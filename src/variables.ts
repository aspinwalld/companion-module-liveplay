import type ModuleInstance from './main.js'
import { formatTime, Transport } from './liveplay.js'
import { strings } from './locale.js'
import { blend, contrastText, gaugeFill, gaugeText, warnColor } from './colors.js'
import { PROGRESS_MAX, type LivePlayState } from './state.js'

/** Cart slots surfaced as variables — matches the 16 slots of LivePlay's cart wall. */
export const CART_SLOTS = 16

/** What a progress gauge needs to draw one item: how far through it is, its fill, and legible text. */
export interface ItemGauge {
	/** 0..PROGRESS_MAX */
	progress: number
	/** Packed RGB fill (gauge colors must be numbers). */
	fill: number
	/** Packed RGB text color that reads over the gauge. */
	text: number
}

/**
 * Gauge inputs for an item ('' = no item). The one place progress, fill and
 * text color are derived, so the cart pads, GO, Now Playing, Play Selected
 * and every Trigger Cue button draw an item the same way.
 */
export function itemGauge(state: LivePlayState, itemUuid: string, color?: string): ItemGauge {
	const loaded = itemUuid !== ''
	const fill = gaugeFill(color || (loaded ? state.itemColor(itemUuid) : ''), loaded)
	return {
		progress: loaded ? state.progressOf(itemUuid) : 0,
		fill,
		text: gaugeText(fill, loaded && state.isAudible(itemUuid)),
	}
}

/** Variable-id-safe form of a bus id (ids are server-generated, e.g. "music"). */
export function busVariableKey(busId: string): string {
	return busId.replace(/[^A-Za-z0-9_-]/g, '_')
}

export type VariablesSchema = {
	project_name: string
	item_count: number
	playing_count: number
	current_item: string
	current_item_uuid: string
	current_color: string
	current_state: string
	current_progress: number
	current_color_rgb: number
	current_text_rgb: number
	current_flash_rgb: number
	current_flash_text_rgb: number
	next_progress: number
	next_color_rgb: number
	next_text_rgb: number
	selected_progress: number
	selected_color_rgb: number
	selected_text_rgb: number
	elapsed: string
	remaining: string
	duration: string
	warn_level: string
	next_name: string
	next_uuid: string
	next_color: string
	next_index: string
	next_source: string
	selected_name: string
	selected_uuid: string
	selected_color: string
	selected_index: string
	show_mode: string
	locale: string
	master_gain: string
	limiter: string
	lufs_m: string
	lufs_s: string
	preview_mono: string
	advance_in: string
	server_version: string
	// Per-item name variables generated from the project catalog:
	// item_name_<uuid> and item_name_at_<index path joined by _>
	// Per-cart-slot: cart_<n>_name, cart_<n>_uuid, cart_<n>_color,
	//   cart_<n>_progress, cart_<n>_color_rgb, cart_<n>_text_rgb
	// Per-bus: bus_<id>_name, bus_<id>_gain, bus_<id>_mute, bus_<id>_pfl
} & Record<string, string | number>

/** Variable id for an item's name addressed by uuid. */
export function itemNameByUuidVariable(uuid: string): string {
	return `item_name_${uuid}`
}

/** Variable id for an item's name addressed by index path, or null for cart-only (-1) paths. */
export function itemNameByIndexVariable(index: number[] | undefined): string | null {
	if (!index || index.length === 0 || index.some((i) => i < 0)) return null
	return `item_name_at_${index.join('_')}`
}

