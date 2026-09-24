import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import WebSocket from 'ws'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, CollectVariableValues, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { LivePlayState } from './state.js'
import {
	collectProjectItems,
	Transport,
	type ProjectDoc,
	type StateSummary,
	type WsCueStateMsg,
	type WsDocPatchMsg,
	type WsMessage,
	type WsMetersMsg,
	type WsPlaybackSnapshotMsg,
} from './liveplay.js'
import { warnLevel, warnPeriodMs, type WarnLevel } from './colors.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 5000
/**
 * Companion-facing update rate for meter-driven variables (elapsed/remaining/
 * LUFS) and for the end-of-cue flash. 250 ms is fast enough to render the
 * 0.5 s red blink as a clean on/off rather than a stutter.
 */
const TICK_MS = 250
/** Debounce for summary re-fetches triggered by doc_patch bursts. */
const SUMMARY_DEBOUNCE_MS = 250
/** Every color feedback that has to be re-evaluated when an item's color or identity changes. */
const COLOR_FEEDBACKS = [
	'next_color',
	'selected_color',
	'playing_color',
	'cart_color',
	'item_color',
	'cue_button',
] as const

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()
	state = new LivePlayState()
	connected = false

	private ws: WebSocket | null = null
	/** Incremented on every (re)connect; async callbacks from stale connections bail out. */
	private connectSeq = 0
	private reconnectDelay = RECONNECT_MIN_MS
	private reconnectTimer: NodeJS.Timeout | null = null
	private tickTimer: NodeJS.Timeout | null = null
	private summaryTimer: NodeJS.Timeout | null = null
	private lastVarValues: Partial<VariablesSchema> = {}
	private lastLimiterEngaged = false
	/** Last warning level pushed to the flashing feedback ('' = none). */
	private lastWarnLevel: WarnLevel = null
	/** Locale the presets were last published in; a change re-publishes them. */
	private lastPresetLocale = ''

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()

		this.tickTimer = setInterval(() => this.tick(), TICK_MS)
		this.startConnection()
	}

	async destroy(): Promise<void> {
		this.connectSeq++
		if (this.tickTimer) clearInterval(this.tickTimer)
		this.tickTimer = null
		this.teardownConnection()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.startConnection()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		this.lastPresetLocale = this.state.locale
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	// ---------------------------------------------------------------- REST

	private get baseUrl(): string {
		return `http://${this.config.host}:${this.config.port}`
	}

	/**
	 * Perform a REST request against the LivePlay server. Returns the parsed
	 * JSON body, or null on any failure (which is logged, not thrown).
	 */
	async apiRequest(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<unknown | null> {
		try {
			const res = await fetch(`${this.baseUrl}${path}`, {
				method,
				headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
				body: body !== undefined ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(5000),
			})
			const json: unknown = await res.json().catch(() => null)
			if (!res.ok) {
				const message = json && typeof json === 'object' && 'error' in json ? String(json.error) : res.statusText
				this.log('warn', `${method} ${path} failed (${res.status}): ${message}`)
				return null
			}
			return json
		} catch (e) {
			this.log('error', `${method} ${path} failed: ${e instanceof Error ? e.message : String(e)}`)
			return null
		}
	}

	async apiPost(path: string, body?: unknown): Promise<unknown | null> {
		return this.apiRequest('POST', path, body ?? {})
	}

	/** Send a JSON message over the WebSocket (used for set_next_item and keepalive). */
	wsSend(message: Record<string, unknown>): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message))
		} else {
			this.log('warn', `Cannot send ${String(message.type)}: not connected to LivePlay`)
		}
	}

	// ------------------------------------------------- connection lifecycle

	private startConnection(): void {
		this.teardownConnection()
		this.reconnectDelay = RECONNECT_MIN_MS

		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Server host is not set')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)
		const seq = this.connectSeq
		void this.connect(seq)
	}

	private teardownConnection(): void {
		this.connectSeq++
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
		this.reconnectTimer = null
		if (this.summaryTimer) clearTimeout(this.summaryTimer)
		this.summaryTimer = null
		if (this.ws) {
			this.ws.removeAllListeners()
			try {
				this.ws.close()
			} catch {
				// ignore
			}
			this.ws = null
		}
		this.setConnected(false)
	}

	private scheduleReconnect(seq: number): void {
		if (seq !== this.connectSeq) return
		this.setConnected(false)
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
		this.reconnectTimer = setTimeout(() => {
			if (seq !== this.connectSeq) return
			void this.connect(seq)
		}, this.reconnectDelay)
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS)
	}

	private async connect(seq: number): Promise<void> {
		if (seq !== this.connectSeq) return

		// 1. Health probe
		const health = (await this.probe('/api/health')) as { ok?: boolean } | null
		if (seq !== this.connectSeq) return
		if (!health?.ok) {
			this.updateStatus(InstanceStatus.ConnectionFailure, `No LivePlay server at ${this.baseUrl}`)
			this.scheduleReconnect(seq)
			return
		}

		// 2. Seed state from the summary
		const summary = (await this.probe('/api/state/summary')) as StateSummary | null
		if (seq !== this.connectSeq) return
		if (!summary) {
			this.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to fetch state summary')
			this.scheduleReconnect(seq)
			return
		}
		this.state.applySummary(summary)
		await this.refreshCatalog()
		if (seq !== this.connectSeq) return

		// 3. Open the push stream (the server sends a playback_snapshot on open)
		const ws = new WebSocket(`ws://${this.config.host}:${this.config.port}/ws`)
		this.ws = ws

		ws.on('open', () => {
			if (seq !== this.connectSeq) return
			this.reconnectDelay = RECONNECT_MIN_MS
			this.updateStatus(InstanceStatus.Ok)
			this.setConnected(true)
			this.refreshAll()
		})
		ws.on('message', (data) => {
			if (seq !== this.connectSeq) return
			this.handleWsData(data)
		})
		ws.on('error', (err) => {
			if (seq !== this.connectSeq) return
			this.log('debug', `WebSocket error: ${err.message}`)
		})
		ws.on('close', () => {
			if (seq !== this.connectSeq) return
			this.ws = null
			this.state.clearPlayback()
			this.updateStatus(InstanceStatus.Disconnected, 'Connection to LivePlay lost')
			this.refreshAll()
			this.scheduleReconnect(seq)
		})
	}

	/** GET that never throws; returns parsed JSON or null. Quieter than apiRequest (used while probing). */
	private async probe(path: string): Promise<unknown | null> {
		try {
			const res = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(3000) })
			if (!res.ok) return null
			return await res.json()
		} catch {
			return null
		}
	}

	private setConnected(connected: boolean): void {
		if (this.connected === connected) return
		this.connected = connected
		this.checkFeedbacks('connected')
	}

	// ------------------------------------------------------ WS push stream

	private handleWsData(data: WebSocket.RawData): void {
		let msg: WsMessage
		try {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			msg = JSON.parse(data.toString()) as WsMessage
		} catch {
			return
		}

		switch (msg.type) {
			case 'meters':
				this.handleMeters(msg as WsMetersMsg)
				break
			case 'cue_state':
				this.handleCueState(msg as WsCueStateMsg)
				break
			case 'playback_snapshot':
				this.handleSnapshot(msg as WsPlaybackSnapshotMsg)
				break
			case 'doc_patch':
				this.handleDocPatch(msg as WsDocPatchMsg)
				break
			default:
				// Unknown message types must be ignored silently
				break
		}
	}

	/**
	 * ~30 Hz meter stream. Only updates the cached state here — nothing is
	 * pushed into Companion until the next tick() (<= 2 Hz effective, since
	 * values are formatted to whole seconds / 0.1 dB and diffed).
	 */
	private handleMeters(msg: WsMetersMsg): void {
		for (const item of msg.items ?? []) {
			const uuid = this.state.cueToItem.get(item.cue_id)
			if (!uuid) continue
			const playing = this.state.playing.get(uuid)
			if (!playing || playing.cueId !== item.cue_id) continue
			playing.elapsedSec = item.playhead_seconds - playing.playheadOffsetSec
		}

		const master = msg.master_channels ?? []
		const ch0 = master.find((c) => c.index === 0)
		this.state.lufsM = ch0?.kw_ms ?? null
		this.state.lufsS = ch0?.kw_ms_s ?? null
		this.state.limiterEngaged = master.some((c) => (c.gain_reduction_db ?? 0) < -0.1)
	}

	/** Edge event on every transport transition — primary driver for play/pause feedbacks. */
	private handleCueState(msg: WsCueStateMsg): void {
		const uuid = msg.item_uuid ?? this.state.cueToItem.get(msg.cue_id)
		if (!uuid) return // orphan cue, not part of the project
		this.state.cueToItem.set(msg.cue_id, uuid)

		if (msg.transport === Transport.Stopped) {
			const existing = this.state.playing.get(uuid)
			if (existing && existing.cueId === msg.cue_id) this.state.playing.delete(uuid)
		} else {
			const existing = this.state.playing.get(uuid)
			if (existing) {
				// A cue restarting on a new engine cue id is a fresh trigger, so
				// it takes the top of the firing order; a pause/resume or fade
				// edge on the same cue keeps the order it already had.
				if (existing.cueId !== msg.cue_id) existing.triggerSeq = this.state.nextTriggerSeq()
				existing.cueId = msg.cue_id
				existing.transport = msg.transport
				existing.elapsedSec = msg.playhead_seconds - existing.playheadOffsetSec
			} else {
				// New cue we have no metadata for yet — insert a placeholder and
				// pull names/durations/colors from a fresh summary.
				this.state.playing.set(uuid, {
					itemUuid: uuid,
					cueId: msg.cue_id,
					name: this.state.itemName(uuid),
					color: this.state.itemColor(uuid),
					transport: msg.transport,
					elapsedSec: msg.playhead_seconds,
					durationSec: null,
					playheadOffsetSec: 0,
					triggerSeq: this.state.nextTriggerSeq(),
				})
				this.scheduleSummaryRefresh()
			}
		}

		this.checkFeedbacks(
			'item_playing',
			'item_paused',
			'anything_playing',
			'cart_active',
			'playing_color',
			'cart_color',
			'item_color',
			'cue_button',
		)
		this.pushVariables()
	}

	/**
	 * Refresh the item catalog from the full project document. Only called on
	 * connect and after document mutations (project_changed / item_* patches) —
	 * never polled, per the LivePlay API guidance.
	 */
	private async refreshCatalog(): Promise<void> {
		const items = this.state.hasOpenProject
			? collectProjectItems(((await this.probe('/api/project')) as ProjectDoc | null) ?? {})
			: []
		if (this.state.applyCatalog(items)) {
			// Item set changed: re-publish variable definitions and force a full value push
			this.lastVarValues = {}
			this.updateVariableDefinitions()
			// The Trigger Cue presets are generated one per catalog item
			this.updatePresets()
		}
	}

	/** Pushed by the server once after every WS (re)connect. */
	private handleSnapshot(msg: WsPlaybackSnapshotMsg): void {
		const seen = new Set<string>()
		for (const cue of msg.cues ?? []) {
			if (!cue.item_uuid || cue.transport === Transport.Stopped) continue
			seen.add(cue.item_uuid)
			this.state.cueToItem.set(cue.cue_id, cue.item_uuid)
			const existing = this.state.playing.get(cue.item_uuid)
			if (existing) {
				existing.cueId = cue.cue_id
				existing.transport = cue.transport
				existing.elapsedSec = cue.playhead_seconds - existing.playheadOffsetSec
			} else {
				// The snapshot carries no firing order; the summary refresh that
				// follows restores the server's authoritative triggerSeq. Until
				// then, snapshot order is the best guess available.
				this.state.playing.set(cue.item_uuid, {
					itemUuid: cue.item_uuid,
					cueId: cue.cue_id,
					name: this.state.itemName(cue.item_uuid),
					color: this.state.itemColor(cue.item_uuid),
					transport: cue.transport,
					elapsedSec: cue.playhead_seconds,
					durationSec: null,
					playheadOffsetSec: 0,
					triggerSeq: this.state.nextTriggerSeq(),
				})
				this.scheduleSummaryRefresh()
			}
		}
		for (const uuid of [...this.state.playing.keys()]) {
			if (!seen.has(uuid)) this.state.playing.delete(uuid)
		}

		if (msg.master_gain_db !== undefined) this.state.masterGainDb = msg.master_gain_db
		if (msg.preview) {
			this.state.previewItemUuid = msg.preview.item_uuid ?? ''
			this.state.previewActive = this.state.previewItemUuid !== ''
		}
		// Shared operator UI state (LivePlay >= 2.4.0). Absent on older servers,
		// where the defaults (nothing selected, Show Mode off, English) hold.
		if (msg.selected_item_uuid !== undefined) this.state.selection = this.state.refFor(msg.selected_item_uuid)
		if (typeof msg.show_mode === 'boolean') this.state.showMode = msg.show_mode
		if (msg.locale) this.state.locale = msg.locale

		this.refreshAll()
	}

	/** Document mutation fan-out. */
	private handleDocPatch(msg: WsDocPatchMsg): void {
		switch (msg.op) {
			case 'master_gain_changed':
				if (typeof msg.db === 'number') this.state.masterGainDb = msg.db
				this.pushVariables()
				break
			case 'limiter_changed':
				if (typeof msg.enabled === 'boolean') this.state.limiterEnabled = msg.enabled
				this.checkFeedbacks('limiter_enabled')
				this.pushVariables()
				break
			case 'preview_started':
				this.state.previewActive = true
				this.state.previewItemUuid = typeof msg.itemUuid === 'string' ? msg.itemUuid : ''
				this.checkFeedbacks('preview_active')
				break
			case 'preview_stopped':
				this.state.previewActive = false
				this.state.previewItemUuid = ''
				this.checkFeedbacks('preview_active')
				break
			case 'selection_changed':
				// Resolve straight from the catalog rather than waiting on a
				// summary round-trip — arrow-key stepping has to feel immediate.
				this.state.selection = this.state.refFor(typeof msg.itemUuid === 'string' ? msg.itemUuid : '')
				this.checkFeedbacks('item_selected', 'selected_color')
				this.pushVariables()
				break
			case 'show_mode_changed':
				if (typeof msg.enabled === 'boolean') this.state.showMode = msg.enabled
				this.checkFeedbacks('show_mode')
				this.pushVariables()
				break
			case 'locale_changed':
				if (typeof msg.locale === 'string' && msg.locale) {
					this.state.locale = msg.locale
					// Preset button text is baked in at publish time, so the
					// operator changing LivePlay's language has to re-issue them.
					this.updatePresets()
					this.pushVariables()
				}
				break
			case 'next_item_set':
			case 'cart_slot_set':
			case 'cart_slot_cleared':
			case 'project_changed':
			case 'item_added':
			case 'item_updated':
			case 'item_removed':
			case 'items_reordered':
				// Names / indices / cart bindings may have changed — re-seed from the summary
				this.scheduleSummaryRefresh()
				break
			default:
				// Unknown ops must be ignored silently — the set grows over time
				break
		}
	}

	// ------------------------------------------------------- state fan-out

	private scheduleSummaryRefresh(): void {
		if (this.summaryTimer) return
		const seq = this.connectSeq
		this.summaryTimer = setTimeout(() => {
			this.summaryTimer = null
			void (async () => {
				const summary = (await this.probe('/api/state/summary')) as StateSummary | null
				if (seq !== this.connectSeq || !summary) return
				this.state.applySummary(summary)
				await this.refreshCatalog()
				if (seq !== this.connectSeq) return
				this.refreshAll()
			})()
		}, SUMMARY_DEBOUNCE_MS)
	}

	/** Re-evaluate all feedbacks and variables after a bulk state change. */
	private refreshAll(): void {
		this.checkFeedbacks(
			'connected',
			'project_loaded',
			'item_playing',
			'item_paused',
			'anything_playing',
			'cart_active',
			'limiter_enabled',
			'limiter_engaged',
			'preview_active',
			'show_mode',
			'item_selected',
			'item_is_next',
			...COLOR_FEEDBACKS,
		)
		// The locale travels with the summary as well as by doc_patch, so a
		// server that changed language while we were disconnected still relabels.
		if (this.state.locale !== this.lastPresetLocale) this.updatePresets()
		this.pushVariables()
	}

	/** Diff variable values against the last push so Companion only sees real changes. */
	private pushVariables(): void {
		const values = CollectVariableValues(this)
		const changed: Partial<VariablesSchema> = {}
		let any = false
		for (const key of Object.keys(values)) {
			if (values[key] !== this.lastVarValues[key]) {
				changed[key] = values[key]
				any = true
			}
		}
		if (any) {
			this.lastVarValues = values
			this.setVariableValues(changed)
		}
	}

	/**
	 * Phase of the end-of-cue flash, 0..1, for the given warning level.
	 *
	 * Driven off the wall clock rather than a counter so every button — and
	 * every Companion surface — pulses in step, and so the phase survives a
	 * feedback being re-evaluated out of band. The triangle wave reproduces
	 * the client's `warning-border-flash` keyframes (opacity 0 -> 1 -> 0) over
	 * the same period as the CSS animation for that level.
	 */
	flashPhase(level: WarnLevel): number {
		const period = warnPeriodMs(level)
		const position = (Date.now() % period) / period
		return position < 0.5 ? position * 2 : (1 - position) * 2
	}

	/** Public wrapper so variables.ts can report the same warning level the flash uses. */
	warnLevelOf(remainingSec: number | null): WarnLevel {
		return warnLevel(remainingSec)
	}

	/**
	 * Low-rate tick: forwards meter-driven values (time, LUFS, limiter GR) into
	 * Companion, and drives the end-of-cue flash.
	 */
	private tick(): void {
		this.pushVariables()
		if (this.state.limiterEngaged !== this.lastLimiterEngaged) {
			this.lastLimiterEngaged = this.state.limiterEngaged
			this.checkFeedbacks('limiter_engaged')
		}

		// Repaint the playing button only while a cue is actually inside a
		// warning window, so an idle rack isn't re-rendered four times a second
		// for the whole show. The extra tick when the level clears puts the
		// button back to the cue's own color.
		const current = this.state.currentItem()
		const level = current && !this.state.isPaused(current.itemUuid) ? warnLevel(this.state.remainingSec(current)) : null
		if (level !== null || this.lastWarnLevel !== null) {
			this.checkFeedbacks('playing_color')
		}
		this.lastWarnLevel = level
	}
}
