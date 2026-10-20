import type { Environment } from '@inkdropapp/types'

/**
 * Captures the `Environment` handed to `activate()` so other modules can reach
 * it without the (discouraged) global `inkdrop`.
 */
let captured: Environment | undefined

export function setEnv(env: Environment | undefined): void {
  captured = env
}

/** The env, or `undefined` once the plugin is deactivated. */
export function peekEnv(): Environment | undefined {
  return captured
}

export function getEnv(): Environment {
  if (!captured) throw new Error('[habits] env accessed before activate()')
  return captured
}

export interface HabitsConfig {
  notificationStyle: 'both' | 'desktop' | 'inapp'
  notifyMissed: boolean
  snoozeMinutes: number
  /** 0 = Sunday, 1 = Monday */
  weekStart: number
  notebook: string
}

export function getConfig(): HabitsConfig {
  const { config } = getEnv()
  return {
    notificationStyle: config.get('habits.notificationStyle') ?? 'both',
    notifyMissed: config.get('habits.notifyMissed') ?? true,
    snoozeMinutes: Math.max(1, Number(config.get('habits.snoozeMinutes') ?? 10)),
    weekStart: config.get('habits.weekStartsOn') === 'sunday' ? 0 : 1,
    notebook: String(config.get('habits.notebook') ?? '').trim()
  }
}

/** Opens a note in the editor and brings the window forward. */
export function openNote(noteId: string): void {
  const env = getEnv()
  env.window.show()
  env.window.focus()
  env.commands.dispatch(document.body, 'core:open-note', { noteId, selectInNoteListBar: true })
}