/** Human-readable transport state, in the operator's language where LivePlay has a word for it. */
function transportLabel(t: Transport | undefined, locale: string): string {
	const s = strings(locale)
	switch (t) {
		case Transport.Playing:
			return s.playing
		case Transport.FadingIn:
			return 'Fading in'
		case Transport.FadingOut:
			return 'Fading out'
		case Transport.Paused:
			return s.pause
		default:
			return ''
	}
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const definitions: Parameters<typeof self.setVariableDefinitions>[0] = {
		project_name: { name: 'Project name' },
		item_count: { name: 'Top-level item count' },
		playing_count: { name: 'Number of on-air items (includes paused)' },
		current_item: { name: 'Current item name (most recently triggered)' },
		current_item_uuid: { name: 'Current item UUID' },
		current_color: { name: 'Current item color (#RRGGBB)' },
		current_state: { name: 'Current item transport state' },
		current_progress: { name: `Current item progress (0-${PROGRESS_MAX}, for gauges)` },
		current_color_rgb: { name: 'Current item color (packed RGB number, for gauges)' },
		current_text_rgb: { name: 'Legible text color over the current item gauge (packed RGB)' },
		current_flash_rgb: {
			name: 'Current item color with the end-of-cue warning flash blended in (packed RGB, for gauges)',
		},
		current_flash_text_rgb: { name: 'Legible text color over current_flash_rgb (packed RGB)' },
		next_progress: { name: `Up Next item progress (0-${PROGRESS_MAX}; 0 until it is on air)` },
		next_color_rgb: { name: 'Up Next item color (packed RGB number, for gauges)' },
		next_text_rgb: { name: 'Legible text color over the Up Next gauge (packed RGB)' },
		selected_progress: { name: `Selected item progress (0-${PROGRESS_MAX}; 0 unless it is on air)` },
		selected_color_rgb: { name: 'Selected item color (packed RGB number, for gauges)' },
		selected_text_rgb: { name: 'Legible text color over the selected item gauge (packed RGB)' },
		elapsed: { name: 'Current item elapsed (mm:ss)' },
		remaining: { name: 'Current item remaining (mm:ss)' },
		duration: { name: 'Current item duration (mm:ss)' },
		warn_level: { name: 'End-of-cue warning (yellow/orange/red, blank when clear)' },
		next_name: { name: 'Up Next item name' },
		next_uuid: { name: 'Up Next item UUID' },
		next_color: { name: 'Up Next item color (#RRGGBB)' },
		next_index: { name: 'Up Next item index path' },
		next_source: { name: 'Up Next source (override / auto)' },
		selected_name: { name: 'Selected item name' },
		selected_uuid: { name: 'Selected item UUID' },
		selected_color: { name: 'Selected item color (#RRGGBB)' },
		selected_index: { name: 'Selected item index path' },
		show_mode: { name: 'Show Mode (On/Off)' },
		locale: { name: 'LivePlay display locale' },
		master_gain: { name: 'Master gain (dB)' },
		limiter: { name: 'Limiter enabled (On/Off)' },
		lufs_m: { name: 'Master loudness, momentary (K-weighted dB)' },
		lufs_s: { name: 'Master loudness, short-term (K-weighted dB)' },
		preview_mono: { name: 'Preview mono audition (On/Off)' },
		advance_in: { name: 'Seconds until a pending cue wait fires (blank when none)' },
		server_version: { name: 'LivePlay server version' },
	}

	for (let slot = 1; slot <= CART_SLOTS; slot++) {
		definitions[`cart_${slot}_name`] = { name: `Cart slot ${slot}: item name (slot number when empty)` }
		definitions[`cart_${slot}_uuid`] = { name: `Cart slot ${slot}: item UUID` }
		definitions[`cart_${slot}_color`] = { name: `Cart slot ${slot}: item color (#RRGGBB)` }
		definitions[`cart_${slot}_progress`] = { name: `Cart slot ${slot}: playback progress (0-${PROGRESS_MAX})` }
		definitions[`cart_${slot}_color_rgb`] = { name: `Cart slot ${slot}: item color (packed RGB number, for gauges)` }
		definitions[`cart_${slot}_text_rgb`] = { name: `Cart slot ${slot}: legible text color over the gauge (packed RGB)` }
	}

	for (const bus of self.state.buses.values()) {
		const key = busVariableKey(bus.id)
		definitions[`bus_${key}_name`] = { name: `Bus ${bus.name}: name` }
		definitions[`bus_${key}_gain`] = { name: `Bus ${bus.name}: fader (dB)` }
		definitions[`bus_${key}_mute`] = { name: `Bus ${bus.name}: muted (On/Off)` }
		definitions[`bus_${key}_pfl`] = { name: `Bus ${bus.name}: PFL (On/Off)` }
	}

	for (const item of self.state.catalog.values()) {
		definitions[itemNameByUuidVariable(item.uuid)] = { name: `Item name by UUID: ${item.name}` }
		const byIndex = itemNameByIndexVariable(item.index)
		if (byIndex) definitions[byIndex] = { name: `Item name at index ${item.index?.join(',')}: ${item.name}` }
	}

	self.setVariableDefinitions(definitions)
}

