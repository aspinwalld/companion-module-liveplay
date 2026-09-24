import { combineRgb, type CompanionAdvancedFeedbackResult } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { blend, contrastText, itemStyle, warnColor, warnLevel, NEUTRAL_BG, PAUSED_BG, PLAYING_BG } from './colors.js'
import { parseIndexPath } from './liveplay.js'

export type FeedbacksSchema = {
	connected: { type: 'boolean'; options: Record<string, never> }
	project_loaded: { type: 'boolean'; options: Record<string, never> }
	item_playing: { type: 'boolean'; options: { uuid: string } }
	item_paused: { type: 'boolean'; options: { uuid: string } }
	anything_playing: { type: 'boolean'; options: Record<string, never> }
	cart_active: { type: 'boolean'; options: { slot: number } }
	limiter_enabled: { type: 'boolean'; options: Record<string, never> }
	limiter_engaged: { type: 'boolean'; options: Record<string, never> }
	preview_active: { type: 'boolean'; options: Record<string, never> }
	show_mode: { type: 'boolean'; options: Record<string, never> }
	item_selected: { type: 'boolean'; options: { uuid: string } }
	item_is_next: { type: 'boolean'; options: { uuid: string } }
	next_color: { type: 'advanced'; options: { idle: number } }
	selected_color: { type: 'advanced'; options: { idle: number } }
	playing_color: { type: 'advanced'; options: { idle: number; flash: boolean } }
	cart_color: { type: 'advanced'; options: { slot: number; idle: number } }
	item_color: { type: 'advanced'; options: { uuid: string; idle: number } }
	cue_button: {
		type: 'advanced'
		options: { cue: string; idle: number; playing: number; paused: number; show_name: boolean }
	}
}

const UUID_TOOLTIP = 'The item UUID from the LivePlay project.'

/** Shared "what to show when there is no item" option. */
const idleOption = {
	id: 'idle' as const,
	type: 'colorpicker' as const,
	label: 'Background when empty',
	tooltip: 'Used when there is no item to take a color from.',
	default: NEUTRAL_BG,
}

