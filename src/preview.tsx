import React, { useEffect, useState } from 'react'

import { getEnv, peekEnv } from './env'
import { lang, tr, useLanguage } from './i18n'
import { MARKER, addDays, markOf, parseDate, todayState, weekStartOf, type Habit } from './model'
import { getStore } from './store'
import { HabitRow, HabitsIcon, WeekHead, useHabitData, useToday, useWeekStart } from './view'
import { editing, habitsView, selectedHabit } from './view-state'

/* ---- preview: the habits sections become a dashboard ---- */

export const DASHBOARD_TAG = 'habits-dashboard'

function textOf(node: any): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(textOf).join('')
}

/** The intro the plugin writes under the marker. */
const INTRO_RE = /^(習慣の一覧と達成記録です|書式[:：]|Your habits and check-ins\.|Format:)/

/**
 * In the habits note, swaps the 習慣 / 記録 (Habits / Records) sections (and the intro) for one
 * dashboard element. Anything else written in the note is kept.
 */
export function remarkHabits() {
  return (tree: any) => {
    const children: any[] = tree.children ?? []
    if (!children.some(n => n.type === 'html' && String(n.value).includes(MARKER))) return
    const dashboard = { type: 'habitsDashboard', data: { hName: DASHBOARD_TAG, hProperties: {} }, children: [] }
    const out: any[] = []
    let inSection = false
    let inserted = false
    for (const node of children) {
      if (node.type === 'html' && String(node.value).includes(MARKER)) continue
      if (node.type === 'paragraph' && !inSection && INTRO_RE.test(textOf(node))) continue
      if (node.type === 'heading') {
        const title = textOf(node)
        inSection = title.includes('習慣') || title.includes('記録') || /^(habits|records)\b/i.test(title.trim())
        if (inSection) {
          if (!inserted) out.push(dashboard)
          inserted = true
          continue
        }
      }
      if (!inSection) out.push(node)
    }
    if (!inserted) out.unshift(dashboard)
    tree.children = out
  }
}

const RECENT_DAYS = 28

