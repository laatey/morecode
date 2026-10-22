export const platform: string = (typeof window !== 'undefined' && window.api?.platform) || 'unknown'

export const isMac = platform === 'darwin'
export const isWindows = platform === 'win32'

/** Space reserved for native window controls (Windows overlay / macOS traffic lights). */
export const WINDOW_CONTROLS_RIGHT_PX = isWindows ? 138 : 0
export const WINDOW_CONTROLS_LEFT_PX = isMac ? 72 : 0
