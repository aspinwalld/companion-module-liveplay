/**
 * Types and helpers for the LivePlay external-control API (REST + WebSocket).
 * Protocol reference: the LivePlay Developer API Reference
 * (docs-site/public/api/reference.json in the LivePlay repo), server >= 2.5.0.
 */

/** Oldest LivePlay server this module talks to. */
export const MIN_SERVER_VERSION = '2.5.0'

/**
 * True when `version` (e.g. "2.5.0", "2.5.1-beta") is at least `minimum`.
 * Only the numeric major.minor.patch triple is compared; a pre-release
 * suffix counts as that release, so a 2.5.0 build candidate is accepted.
 */
export function versionAtLeast(version: string, minimum: string): boolean {
	const parse = (v: string): number[] => {
		const m = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v)
		return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : []
	}
	const a = parse(version)
	const b = parse(minimum)
	if (a.length === 0 || b.length === 0) return false
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] > b[i]
	}
	return true
}

/** Transport state integers as used in WebSocket messages. */
export enum Transport {
	Stopped = 0,
	Playing = 1,
	FadingIn = 2,
	FadingOut = 3,
	Paused = 4,
}

/** Map the REST summary's transport strings onto the WS integer space. */
export function transportFromString(s: string): Transport {
	switch (s) {
		case 'playing':
			return Transport.Playing
		case 'fading_in':
			return Transport.FadingIn
		case 'fading_out':
			return Transport.FadingOut
		case 'paused':
			return Transport.Paused
		default:
			return Transport.Stopped
	}
}

/** An entry of `GET /api/state/summary` -> `playing[]`. */
export interface SummaryPlayingItem {
	itemUuid: string
	cueId: string
	name: string
	/** The item's color as authored in LivePlay, `#RRGGBB`. May be empty. */
	color?: string
	/** Index path; absent for cart-only items. */
	index?: number[]
	transport: string
	paused: boolean
	playheadSec: number
	elapsedSec: number
	durationSec: number
	remainingSec: number
	/**
	 * Monotonic firing order stamped by the server on every trigger. Higher =
	 * more recent. Lets a "now playing" button follow what the operator fired
	 * last rather than whatever sits highest in the playlist.
	 */
	triggerSeq?: number
}

/** The Up Next / selected item block of the summary. */
export interface SummaryItemRef {
	itemUuid: string
	name?: string
	color?: string
	type?: string
	index?: number[]
	source?: string
	onAir?: boolean
}

/**
 * A mixer bus as it appears in the summary's `buses[]` and in `buses_patched`.
 * `buses_patched` carries stored definitions only, so the runtime fields
 * (pfl, bound, masters, monoCheck) are optional here.
 */
export interface SummaryBus {
	id: string
	name?: string
	/** Display color, CSS form. May be empty. */
	color?: string
	order?: number
	width?: number
	gainDb?: number
	mute?: boolean
	pfl?: boolean
	bound?: boolean
	/** Holds the Master role. Find Master/Preview by these flags, never by id. */
	master?: boolean
	/** Holds the Preview role. */
	preview?: boolean
	/** Preview mono audition — only reported on the Preview-role bus. */
	monoCheck?: boolean
}

/** `GET /api/state/summary` response. */
export interface StateSummary {
	server?: { version?: string; meterBroadcastHz?: number }
	project?: { name?: string; itemCount?: number; hasOpenProject?: boolean; audioLoading?: boolean }
	playing?: SummaryPlayingItem[]
	next?: SummaryItemRef | null
	/** The shared playlist selection. */
	selection?: SummaryItemRef | null
	/** Shared operator UI state. */
	ui?: { showMode?: boolean; locale?: string }
	master?: { gainDb?: number; limiterEnabled?: boolean }
	cart?: { slot: number; itemUuid: string; name?: string; color?: string; playing: boolean }[]
	buses?: SummaryBus[]
	preview?: { active?: boolean; itemUuid?: string }
}

