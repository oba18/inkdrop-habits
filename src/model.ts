/**
 * The habits note: its format, and the pure logic over it (schedules, streaks,
 * stats). No Inkdrop APIs here, so it can be tested with plain Node.
 *
 *     <!-- inkdrop-habits -->
 *     ## 習慣
 *     - 💧 水を2L飲む | 毎日 | 09:00, 15:00
 *     - 🏃 ランニング | 月水金 | 07:00 | 開始 2026-10-01
 *     - 📚 読書 | 週3回 | 21:00
 *     - 🧹 掃除 | 3日ごと | | 開始 2026-10-01 | アーカイブ
 *
 *     ## 記録
 *     - 2026-10-16: ✓ 水を2L飲む · ⏭ 読書
 */

export const MARKER = '<!-- inkdrop-habits -->'
export const HABITS_HEADING = '## 習慣'
export const RECORDS_HEADING = '## 記録'

export type Frequency =
  | { kind: 'daily' }
  /** 0 = Sunday … 6 = Saturday */
  | { kind: 'weekdays'; days: number[] }
  /** Any days, `times` a week */
  | { kind: 'weekly'; times: number }
  /** Every `every` days counted from the start date */
  | { kind: 'interval'; every: number }

export interface Habit {
  name: string
  emoji: string
  frequency: Frequency
  /** Reminder times, `HH:MM`, sorted */
  times: string[]
  /** `YYYY-MM-DD`; days before it don't count */
  start: string | null
  archived: boolean
}

export type Mark = 'done' | 'skip'

/** date (`YYYY-MM-DD`) → habit name → mark */
export type Records = Map<string, Map<string, Mark>>

export interface HabitData {
  habits: Habit[]
  records: Records
}

/* ---- dates (local time, `YYYY-MM-DD`) ---- */

export function toDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function parseDate(ds: string): Date {
  const [y, m, d] = ds.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(ds: string, n: number): string {
  const d = parseDate(ds)
  d.setDate(d.getDate() + n)
  return toDateString(d)
}

/** Whole days from `a` to `b` (DST-safe). */
export function daysBetween(a: string, b: string): number {
  const utc = (ds: string) => {
    const [y, m, d] = ds.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(b) - utc(a)) / 864e5)
}

/** The first day of `ds`'s week; `weekStart` 0 = Sunday, 1 = Monday. */
export function weekStartOf(ds: string, weekStart: number): string {
  const dow = parseDate(ds).getDay()
  return addDays(ds, -((dow - weekStart + 7) % 7))
}

/* ---- parsing ---- */

const DOW_CHARS = '日月火水木金土'
/** Display order of weekdays: Monday first */
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]
const EMOJI_RE = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*|\p{Regional_Indicator}{2})\s*/u
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const RECORD_RE = /^\s*[-*]\s+(\d{4}-\d{2}-\d{2})\s*[:：]\s*(.*)$/
const ITEM_SEP = ' · '

export function parseFrequency(text: string): Frequency | null {
  const s = text.replace(/\s+/g, '')
  if (s === '毎日' || s === '') return { kind: 'daily' }
  if (s === '平日') return { kind: 'weekdays', days: [1, 2, 3, 4, 5] }
  if (s === '週末' || s === '土日') return { kind: 'weekdays', days: [0, 6] }
  if (s === '隔日') return { kind: 'interval', every: 2 }
  let m = /^週(\d+)回$/.exec(s)
  if (m) return { kind: 'weekly', times: Math.min(7, Math.max(1, Number(m[1]))) }
  m = /^(\d+)日(?:ごと|毎)$/.exec(s)
  if (m) {
    const every = Math.max(1, Number(m[1]))
    return every === 1 ? { kind: 'daily' } : { kind: 'interval', every }
  }
  const days = s.replace(/^毎週/, '').replace(/[・、,曜]/g, '')
  if (days && [...days].every(c => DOW_CHARS.includes(c))) {
    const set = [...new Set([...days].map(c => DOW_CHARS.indexOf(c)))].sort()
    return set.length === 7 ? { kind: 'daily' } : { kind: 'weekdays', days: set }
  }
  return null
}

