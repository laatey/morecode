/** One place for the localStorage keys that more than one feature needs. */
export const workspaceKey = (accountId: string): string => `morecode:workspace:v1:${accountId}`
export const SETTINGS_KEY = 'morecode:settings:v1'
export const skillsKey = (accountId: string): string => `morecode:skills:v1:${accountId}`
export const connectorsKey = (accountId: string): string => `morecode:connectors:v1:${accountId}`
