import React, { useEffect, useMemo, useState } from 'react'

import { cycleMark, mark, today as todayString } from './actions'
import { getConfig, getEnv, openNote, peekEnv } from './env'
import { lang, locale, tr, useLanguage } from './i18n'
import {
  addDays,
  describeHabit,
  weekdayName,
  firstDay,
  isScheduled,
  markOf,
  monthStats,
  parseDate,
  streaks,
  todayState,
  totalDone,
  weekStartOf,
  type Habit,
  type HabitData,
  type Mark
} from './model'
import { getStore } from './store'
import { editing, habitsView, selectedHabit } from './view-state'

/* ---- data ---- */

const EMPTY: HabitData = { habits: [], records: new Map() }

export function useHabitData(): { data: HabitData; noteId: string | null; loaded: boolean } {
  const read = () => {
    const store = getStore()
    return { data: store?.data ?? EMPTY, noteId: store?.noteId ?? null, loaded: !!store?.loaded }
  }
  const [state, setState] = useState(read)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let sub: { dispose(): void } | null = null
    // The store may still be loading when the view mounts.
    const attach = () => {
      const store = getStore()
      if (!store) {
        timer = setTimeout(attach, 300)
        return
      }
      sub = store.onDidChange(() => setState(read()))
      setState(read())
    }
    attach()
    return () => {
      if (timer) clearTimeout(timer)
      sub?.dispose()
    }
  }, [])
  return state
}

