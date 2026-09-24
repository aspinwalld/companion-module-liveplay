/**
 * Color helpers for painting buttons the way LivePlay paints its playlist.
 *
 * LivePlay stores a per-item color as a `#RRGGBB` string (see PRESET_COLORS
 * in the client's types/project.ts). Companion wants packed 24-bit integers,
 * so everything here converts between the two and derives the surrounding
 * styling — legible text, dimmed idle states, and the end-of-cue warning
 * flash — from that one authored color.
 */
import { combineRgb } from '@companion-module/base'

export const WHITE = combineRgb(255, 255, 255)
export const BLACK = combineRgb(0, 0, 0)

/** Neutral button background used when an item has no color of its own. */
export const NEUTRAL_BG = combineRgb(28, 28, 30)

/** Cue-button fills while a cue is sounding / held paused. */
export const PLAYING_BG = combineRgb(0, 204, 0)
export const PAUSED_BG = combineRgb(255, 153, 0)

/**
 * End-of-cue warning colors and blink periods, matched to the client's
 * ActiveCueItem warning border so a Companion button and the on-screen card
 * pulse the same way at the same moments.
 */
export const WARN_YELLOW = combineRgb(255, 193, 7)
export const WARN_ORANGE = combineRgb(255, 152, 0)
export const WARN_RED = combineRgb(244, 67, 54)

export type WarnLevel = 'red' | 'orange' | 'yellow' | null

/** Seconds-remaining thresholds, mirroring ActiveCueItem.vue's warningState. */
export function warnLevel(remainingSec: number | null): WarnLevel {
	if (remainingSec === null || !Number.isFinite(remainingSec)) return null
	if (remainingSec <= 5) return 'red'
	if (remainingSec <= 10) return 'orange'
	if (remainingSec <= 30) return 'yellow'
	return null
}

export function warnColor(level: WarnLevel): number | null {
	switch (level) {
		case 'red':
			return WARN_RED
		case 'orange':
			return WARN_ORANGE
		case 'yellow':
			return WARN_YELLOW
		default:
			return null
	}
}

/**
 * Blink period in milliseconds for each warning level — the client animates
 * these borders at 0.5 s (red), 1 s (orange) and 2 s (yellow).
 */
export function warnPeriodMs(level: WarnLevel): number {
	switch (level) {
		case 'red':
			return 500
		case 'orange':
			return 1000
		default:
			return 2000
	}
}

/** Parse `#RRGGBB` / `#RGB` (with or without the hash) into a packed RGB int. */
export function parseHexColor(hex: string | undefined | null): number | null {
	if (!hex) return null
	let h = hex.trim()
	if (h.startsWith('#')) h = h.slice(1)
	if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
	if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null
	return combineRgb(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16))
}

/** Split a packed RGB int back into components. */
export function splitRgb(rgb: number): { r: number; g: number; b: number } {
	return { r: (rgb >> 16) & 0xff, g: (rgb >> 8) & 0xff, b: rgb & 0xff }
}

/**
 * Black or white, whichever stays readable on `rgb`.
 *
 * Uses WCAG relative luminance rather than a naive brightness average —
 * LivePlay's palette spans `#FFCC00` to `#333333`, and a brightness test picks
 * the wrong color on the saturated greens and cyans in between.
 *
 * The 0.179 threshold is where the two contrast ratios cross: black wins when
 * (L + 0.05) / 0.05 exceeds 1.05 / (L + 0.05), i.e. L > sqrt(0.0525) - 0.05.
 */
const CONTRAST_CROSSOVER = 0.179

export function contrastText(rgb: number): number {
	const { r, g, b } = splitRgb(rgb)
	const lin = (c: number): number => {
		const s = c / 255
		return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
	}
	const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
	return luminance > CONTRAST_CROSSOVER ? BLACK : WHITE
}

/** Scale a color towards black. `factor` 0 = black, 1 = unchanged. */
export function dim(rgb: number, factor: number): number {
	const { r, g, b } = splitRgb(rgb)
	const f = Math.max(0, Math.min(1, factor))
	return combineRgb(Math.round(r * f), Math.round(g * f), Math.round(b * f))
}

/** Linear blend between two colors. `t` 0 = a, 1 = b. */
export function blend(a: number, b: number, t: number): number {
	const ca = splitRgb(a)
	const cb = splitRgb(b)
	const f = Math.max(0, Math.min(1, t))
	return combineRgb(
		Math.round(ca.r + (cb.r - ca.r) * f),
		Math.round(ca.g + (cb.g - ca.g) * f),
		Math.round(ca.b + (cb.b - ca.b) * f),
	)
}

/**
 * The background/foreground pair for an item, from its authored color.
 * `intensity` dims the fill for idle states (the client tints inactive rows
 * rather than filling them), while the text color is always picked against
 * the color that actually ends up on the button.
 */
export function itemStyle(
	color: string | undefined,
	intensity = 1,
	fallbackBg: number = NEUTRAL_BG,
): { bgcolor: number; color: number } {
	const parsed = parseHexColor(color)
	if (parsed === null) return { bgcolor: fallbackBg, color: contrastText(fallbackBg) }
	const bgcolor = intensity >= 1 ? parsed : dim(parsed, intensity)
	return { bgcolor, color: contrastText(bgcolor) }
}