/** `GET /api/auth/status` response (public). */
export interface AuthStatus {
	authRequired?: boolean
	userCount?: number
	setupRequired?: boolean
}

export interface WsCueMeter {
	cue_id: string
	transport: Transport
	playhead_seconds: number
}

export interface WsMasterChannelMeter {
	index: number
	peak_db?: number
	rms_db?: number
	kw_ms?: number
	kw_ms_s?: number
	gain_reduction_db?: number
}

export interface WsMetersMsg {
	type: 'meters'
	items?: WsCueMeter[]
	master_channels?: WsMasterChannelMeter[]
}

export interface WsCueStateMsg {
	type: 'cue_state'
	cue_id: string
	transport: Transport
	playhead_seconds: number
	/** Absent for orphan cues that are not part of the project. */
	item_uuid?: string
}

export interface WsSnapshotCue {
	cue_id: string
	transport: Transport
	playhead_seconds: number
	item_uuid?: string
}

export interface WsPlaybackSnapshotMsg {
	type: 'playback_snapshot'
	cues?: WsSnapshotCue[]
	next_item_uuid?: string
	selected_item_uuid?: string
	show_mode?: boolean
	locale?: string
	master_gain_db?: number
	output_channel_gains?: { channel: number; db: number }[]
	preview?: { item_uuid?: string; cue_id?: string }
}

export interface WsDocPatchMsg {
	type: 'doc_patch'
	op: string
	db?: number
	channel?: number
	enabled?: boolean
	itemUuid?: string
	slot?: number
	[key: string]: unknown
}

/** One project item as known to the module's catalog (name lookups by uuid/index). */
export interface CatalogItem {
	uuid: string
	name: string
	/** The item's color as authored in LivePlay, `#RRGGBB`. May be empty. */
	color: string
	/** 'audio' | 'group' | 'action'. */
	type: string
	/** Index path; cart-only items use paths containing -1. */
	index?: number[]
}

/** A node of the full project document (`GET /api/project`). Groups may nest children. */
export interface ProjectDocItemNode {
	uuid?: string
	displayName?: string
	color?: string
	index?: number[]
	type?: string
	children?: ProjectDocItemNode[]
	items?: ProjectDocItemNode[]
}

export interface ProjectDoc {
	name?: string
	items?: ProjectDocItemNode[]
	cartOnlyItems?: ProjectDocItemNode[]
}

/** Flatten the project document into a catalog of items (depth-first, document order). */
export function collectProjectItems(doc: ProjectDoc): CatalogItem[] {
	const out: CatalogItem[] = []
	const walk = (nodes: ProjectDocItemNode[] | undefined): void => {
		for (const n of nodes ?? []) {
			if (n.uuid)
				out.push({
					uuid: n.uuid,
					name: n.displayName ?? '',
					color: n.color ?? '',
					type: n.type ?? '',
					index: n.index,
				})
			walk(n.children)
			walk(n.items)
		}
	}
	walk(doc.items)
	walk(doc.cartOnlyItems)
	return out
}

export type WsMessage =
	WsMetersMsg | WsCueStateMsg | WsPlaybackSnapshotMsg | WsDocPatchMsg | { type: string; [key: string]: unknown }

/** Format seconds as mm:ss (or h:mm:ss above one hour). Returns '-' for unknown values. */
export function formatTime(seconds: number | null | undefined): string {
	if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '-'
	const total = Math.max(0, Math.floor(seconds))
	const h = Math.floor(total / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = total % 60
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
	return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** Parse an index-path option like "1,11" or "1/11" into an array of integers. */
export function parseIndexPath(text: string): number[] | null {
	const parts = text
		.split(/[,/\s]+/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0)
	if (parts.length === 0) return null
	const index = parts.map((p) => Number(p))
	if (index.some((n) => !Number.isInteger(n) || n < 0)) return null
	return index
}
