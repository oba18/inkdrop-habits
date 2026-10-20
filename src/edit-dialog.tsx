import type { ButtonProps, Dialog as DialogType } from '@inkdropapp/types'
import React, { useEffect, useState } from 'react'

import { removeHabit, saveHabit, setArchived, today } from './actions'
import { getEnv } from './env'
import { lang, tr, useLanguage } from './i18n'
import { DOW_ORDER, normalizeTime, weekdayName, type Frequency, type Habit } from './model'
import { getStore } from './store'
import { editing, selectedHabit } from './view-state'

type Kind = Frequency['kind']

const KINDS: Array<{ value: Kind; label: string }> = [
  { value: 'daily', get label() { return tr('Daily', '毎日') } },
  { value: 'weekdays', get label() { return tr('Specific weekdays', '曜日を指定') } },
  { value: 'weekly', get label() { return tr('N times a week', '週に◯回') } },
  { value: 'interval', get label() { return tr('Every N days', '◯日ごと') } }
]

const EMOJIS = ['💧', '🏃', '📚', '🧘', '💪', '🛌', '🥗', '💊', '🧹', '✍️', '🎸', '🇬🇧', '💻', '🚶', '☀️', '🌙']

interface Form {
  emoji: string
  name: string
  kind: Kind
  days: number[]
  timesPerWeek: number
  every: number
  times: string[]
  start: string
}

function toForm(h?: Habit): Form {
  const f = h?.frequency
  return {
    emoji: h?.emoji ?? '',
    name: h?.name ?? '',
    kind: f?.kind ?? 'daily',
    days: f?.kind === 'weekdays' ? f.days : [1, 3, 5],
    timesPerWeek: f?.kind === 'weekly' ? f.times : 3,
    every: f?.kind === 'interval' ? f.every : 2,
    times: h ? [...h.times] : ['09:00'],
    start: h?.start ?? ''
  }
}

function toFrequency(f: Form): Frequency {
  switch (f.kind) {
    case 'daily':
      return { kind: 'daily' }
    case 'weekdays':
      return { kind: 'weekdays', days: [...f.days].sort() }
    case 'weekly':
      return { kind: 'weekly', times: f.timesPerWeek }
    case 'interval':
      return { kind: 'interval', every: f.every }
  }
}

function validate(f: Form, original?: Habit): string | null {
  const name = f.name.trim()
  if (!name) return tr('Enter a name', '名前を入力してください')
  if (/[|]|\s·\s/.test(name)) return tr('Names can\'t contain "|" or " · "', '名前に「|」「 · 」は使えません')
  const taken = getStore()?.data.habits.some(h => h.name === name && h.name !== original?.name)
  if (taken) return tr('A habit with this name already exists', '同じ名前の習慣があります')
  if (f.kind === 'weekdays' && !f.days.length) return tr('Choose at least one weekday', '曜日を1つ以上選んでください')
  if (f.times.some(t => !/^\d{2}:\d{2}$/.test(t))) return tr('Enter valid reminder times', '通知時刻を正しく入力してください')
  return null
}