/** Today's date, rolling over at midnight. */
export function useToday(): string {
  const [today, setToday] = useState(todayString)
  useEffect(() => {
    const timer = setInterval(() => setToday(todayString()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])
  return today
}

export function useWeekStart(): number {
  const [weekStart, setWeekStart] = useState(() => getConfig().weekStart)
  useEffect(() => {
    const sub = getEnv().config.onDidChange('habits.weekStartsOn', () => setWeekStart(getConfig().weekStart))
    return () => sub.dispose()
  }, [])
  return weekStart
}

export function report(err: unknown) {
  console.error('[habits] update failed:', err)
  peekEnv()?.notifications.addError(tr('Could not update the habit', '習慣を更新できませんでした'), {
    detail: err instanceof Error ? err.message : String(err),
    dismissable: true
  })
}

/* ---- sidebar item ---- */

export const HabitsIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" className="svg-icon habits-icon">
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
      <path d="M8.5 12.5l2.2 2.2 4.3-4.6" />
    </g>
  </svg>
)

/** "Habits" entry under All Notes / Templates, with today's remaining count. */
export const SideBarMenuItemHabits: React.FC = () => {
  const active = habitsView.use()
  const { data } = useHabitData()
  const today = useToday()
  const weekStart = useWeekStart()
  const env = peekEnv()
  if (!env) return null
  const { SideBarMenuItem } = env.components.classes as Record<string, React.ComponentType<any>>
  if (!SideBarMenuItem) return null
  const remaining = data.habits.filter(h => {
    const st = todayState(h, data.records, today, weekStart)
    return st.due && st.mark === null
  }).length
  return (
    <SideBarMenuItem
      className="sidebar-menu-item-habits"
      selectable
      active={active}
      onClick={() => env.commands.dispatch(document.body, 'habits:show' as any)}
      renderIcon={() => <HabitsIcon />}
      renderAccessory={() => (remaining ? <span className="accessory-count">{remaining}</span> : null)}
    >
      Habits
    </SideBarMenuItem>
  )
}

SideBarMenuItemHabits.displayName = 'HabitsSideBarMenuItem'

/* ---- the page ---- */

export const HabitsView: React.FC = () => {
  useLanguage()
  const active = habitsView.use()
  if (!active || !peekEnv()) return null
  return <HabitsBody />
}

HabitsView.displayName = 'HabitsView'

const HabitsBody: React.FC = () => {
  const env = getEnv()
  const { data, noteId, loaded } = useHabitData()
  const today = useToday()
  const weekStart = useWeekStart()
  const selected = selectedHabit.use()
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    // Leave the page when another sidebar item is picked or a note is opened
    // some other way.
    const onClick = (e: MouseEvent) => {
      const item = (e.target as Element).closest?.('.sidebar-layout .sidebar-menu-item')
      if (item && !item.classList.contains('sidebar-menu-item-habits')) habitsView.set(false)
    }
    document.addEventListener('click', onClick, true)
    let { queryContext, editingNote } = env.store.getState()
    let id = editingNote?._id
    const unsubscribe = env.store.subscribe(() => {
      const state = env.store.getState()
      if (state.queryContext !== queryContext || state.editingNote?._id !== id) habitsView.set(false)
      queryContext = state.queryContext
      id = state.editingNote?._id
    })
    return () => {
      document.removeEventListener('click', onClick, true)
      unsubscribe()
    }
  }, [])

  const groups = useMemo(() => {
    const todo: Habit[] = []
    const handled: Habit[] = []
    const off: Habit[] = []
    const archived: Habit[] = []
    for (const h of data.habits) {
      if (h.archived) {
        archived.push(h)
        continue
      }
      const st = todayState(h, data.records, today, weekStart)
      if (st.mark) handled.push(h)
      else if (st.due) todo.push(h)
      else off.push(h)
    }
    return { todo, handled, off, archived }
  }, [data, today, weekStart])

  const active = data.habits.filter(h => !h.archived)
  const current = data.habits.find(h => h.name === selected) ?? active[0] ?? data.habits[0] ?? null
  const select = (h: Habit) => selectedHabit.set(h.name)
  const doneToday = groups.handled.filter(h => markOf(data.records, today, h.name) === 'done').length
  const dueToday = groups.todo.length + groups.handled.length

  const weekFrom = weekStartOf(today, weekStart)
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i))

  const section = (title: string, list: Habit[], className = '') =>
    list.length > 0 && (
      <section className={`habits-section ${className}`}>
        <h2>
          {title}
          <span className="count">{list.length}</span>
        </h2>
        <ul>
          {list.map(h => (
            <HabitRow
              key={h.name}
              habit={h}
              data={data}
              today={today}
              week={week}
              weekStart={weekStart}
              selected={current?.name === h.name}
              onSelect={() => select(h)}
            />
          ))}
        </ul>
      </section>
    )

  return (
    <div className="habits-view">
      <header className="habits-header">
        <h1>{tr('Habits', '習慣')}</h1>
        <span className="date">
          {parseDate(today).toLocaleDateString(locale(), { month: 'long', day: 'numeric', weekday: 'short' })}
        </span>
        {dueToday > 0 && (
          <span className="progress" title={tr("Today's progress", '今日の達成')}>
            <span className="bar">
              <span style={{ width: `${(doneToday / dueToday) * 100}%` }} />
            </span>
            {doneToday}/{dueToday}
          </span>
        )}
        <span className="spacer" />
        {noteId && (
          <button className="habits-button" onClick={() => openNote(noteId)} title={tr('Open the note that stores your habits and check-ins', '習慣と記録を保存しているノートを開く')}>
            {tr('Open note', 'ノートを開く')}
          </button>
        )}
        <button className="habits-button primary" onClick={() => editing.set({})}>
          ＋ {tr('Add habit', '習慣を追加')}
        </button>
      </header>

      {!loaded ? (
        <div className="habits-empty">{tr('Loading…', '読み込み中…')}</div>
      ) : !data.habits.length ? (
        <div className="habits-empty">
          <div className="big">🔁</div>
          <p>{tr('Add things you want to keep doing every day or week, and get reminded at the times you choose.', '毎日・毎週続けたいことを登録すると、時間になったら通知します。')}</p>
          <button className="habits-button primary" onClick={() => editing.set({})}>
            ＋ {tr('Add your first habit', '最初の習慣を追加')}
          </button>
        </div>
      ) : (
        <div className="habits-body">
          <div className="habits-list">
            <WeekHead week={week} today={today} />
            <div className="habits-list-scroll">
              {section(tr('To do today', '今日やる'), groups.todo, 'todo')}
              {section(tr('Done today', '今日の記録済み'), groups.handled, 'handled')}
              {section(tr('Off today', '今日はお休み'), groups.off, 'off')}
              {groups.archived.length > 0 && (
                <button className="archived-toggle" onClick={() => setShowArchived(!showArchived)}>
                  {showArchived ? '▾' : '▸'} {tr('Archived', 'アーカイブ')}{tr(` (${groups.archived.length})`, `（${groups.archived.length}）`)}
                </button>
              )}
              {showArchived && section(tr('Archived', 'アーカイブ'), groups.archived, 'archived')}
            </div>
          </div>
          {current && <HabitDetail habit={current} data={data} today={today} weekStart={weekStart} />}
        </div>
      )}
    </div>
  )
}