/** Style for an item's authored color, or the idle fill when there is none. */
function colorOf(color: string | undefined, idle: number, intensity = 1): CompanionAdvancedFeedbackResult {
	if (!color) return { bgcolor: idle, color: contrastText(idle) }
	return itemStyle(color, intensity, idle)
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({
		connected: {
			name: 'Connected to LivePlay',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 102, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: () => self.connected,
		},
		project_loaded: {
			name: 'Project loaded',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 51, 102),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: () => self.state.hasOpenProject,
		},
		item_playing: {
			name: 'Item is playing',
			description: 'True while the item is sounding (playing or fading). Paused items are not "playing".',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 204, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '' }],
			callback: (feedback) => self.state.isAudible(feedback.options.uuid.trim()),
		},
		item_paused: {
			name: 'Item is paused',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(255, 153, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '' }],
			callback: (feedback) => self.state.isPaused(feedback.options.uuid.trim()),
		},
		anything_playing: {
			name: 'Anything is playing',
			description: 'True while at least one item is sounding (paused items do not count).',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 204, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [],
			callback: () => self.state.anythingAudible(),
		},
		cart_active: {
			name: 'Cart slot is playing',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 204, 0),
				color: combineRgb(0, 0, 0),
			},
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
			callback: (feedback) => self.state.isCartSlotActive(feedback.options.slot - 1),
		},
		limiter_enabled: {
			name: 'Limiter enabled',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 102, 153),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: () => self.state.limiterEnabled,
		},
		limiter_engaged: {
			name: 'Limiter engaged (reducing gain)',
			description: 'True while the limiter is actively reducing the master output level.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(204, 0, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: () => self.state.limiterEngaged,
		},
		preview_active: {
			name: 'Preview (pre-listen) active',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(153, 51, 204),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: () => self.state.previewActive,
		},
		show_mode: {
			name: 'Show Mode is on',
			description: 'True while LivePlay is in the simplified, touch-friendly playback view.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(153, 51, 204),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: () => self.state.showMode,
		},
		item_selected: {
			name: 'Item is selected',
			description: 'True while this item is the one selected in the LivePlay playlist.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(51, 51, 51),
				color: combineRgb(255, 255, 255),
			},
			options: [{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '' }],
			callback: (feedback) => {
				const uuid = feedback.options.uuid.trim()
				return uuid !== '' && self.state.selection?.itemUuid === uuid
			},
		},
		item_is_next: {
			name: 'Item is armed as Up Next',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(255, 153, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '' }],
			callback: (feedback) => {
				const uuid = feedback.options.uuid.trim()
				return uuid !== '' && self.state.next?.itemUuid === uuid
			},
		},

		// ---- Color mirrors ------------------------------------------------
		// LivePlay identifies cues by color first and name second, so a button
		// that shows the name without the color is doing half the job. These
		// paint the button in the item's own authored color, picking legible
		// text for whatever that color turns out to be.
		next_color: {
			name: 'Up Next item color',
			description: 'Paints the button in the color of whatever is armed as Up Next. Use on a GO button.',
			type: 'advanced',
			options: [idleOption],
			callback: (feedback) => colorOf(self.state.next?.color, feedback.options.idle),
		},
		selected_color: {
			name: 'Selected item color',
			description: 'Paints the button in the color of the item selected in the LivePlay playlist.',
			type: 'advanced',
			options: [idleOption],
			callback: (feedback) => colorOf(self.state.selection?.color, feedback.options.idle),
		},
		playing_color: {
			name: 'Playing item color (with end-of-cue flash)',
			description:
				'Paints the button in the color of the most recently triggered on-air item. Optionally flashes yellow / orange / red as the cue nears its end, matching LivePlay’s on-screen warning border (30 s / 10 s / 5 s).',
			type: 'advanced',
			options: [
				idleOption,
				{
					id: 'flash',
					type: 'checkbox',
					label: 'Flash near the end of the cue',
					default: true,
				},
			],
			callback: (feedback) => {
				const current = self.state.currentItem()
				if (!current) return { bgcolor: feedback.options.idle, color: contrastText(feedback.options.idle) }

				const base = colorOf(current.color, feedback.options.idle)
				if (!feedback.options.flash) return base

				const level = warnLevel(self.state.remainingSec(current))
				const warn = warnColor(level)
				// Paused cues are held deliberately — a countdown that isn't
				// running has no business flashing an alarm at the operator.
				if (warn === null || self.state.isPaused(current.itemUuid)) return base

				// The client animates the border's opacity 0 -> 1 -> 0; a button
				// has no border to fade, so we cross-fade the whole fill between
				// the cue's own color and the warning color on the same period.
				const t = self.flashPhase(level)
				const bgcolor = blend(base.bgcolor ?? NEUTRAL_BG, warn, t)
				return { bgcolor, color: contrastText(bgcolor) }
			},
		},
		cart_color: {
			name: 'Cart slot color',
			description:
				'Paints the button in the color of the item loaded into a cart slot, at full brightness while it plays and dimmed while idle. Empty slots use the idle color.',
			type: 'advanced',
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
				idleOption,
			],
			callback: (feedback) => {
				const slot = feedback.options.slot - 1
				const bound = self.state.cart.get(slot)
				if (!bound) return { bgcolor: feedback.options.idle, color: contrastText(feedback.options.idle) }
				// Dimmed when loaded but idle, full when sounding — the same
				// "armed vs firing" read the cart wall gives on screen.
				return colorOf(bound.color, feedback.options.idle, self.state.isCartSlotActive(slot) ? 1 : 0.45)
			},
		},
		item_color: {
			name: 'Item color by UUID',
			description: 'Paints the button in a specific item’s color, brightening while it is on air.',
			type: 'advanced',
			options: [{ id: 'uuid', type: 'textinput', label: 'Item UUID', tooltip: UUID_TOOLTIP, default: '' }, idleOption],
			callback: (feedback) => {
				const uuid = feedback.options.uuid.trim()
				const color = uuid ? self.state.itemColor(uuid) : ''
				if (!color) return { bgcolor: feedback.options.idle, color: contrastText(feedback.options.idle) }
				return colorOf(color, feedback.options.idle, self.state.isAudible(uuid) ? 1 : 0.45)
			},
		},
		// One feedback that does a whole cue button — name, color and play
		// state — from a single value, so the manual presets can point it and
		// their action at the same local variable and stay in step.
		cue_button: {
			name: 'Cue button (name, color and play state)',
			description:
				'Shows a cue’s name in its own color (dimmed while idle), with a fill while it plays or is paused. Takes a UUID or an index path, including variables such as $(local:index).',
			type: 'advanced',
			options: [
				{
					id: 'cue',
					type: 'textinput',
					label: 'Cue (UUID or index path)',
					tooltip: 'An item UUID, or a 0-based index path such as "2,35".',
					default: '',
					useVariables: true,
				},
				{ id: 'show_name', type: 'checkbox', label: 'Show the cue name as button text', default: true },
				idleOption,
				{ id: 'playing', type: 'colorpicker', label: 'Background while playing', default: PLAYING_BG },
				{ id: 'paused', type: 'colorpicker', label: 'Background while paused', default: PAUSED_BG },
			],
			callback: (feedback) => {
				const raw = feedback.options.cue.trim()
				const index = parseIndexPath(raw)
				const uuid = index ? self.state.uuidAtIndex(index) : raw
				const { idle, playing, paused, show_name } = feedback.options

				let style: CompanionAdvancedFeedbackResult
				if (uuid && self.state.isAudible(uuid)) style = { bgcolor: playing, color: contrastText(playing) }
				else if (uuid && self.state.isPaused(uuid)) style = { bgcolor: paused, color: contrastText(paused) }
				else style = colorOf(uuid ? self.state.itemColor(uuid) : '', idle, 0.45)

				// An unresolvable cue shows what was typed, so a wrong index or
				// UUID reads as wrong rather than as a blank key.
				if (show_name && raw) style.text = (uuid && self.state.itemName(uuid)) || raw
				return style
			},
		},
	})
}