/** Adds or edits a habit: name, schedule, reminder times, start date. */
export const EditDialog: React.FC = () => {
  useLanguage()
  const [{ Dialog, Button }] = useState(() => ({
    Dialog: getEnv().components.classes.Dialog as DialogType,
    Button: getEnv().components.getComponentClass<ButtonProps>('Button')!
  }))
  const session = editing.use()
  const original = session?.habit
  const [form, setForm] = useState<Form>(() => toForm(original))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setForm(toForm(session?.habit))
    setError(null)
    setConfirmDelete(false)
  }, [session])

  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }))
  const close = () => editing.set(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      close()
    } catch (err) {
      console.error('[habits] save failed:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    const problem = validate(form, original)
    if (problem) {
      setError(problem)
      return
    }
    const kind = form.kind
    const habit: Habit = {
      name: form.name.trim(),
      emoji: form.emoji.trim(),
      frequency: toFrequency(form),
      times: [...new Set(form.times.map(normalizeTime))].sort(),
      // "Every N days" counts from a start date, so it always has one.
      start: form.start || (kind === 'interval' ? today() : null),
      archived: original?.archived ?? false
    }
    run(async () => {
      await saveHabit(habit, original?.name)
      selectedHabit.set(habit.name)
    })
  }

  const toggleDay = (d: number) =>
    set({ days: form.days.includes(d) ? form.days.filter(x => x !== d) : [...form.days, d] })

  return (
    <Dialog visible={!!session} className="habits-edit-dialog" onEscKeyDown={close} autofocus>
      <Dialog.Content>
        <form
          className="habits-form"
          onSubmit={e => {
            e.preventDefault()
            submit()
          }}
        >
          <h3>{original ? tr('Edit habit', '習慣を編集') : tr('Add habit', '習慣を追加')}</h3>

          <div className="row name-row">
            <input
              className="emoji-input"
              value={form.emoji}
              placeholder="🙂"
              maxLength={8}
              onChange={e => set({ emoji: e.target.value })}
              aria-label={tr('Emoji', '絵文字')}
            />
            <input
              className="name-input"
              value={form.name}
              placeholder={tr('Habit name (e.g. Drink 2L of water)', '習慣の名前（例: 水を2L飲む）')}
              autoFocus
              onChange={e => set({ name: e.target.value })}
            />
          </div>
          <div className="emoji-palette">
            {EMOJIS.map(e => (
              <button type="button" key={e} className={form.emoji === e ? 'selected' : ''} onClick={() => set({ emoji: e })}>
                {e}
              </button>
            ))}
          </div>

          <label className="field-label">{tr('Frequency', '頻度')}</label>
          <div className="segmented">
            {KINDS.map(k => (
              <button type="button" key={k.value} className={form.kind === k.value ? 'selected' : ''} onClick={() => set({ kind: k.value })}>
                {k.label}
              </button>
            ))}
          </div>
          {form.kind === 'weekdays' && (
            <div className="weekdays">
              {DOW_ORDER.map(d => (
                <button type="button" key={d} className={form.days.includes(d) ? 'selected' : ''} onClick={() => toggleDay(d)}>
                  {weekdayName(d, lang())}
                </button>
              ))}
            </div>
          )}
          {form.kind === 'weekly' && (
            <div className="row inline">
              {tr('', '週に')}
              <input
                type="number"
                min={1}
                max={7}
                value={form.timesPerWeek}
                onChange={e => set({ timesPerWeek: Math.min(7, Math.max(1, Number(e.target.value) || 1)) })}
              />
              {tr(
                'times a week (any days; you are reminded daily until the goal is met)',
                '回（曜日は自由。達成するまで毎日通知します）'
              )}
            </div>
          )}
          {form.kind === 'interval' && (
            <div className="row inline">
              <input
                type="number"
                min={2}
                max={365}
                value={form.every}
                onChange={e => set({ every: Math.max(2, Number(e.target.value) || 2) })}
              />
              {tr('days (counted from the start date)', '日ごと（開始日から数えます）')}
            </div>
          )}

          <label className="field-label">{tr('Reminder times', '通知時刻')}</label>
          <div className="times">
            {form.times.map((t, i) => (
              <span className="time" key={i}>
                <input
                  type="time"
                  value={t}
                  onChange={e => set({ times: form.times.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <button type="button" title={tr('Remove', '削除')} onClick={() => set({ times: form.times.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </span>
            ))}
            <button type="button" className="add-time" onClick={() => set({ times: [...form.times, form.times.at(-1) ?? '09:00'] })}>
              ＋ {tr('Add time', '時刻を追加')}
            </button>
            {!form.times.length && <span className="hint">{tr('No reminders', '通知しません')}</span>}
          </div>

          <label className="field-label">{tr('Start date', '開始日')}</label>
          <div className="row inline">
            <input type="date" value={form.start} onChange={e => set({ start: e.target.value })} />
            {form.start ? (
              <button type="button" className="link" onClick={() => set({ start: '' })}>
                {tr('Clear', 'クリア')}
              </button>
            ) : (
              <span className="hint">{form.kind === 'interval'
                  ? tr('If empty, from today', '未指定なら今日から')
                  : tr('If empty, from the first check-in', '未指定なら最初の記録から')}</span>
            )}
          </div>

          {error && <div className="habits-form-error">{error}</div>}
          {/* Enter submits */}
          <button type="submit" hidden />
        </form>
      </Dialog.Content>
      <Dialog.Actions className="habits-actions">
        {original && !confirmDelete && (
          <div className="left">
            <Button basic disabled={busy} onClick={() => run(() => setArchived(original, !original.archived))}>
              {original.archived ? tr('Unarchive', '再開する') : tr('Archive', 'アーカイブ')}
            </Button>
            <Button basic negative disabled={busy} onClick={() => setConfirmDelete(true)}>
              {tr('Delete', '削除')}
            </Button>
          </div>
        )}
        {original && confirmDelete && (
          <div className="left confirm">
            <span>{tr('Delete it along with its check-ins?', '記録ごと削除しますか？')}</span>
            <Button negative disabled={busy} onClick={() => run(() => removeHabit(original.name))}>
              {tr('Delete', '削除する')}
            </Button>
            <Button basic onClick={() => setConfirmDelete(false)}>
              {tr('Keep', 'やめる')}
            </Button>
          </div>
        )}
        <Button onClick={close}>{tr('Cancel', 'キャンセル')}</Button>
        <Button primary disabled={busy} onClick={submit}>
          {tr('Save', '保存')}
        </Button>
      </Dialog.Actions>
    </Dialog>
  )
}

EditDialog.displayName = 'HabitsEditDialog'
