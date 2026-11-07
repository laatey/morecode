import { ipcMain, powerMonitor, powerSaveBlocker } from 'electron'

/**
 * Keeps the computer from going to sleep while the AI is working, so a long task can finish.
 * The screen can still turn off, and closing a laptop lid still puts it to sleep.
 */
let keepAwake = true
let onBattery = false
let active = 0
let blockerId: number | null = null

function apply(): void {
  const onBatteryPower = (() => {
    try {
      return powerMonitor.isOnBatteryPower()
    } catch {
      return false
    }
  })()
  const want = keepAwake && active > 0 && (!onBatteryPower || onBattery)
  if (want && blockerId === null) blockerId = powerSaveBlocker.start('prevent-app-suspension')
  if (!want && blockerId !== null) {
    if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId)
    blockerId = null
  }
}

/** Called when a run starts (+1) and when it ends (-1), so the block is released the moment work stops. */
export function runsChanged(count: number): void {
  active = count
  apply()
}

export function registerPowerIpc(): void {
  ipcMain.on('power:set', (_e, prefs: unknown) => {
    const p = prefs as { keepAwake?: unknown; onBattery?: unknown } | null
    if (p && typeof p.keepAwake === 'boolean') keepAwake = p.keepAwake
    if (p && typeof p.onBattery === 'boolean') onBattery = p.onBattery
    apply()
  })
  // plugging in or unplugging while a task runs changes the answer
  powerMonitor.on('on-battery', apply)
  powerMonitor.on('on-ac', apply)
}