/** `日` / `週` (`day(s)` / `week(s)`) for a streak in `unit`s. */
function unitLabel(unit: 'day' | 'week', n: number): string {
  if (lang() === 'ja') return unit === 'week' ? '週' : '日'
  return `${unit}${n === 1 ? '' : 's'}`
}

function streakLabel(n: number, unit: 'day' | 'week'): string {
  return tr(`${n}-${unit} streak`, `連続 ${n}${unitLabel(unit, n)}`)
}

/** Month `m` (1–12) of `y` by name: `October` / `10月`, with the year (`October 2026` / `2026年10月`) when asked. */
function monthName(y: number, m: number, width: 'long' | 'short', withYear = false): string {
  return new Date(y, m - 1, 1).toLocaleDateString(locale(), withYear ? { year: 'numeric', month: width } : { month: width })
}

/** Weekday labels over the rows' day cells. */
export const WeekHead: React.FC<{ week: string[]; today: string }> = ({ week, today }) => (
  <div className="week-head">
    <span className="spacer" />
    {week.map(d => (
      <span key={d} className={`dow ${d === today ? 'today' : ''} dow-${parseDate(d).getDay()}`}>
        <span>{weekdayName(parseDate(d).getDay(), lang())}</span>
        <span className="num">{parseDate(d).getDate()}</span>
      </span>
    ))}
  </div>
)

/* ---- a row: check button, name, streak, this week ---- */

const CheckButton: React.FC<{ mark: Mark | null; onClick: () => void; disabled?: boolean }> = ({ mark, onClick, disabled }) => (
  <button
    className={`habit-check ${mark ?? 'none'}`}
    onClick={e => {
      e.stopPropagation()
      onClick()
    }}
    disabled={disabled}
    title={
      mark === 'done'
        ? tr('Undo done', '完了を取り消す')
        : mark === 'skip'
          ? tr('Undo skip', 'スキップを取り消す')
          : tr('Mark as done', '完了にする')
    }
  >
    {mark === 'done' ? '✓' : mark === 'skip' ? '⏭' : ''}
  </button>
)

