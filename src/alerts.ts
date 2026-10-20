export interface HabitAlert {
  /** `name|date` — one entry per habit and day, however many times fire */
  id: string
  name: string
  emoji: string
  date: string
  /** The reminder time that fired, `HH:MM` */
  time: string
  /** Sample shown by the test command: no actions */
  test?: boolean
}

type Listener = (alerts: HabitAlert[]) => void

/** Fired reminders waiting in the in-app modal. */
let queue: HabitAlert[] = []
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l(queue)
}

export function pushAlert(alert: HabitAlert) {
  queue = [...queue.filter(a => a.id !== alert.id), alert]
  emit()
}

export function currentAlerts(): HabitAlert[] {
  return queue
}

export function dismissAlert(id: string) {
  queue = queue.filter(a => a.id !== id)
  emit()
}

export function dismissAllAlerts() {
  queue = []
  emit()
}

export function subscribeAlerts(listener: Listener): () => void {
  listeners.add(listener)
  listener(queue)
  return () => listeners.delete(listener)
}
