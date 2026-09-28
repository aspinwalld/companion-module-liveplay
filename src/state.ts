import { Transport, transportFromString, type CatalogItem, type StateSummary, type SummaryBus } from './liveplay.js'

/** Full-scale value of the progress variables that drive the gauge elements. */
export const PROGRESS_MAX = 255

/** A mixer bus as cached by the module. */
export interface BusState {
	id: string
	name: string
	color: string
	order: number
	gainDb: number
	mute: boolean
	pfl: boolean
	master: boolean
	preview: boolean
}

/** An on-air item as cached by the module (includes paused items). */
export interface PlayingItem {
	itemUuid: string
	cueId: string
	name: string
	/** Authored item color, `#RRGGBB`; '' when the item has none. */
	color: string
	index?: number[]
	transport: Transport
	elapsedSec: number
	durationSec: number | null
	/** playheadSec - elapsedSec (the inPoint trim), used to derive elapsed from meter playheads. */
	playheadOffsetSec: number
	/**
	 * Firing order — higher means more recently triggered. Seeded from the
	 * server's `triggerSeq` and re-stamped locally on every transport edge, so
	 * "currently playing" tracks what the operator fired last even between
	 * summary fetches.
	 */
	triggerSeq: number
}

/** An item referenced by the Up Next / selection blocks of the summary. */
export interface ItemRef {
	itemUuid: string
	name: string
	color: string
	index?: number[]
}

/**
 * Cached mirror of the LivePlay server state. The server is the single
 * authority; this is only ever written from the REST summary and WS push
 * stream, never from assumptions about our own actions' outcomes.
 */
export class LivePlayState {
	serverVersion = ''
	projectName = ''
	hasOpenProject = false
	itemCount = 0
	audioLoading = false

	/** On-air items (including paused), keyed by itemUuid. */
	playing = new Map<string, PlayingItem>()
	/** Engine cue id -> project item uuid (cue ids change across loads). */
	cueToItem = new Map<string, string>()

	next: (ItemRef & { source: string }) | null = null

	/** The shared playlist selection, mirrored from the server. */
	selection: ItemRef | null = null
	/** Server-owned Show Mode (the simplified touch playback view). */
	showMode = false
	/** Server-owned display locale, used to label presets in the operator's language. */
	locale = 'en'

	masterGainDb = 0
	limiterEnabled = false
	/** True while the limiter is actively reducing gain (from meter data). */
	limiterEngaged = false

	/** Bound cart slots (0-based), slot -> item. */
	cart = new Map<number, { itemUuid: string; name: string; color: string }>()

	previewActive = false
	previewItemUuid = ''
	/** Mono audition on the Preview-role bus (session state, not stored in the show). */
	previewMono = false

	/** Project mixer buses, keyed by id. */
	buses = new Map<string, BusState>()

	/**
	 * An inter-cue wait the sequencer announced (`advance_pending`). The server
	 * sends no countdown or cancellation, so this simply expires at `dueAt`.
	 */
	advance: { fromUuid: string; dueAt: number } | null = null

	/** K-weighted momentary / short-term loudness of master channel 0, dB. */
	lufsM: number | null = null
	lufsS: number | null = null

	/** All project items (from the full project document), keyed by uuid, document order. */
	catalog = new Map<string, CatalogItem>()

	/**
	 * Local high-water mark for trigger ordering. Cues that start between
	 * summary fetches are stamped from here, so they immediately outrank
	 * anything already on air.
	 */
	private triggerSeqHigh = 0

	/** Next trigger stamp; always above every sequence seen so far. */
	nextTriggerSeq(): number {
		return ++this.triggerSeqHigh
	}

