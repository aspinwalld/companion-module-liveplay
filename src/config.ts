import type { SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
}

/**
 * Credentials live in Companion's secrets store rather than the config, so
 * they are never echoed back to the web UI.
 */
export type ModuleSecrets = {
	apiToken: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Information',
			width: 12,
			value:
				'Controls a LivePlay server (v2.5.0 or later) over its REST + WebSocket API. ' +
				'If the server requires a login, have an administrator issue an API token from LivePlay’s Users settings and paste it below.' +
				'Without a login the LivePlay API is open to anyone on the network — only use it on a trusted network.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Server IP / hostname',
			width: 8,
			default: '127.0.0.1',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 4480,
		},
		{
			type: 'secret-text',
			id: 'apiToken',
			label: 'API token',
			tooltip:
				'A LivePlay API token (starts with "lpk1_"). Leave blank when the server does not require a login. ' +
				'Use an API token rather than a user account: it does not expire, and revoking it only affects Companion.',
			width: 12,
			default: '',
		},
	]
}
