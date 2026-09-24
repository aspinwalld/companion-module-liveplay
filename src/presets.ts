import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'
import { combineRgb, type CompanionPresetDefinitions, type CompanionPresetSection } from '@companion-module/base'
import { NEUTRAL_BG, WHITE } from './colors.js'
import { strings } from './locale.js'
import { CART_SLOTS } from './variables.js'
import { CuePresets } from './presets-cues.js'

/** Cart slots offered as ready-made presets — the full LivePlay cart wall. */
const CART_PRESETS = CART_SLOTS

export function UpdatePresets(self: ModuleInstance): void {
	// Button text is written in the language LivePlay is currently displaying,
	// so the rack reads like the screen next to it. The server pushes locale
	// changes as a doc_patch and main.ts re-publishes these presets on receipt.
	const t = strings(self.state.locale)

	const presets: CompanionPresetDefinitions<ModuleSchema> = {}

	// GO carries the Up Next item's own color, so the operator can see what
	// they're about to fire without reading the name — the same color-first
	// read the playlist gives on screen.
	presets['go'] = {
		type: 'simple',
		name: `GO (${t.upNext} name + color)`,
		style: {
			text: `${t.go}\\n$(liveplay:next_name)`,
			size: 'auto',
			color: WHITE,
			bgcolor: combineRgb(0, 102, 0),
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'go', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'next_color', options: { idle: combineRgb(0, 51, 0) } }],
	}

	presets['next_display'] = {
		type: 'simple',
		name: `${t.upNext} display`,
		style: {
			text: `${t.upNext}\\n$(liveplay:next_name)`,
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [],
		feedbacks: [{ feedbackId: 'next_color', options: { idle: NEUTRAL_BG } }],
	}

	// The now-playing button shows the last-triggered cue in its own color,
	// counting down, and flashes yellow/orange/red at 30/10/5 s exactly as the
	// on-screen cue card does.
	presets['now_playing'] = {
		type: 'simple',
		name: 'Now playing (color + countdown + end flash)',
		style: {
			text: '$(liveplay:current_item)\\n-$(liveplay:remaining)',
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [],
		feedbacks: [{ feedbackId: 'playing_color', options: { idle: NEUTRAL_BG, flash: true } }],
	}

	presets['now_playing_pause'] = {
		type: 'simple',
		name: `Now playing / ${t.pause}`,
		style: {
			text: '$(liveplay:current_item)\\n-$(liveplay:remaining)',
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'pause_toggle', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'playing_color', options: { idle: NEUTRAL_BG, flash: true } }],
	}

	presets['stop_all'] = {
		type: 'simple',
		name: t.stopAll,
		style: {
			text: t.stopAll.toUpperCase(),
			size: 'auto',
			color: WHITE,
			bgcolor: combineRgb(102, 0, 0),
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'stop_all', options: { fade: '' } }], up: [] }],
		feedbacks: [],
	}

	presets['panic'] = {
		type: 'simple',
		name: `${t.panic} (instant stop all)`,
		style: {
			text: t.panic,
			size: 'auto',
			color: WHITE,
			bgcolor: combineRgb(204, 0, 0),
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'panic', options: {} }], up: [] }],
		feedbacks: [],
	}

	presets['pause_toggle'] = {
		type: 'simple',
		name: `${t.pause} / ${t.resume}`,
		style: {
			text: `${t.pause}\\n${t.resume}`,
			size: 'auto',
			color: WHITE,
			bgcolor: combineRgb(153, 92, 0),
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'pause_toggle', options: {} }], up: [] }],
		feedbacks: [],
	}

	// ---- Selection ---------------------------------------------------------
	// The arrow glyph leads so the button reads at a glance on a 72 px key; the
	// translated label sits underneath for anyone who needs it.
	presets['select_prev'] = {
		type: 'simple',
		name: t.selectUp,
		style: {
			text: `▲\\n${t.selectUp}`,
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'select_step', options: { delta: -1 } }], up: [] }],
		feedbacks: [],
	}

	presets['select_next'] = {
		type: 'simple',
		name: t.selectDown,
		style: {
			text: `▼\\n${t.selectDown}`,
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'select_step', options: { delta: 1 } }], up: [] }],
		feedbacks: [],
	}

	// Arming shows a preview of what will be armed — name and color — so the
	// press is confirmable before it happens.
	presets['arm_selected'] = {
		type: 'simple',
		name: `${t.setAsNext} (selected item preview)`,
		style: {
			text: `${t.setAsNext}\\n$(liveplay:selected_name)`,
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'arm_selected', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'selected_color', options: { idle: NEUTRAL_BG } }],
	}

	presets['selected_display'] = {
		type: 'simple',
		name: 'Selected item display',
		style: {
			text: '$(liveplay:selected_name)',
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [],
		feedbacks: [{ feedbackId: 'selected_color', options: { idle: NEUTRAL_BG } }],
	}

	presets['play_selected'] = {
		type: 'simple',
		name: t.playSelected,
		style: {
			text: `${t.playSelected}\\n$(liveplay:selected_name)`,
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'play_selected', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'selected_color', options: { idle: NEUTRAL_BG } }],
	}

	presets['preview_selected'] = {
		type: 'simple',
		name: `${t.preview} (selected item)`,
		style: {
			text: `${t.preview}\\n$(liveplay:selected_name)`,
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'preview_selected', options: {} }], up: [] }],
		feedbacks: [
			{
				feedbackId: 'preview_active',
				options: {},
				style: { bgcolor: combineRgb(153, 51, 204), color: WHITE },
			},
		],
	}

	presets['show_mode'] = {
		type: 'simple',
		name: `${t.showMode} toggle`,
		style: {
			text: `${t.showMode}\\n$(liveplay:show_mode)`,
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'show_mode', options: { mode: 'toggle' } }], up: [] }],
		feedbacks: [
			{
				feedbackId: 'show_mode',
				options: {},
				style: { bgcolor: combineRgb(153, 51, 204), color: WHITE },
			},
		],
	}

	// ---- Cart --------------------------------------------------------------
	// Each pad shows the cue actually loaded into the slot, in its own color —
	// dimmed while idle, full while firing. Empty slots fall back to the slot
	// number so an unbuilt cart wall still reads as a cart wall.
	const cartPresetIds: string[] = []
	for (let slot = 1; slot <= CART_PRESETS; slot++) {
		const id = `cart_${slot}`
		cartPresetIds.push(id)
		presets[id] = {
			type: 'simple',
			name: `${t.slot} ${slot}`,
			style: {
				text: `$(liveplay:cart_${slot}_name)`,
				size: 'auto',
				color: WHITE,
				bgcolor: NEUTRAL_BG,
				show_topbar: false,
			},
			steps: [{ down: [{ actionId: 'cart_play', options: { slot } }], up: [] }],
			feedbacks: [{ feedbackId: 'cart_color', options: { slot, idle: NEUTRAL_BG } }],
		}
	}

	presets['master_gain_up'] = {
		type: 'simple',
		name: 'Master gain +1 dB',
		style: {
			text: `${t.master}\\n+1 dB`,
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'master_gain_step', options: { delta: 1 } }], up: [] }],
		feedbacks: [],
	}

	presets['master_gain_down'] = {
		type: 'simple',
		name: 'Master gain -1 dB',
		style: {
			text: `${t.master}\\n-1 dB`,
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'master_gain_step', options: { delta: -1 } }], up: [] }],
		feedbacks: [],
	}

	presets['master_gain_display'] = {
		type: 'simple',
		name: 'Master gain display',
		style: {
			text: `${t.master}\\n$(liveplay:master_gain) dB`,
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [],
		feedbacks: [],
	}

	presets['limiter'] = {
		type: 'simple',
		name: 'Limiter toggle',
		style: {
			text: `${t.limiter}\\n$(liveplay:limiter)`,
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [{ down: [{ actionId: 'limiter', options: { mode: 'toggle' } }], up: [] }],
		feedbacks: [
			{
				feedbackId: 'limiter_enabled',
				options: {},
				style: { bgcolor: combineRgb(0, 102, 153), color: WHITE },
			},
			{
				feedbackId: 'limiter_engaged',
				options: {},
				style: { bgcolor: combineRgb(204, 0, 0), color: WHITE },
			},
		],
	}

	presets['loudness'] = {
		type: 'simple',
		name: 'Loudness (LUFS short-term)',
		style: {
			text: 'LUFS-S\\n$(liveplay:lufs_s)',
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		steps: [],
		feedbacks: [
			{
				feedbackId: 'limiter_engaged',
				options: {},
				style: { bgcolor: combineRgb(204, 0, 0), color: WHITE },
			},
		],
	}

	presets['connection'] = {
		type: 'simple',
		name: 'Connection status',
		style: {
			text: 'LivePlay\\n$(liveplay:project_name)',
			size: 'auto',
			color: WHITE,
			bgcolor: combineRgb(102, 0, 0),
			show_topbar: false,
		},
		steps: [],
		feedbacks: [
			{
				feedbackId: 'connected',
				options: {},
				style: { bgcolor: combineRgb(0, 102, 0), color: WHITE },
			},
		],
	}

	const cues = CuePresets(self)
	Object.assign(presets, cues.presets)

	const structure: CompanionPresetSection[] = [
		{
			id: 'transport',
			name: 'Transport',
			definitions: [
				{
					id: 'transport_main',
					name: 'Transport',
					description: 'GO, pause/resume, stop all and the now-playing display',
					type: 'simple',
					presets: ['go', 'now_playing', 'now_playing_pause', 'pause_toggle', 'stop_all', 'panic'],
				},
				{
					id: 'transport_next',
					name: 'Up Next',
					description: 'What GO will fire, in the item’s own color',
					type: 'simple',
					presets: ['next_display'],
				},
			],
		},
		cues.section,
		{
			id: 'selection',
			name: 'Selection & Show Mode',
			definitions: [
				{
					id: 'selection_main',
					name: 'Selection',
					description: 'Step the LivePlay playlist selection, then arm, play or pre-listen it',
					type: 'simple',
					presets: [
						'select_prev',
						'select_next',
						'selected_display',
						'arm_selected',
						'play_selected',
						'preview_selected',
					],
				},
				{
					id: 'show_mode_main',
					name: 'Show Mode',
					description: 'Switch every LivePlay client between the edit and playback views',
					type: 'simple',
					presets: ['show_mode'],
				},
			],
		},
		{
			id: 'cart',
			name: 'Cart',
			definitions: [
				{
					id: 'cart_slots',
					name: 'Cart slots',
					description: `Trigger cart slots 1-${CART_PRESETS}, showing each slot’s loaded cue name and color`,
					type: 'simple',
					presets: cartPresetIds,
				},
			],
		},
		{
			id: 'master',
			name: 'Master section',
			definitions: [
				{
					id: 'master_main',
					name: 'Master gain & limiter',
					description: 'Master gain control, limiter toggle and loudness readout',
					type: 'simple',
					presets: ['master_gain_down', 'master_gain_display', 'master_gain_up', 'limiter', 'loudness'],
				},
			],
		},
		{
			id: 'status',
			name: 'Status',
			definitions: [
				{
					id: 'status_main',
					name: 'Status',
					description: 'Connection and project status',
					type: 'simple',
					presets: ['connection'],
				},
			],
		},
	]

	self.setPresetDefinitions(structure, presets)
}