export const HabitRow: React.FC<{
  habit: Habit
  data: HabitData
  today: string
  week: string[]
  weekStart: number
  selected: boolean
  onSelect: () => void
}> = ({ habit, data, today, week, weekStart, selected, onSelect }) => {
  const st = todayState(habit, data.records, today, weekStart)
  const streak = streaks(habit, data.records, today, weekStart)
  const run = (p: Promise<void>) => p.catch(report)
  return (
    <li className={`habit-row ${selected ? 'selected' : ''} ${st.mark ? `marked ${st.mark}` : ''}`} onClick={onSelect}>
      <CheckButton
        mark={st.mark}
        disabled={habit.archived}
        onClick={() => run(mark(habit.name, st.mark ? null : 'done'))}
      />
      <span className="emoji">{habit.emoji || '•'}</span>
      <span className="main">
        <span className="name">{habit.name}</span>
        <span className="meta">
          {describeHabit(habit, lang())}
          {st.week && (
            <span className={`week-goal ${st.week.done >= st.week.goal ? 'met' : ''}`}>
              {tr('This week', '今週')} {st.week.done}/{st.week.goal}
            </span>
          )}
        </span>
      </span>
      {streak.current > 0 && (
        <span className="streak" title={streakLabel(streak.current, streak.unit)}>
          🔥{streak.current}
          <small>{unitLabel(streak.unit, streak.current)}</small>
        </span>
      )}
      {!habit.archived && !st.mark && st.due && (
        <button
          className="row-action"
          title={tr('Skip today', '今日はスキップ')}
          onClick={e => {
            e.stopPropagation()
            run(mark(habit.name, 'skip'))
          }}
        >
          ⏭
        </button>
      )}
      <span className="week-cells">
        {week.map(d => (
          <DayCell key={d} habit={habit} data={data} date={d} today={today} />
        ))}
      </span>
    </li>
  )
}

/** One day: click cycles none → done → skip → none. Future days are inert. */
export const DayCell: React.FC<{ habit: Habit; data: HabitData; date: string; today: string; label?: React.ReactNode }> = ({
  habit,
  data,
  date,
  today,
  label
}) => {
  const m = markOf(data.records, date, habit.name)
  const future = date > today
  // Days before the start (or before the first record) don't count.
  const first = firstDay(habit, data.records)
  const before = !first || date < first
  const scheduled = habit.frequency.kind === 'weekly' || isScheduled(habit, date)
  const missed = !m && !future && !before && scheduled && date < today && habit.frequency.kind !== 'weekly'
  const cls = [
    'day',
    m ?? '',
    future ? 'future' : '',
    before || !scheduled ? 'off' : '',
    missed ? 'missed' : '',
    date === today ? 'today' : ''
  ]
    .filter(Boolean)
    .join(' ')
  const d = parseDate(date)
  const state = m === 'done' ? tr('done', '完了') : m === 'skip' ? tr('skipped', 'スキップ') : future ? '' : tr('not recorded', '未記録')
  const title = `${d.toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })} ${state}`
  return (
    <button
      className={cls}
      disabled={future || habit.archived}
      title={title}
      onClick={e => {
        e.stopPropagation()
        cycleMark(habit.name, m, date).catch(report)
      }}
    >
      {label ?? (m === 'done' ? '✓' : m === 'skip' ? '–' : '')}
    </button>
  )
}

/* ---- detail panel: stats, month calendar, half-year heatmap ---- */