/** Rendered in place of the habits sections in the preview. */
export const HabitsDashboard: React.FC = () => {
  useLanguage()
  const { data } = useHabitData()
  const today = useToday()
  const weekStart = useWeekStart()
  if (!peekEnv()) return null
  const active = data.habits.filter(h => !h.archived)
  const archived = data.habits.length - active.length
  const states = active.map(h => todayState(h, data.records, today, weekStart))
  const due = states.filter(s => s.due).length
  const done = states.filter(s => s.due && s.mark === 'done').length
  const weekFrom = weekStartOf(today, weekStart)
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i))
  const recent = Array.from({ length: RECENT_DAYS }, (_, i) => addDays(today, i - RECENT_DAYS + 1))
  const open = (h?: Habit) => {
    if (h) selectedHabit.set(h.name)
    habitsView.set(true)
  }

  return (
    <div className="habits-dashboard" contentEditable={false}>
      <div className="dash-head">
        <HabitsIcon />
        <span className="dash-title">{tr('Habit tracker', '習慣トラッカー')}</span>
        {due > 0 && (
          <span className="dash-progress">
            {tr('Today', '今日')} {done}/{due}
          </span>
        )}
        <span className="spacer" />
        <button className="habits-button" onClick={() => editing.set({})}>
          ＋ {tr('Add', '追加')}
        </button>
        <button className="habits-button primary" onClick={() => open()}>
          {tr('Open habits page', '習慣ページを開く')}
        </button>
      </div>

      {active.length === 0 ? (
        <div className="dash-empty">{tr('No habits yet. Add one with "＋ Add".', 'まだ習慣がありません。「＋ 追加」から登録できます。')}</div>
      ) : (
        <div className="habits-list embedded">
          <WeekHead week={week} today={today} />
          <ul>
            {active.map(h => (
              <HabitRow
                key={h.name}
                habit={h}
                data={data}
                today={today}
                week={week}
                weekStart={weekStart}
                selected={false}
                onSelect={() => open(h)}
              />
            ))}
          </ul>
        </div>
      )}

      {active.length > 0 && (
        <div className="dash-recent">
          <div className="dash-subtitle">{tr('Last 4 weeks', '直近4週間')}</div>
          {active.map(h => (
            <div className="recent-row" key={h.name}>
              <span className="recent-name" title={h.name}>
                {h.emoji} {h.name}
              </span>
              <span className="recent-cells">
                {recent.map(d => {
                  const m = markOf(data.records, d, h.name)
                  const dow = parseDate(d).getDay()
                  return <span key={d} className={`sq ${m ?? ''} ${d === today ? 'today' : ''} ${dow === weekStart ? 'week-start' : ''}`} title={d} />
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      {archived > 0 && <div className="dash-foot">
          {tr(`${archived} archived habit${archived === 1 ? '' : 's'} on the habits page`, `アーカイブ中の習慣 ${archived}件は習慣ページで確認できます`)}
        </div>}
    </div>
  )
}

HabitsDashboard.displayName = 'HabitsDashboard'

/* ---- editor: a banner over the habits note ---- */

function isHabitsNoteOpen(): boolean {
  const note = peekEnv()?.store.getState().editingNote
  if (!note) return false
  const id = getStore()?.noteId
  return note._id === id || (note.body ?? '').includes(MARKER)
}

export const EditorBanner: React.FC = () => {
  useLanguage()
  const [show, setShow] = useState(isHabitsNoteOpen)
  useEffect(() => {
    const env = getEnv()
    const update = () => setShow(isHabitsNoteOpen())
    const unsubscribe = env.store.subscribe(update)
    const sub = getStore()?.onDidChange(update)
    update()
    return () => {
      unsubscribe()
      sub?.dispose()
    }
  }, [])
  if (!show || !peekEnv()) return null
  return (
    <div className="habits-editor-banner">
      <HabitsIcon />
      <span className="text">
        {lang() === 'en' ? (
          <>
            <strong>Habits note</strong> — the Habits plugin keeps your habits and check-ins here. The preview shows them as a dashboard.
          </>
        ) : (
          <>
            <strong>習慣ノート</strong> — Habits プラグインが習慣と記録を保存しています。プレビューではダッシュボードになります。
          </>
        )}
      </span>
      <button className="habits-button primary" onClick={() => habitsView.set(true)}>
        {tr('Open habits page', '習慣ページを開く')}
      </button>
    </div>
  )
}

EditorBanner.displayName = 'HabitsEditorBanner'

/* ---- note list: mark the habits note's row ---- */

const STYLE_ID = 'habits-note-list-marker'

/** Keeps a style rule pointing at the habits note's row in the note list. */
export function startNoteListMarker(): { dispose(): void } {
  const style = document.createElement('style')
  style.id = STYLE_ID
  document.head.appendChild(style)
  const update = () => {
    const id = getStore()?.noteId
    const sel = id ? `.note-list-bar-item[id="${id.replace(/^note:/, 'note-')}"]` : null
    style.textContent = sel
      ? `${sel} { box-shadow: inset 3px 0 0 var(--habit-accent, #2fa36b); }
${sel} .header::before { content: "Habits"; display: inline-block; margin-right: 6px; padding: 0 6px; border-radius: 8px; font-size: 10px; font-weight: 600; line-height: 16px; vertical-align: 2px; color: #fff; background: #2fa36b; }`
      : ''
  }
  update()
  let sub: { dispose(): void } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const attach = () => {
    const store = getStore()
    if (!store) {
      timer = setTimeout(attach, 300)
      return
    }
    sub = store.onDidChange(update)
    update()
  }
  attach()
  return {
    dispose() {
      if (timer) clearTimeout(timer)
      sub?.dispose()
      style.remove()
    }
  }
}
