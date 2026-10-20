import { deleteHabit, setMark, toDateString, upsertHabit, type Habit, type Mark } from './model'
import { requireStore } from './store'

export const today = () => toDateString(new Date())

/** Sets the habit's mark on `date` (today by default); `null` clears it. */
export function mark(name: string, value: Mark | null, date = today()) {
  return requireStore().update(body => setMark(body, date, name, value))
}

/** Cycles a day's mark: none → done → skip → none. */
export function cycleMark(name: string, current: Mark | null, date: string) {
  const next: Mark | null = current === null ? 'done' : current === 'done' ? 'skip' : null
  return mark(name, next, date)
}

export function saveHabit(habit: Habit, oldName?: string) {
  return requireStore().update(body => upsertHabit(body, habit, oldName))
}

export function setArchived(habit: Habit, archived: boolean) {
  return saveHabit({ ...habit, archived }, habit.name)
}

export function removeHabit(name: string) {
  return requireStore().update(body => deleteHabit(body, name))
}