const HabitDetail: React.FC<{ habit: Habit; data: HabitData; today: string; weekStart: number }> = ({
  habit,
  data,
  today,
  weekStart
}) => {
  const [month, setMonth] = useState(today.slice(0, 7))
  useEffect(() => setMonth(today.slice(0, 7)), [habit.name])
  const streak = streaks(habit, data.records, today, weekStart)
  const stats = monthStats(habit, data.records, month, today)
  const unit = unitLabel(streak.unit, 2)

  const shiftMonth = (n: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + n, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // Month grid, padded to whole weeks.
  const first = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const gridStart = weekStartOf(first, weekStart)
  const cells: Array<string | null> = []
  for (let d = gridStart; d < first; d = addDays(d, 1)) cells.push(null)
  for (let i = 0; i < days; i++) cells.push(addDays(first, i))
  while (cells.length % 7) cells.push(null)
  const heads = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7)

  return (
    <aside className="habit-detail">
      <div className="detail-head">
        <span className="emoji">{habit.emoji || '•'}</span>
        <div className="titles">
          <h2>{habit.name}</h2>
          <div className="meta">
            {describeHabit(habit, lang())}
            {habit.start && tr(` · from ${habit.start}`, ` · ${habit.start} から`)}
            {habit.archived && tr(' · archived', ' · アーカイブ済み')}
          </div>
        </div>
        <button className="habits-button" onClick={() => editing.set({ habit })}>
          {tr('Edit', '編集')}
        </button>
      </div>

      <div className="stat-tiles">
        <div className="tile">
          <div className="value">
            {streak.current}
            <small>{unit}</small>
          </div>
          <div className="label">🔥 {tr('Current streak', '連続')}</div>
        </div>
        <div className="tile">
          <div className="value">
            {streak.longest}
            <small>{unit}</small>
          </div>
          <div className="label">{tr('Longest streak', '最長連続')}</div>
        </div>
        <div className="tile">
          <div className="value">
            {totalDone(habit, data.records)}
            <small>{tr('times', '回')}</small>
          </div>
          <div className="label">{tr('Total', '合計')}</div>
        </div>
        <div className="tile">
          <div className="value">
            {stats.rate === null ? '–' : Math.round(stats.rate * 100)}
            {stats.rate !== null && <small>%</small>}
          </div>
          <div className="label">
            {month === today.slice(0, 7)
              ? tr('Completion this month', '今月の達成率')
              : tr(`${monthName(y, m, 'long')} completion`, `${m}月の達成率`)}
          </div>
        </div>
      </div>

      <div className="month">
        <div className="month-nav">
          <button onClick={() => shiftMonth(-1)} title={tr('Previous month', '前の月')}>
            ‹
          </button>
          <span>
            {monthName(y, m, 'long', true)}
            <small>
              {tr(`${stats.done} times`, `${stats.done}回`)}
              {stats.target ? tr(` / goal ${stats.target}`, ` / 目標 ${stats.target}`) : ''}
            </small>
          </span>
          <button onClick={() => shiftMonth(1)} title={tr('Next month', '次の月')} disabled={month >= today.slice(0, 7)}>
            ›
          </button>
        </div>
        <div className="month-grid">
          {heads.map(d => (
            <span key={d} className={`head dow-${d}`}>
              {weekdayName(d, lang())}
            </span>
          ))}
          {cells.map((d, i) =>
            d ? (
              <DayCell key={d} habit={habit} data={data} date={d} today={today} label={parseDate(d).getDate()} />
            ) : (
              <span key={`pad${i}`} />
            )
          )}
        </div>
        <div className="legend">
          <span className="day done" /> {tr('Done', '完了')} <span className="day skip" /> {tr('Skipped', 'スキップ')}{' '}
          <span className="day missed" /> {tr('Missed', '未達成')}
          <span className="hint">{tr('Click a day: done → skipped → cleared', '日付をクリックで 完了 → スキップ → 取消')}</span>
        </div>
      </div>

      <Heatmap habit={habit} data={data} today={today} weekStart={weekStart} />
    </aside>
  )
}

const HEATMAP_WEEKS = 26

/** Last half year, one square per day, a column per week. */
const Heatmap: React.FC<{ habit: Habit; data: HabitData; today: string; weekStart: number }> = ({
  habit,
  data,
  today,
  weekStart
}) => {
  const end = weekStartOf(today, weekStart)
  const start = addDays(end, -7 * (HEATMAP_WEEKS - 1))
  const columns = Array.from({ length: HEATMAP_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i))
  )
  return (
    <div className="heatmap">
      <div className="heatmap-title">{tr('Last 6 months', '過去半年')}</div>
      <div className="heatmap-grid">
        {columns.map((col, w) => (
          <span className="col" key={w}>
            {col.map(d => {
              const m = markOf(data.records, d, habit.name)
              const scheduled = habit.frequency.kind === 'weekly' || isScheduled(habit, d)
              return (
                <span
                  key={d}
                  className={`sq ${m ?? ''} ${d > today ? 'future' : ''} ${scheduled ? '' : 'off'}`}
                  title={`${d}${m === 'done' ? ` ${tr('done', '完了')}` : m === 'skip' ? ` ${tr('skipped', 'スキップ')}` : ''}`}
                />
              )
            })}
          </span>
        ))}
      </div>
    </div>
  )
}
