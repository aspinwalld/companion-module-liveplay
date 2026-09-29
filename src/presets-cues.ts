import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'
import {
	type CompanionPresetDefinitions,
	type CompanionPresetGroup,
	type CompanionPresetSection,
} from '@companion-module/base'
import { itemNameByIndexVariable, itemNameByUuidVariable } from './variables.js'
import { CUE_LOCAL_SOURCES, cueGaugeLocals, gaugePreset, localVar, moduleVar } from './presets-gauge.js'

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
	// target in one local variable that both the action and the gauge's cue
	// feedbacks read, so editing that one value retargets the press, the name,
	// the color and the progress together.
	presets['cue_by_index'] = gaugePreset({
		name: 'Trigger cue by index path (set the "index" local variable)',
		keywords: ['index', 'position', 'progress', 'gauge'],
		label: localVar('name'),
		sources: CUE_LOCAL_SOURCES,
		// `index` first: the gauge locals below read it.
		localVariables: [
			{
				variableName: 'index',
				variableType: 'simple',
				headline: 'Index path to fire, 0-based, e.g. 2,35',
				startupValue: '0',
			},
			...cueGaugeLocals(localVar('index')),
		],
		steps: [{ down: [{ actionId: 'play_index', options: { index: localVar('index') } }], up: [] }],
	})

	presets['cue_by_uuid'] = gaugePreset({
		name: 'Trigger cue by UUID (set the "uuid" local variable)',
		keywords: ['uuid', 'progress', 'gauge'],
		label: localVar('name'),
		sources: CUE_LOCAL_SOURCES,
		localVariables: [
			{
				variableName: 'uuid',
				variableType: 'simple',
				headline: 'Item UUID from the LivePlay project',
				startupValue: '',
			},
			...cueGaugeLocals(localVar('uuid')),
		],
		steps: [{ down: [{ actionId: 'play_item', options: { uuid: localVar('uuid') } }], up: [] }],
	})

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
		// The UUID is baked in, so the button keeps firing (and showing) the
		// same cue when the playlist is reordered; the label follows renames.
		presets[id] = gaugePreset({
			name: `${path}  ${item.name}`,
			keywords: [path, item.name],
			label: moduleVar(itemNameByUuidVariable(item.uuid)),
			sources: CUE_LOCAL_SOURCES,
			localVariables: cueGaugeLocals(item.uuid),
			steps: [{ down: [{ actionId: 'play_item', options: { uuid: item.uuid } }], up: [] }],
		})
	}

	const definitions: CompanionPresetGroup[] = [
		{
			id: 'cues_template',
			name: 'Manual',
			description:
				'Point a button at any cue by index path or UUID: set the button’s local variable and the name, color and progress follow',
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
				'One button per cue in the open project: its live name over a progress bar in its own color, dimmed while waiting and filling as it plays',
			definitions,
		},
	}
}