	/** Returns true when the set of buses changed (see applyBuses). */
	applySummary(s: StateSummary): boolean {
		this.serverVersion = s.server?.version ?? this.serverVersion
		this.projectName = s.project?.name ?? ''
		this.hasOpenProject = s.project?.hasOpenProject ?? false
		this.itemCount = s.project?.itemCount ?? 0
		this.audioLoading = s.project?.audioLoading ?? false

		this.playing.clear()
		for (const p of s.playing ?? []) {
			this.cueToItem.set(p.cueId, p.itemUuid)
			// Keep our local counter above anything the server has issued, so a
			// locally stamped cue can never sort below a server-stamped one.
			const seq = p.triggerSeq ?? 0
			if (seq > this.triggerSeqHigh) this.triggerSeqHigh = seq
			this.playing.set(p.itemUuid, {
				itemUuid: p.itemUuid,
				cueId: p.cueId,
				name: p.name,
				color: p.color ?? this.itemColor(p.itemUuid),
				index: p.index,
				transport: transportFromString(p.transport),
				elapsedSec: p.elapsedSec,
				durationSec: p.durationSec,
				playheadOffsetSec: (p.playheadSec ?? 0) - (p.elapsedSec ?? 0),
				triggerSeq: seq,
			})
		}

		this.next = s.next
			? {
					itemUuid: s.next.itemUuid,
					name: s.next.name ?? this.itemName(s.next.itemUuid),
					color: s.next.color ?? this.itemColor(s.next.itemUuid),
					index: s.next.index,
					source: s.next.source ?? '',
				}
			: null

		this.selection = s.selection
			? {
					itemUuid: s.selection.itemUuid,
					name: s.selection.name ?? this.itemName(s.selection.itemUuid),
					color: s.selection.color ?? this.itemColor(s.selection.itemUuid),
					index: s.selection.index,
				}
			: null
		this.showMode = s.ui?.showMode ?? false
		if (s.ui?.locale) this.locale = s.ui.locale

		this.masterGainDb = s.master?.gainDb ?? this.masterGainDb
		this.limiterEnabled = s.master?.limiterEnabled ?? this.limiterEnabled

		this.cart.clear()
		for (const c of s.cart ?? []) {
			this.cart.set(c.slot, {
				itemUuid: c.itemUuid,
				name: c.name ?? this.itemName(c.itemUuid),
				color: c.color ?? this.itemColor(c.itemUuid),
			})
		}

		this.previewActive = s.preview?.active ?? false
		this.previewItemUuid = s.preview?.itemUuid ?? ''

		return this.applyBuses(s.buses ?? [], true)
	}

	/**
	 * Replace the bus list. The summary carries live PFL / mono state, but a
	 * `buses_patched` notification carries stored definitions only — so for
	 * those, `withRuntime` is false and the live fields we already hold are kept.
	 * Returns true when the set of buses (ids, names or order) changed, which
	 * is what the action/feedback dropdowns and variable definitions hang off.
	 */
	applyBuses(list: SummaryBus[], withRuntime: boolean): boolean {
		const before = this.busSignature()
		const next = new Map<string, BusState>()
		for (const b of list) {
			if (!b.id) continue
			const old = this.buses.get(b.id)
			next.set(b.id, {
				id: b.id,
				name: b.name ?? old?.name ?? b.id,
				color: b.color ?? old?.color ?? '',
				order: b.order ?? old?.order ?? 0,
				gainDb: b.gainDb ?? old?.gainDb ?? 0,
				mute: b.mute ?? old?.mute ?? false,
				pfl: withRuntime ? (b.pfl ?? false) : (old?.pfl ?? false),
				master: b.master ?? old?.master ?? false,
				preview: b.preview ?? old?.preview ?? false,
			})
			if (withRuntime && b.preview) this.previewMono = b.monoCheck ?? false
		}
		this.buses = new Map([...next.values()].sort((a, b) => a.order - b.order).map((b) => [b.id, b]))
		return this.busSignature() !== before
	}

	private busSignature(): string {
		return [...this.buses.values()]
			.map((b) => `${b.id}\u0000${b.name}\u0000${b.master}\u0000${b.preview}`)
			.join('\u0001')
	}

	/**
	 * Resolve a bus reference from an action/feedback option. `@master` and
	 * `@preview` follow the role, wherever it currently lives — the API says to
	 * find those by flag, never by a fixed id.
	 */
	resolveBus(ref: string): BusState | null {
		const key = ref.trim()
		if (key === '@master') return [...this.buses.values()].find((b) => b.master) ?? null
		if (key === '@preview') return [...this.buses.values()].find((b) => b.preview) ?? null
		return this.buses.get(key) ?? null
	}

	/** Seconds until an announced inter-cue wait fires, or null when none is pending. */
	advanceRemainingSec(now = Date.now()): number | null {
		if (!this.advance) return null
		const ms = this.advance.dueAt - now
		if (ms <= 0) {
			this.advance = null
			return null
		}
		return ms / 1000
	}

	/**
	 * How far through an on-air item is, scaled 0..PROGRESS_MAX. 0 when the item
	 * is not on air or its duration is not known yet; paused items hold their
	 * position.
	 */
	progressOf(itemUuid: string): number {
		const p = this.playing.get(itemUuid)
		if (!p || p.durationSec === null || !(p.durationSec > 0)) return 0
		const fraction = Math.max(0, Math.min(1, p.elapsedSec / p.durationSec))
		return Math.round(fraction * PROGRESS_MAX)
	}

