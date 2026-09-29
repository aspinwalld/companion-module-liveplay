import type { DropdownChoice } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { parseIndexPath } from './liveplay.js'
import type { BusState } from './state.js'

export type ActionsSchema = {
	go: { options: Record<string, never> }
	play_index: { options: { index: string } }
	play_item: { options: { uuid: string } }
	stop_item: { options: { uuid: string; fade: string } }
	pause_item: { options: { uuid: string } }
	resume_item: { options: { uuid: string } }
	toggle_pause_item: { options: { uuid: string } }
	seek_item: { options: { uuid: string; seconds: number } }
	stop_all: { options: { fade: string } }
	panic: { options: Record<string, never> }
	cart_play: { options: { slot: number } }
	master_gain_set: { options: { db: number } }
	master_gain_step: { options: { delta: number } }
	limiter: { options: { mode: 'toggle' | 'on' | 'off' } }
	arm_next: { options: { uuid: string } }
	preview_start: { options: { uuid: string } }
	preview_stop: { options: Record<string, never> }
	load_project: { options: { path: string } }
	close_project: { options: Record<string, never> }
	pause_toggle: { options: Record<string, never> }
	select_step: { options: { delta: number } }
	select_item: { options: { uuid: string } }
	select_index: { options: { index: string } }
	arm_selected: { options: Record<string, never> }
	play_selected: { options: Record<string, never> }
	preview_selected: { options: Record<string, never> }
	show_mode: { options: { mode: 'toggle' | 'on' | 'off' } }
	bus_gain_set: { options: { bus: string; db: number } }
	bus_gain_step: { options: { bus: string; delta: number } }
	bus_mute: { options: { bus: string; mode: 'toggle' | 'on' | 'off' } }
	bus_pfl: { options: { bus: string; mode: 'toggle' | 'on' | 'off' } }
	bus_pfl_clear: { options: Record<string, never> }
	preview_mono: { options: { mode: 'toggle' | 'on' | 'off' } }
}

const UUID_TOOLTIP =
	'The item UUID from the LivePlay project. UUIDs are stable across playlist edits; prefer them over index paths for fixed buttons.'

/**
 * Bounds for bus fader moves. The API documents no range for Bus.gainDb, so
 * this borrows the one it does document for bus sends (-120..+12 dB).
 */
const BUS_GAIN_MIN = -120
const BUS_GAIN_MAX = 12

const MODE_CHOICES: DropdownChoice<'toggle' | 'on' | 'off'>[] = [
	{ id: 'toggle', label: 'Toggle' },
	{ id: 'on', label: 'On' },
	{ id: 'off', label: 'Off' },
]

/**
 * The bus picker shared by actions and feedbacks. The Master and Preview
 * entries follow the role rather than a bus id — LivePlay lets any bus take
 * a role, and says to find them by flag. The rest are the project's buses,
 * re-published whenever the bus list changes. Custom values are bus ids.
 */
export function busOption(self: ModuleInstance): {
	id: 'bus'
	type: 'dropdown'
	label: string
	tooltip: string
	default: string
	allowCustom: true
	choices: DropdownChoice<string>[]
} {
	const choices: DropdownChoice<string>[] = [
		{ id: '@master', label: 'Master (whichever bus holds the role)' },
		{ id: '@preview', label: 'Preview (whichever bus holds the role)' },
	]
	for (const bus of self.state.buses.values()) {
		const role = bus.master ? ' — Master' : bus.preview ? ' — Preview' : ''
		choices.push({ id: bus.id, label: `${bus.name}${role}` })
	}
	return {
		id: 'bus',
		type: 'dropdown',
		label: 'Bus',
		tooltip: 'A mixer bus in the open project. You can also type a bus id.',
		default: '@master',
		allowCustom: true,
		choices,
	}
}

/** Resolve a bus option, logging when it names nothing. */
function busFor(self: ModuleInstance, ref: string): BusState | null {
	const bus = self.state.resolveBus(String(ref))
	if (!bus) self.log('warn', `No LivePlay bus "${String(ref)}"`)
	return bus
}