/** Compute the full set of variable values from the cached state. */
export function CollectVariableValues(self: ModuleInstance): Partial<VariablesSchema> {
	const state = self.state
	const current = state.currentItem()
	const remaining = state.remainingSec(current)
	const fmtDb = (db: number | null): string => (db === null || !Number.isFinite(db) ? '-' : db.toFixed(1))
	const fmtIndex = (index: number[] | undefined): string => (index && index.length > 0 ? index.join(',') : '')

	const itemNames: Partial<VariablesSchema> = {}
	for (const item of state.catalog.values()) {
		itemNames[itemNameByUuidVariable(item.uuid)] = item.name
		const byIndex = itemNameByIndexVariable(item.index)
		if (byIndex) itemNames[byIndex] = item.name
	}

	const cartValues: Partial<VariablesSchema> = {}
	for (let slot = 1; slot <= CART_SLOTS; slot++) {
		const bound = state.cart.get(slot - 1)
		// An empty pad falls back to its slot number, so an unbuilt cart wall
		// still reads as a numbered cart wall rather than a row of blanks.
		cartValues[`cart_${slot}_name`] = bound?.name || String(slot)
		cartValues[`cart_${slot}_uuid`] = bound?.itemUuid ?? ''
		cartValues[`cart_${slot}_color`] = bound?.color ?? ''
		// Progress and the numeric colors feed a Companion gauge element: the
		// fill grows across the pad as the cue plays, over a dimmed track of
		// the same color.
		const gauge = itemGauge(state, bound?.itemUuid ?? '', bound?.color)
		cartValues[`cart_${slot}_progress`] = gauge.progress
		cartValues[`cart_${slot}_color_rgb`] = gauge.fill
		cartValues[`cart_${slot}_text_rgb`] = gauge.text
	}

	const busValues: Partial<VariablesSchema> = {}
	for (const bus of state.buses.values()) {
		const key = busVariableKey(bus.id)
		busValues[`bus_${key}_name`] = bus.name
		busValues[`bus_${key}_gain`] = bus.gainDb.toFixed(1)
		busValues[`bus_${key}_mute`] = bus.mute ? 'On' : 'Off'
		busValues[`bus_${key}_pfl`] = bus.pfl ? 'On' : 'Off'
	}

	const currentGauge = itemGauge(state, current?.itemUuid ?? '', current?.color)
	const nextGauge = itemGauge(state, state.next?.itemUuid ?? '', state.next?.color)
	const selectedGauge = itemGauge(state, state.selection?.itemUuid ?? '', state.selection?.color)

	// The now-playing gauge carries the end-of-cue warning: its color
	// cross-fades toward yellow / orange / red on the same beat as LivePlay's
	// on-screen cue card. Paused cues hold still, as they do on screen.
	const level = current && !state.isPaused(current.itemUuid) ? self.warnLevelOf(remaining) : null
	const warn = warnColor(level)
	const flashFill = warn === null ? currentGauge.fill : blend(currentGauge.fill, warn, self.flashPhase(level))
	const flashText = warn === null ? currentGauge.text : contrastText(flashFill)

	const advanceIn = state.advanceRemainingSec()

	return {
		...itemNames,
		...cartValues,
		...busValues,
		project_name: state.projectName,
		item_count: state.itemCount,
		playing_count: state.playing.size,
		current_item: current?.name ?? '',
		current_item_uuid: current?.itemUuid ?? '',
		current_color: current?.color ?? '',
		current_state: transportLabel(current?.transport, state.locale),
		current_progress: currentGauge.progress,
		current_color_rgb: currentGauge.fill,
		current_text_rgb: currentGauge.text,
		current_flash_rgb: flashFill,
		current_flash_text_rgb: flashText,
		elapsed: current ? formatTime(current.elapsedSec) : '-',
		remaining: remaining !== null ? formatTime(remaining) : '-',
		duration: current ? formatTime(current.durationSec) : '-',
		// Blank rather than 'none' so `$(liveplay:warn_level)` can be dropped
		// straight into button text without reading as noise when all is well.
		warn_level: current && !state.isPaused(current.itemUuid) ? (self.warnLevelOf(remaining) ?? '') : '',
		next_name: state.next?.name ?? '',
		next_uuid: state.next?.itemUuid ?? '',
		next_color: state.next?.color ?? '',
		next_index: fmtIndex(state.next?.index),
		next_source: state.next?.source ?? '',
		next_progress: nextGauge.progress,
		next_color_rgb: nextGauge.fill,
		next_text_rgb: nextGauge.text,
		selected_name: state.selection?.name ?? '',
		selected_uuid: state.selection?.itemUuid ?? '',
		selected_color: state.selection?.color ?? '',
		selected_index: fmtIndex(state.selection?.index),
		selected_progress: selectedGauge.progress,
		selected_color_rgb: selectedGauge.fill,
		selected_text_rgb: selectedGauge.text,
		show_mode: state.showMode ? 'On' : 'Off',
		locale: state.locale,
		master_gain: state.masterGainDb.toFixed(1),
		limiter: state.limiterEnabled ? 'On' : 'Off',
		lufs_m: fmtDb(state.lufsM),
		lufs_s: fmtDb(state.lufsS),
		preview_mono: state.previewMono ? 'On' : 'Off',
		advance_in: advanceIn === null ? '' : Math.ceil(advanceIn).toString(),
		server_version: state.serverVersion,
	}
}