	/** Replace the item catalog. Returns true when anything actually changed. */
	applyCatalog(items: CatalogItem[]): boolean {
		let changed = items.length !== this.catalog.size
		if (!changed) {
			const old = [...this.catalog.values()]
			changed = items.some(
				(item, i) =>
					old[i].uuid !== item.uuid ||
					old[i].name !== item.name ||
					old[i].color !== item.color ||
					(old[i].index ?? []).join(',') !== (item.index ?? []).join(','),
			)
		}
		if (changed) {
			this.catalog.clear()
			for (const item of items) this.catalog.set(item.uuid, item)
		}
		return changed
	}

	/** Best-known display name for an item uuid ('' when unknown). */
	itemName(uuid: string): string {
		const fromCatalog = this.catalog.get(uuid)?.name
		if (fromCatalog) return fromCatalog
		const fromPlaying = this.playing.get(uuid)?.name
		if (fromPlaying) return fromPlaying
		if (this.next?.itemUuid === uuid) return this.next.name
		if (this.selection?.itemUuid === uuid) return this.selection.name
		for (const bound of this.cart.values()) {
			if (bound.itemUuid === uuid) return bound.name
		}
		return ''
	}

	/** Best-known color for an item uuid ('' when unknown). */
	itemColor(uuid: string): string {
		const fromCatalog = this.catalog.get(uuid)?.color
		if (fromCatalog) return fromCatalog
		const fromPlaying = this.playing.get(uuid)?.color
		if (fromPlaying) return fromPlaying
		if (this.next?.itemUuid === uuid && this.next.color) return this.next.color
		if (this.selection?.itemUuid === uuid && this.selection.color) return this.selection.color
		for (const bound of this.cart.values()) {
			if (bound.itemUuid === uuid && bound.color) return bound.color
		}
		return ''
	}

	/** uuid of the catalog item at an index path, or '' when there is none. */
	uuidAtIndex(index: number[]): string {
		const wanted = index.join(',')
		for (const item of this.catalog.values()) {
			if ((item.index ?? []).join(',') === wanted) return item.uuid
		}
		return ''
	}

	/** Build an item reference from the catalog, for uuids pushed to us bare. */
	refFor(uuid: string): ItemRef | null {
		if (!uuid) return null
		return {
			itemUuid: uuid,
			name: this.itemName(uuid),
			color: this.itemColor(uuid),
			index: this.catalog.get(uuid)?.index,
		}
	}

	clearPlayback(): void {
		this.playing.clear()
		this.advance = null
		this.lufsM = null
		this.lufsS = null
		this.limiterEngaged = false
	}

	itemTransport(itemUuid: string): Transport | null {
		return this.playing.get(itemUuid)?.transport ?? null
	}

	/** On air = present in playing (paused counts). */
	isOnAir(itemUuid: string): boolean {
		return this.playing.has(itemUuid)
	}

	/** Actively sounding: playing or fading, not paused. */
	isAudible(itemUuid: string): boolean {
		const t = this.itemTransport(itemUuid)
		return t === Transport.Playing || t === Transport.FadingIn || t === Transport.FadingOut
	}

	isPaused(itemUuid: string): boolean {
		return this.itemTransport(itemUuid) === Transport.Paused
	}

	/**
	 * The item to show as "currently playing": the one triggered most recently.
	 * With a bed under a stinger, or a cart fired over a playlist track, the
	 * operator means the last thing they pressed — not whatever happens to sit
	 * highest in the playlist. Sounding items win over paused ones at equal
	 * recency; falls back to any paused item when nothing is sounding.
	 */
	currentItem(): PlayingItem | null {
		let best: PlayingItem | null = null
		let bestPaused: PlayingItem | null = null
		for (const p of this.playing.values()) {
			if (p.transport === Transport.Paused) {
				if (!bestPaused || p.triggerSeq > bestPaused.triggerSeq) bestPaused = p
			} else if (!best || p.triggerSeq > best.triggerSeq) {
				best = p
			}
		}
		return best ?? bestPaused
	}

	anythingAudible(): boolean {
		for (const p of this.playing.values()) {
			if (p.transport !== Transport.Paused) return true
		}
		return false
	}

	anythingPaused(): boolean {
		for (const p of this.playing.values()) {
			if (p.transport === Transport.Paused) return true
		}
		return false
	}

	/** Seconds left on an item, or null when its duration isn't known yet. */
	remainingSec(item: PlayingItem | null): number | null {
		if (!item || item.durationSec === null) return null
		return Math.max(0, item.durationSec - item.elapsedSec)
	}

	/** Is the item bound to the given 0-based cart slot currently audible? */
	isCartSlotActive(slot: number): boolean {
		const bound = this.cart.get(slot)
		return bound ? this.isAudible(bound.itemUuid) : false
	}
}
