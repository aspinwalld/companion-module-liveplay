import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'
import {
	type CompanionPresetDefinitions,
	type CompanionPresetGroup,
	type CompanionPresetSection,
} from '@companion-module/base'
import { BLACK, NEUTRAL_BG, PAUSED_BG, PLAYING_BG, WHITE } from './colors.js'
import { itemNameByIndexVariable, itemNameByUuidVariable } from './variables.js'

function cueButtonOptions(cue: string) {
	return { cue, show_name: true, idle: NEUTRAL_BG, playing: PLAYING_BG, paused: PAUSED_BG }
}

/**
 * "Trigger Cue" presets: one button per playable item in the open project,
 * grouped by the top-level LivePlay group it lives in.
 *
 * The item's UUID is baked into the action and feedbacks, so a placed button
 * keeps firing the same cue when the playlist is reordered. The text points
 * at the item's name variable rather than baking the name in, so renaming a
 * cue in LivePlay relabels buttons already on a page too.
 *
 * Generated from the catalog; main.ts re-publishes presets whenever the
 * catalog changes, so this list tracks the project as it is edited.
 */
export function CuePresets(self: ModuleInstance): {
	presets: CompanionPresetDefinitions<ModuleSchema>
	section: CompanionPresetSection
} {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}

	// Manual buttons for cues the generated list doesn't suit. Each keeps its
	// target in one local variable that both the action and the cue_button
	// feedback read, so editing that one value retargets the press, the name
	// and the colors together.
	presets['cue_by_index'] = {
		type: 'simple',
		name: 'Trigger cue by index path (set the "index" local variable)',
		keywords: ['index', 'position'],
		style: {
			text: '$(local:index)',
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		previewStyle: { text: 'Cue by index' },
		localVariables: [
			{
				variableName: 'index',
				variableType: 'simple',
				headline: 'Index path to fire, 0-based, e.g. 2,35',
				startupValue: '0',
			},
		],
		steps: [{ down: [{ actionId: 'play_index', options: { index: '$(local:index)' } }], up: [] }],
		feedbacks: [{ feedbackId: 'cue_button', options: cueButtonOptions('$(local:index)') }],
	}

	presets['cue_by_uuid'] = {
		type: 'simple',
		name: 'Trigger cue by UUID (set the "uuid" local variable)',
		keywords: ['uuid'],
		style: {
			text: 'Set cue UUID',
			size: 'auto',
			color: WHITE,
			bgcolor: NEUTRAL_BG,
			show_topbar: false,
		},
		previewStyle: { text: 'Cue by UUID' },
		localVariables: [
			{
				variableName: 'uuid',
				variableType: 'simple',
				headline: 'Item UUID from the LivePlay project',
				startupValue: '',
			},
		],
		steps: [{ down: [{ actionId: 'play_item', options: { uuid: '$(local:uuid)' } }], up: [] }],
		feedbacks: [{ feedbackId: 'cue_button', options: cueButtonOptions('$(local:uuid)') }],
	}

	// Bucket every playable item under the top-level entry it descends from:
	// `2,35` lands under group 2, a bare `4` under the top level.
	const buckets = new Map<string, { name: string; presets: string[] }>()
	for (const item of self.state.catalog.values()) {
		// Groups aren't cues, and cart-only items (-1 paths) have no playlist
		// position — the cart presets cover those.
		if (item.type === 'group' || !item.index || !itemNameByIndexVariable(item.index)) continue

		const path = item.index.join(',')
		const top = item.index.length > 1 ? item.index[0] : null
		const groupUuid = top === null ? '' : self.state.uuidAtIndex([top])
		const bucketId = top === null ? 'cues_top' : `cues_group_${groupUuid || top}`
		let bucket = buckets.get(bucketId)
		if (!bucket) {
			const groupName = groupUuid ? self.state.itemName(groupUuid) : ''
			bucket = {
				name: top === null ? 'Cues: Top level' : `Cues: Group ${top}${groupName ? ` – ${groupName}` : ''}`,
				presets: [],
			}
			buckets.set(bucketId, bucket)
		}

		const id = `cue_${item.uuid}`
		bucket.presets.push(id)
		presets[id] = {
			type: 'simple',
			name: `${path}  ${item.name}`,
			keywords: [path, item.name],
			style: {
				text: `$(liveplay:${itemNameByUuidVariable(item.uuid)})`,
				size: 'auto',
				color: WHITE,
				bgcolor: NEUTRAL_BG,
				show_topbar: false,
			},
			previewStyle: { text: item.name || path },
			steps: [{ down: [{ actionId: 'play_item', options: { uuid: item.uuid } }], up: [] }],
			// Idle in the cue's own color (dimmed), then a hard green / orange
			// while it sounds / is held, so play state reads from across a room.
			feedbacks: [
				{ feedbackId: 'item_color', options: { uuid: item.uuid, idle: NEUTRAL_BG } },
				{ feedbackId: 'item_playing', options: { uuid: item.uuid }, style: { bgcolor: PLAYING_BG, color: BLACK } },
				{ feedbackId: 'item_paused', options: { uuid: item.uuid }, style: { bgcolor: PAUSED_BG, color: BLACK } },
			],
		}
	}

	const definitions: CompanionPresetGroup[] = [
		{
			id: 'cues_template',
			name: 'Manual',
			description:
				'Point a button at any cue by index path or UUID: set the button’s local variable and the name and colors follow',
			type: 'simple',
			presets: ['cue_by_index', 'cue_by_uuid'],
		},
	]
	for (const [id, bucket] of buckets) {
		definitions.push({ id, name: bucket.name, type: 'simple', presets: bucket.presets })
	}

	return {
		presets,
		section: {
			id: 'cues',
			name: 'Trigger Cue',
			description:
				'One button per cue in the open project, showing its live name and color, green while playing and orange while paused',
			definitions,
		},
	}
}
