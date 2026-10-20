import { useEffect, useState } from 'react'

import type { Habit } from './model'

/** A value with listeners, usable from React through `use()`. */
function observable<T>(initial: T, onChange?: (v: T) => void) {
  let value = initial
  const listeners = new Set<(v: T) => void>()
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(value, next)) return
      value = next
      onChange?.(next)
      for (const l of listeners) l(next)
    },
    use(): T {
      const [v, setV] = useState(value)
      useEffect(() => {
        listeners.add(setV)
        setV(value)
        return () => {
          listeners.delete(setV)
        }
      }, [])
      return v
    }
  }
}

export const ACTIVE_CLASS = 'habits-view-active'

/** Whether the Habits page is showing, in place of the note list and editor. */
export const habitsView = observable(false, v => document.body.classList.toggle(ACTIVE_CLASS, v))

export function showHabits() {
  habitsView.set(true)
}

/** The add / edit dialog: `null` closed, `{}` adding, `{ habit }` editing. */
export const editing = observable<{ habit?: Habit } | null>(null)

const SELECTED_KEY = 'inkdrop-habits:selected'

function loadSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

/** The habit shown in the detail panel, by name. */
export const selectedHabit = observable<string | null>(loadSelected(), name => {
  try {
    if (name) localStorage.setItem(SELECTED_KEY, name)
  } catch {
    // Not remembered.
  }
})