/** Parse an optional fade field: '' -> null (use the cue's own), else a non-negative number of ms. */
function parseFade(raw: string | undefined): number | null | undefined {
	const text = (raw ?? '').trim()
	if (text === '') return null
	const ms = Number(text)
	return Number.isFinite(ms) && ms >= 0 ? ms : undefined
}

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		go: {
			name: 'GO (play armed Up Next)',
			description:
				'Plays the armed Up Next item, or the target derived from the playing item’s end behavior — same as the GO button in LivePlay.',
			options: [],
			callback: async () => {
				await self.apiPost('/api/transport/go')
			},
		},
		play_index: {
			name: 'Play item by index path',
			options: [
				{
					id: 'index',
					type: 'textinput',
					label: 'Index path (e.g. "0" or "1,11")',
					tooltip: 'Comma-separated child indices descending into groups, matching the LivePlay client UI. 0-based.',
					default: '0',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const raw = event.options.index
				const index = parseIndexPath(raw)
				if (!index) {
					self.log('error', `Invalid index path: "${raw}"`)
					return
				}
				await self.apiPost('/api/transport/play_index', { index })
			},
		},
		play_item: {
			name: 'Play item by UUID',
			options: [
				{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '', useVariables: true },
			],
			callback: async (event) => {
				const uuid = event.options.uuid.trim()
				if (uuid) await self.apiPost(`/api/project/items/${encodeURIComponent(uuid)}/play`)
			},
		},
		stop_item: {
			name: 'Stop item',
			description: 'Stops an item or group. The fade defaults to the cue’s own Stop fade, as set in LivePlay.',
			options: [
				{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '', useVariables: true },
				{
					id: 'fade',
					type: 'textinput',
					label: 'Fade (ms, blank = the cue’s Stop fade)',
					tooltip: 'Leave blank to use the fade set on the cue in LivePlay. 0 = cut.',
					default: '',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const uuid = event.options.uuid.trim()
				if (!uuid) return
				const fadeMs = parseFade(event.options.fade)
				if (fadeMs === undefined) {
					self.log('error', `Invalid stop fade: "${event.options.fade}"`)
					return
				}
				await self.apiPost(
					`/api/project/items/${encodeURIComponent(uuid)}/stop`,
					fadeMs === null ? {} : { fade_ms: fadeMs },
				)
			},
		},
		pause_item: {
			name: 'Pause item',
			options: [
				{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '', useVariables: true },
			],
			callback: async (event) => {
				const uuid = event.options.uuid.trim()
				if (uuid) await self.apiPost(`/api/project/items/${encodeURIComponent(uuid)}/pause`)
			},
		},
		resume_item: {
			name: 'Resume item',
			options: [
				{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '', useVariables: true },
			],
			callback: async (event) => {
				const uuid = event.options.uuid.trim()
				if (uuid) await self.apiPost(`/api/project/items/${encodeURIComponent(uuid)}/resume`)
			},
		},
		toggle_pause_item: {
			name: 'Toggle pause item',
			description:
				'Pauses the item if it is sounding, resumes it if it is paused. Does nothing if the item is not on air.',
			options: [
				{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '', useVariables: true },
			],
			callback: async (event) => {
				const uuid = event.options.uuid.trim()
				if (!uuid) return
				if (self.state.isPaused(uuid)) {
					await self.apiPost(`/api/project/items/${encodeURIComponent(uuid)}/resume`)
				} else if (self.state.isOnAir(uuid)) {
					await self.apiPost(`/api/project/items/${encodeURIComponent(uuid)}/pause`)
				} else {
					self.log('info', `Toggle pause: item ${uuid} is not on air`)
				}
			},
		},
		seek_item: {
			name: 'Seek item',
			options: [
				{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '', useVariables: true },
				{ id: 'seconds', type: 'number', label: 'Position (seconds)', default: 0, min: 0, max: 86400, step: 0.1 },
			],
			callback: async (event) => {
				const uuid = event.options.uuid.trim()
				if (uuid)
					await self.apiPost(`/api/project/items/${encodeURIComponent(uuid)}/seek`, { seconds: event.options.seconds })
			},
		},
		stop_all: {
			name: 'Stop all',
			options: [
				{
					id: 'fade',
					type: 'textinput',
					label: 'Fade (ms, blank = project default)',
					tooltip: 'Leave blank for the project’s Stop All fade. 0 = instant.',
					default: '',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const fadeMs = parseFade(event.options.fade)
				if (fadeMs === undefined) {
					self.log('error', `Invalid Stop All fade: "${event.options.fade}"`)
					return
				}
				await self.apiPost('/api/transport/stop_all', fadeMs === null ? {} : { fade_ms: fadeMs })
			},
		},
		panic: {
			name: 'Panic (stop all, instant)',
			options: [],
			callback: async () => {
				await self.apiPost('/api/transport/stop_all', { fade_ms: 0 })
			},
		},
		cart_play: {
			name: 'Trigger cart slot',
			options: [
				{
					id: 'slot',
					type: 'number',
					label: 'Slot (1-64)',
					tooltip: 'Cart slot as shown in the LivePlay UI (1-based).',
					default: 1,
					min: 1,
					max: 64,
				},
			],
			callback: async (event) => {
				await self.apiPost(`/api/transport/cart/${event.options.slot - 1}/play`)
			},
		},
		master_gain_set: {
			name: 'Master gain: set',
			options: [{ id: 'db', type: 'number', label: 'Gain (dB)', default: 0, min: -60, max: 12, step: 0.5 }],
			callback: async (event) => {
				await self.apiPost('/api/master/gain', { db: event.options.db })
			},
		},
		master_gain_step: {
			name: 'Master gain: adjust',
			description: 'Adds the delta to the current master gain (applied server-side, race-free).',
			options: [{ id: 'delta', type: 'number', label: 'Delta (dB)', default: 1, min: -24, max: 24, step: 0.5 }],
			callback: async (event) => {
				await self.apiPost('/api/master/gain', { delta: event.options.delta })
			},
		},
		limiter: {
			name: 'Master limiter',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' },
					],
				},
			],
			callback: async (event) => {
				const body = event.options.mode === 'toggle' ? {} : { enabled: event.options.mode === 'on' }
				await self.apiPost('/api/master/limiter', body)
			},
		},
		arm_next: {
			name: 'Arm Up Next',
			description: 'Arms an item as the Up Next override for GO. Leave blank to clear the override.',
			options: [
				{
					id: 'uuid',
					type: 'textinput',
					label: 'Item UUID (blank = clear)',
					tooltip: UUID_TOOLTIP,
					default: '',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const uuid = event.options.uuid.trim()
				self.wsSend({ type: 'set_next_item', item_uuid: uuid })
			},
		},
		preview_start: {
			name: 'Preview (pre-listen) item',
			options: [
				{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '', useVariables: true },
			],
			callback: async (event) => {
				const uuid = event.options.uuid.trim()
				if (uuid) await self.apiPost('/api/preview', { itemUuid: uuid })
			},
		},
		preview_stop: {
			name: 'Stop preview',
			options: [],
			callback: async () => {
				await self.apiRequest('DELETE', '/api/preview')
			},
		},
		load_project: {
			name: 'Load project',
			options: [
				{
					id: 'path',
					type: 'textinput',
					label: 'Project path (on the server)',
					tooltip: 'Absolute path to a .liveplay project file on the machine running the LivePlay server.',
					default: '',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const path = event.options.path.trim()
				if (path) await self.apiPost('/api/project/load', { path })
			},
		},
		close_project: {
			name: 'Close project',
			options: [],
			callback: async () => {
				await self.apiPost('/api/project/close')
			},
		},
		pause_toggle: {
			name: 'Pause / resume on-air items',
			description:
				'Resumes everything paused, or pauses everything sounding — the same single-key behavior as LivePlay’s Pause/Resume shortcut.',
			options: [],
			callback: async () => {
				await self.apiPost('/api/transport/pause_toggle')
			},
		},

		// ---- Shared selection (LivePlay >= 2.4.0) --------------------------
		// The selection lives on the server, so these move the highlight in the
		// LivePlay playlist itself — the operator sees on screen exactly what
		// the surface is pointing at before they arm or fire it.
		select_step: {
			name: 'Select next / previous item',
			description:
				'Moves the playlist selection in LivePlay itself. Walks the flattened playlist (groups, then their children) and stops at the ends rather than wrapping.',
			options: [
				{
					id: 'delta',
					type: 'dropdown',
					label: 'Direction',
					default: 1,
					choices: [
						{ id: 1, label: 'Next (down)' },
						{ id: -1, label: 'Previous (up)' },
					],
				},
			],
			callback: async (event) => {
				await self.apiPost('/api/selection', { delta: event.options.delta })
			},
		},
		select_item: {
			name: 'Select item by UUID',
			options: [
				{
					id: 'uuid',
					type: 'textinput',
					label: 'Item UUID (blank = clear selection)',
					tooltip: UUID_TOOLTIP,
					default: '',
					useVariables: true,
				},
			],
			callback: async (event) => {
				await self.apiPost('/api/selection', { itemUuid: event.options.uuid.trim() })
			},
		},
		select_index: {
			name: 'Select item by index path',
			options: [
				{
					id: 'index',
					type: 'textinput',
					label: 'Index path (e.g. "0" or "1,11")',
					tooltip: 'Comma-separated child indices descending into groups, matching the LivePlay client UI. 0-based.',
					default: '0',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const raw = event.options.index
				const index = parseIndexPath(raw)
				if (!index) {
					self.log('error', `Invalid index path: "${raw}"`)
					return
				}
				const uuid = self.state.uuidAtIndex(index)
				if (!uuid) {
					self.log('warn', `No item at index path "${raw}"`)
					return
				}
				await self.apiPost('/api/selection', { itemUuid: uuid })
			},
		},
		arm_selected: {
			name: 'Arm selected as Up Next',
			description: 'Arms whatever is selected in LivePlay as the Up Next target for GO.',
			options: [],
			callback: async () => {
				await self.apiPost('/api/transport/arm_selected')
			},
		},
		play_selected: {
			name: 'Play selected item',
			description: 'Triggers the selected item immediately — LivePlay’s "Play Selected" shortcut.',
			options: [],
			callback: async () => {
				await self.apiPost('/api/transport/play_selected')
			},
		},
		preview_selected: {
			name: 'Preview selected item',
			description: 'Pre-listens the selected item on the preview device without going to air.',
			options: [],
			callback: async () => {
				const uuid = self.state.selection?.itemUuid
				if (!uuid) {
					self.log('info', 'Preview selected: nothing is selected')
					return
				}
				await self.apiPost('/api/preview', { itemUuid: uuid })
			},
		},
		show_mode: {
			name: 'Show Mode',
			description:
				'Switches LivePlay between the edit view and the simplified, touch-friendly Show Mode. Applies to every connected LivePlay client.',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'on', label: 'On (playback view)' },
						{ id: 'off', label: 'Off (edit view)' },
					],
				},
			],
			callback: async (event) => {
				const body = event.options.mode === 'toggle' ? {} : { enabled: event.options.mode === 'on' }
				await self.apiPost('/api/ui/showmode', body)
			},
		},

		// ---- Mixer buses -------------------------------------------------
		// Gain, mute and PFL go over the WebSocket, which is how LivePlay's own
		// mixer drives them: each is stored in the show and echoed to every
		// client as buses_patched / bus_pfl_changed.
		bus_gain_set: {
			name: 'Bus fader: set',
			options: [
				busOption(self),
				{ id: 'db', type: 'number', label: 'Level (dB)', default: 0, min: BUS_GAIN_MIN, max: BUS_GAIN_MAX, step: 0.5 },
			],
			callback: async (event) => {
				const bus = busFor(self, event.options.bus)
				if (bus) self.wsSend({ type: 'bus_gain', busId: bus.id, gainDb: event.options.db })
			},
		},
		bus_gain_step: {
			name: 'Bus fader: adjust',
			description: 'Moves a bus fader up or down from where it currently sits.',
			options: [
				busOption(self),
				{ id: 'delta', type: 'number', label: 'Delta (dB)', default: 1, min: -24, max: 24, step: 0.5 },
			],
			callback: async (event) => {
				const bus = busFor(self, event.options.bus)
				if (!bus) return
				// LivePlay has no relative bus-gain command, so step from the level
				// we last heard back. Each move is echoed as buses_patched, which
				// keeps that cached level current between presses.
				const db = Math.max(BUS_GAIN_MIN, Math.min(BUS_GAIN_MAX, bus.gainDb + event.options.delta))
				bus.gainDb = db
				self.wsSend({ type: 'bus_gain', busId: bus.id, gainDb: db })
			},
		},
		bus_mute: {
			name: 'Bus mute',
			options: [
				busOption(self),
				{ id: 'mode', type: 'dropdown', label: 'Mode', default: 'toggle', choices: MODE_CHOICES },
			],
			callback: async (event) => {
				const bus = busFor(self, event.options.bus)
				if (!bus) return
				// Toggle is left to the server, so two surfaces pressing at once can't cross.
				const msg: Record<string, unknown> = { type: 'bus_mute', busId: bus.id }
				if (event.options.mode !== 'toggle') msg.mute = event.options.mode === 'on'
				self.wsSend(msg)
			},
		},
		bus_pfl: {
			name: 'Bus PFL (pre-fade listen)',
			description: 'Listens to a bus through the Preview bus. Session-only: not saved in the show.',
			options: [
				busOption(self),
				{ id: 'mode', type: 'dropdown', label: 'Mode', default: 'toggle', choices: MODE_CHOICES },
			],
			callback: async (event) => {
				const bus = busFor(self, event.options.bus)
				if (!bus) return
				if (bus.preview) {
					self.log('warn', 'The Preview bus cannot be PFL’d')
					return
				}
				const msg: Record<string, unknown> = { type: 'bus_pfl', busId: bus.id }
				if (event.options.mode !== 'toggle') msg.pfl = event.options.mode === 'on'
				self.wsSend(msg)
			},
		},
		bus_pfl_clear: {
			name: 'Clear all PFL',
			options: [],
			callback: async () => {
				await self.apiPost('/api/buses/pfl/clear')
			},
		},
		preview_mono: {
			name: 'Preview mono audition',
			description: 'Sums the Preview bus to mono, to check a cue for phase problems. Session-only.',
			options: [{ id: 'mode', type: 'dropdown', label: 'Mode', default: 'toggle', choices: MODE_CHOICES }],
			callback: async (event) => {
				const mono = event.options.mode === 'toggle' ? !self.state.previewMono : event.options.mode === 'on'
				await self.apiPost('/api/preview/mono', { mono })
			},
		},
	})
}