export function formatFrequency(f: Frequency): string {
  switch (f.kind) {
    case 'daily':
      return '毎日'
    case 'weekly':
      return `週${f.times}回`
    case 'interval':
      return `${f.every}日ごと`
    case 'weekdays': {
      const key = [...f.days].sort().join('')
      if (key === '12345') return '平日'
      if (key === '06') return '週末'
      return DOW_ORDER.filter(d => f.days.includes(d))
        .map(d => DOW_CHARS[d])
        .join('')
    }
  }
}

function parseHabitLine(line: string): Habit | null {
  const m = /^\s*[-*]\s+(.*)$/.exec(line)
  if (!m) return null
  const fields = m[1].split('|').map(s => s.trim())
  let head = fields[0]
  const em = EMOJI_RE.exec(head)
  const emoji = em ? em[1] : ''
  if (em) head = head.slice(em[0].length)
  const name = head.trim()
  if (!name) return null
  const frequency = parseFrequency(fields[1] ?? '') ?? { kind: 'daily' }
  const times = (fields[2] ?? '')
    .split(/[,、\s]+/)
    .filter(t => TIME_RE.test(t))
    .map(normalizeTime)
  let start: string | null = null
  let archived = false
  for (const f of fields.slice(3)) {
    const s = /^開始\s*(\d{4}-\d{2}-\d{2})$/.exec(f)
    if (s) start = s[1]
    else if (f === 'アーカイブ') archived = true
  }
  return { name, emoji, frequency, times: [...new Set(times)].sort(), start, archived }
}

export function normalizeTime(t: string): string {
  const m = TIME_RE.exec(t.trim())
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t
}

export function formatHabitLine(h: Habit): string {
  const fields = [`${h.emoji ? `${h.emoji} ` : ''}${h.name}`, formatFrequency(h.frequency), h.times.join(', ')]
  if (h.start) fields.push(`開始 ${h.start}`)
  if (h.archived) fields.push('アーカイブ')
  // Drop an empty trailing times column.
  if (!h.times.length && fields.length === 3) fields.pop()
  return `- ${fields.join(' | ')}`
}

function parseRecordItems(text: string): Map<string, Mark> {
  const marks = new Map<string, Mark>()
  for (const raw of text.split(/\s*·\s*/)) {
    const item = raw.trim()
    if (!item) continue
    if (item.startsWith('⏭')) marks.set(item.replace(/^⏭️?\s*/u, '').trim(), 'skip')
    else marks.set(item.replace(/^[✓✔]️?\s*/u, '').trim(), 'done')
  }
  marks.delete('')
  return marks
}

function formatRecordLine(date: string, marks: Map<string, Mark>, order: string[]): string {
  const rank = (name: string) => {
    const i = order.indexOf(name)
    return i < 0 ? order.length : i
  }
  const items = [...marks]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([name, mark]) => `${mark === 'skip' ? '⏭' : '✓'} ${name}`)
  return `- ${date}: ${items.join(ITEM_SEP)}`
}

type Section = 'none' | 'habits' | 'records'

