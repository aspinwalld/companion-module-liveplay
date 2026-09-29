import type { ModuleSchema } from './main.js'
import {
	ButtonGraphicsDecorationType,
	type ButtonGraphicsGaugeElement,
	type ButtonGraphicsTextElement,
	type CompanionButtonStepActions,
	type CompanionLayeredButtonPresetDefinition,
	type CompanionPresetLocalVariable,
} from '@companion-module/base'
import { GAUGE_TRACK_AMOUNT } from './colors.js'
import { PROGRESS_MAX } from './state.js'

/** Reference a module variable, e.g. `$(liveplay:cart_1_progress)`. */
export function moduleVar(variable: string): string {
	return `$(liveplay:${variable})`
}

/** Reference a button local variable, e.g. `$(local:progress)`. */
export function localVar(variable: string): string {
	return `$(local:${variable})`
}

/** Where a gauge button reads its three inputs from — each a variable reference. */
export interface GaugeSources {
	/** 0..PROGRESS_MAX */
	progress: string
	/** Packed RGB number. Gauge colors must be numbers: Companion 5.0.0 draws a `#RRGGBB` string as black. */
	fill: string
	/** Packed RGB number for the label. */
	text: string
}

/** The standard module-variable triple, e.g. `cart_1` -> cart_1_progress / _color_rgb / _text_rgb. */
export function moduleGaugeSources(prefix: string): GaugeSources {
	return {
		progress: moduleVar(`${prefix}_progress`),
		fill: moduleVar(`${prefix}_color_rgb`),
		text: moduleVar(`${prefix}_text_rgb`),
	}
}

function expr(value: string): { isExpression: true; value: string } {
	return { isExpression: true, value }
}

/**
 * A full-button horizontal progress bar. The whole button is the gauge: the
 * track shows the cue's color dimmed while it waits, and the fill sweeps
 * across in full color as it plays — so no separate background layer is
 * needed. Every property is set explicitly, because Companion's defaults for
 * an omitted gauge property (multi-color on, transparent track) are not this.
 */
function progressGauge(src: GaugeSources): ButtonGraphicsGaugeElement {
	return {
		type: 'gauge',
		id: 'elapsed',
		name: 'elapsed',
		enabled: true,
		opacity: 100,
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		rotation: 0,
		value: expr(src.progress),
		min: 0,
		max: PROGRESS_MAX,
		// origin omitted: "auto" — the fill grows from the start of the track
		symmetric: false,
		orientation: 'horizontal',
		reverse: false,
		fillEnabled: true,
		multiColour: false,
		fillWidth: 100,
		stops: [{ value: 0, color: expr(src.fill), gradient: false }],
		markerEnabled: false,
		trackStyle: 'dimmed',
		trackAmount: GAUGE_TRACK_AMOUNT,
		trackWidth: 100,
	}
}

/** Full-button label drawn over the gauge. `text` is a template: variables in it are interpolated. */
function gaugeLabel(text: string, color: string): ButtonGraphicsTextElement {
	return {
		type: 'text',
		id: 'label',
		name: 'label',
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		text,
		fontsizeAllowShrink: true,
		color: expr(color),
		halign: 'center',
		valign: 'center',
	}
}

/**
 * A layered button that is a progress gauge with a label over it — the one
 * look every cue-playing preset shares (cart pads, GO, Now Playing, Play
 * Selected, Trigger Cue).
 */
export function gaugePreset(def: {
	name: string
	keywords?: string[]
	label: string
	sources: GaugeSources
	steps: CompanionButtonStepActions<ModuleSchema>[]
	localVariables?: CompanionPresetLocalVariable<ModuleSchema['feedbacks']>[]
}): CompanionLayeredButtonPresetDefinition<ModuleSchema> {
	return {
		type: 'layered',
		name: def.name,
		keywords: def.keywords,
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [progressGauge(def.sources), gaugeLabel(def.label, def.sources.text)],
		steps: def.steps,
		feedbacks: [],
		localVariables: def.localVariables,
	}
}

/**
 * Local variables that point a gauge at one cue through the module's cue value
 * feedbacks. `cue` is a UUID, an index path, or a variable reference such as
 * `$(local:index)`. Gives `progress`, `fill`, `text` and `name` locals.
 */
export function cueGaugeLocals(cue: string): CompanionPresetLocalVariable<ModuleSchema['feedbacks']>[] {
	return [
		{ variableName: 'progress', variableType: 'feedback', feedbackId: 'cue_progress', options: { cue } },
		{ variableName: 'fill', variableType: 'feedback', feedbackId: 'cue_color_rgb', options: { cue } },
		{ variableName: 'text', variableType: 'feedback', feedbackId: 'cue_text_rgb', options: { cue } },
		{ variableName: 'name', variableType: 'feedback', feedbackId: 'cue_name', options: { cue } },
	]
}

/** Gauge sources for buttons built with cueGaugeLocals. */
export const CUE_LOCAL_SOURCES: GaugeSources = {
	progress: localVar('progress'),
	fill: localVar('fill'),
	text: localVar('text'),
}
