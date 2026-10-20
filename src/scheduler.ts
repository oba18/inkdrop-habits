import { currentAlerts, dismissAlert, pushAlert, type HabitAlert } from './alerts'
import { getConfig, getEnv } from './env'
import { todayState, toDateString, type Habit } from './model'
import { getStore } from './store'
import { showHabits } from './view-state'

const CHECK_INTERVAL_MS = 30 * 1000
/** On a normal tick, how late a reminder may still fire (e.g. after sleep). */
const LATE_MS = 3 * 60 * 60 * 1000
const FIRED_KEY = 'inkdrop-habits:fired'
const SNOOZE_KEY = 'inkdrop-habits:snoozed'
const FIRED_RETENTION_MS = 3 * 864e5
const SHOW_TIMEOUT_MS = 3000

export type DesktopResult = 'shown' | 'denied' | 'unsupported' | 'error'

/** Shows an OS notification, asking for permission first if undecided. */
export async function showDesktopNotification(
  title: string,
  body: string,
  opts: { tag?: string; onClick?: () => void } = {}
): Promise<DesktopResult> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    let permission = Notification.permission
    if (permission === 'default') permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'
    const n = new Notification(title, { body, tag: opts.tag })
    if (opts.onClick) n.onclick = opts.onClick
    return await new Promise<DesktopResult>(resolve => {
      n.onshow = () => resolve('shown')
      n.onerror = () => resolve('error')
      setTimeout(() => resolve('shown'), SHOW_TIMEOUT_MS)
    })
  } catch (err) {
    console.error('[habits] desktop notification failed:', err)
    return 'error'
  }
}

function load(key: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}')
  } catch {
    return {}
  }
}

function save(key: string, value: Record<string, number>) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Worst case a reminder repeats after a restart.
  }
}

function timeOn(date: string, hhmm: string): number {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}

/**
 * Fires each habit's reminder times on the days it is due, until it is
 * checked off (or skipped) for the day. Runs in the main window only.
 */
export class HabitScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private storeSub: { dispose(): void } | null = null
  private fired: Record<string, number> = {}
  private snoozed: Record<string, number> = load(SNOOZE_KEY)
  /** Habits seen so far; one added later starts with its past times already fired. */
  private known = new Set<string>()

  start() {
    const cutoff = Date.now() - FIRED_RETENTION_MS
    this.fired = Object.fromEntries(Object.entries(load(FIRED_KEY)).filter(([, t]) => t > cutoff))
    this.check(true)
    this.timer = setInterval(() => this.check(false), CHECK_INTERVAL_MS)
    // A habit checked off (here or on another device) leaves the modal.
    this.storeSub = getStore()?.onDidChange(() => this.clearHandled()) ?? null
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.storeSub?.dispose()
    this.storeSub = null
  }

  /** Reminds again in the configured snooze minutes. */
  snooze(alert: HabitAlert) {
    this.snoozed[alert.id] = Date.now() + getConfig().snoozeMinutes * 60 * 1000
    save(SNOOZE_KEY, this.snoozed)
    dismissAlert(alert.id)
  }

  /** Habits still to do today, with the reminder times already passed. */
  private pending(date: string): Habit[] {
    const store = getStore()
    if (!store?.loaded) return []
    const { weekStart } = getConfig()
    return store.data.habits.filter(h => {
      if (h.archived) return false
      const st = todayState(h, store.data.records, date, weekStart)
      return st.due && st.mark === null
    })
  }

  private clearHandled() {
    const date = toDateString(new Date())
    const open = new Set(this.pending(date).map(h => `${h.name}|${date}`))
    let changed = false
    for (const id of Object.keys(this.snoozed)) {
      if (!open.has(id)) {
        delete this.snoozed[id]
        changed = true
      }
    }
    if (changed) save(SNOOZE_KEY, this.snoozed)
    // Drop alerts for habits now done / skipped / removed.
    for (const a of currentAlerts()) if (!a.test && !open.has(a.id)) dismissAlert(a.id)
  }

  private check(startup: boolean) {
    const now = Date.now()
    const date = toDateString(new Date(now))
    const { notifyMissed } = getConfig()
    let firedChanged = false
    const added = new Set<string>()
    for (const h of getStore()?.data.habits ?? []) {
      if (!this.known.has(h.name) && !startup) added.add(h.name)
      this.known.add(h.name)
    }
    for (const h of this.pending(date)) {
      const id = `${h.name}|${date}`
      const isNew = added.has(h.name)
      // The latest reminder time that has come and not fired yet.
      let due: string | null = null
      for (const t of h.times) {
        const at = timeOn(date, t)
        const key = `${id}|${t}`
        if (at > now || this.fired[key]) continue
        this.fired[key] = now
        firedChanged = true
        const late = now - at
        if (isNew) continue
        if (startup ? notifyMissed || late < CHECK_INTERVAL_MS * 2 : late < LATE_MS) due = t
      }
      const snoozedUntil = this.snoozed[id]
      if (snoozedUntil && snoozedUntil <= now) {
        delete this.snoozed[id]
        save(SNOOZE_KEY, this.snoozed)
        due ??= h.times.filter(t => timeOn(date, t) <= now).pop() ?? ''
      }
      if (due !== null) {
        notify({ id, name: h.name, emoji: h.emoji, date, time: due }).catch(err =>
          console.error('[habits] notify failed:', err)
        )
      }
    }
    if (firedChanged) {
      const cutoff = now - FIRED_RETENTION_MS
      for (const [k, t] of Object.entries(this.fired)) if (t < cutoff) delete this.fired[k]
      save(FIRED_KEY, this.fired)
    }
  }

  /** Reminders coming up today, for the status command. */
  upcoming(): Array<{ habit: Habit; time: string }> {
    const now = Date.now()
    const date = toDateString(new Date(now))
    return this.pending(date)
      .flatMap(habit => habit.times.filter(t => timeOn(date, t) > now).map(time => ({ habit, time })))
      .sort((a, b) => a.time.localeCompare(b.time))
  }
}

let current: HabitScheduler | null = null

export function getScheduler(): HabitScheduler | null {
  return current
}

export function setScheduler(s: HabitScheduler | null) {
  current = s
}

export async function notify(alert: HabitAlert) {
  const { notificationStyle } = getConfig()
  let desktop: DesktopResult | null = null
  if (notificationStyle !== 'inapp') {
    const label = `${alert.emoji ? `${alert.emoji} ` : ''}${alert.name}`
    desktop = await showDesktopNotification(`🔁 ${label}`, alert.time ? `習慣の時間です（${alert.time}）` : '習慣のリマインダーです', {
      tag: alert.id,
      onClick: () => {
        const env = getEnv()
        env.window.show()
        env.window.focus()
        showHabits()
      }
    })
  }
  // In the app as well when asked to, or as a fallback so it's never lost.
  if (notificationStyle !== 'desktop' || desktop !== 'shown') pushAlert(alert)
}