function sectionOf(line: string): Section | null {
  const t = line.trim()
  if (!/^#{1,6}\s/.test(t)) return null
  const title = t.replace(/^#+\s*/, '')
  if (title.includes('記録')) return 'records'
  if (title.includes('習慣')) return 'habits'
  return 'none'
}

export function isHabitsNote(body: string): boolean {
  return body.includes(MARKER)
}

export function parseNote(body: string): HabitData {
  const habits: Habit[] = []
  const records: Records = new Map()
  let section: Section = 'none'
  for (const line of body.split('\n')) {
    const s = sectionOf(line)
    if (s) {
      section = s
      continue
    }
    if (section === 'habits') {
      const h = parseHabitLine(line)
      if (h && !habits.some(x => x.name === h.name)) habits.push(h)
    } else if (section === 'records') {
      const m = RECORD_RE.exec(line)
      if (!m || !DATE_RE.test(m[1])) continue
      const marks = parseRecordItems(m[2])
      const prev = records.get(m[1])
      records.set(m[1], prev ? new Map([...prev, ...marks]) : marks)
    }
  }
  return { habits, records }
}

/* ---- editing the note text ---- */

export function newNoteBody(): string {
  return [
    MARKER,
    '習慣の一覧と達成記録です。Habits プラグインが読み書きします（手で編集しても構いません）。',
    '',
    '書式: `- 絵文字 名前 | 頻度 | 通知時刻 | 開始 YYYY-MM-DD | アーカイブ`',
    '頻度: 毎日 / 平日 / 週末 / 月水金 / 週3回 / 3日ごと',
    '',
    HABITS_HEADING,
    '',
    RECORDS_HEADING,
    ''
  ].join('\n')
}

/** Line ranges of the two sections; adds missing headings to `lines`. */
function locate(lines: string[]) {
  let habitsAt = -1
  let recordsAt = -1
  lines.forEach((line, i) => {
    const s = sectionOf(line)
    if (s === 'habits' && habitsAt < 0) habitsAt = i
    if (s === 'records' && recordsAt < 0) recordsAt = i
  })
  if (habitsAt < 0) {
    const at = recordsAt < 0 ? lines.length : recordsAt
    lines.splice(at, 0, HABITS_HEADING, '')
    if (recordsAt >= 0) recordsAt += 2
    habitsAt = at
  }
  if (recordsAt < 0) {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('')
    lines.push(RECORDS_HEADING, '')
    recordsAt = lines.length - 2
  }
  const sectionEnd = (from: number) => {
    for (let i = from + 1; i < lines.length; i++) if (sectionOf(lines[i])) return i
    return lines.length
  }
  return { habitsAt, habitsEnd: sectionEnd(habitsAt), recordsAt, recordsEnd: sectionEnd(recordsAt) }
}

/** Adds `habit`, or replaces the one called `oldName` (renaming its records too). */
export function upsertHabit(body: string, habit: Habit, oldName?: string): string {
  const lines = body.split('\n')
  const loc = locate(lines)
  const target = oldName ?? habit.name
  let idx = -1
  for (let i = loc.habitsAt + 1; i < loc.habitsEnd; i++) {
    if (parseHabitLine(lines[i])?.name === target) idx = i
  }
  if (idx >= 0) {
    lines[idx] = formatHabitLine(habit)
  } else {
    // After the last list item of the section.
    let at = loc.habitsAt + 1
    for (let i = loc.habitsAt + 1; i < loc.habitsEnd; i++) if (/^\s*[-*]\s/.test(lines[i])) at = i + 1
    lines.splice(at, 0, formatHabitLine(habit))
  }
  let out = lines.join('\n')
  if (oldName && oldName !== habit.name) out = renameInRecords(out, oldName, habit.name)
  return out
}

function mapRecordLines(body: string, fn: (date: string, marks: Map<string, Mark>) => Map<string, Mark>, order: string[]) {
  const lines = body.split('\n')
  let section: Section = 'none'
  const out: string[] = []
  for (const line of lines) {
    const s = sectionOf(line)
    if (s) section = s
    const m = section === 'records' && !s ? RECORD_RE.exec(line) : null
    if (!m) {
      out.push(line)
      continue
    }
    const marks = fn(m[1], parseRecordItems(m[2]))
    if (marks.size) out.push(formatRecordLine(m[1], marks, order))
  }
  return out.join('\n')
}

function habitOrder(body: string) {
  return parseNote(body).habits.map(h => h.name)
}

function renameInRecords(body: string, from: string, to: string): string {
  return mapRecordLines(
    body,
    (_, marks) => new Map([...marks].map(([name, mark]) => [name === from ? to : name, mark])),
    habitOrder(body)
  )
}

/** Removes the habit and, with `withRecords`, its check-ins. */
export function deleteHabit(body: string, name: string, withRecords = true): string {
  const lines = body.split('\n')
  const loc = locate(lines)
  for (let i = loc.habitsEnd - 1; i > loc.habitsAt; i--) {
    if (parseHabitLine(lines[i])?.name === name) lines.splice(i, 1)
  }
  const out = lines.join('\n')
  if (!withRecords) return out
  return mapRecordLines(
    out,
    (_, marks) => {
      marks.delete(name)
      return marks
    },
    habitOrder(out)
  )
}

/** Sets (or with `null` clears) the habit's mark on `date`. Records stay newest first. */
export function setMark(body: string, date: string, name: string, mark: Mark | null): string {
  const order = habitOrder(body)
  const lines = body.split('\n')
  const loc = locate(lines)
  let insertAt = -1
  for (let i = loc.recordsAt + 1; i < loc.recordsEnd; i++) {
    const m = RECORD_RE.exec(lines[i])
    if (!m) continue
    if (m[1] === date) {
      const marks = parseRecordItems(m[2])
      if (mark) marks.set(name, mark)
      else marks.delete(name)
      if (marks.size) lines[i] = formatRecordLine(date, marks, order)
      else lines.splice(i, 1)
      return lines.join('\n')
    }
    if (insertAt < 0 && m[1] < date) insertAt = i
  }
  if (!mark) return lines.join('\n')
  if (insertAt < 0) {
    // After the section's last record, or right under the heading.
    insertAt = loc.recordsAt + 1
    for (let i = loc.recordsAt + 1; i < loc.recordsEnd; i++) if (RECORD_RE.test(lines[i])) insertAt = i + 1
    if (insertAt === loc.recordsAt + 1 && lines[insertAt]?.trim() === '') insertAt++
  }
  lines.splice(insertAt, 0, formatRecordLine(date, new Map([[name, mark]]), order))
  return lines.join('\n')
}

/* ---- schedules and stats ---- */

const FALLBACK_ANCHOR = '2000-01-03'

export function markOf(records: Records, date: string, name: string): Mark | null {
  return records.get(date)?.get(name) ?? null
}

/** The first day that counts for the habit: its start, or else its first record. */
export function firstDay(h: Habit, records: Records): string | null {
  if (h.start) return h.start
  let first: string | null = null
  for (const [date, marks] of records) if (marks.has(h.name) && (!first || date < first)) first = date
  return first
}

/** Whether the habit is due on `date` by its schedule (weekly habits: every day). */
export function isScheduled(h: Habit, date: string): boolean {
  if (h.start && date < h.start) return false
  const f = h.frequency
  switch (f.kind) {
    case 'daily':
    case 'weekly':
      return true
    case 'weekdays':
      return f.days.includes(parseDate(date).getDay())
    case 'interval':
      return ((daysBetween(h.start ?? FALLBACK_ANCHOR, date) % f.every) + f.every) % f.every === 0
  }
}

/** Check-ins in the week holding `date` (whole week). */
export function weekDoneCount(h: Habit, records: Records, date: string, weekStart: number): number {
  const from = weekStartOf(date, weekStart)
  let n = 0
  for (let i = 0; i < 7; i++) if (markOf(records, addDays(from, i), h.name) === 'done') n++
  return n
}

export interface TodayState {
  mark: Mark | null
  /** Should be done today (weekly: this week's goal not met yet, or done today) */
  due: boolean
  /** Weekly habits: done / goal this week */
  week?: { done: number; goal: number }
}

export function todayState(h: Habit, records: Records, today: string, weekStart: number): TodayState {
  const mark = markOf(records, today, h.name)
  if (h.archived || (h.start && today < h.start)) return { mark, due: false }
  if (h.frequency.kind === 'weekly') {
    const done = weekDoneCount(h, records, today, weekStart)
    const goal = h.frequency.times
    return { mark, due: mark !== null || done < goal, week: { done, goal } }
  }
  return { mark, due: isScheduled(h, today) }
}

/** Lookback limit for streaks, so a habit without a start doesn't scan forever. */
const MAX_DAYS = 366 * 5

export interface Streak {
  current: number
  longest: number
  /** `day` for day-based habits, `week` for "N times a week" */
  unit: 'day' | 'week'
}

/**
 * Current and longest streaks. Skipped days neither break nor extend a streak,
 * and today (or this week) only counts once done, so it never breaks one.
 */
export function streaks(h: Habit, records: Records, today: string, weekStart: number): Streak {
  const first = firstDay(h, records)
  if (!first || first > today) return { current: 0, longest: 0, unit: h.frequency.kind === 'weekly' ? 'week' : 'day' }
  if (h.frequency.kind === 'weekly') {
    const goal = h.frequency.times
    const thisWeek = weekStartOf(today, weekStart)
    let week = weekStartOf(first, weekStart)
    let run = 0
    let longest = 0
    let current = 0
    for (let n = 0; week <= thisWeek && n < MAX_DAYS / 7; week = addDays(week, 7), n++) {
      const met = weekDoneCount(h, records, week, weekStart) >= goal
      if (met) run++
      else if (week !== thisWeek) run = 0
      longest = Math.max(longest, run)
      current = run
    }
    return { current, longest, unit: 'week' }
  }
  let run = 0
  let longest = 0
  const span = Math.min(daysBetween(first, today), MAX_DAYS)
  for (let i = span; i >= 0; i--) {
    const date = addDays(today, -i)
    if (!isScheduled(h, date)) continue
    const mark = markOf(records, date, h.name)
    if (mark === 'done') run++
    else if (mark === null && date !== today) run = 0
    longest = Math.max(longest, run)
  }
  return { current: run, longest, unit: 'day' }
}

export interface MonthStats {
  done: number
  /** Days (weekly: check-ins) it was due so far this month */
  target: number
  /** 0–1, or null when nothing was due yet */
  rate: number | null
}

/** Achievement for the month holding `month` (`YYYY-MM`), counting up to `today`. */
export function monthStats(h: Habit, records: Records, month: string, today: string): MonthStats {
  const [y, m] = month.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const first = firstDay(h, records)
  let done = 0
  let target = 0
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`
    if (date > today) break
    const mark = markOf(records, date, h.name)
    if (mark === 'done') done++
    if (h.frequency.kind === 'weekly' || !first || date < first) continue
    // Today only counts against the rate once done.
    if (isScheduled(h, date) && mark !== 'skip' && (date !== today || mark === 'done')) target++
  }
  if (h.frequency.kind === 'weekly') {
    // Goal per week, pro rata for the days of the month elapsed (from the first day).
    const from = first && first > `${month}-01` ? first : `${month}-01`
    const to = today < `${month}-${String(days).padStart(2, '0')}` ? today : `${month}-${String(days).padStart(2, '0')}`
    const span = from <= to ? daysBetween(from, to) + 1 : 0
    target = Math.round((h.frequency.times * span) / 7)
  }
  return { done, target, rate: target > 0 ? Math.min(1, done / target) : null }
}

export function totalDone(h: Habit, records: Records): number {
  let n = 0
  for (const marks of records.values()) if (marks.get(h.name) === 'done') n++
  return n
}

/** Short description of the schedule, e.g. "毎日 · 09:00, 15:00". */
export function describeHabit(h: Habit): string {
  const freq = h.frequency.kind === 'weekdays' && !['平日', '週末'].includes(formatFrequency(h.frequency))
    ? `毎週 ${[...formatFrequency(h.frequency)].join('・')}`
    : formatFrequency(h.frequency)
  return h.times.length ? `${freq} · ${h.times.join(', ')}` : freq
}

export { DOW_CHARS, DOW_ORDER }
