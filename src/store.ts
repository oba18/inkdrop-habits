import type { Note } from 'inkdrop-model'

import { getConfig, getEnv, peekEnv } from './env'
import { isHabitsNote, newNoteBody, parseNote, type HabitData } from './model'
import { lang, tr } from './i18n'

const NOTE_ID_KEY = 'inkdrop-habits:note-id'
const PAGE_SIZE = 200
const noteTitle = () => tr('🔁 Habits', '🔁 習慣')
const HABITS_BOOK = 'Habits'
/** Same as the sidebar's Habits icon. */
const HABITS_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /><path d="M8.5 12.5l2.2 2.2 4.3-4.6" /></svg>'

/**
 * Holds the habits note: finds it (by the id in the settings, or by its marker
 * on a device that hasn't seen it yet), keeps its parsed data current, and
 * writes changes back.
 */
class HabitStore {
  noteId: string | null = null
  data: HabitData = { habits: [], records: new Map() }
  loaded = false
  private listeners = new Set<() => void>()
  private subscription: { dispose(): void } | null = null
  /** Writes run one at a time so quick check-ins don't overwrite each other. */
  private queue: Promise<unknown> = Promise.resolve()

  async start() {
    const env = getEnv()
    this.subscription = env.localDB.onNoteChange(change => {
      this.handleChange(change).catch(err => console.error('[habits] change failed:', err))
    })
    const note = (await this.findNote()) ?? null
    this.apply(note)
    this.loaded = true
    this.emit()
  }

  stop() {
    this.subscription?.dispose()
    this.subscription = null
    this.listeners.clear()
    this.loaded = false
  }

  onDidChange(listener: () => void): { dispose(): void } {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }

  private emit() {
    for (const l of this.listeners) l()
  }

  private apply(note: Note | null) {
    this.noteId = note?._id ?? null
    this.data = note ? parseNote(note.body ?? '') : { habits: [], records: new Map() }
  }

  private async findNote(): Promise<Note | undefined> {
    const env = getEnv()
    const saved = loadNoteId()
    if (saved) {
      const note = await env.localDB.notes.get(saved).catch(() => undefined)
      if (note && note.bookId !== 'trash' && isHabitsNote(note.body ?? '')) return note
    }
    // Not known on this device (or moved to trash): look for the marker.
    for (let skip = 0; ; skip += PAGE_SIZE) {
      const res: any = await env.localDB.notes.all({ limit: PAGE_SIZE, skip, pinnedFirst: false, sort: [{ createdAt: 'asc' }] })
      const docs: Note[] = res.docs ?? res.rows?.map((r: any) => r.doc).filter(Boolean) ?? []
      const hit = docs.find(d => d.bookId !== 'trash' && isHabitsNote(d.body ?? ''))
      if (hit) {
        saveNoteId(hit._id)
        return hit
      }
      if (docs.length < PAGE_SIZE) return undefined
    }
  }

  private async handleChange(change: Record<string, any>) {
    const id: string | undefined = change.id ?? change.doc?._id ?? change._id
    if (!id?.startsWith('note:')) return
    const inline = change.doc ?? (change.body !== undefined ? change : undefined)
    if (id === this.noteId) {
      const note: Note | undefined =
        change.deleted || change.doc?._deleted
          ? undefined
          : inline?.body !== undefined
            ? inline
            : await getEnv().localDB.notes.get(id).catch(() => undefined)
      // Trashed, deleted, or its marker removed: look for another one.
      if (!note || note.bookId === 'trash' || !isHabitsNote(note.body ?? '')) {
        this.apply((await this.findNote()) ?? null)
      } else this.apply(note)
      this.emit()
    } else if (!this.noteId && inline?.body !== undefined && isHabitsNote(inline.body) && inline.bookId !== 'trash') {
      // Arrived by sync from another device.
      saveNoteId(id)
      this.apply(inline)
      this.emit()
    }
  }

  /** Rewrites the note's body with `fn`, creating the note on first use. */
  update(fn: (body: string) => string): Promise<void> {
    const run = this.queue.then(() => this.write(fn))
    this.queue = run.catch(() => undefined)
    return run
  }

  private async write(fn: (body: string) => string) {
    const env = getEnv()
    if (!this.noteId) {
      await this.create(fn(newNoteBody(lang())))
      return
    }
    const noteId = this.noteId
    const view = env.store.getState().editingNote?._id === noteId ? env.getActiveEditor() : null
    if (view) {
      // Open in the editor: change it there so the editor doesn't overwrite us.
      const current = view.state.doc.toString()
      const next = fn(current)
      if (next === current) return
      view.dispatch({ changes: minimalChange(current, next) })
      this.apply({ ...(env.store.getState().editingNote as Note), body: next })
      this.emit()
      await saveEditingNote(next)
      return
    }
    const note = await env.localDB.notes.get(noteId)
    const body = fn(note.body ?? '')
    if (body === note.body) return
    // Show the change right away rather than after the change feed.
    this.apply({ ...note, body })
    this.emit()
    await env.localDB.notes.put({ ...note, body, updatedAt: Date.now() })
  }

  private async create(body: string) {
    const env = getEnv()
    const bookId = await this.targetBookId()
    const now = Date.now()
    const note = {
      _id: env.localDB.notes.createId(),
      title: noteTitle(),
      body,
      bookId,
      doctype: 'markdown',
      status: 'none',
      share: 'private',
      tags: [],
      numOfTasks: 0,
      numOfCheckedTasks: 0,
      pinned: false,
      timestamp: now,
      createdAt: now,
      updatedAt: now
    } as unknown as Note
    await env.localDB.notes.put(note)
    saveNoteId(note._id)
    this.apply(note)
    this.emit()
    env.notifications.addInfo(tr('Created the habits note', '習慣ノートを作成しました'), {
      detail: tr(
        `Habits and check-ins are saved in "${noteTitle()}". You can move the note to any notebook.`,
        `「${noteTitle()}」に習慣と記録を保存します。ノートは好きなノートブックへ移動できます。`
      ),
      dismissable: true
    })
  }

  /** The notebook named in the settings, else a dedicated "Habits" notebook (created if missing). */
  private async targetBookId(): Promise<string> {
    const env = getEnv()
    const books = await env.localDB.books.all()
    const { notebook } = getConfig()
    const named = books.find(b => b.name === (notebook || HABITS_BOOK))
    if (named) return named._id
    const now = Date.now()
    const order = Math.max(0, ...books.filter(b => !b.parentBookId).map((b: any) => b.order ?? 0)) + 1
    const book = {
      _id: env.localDB.books.createId(),
      name: notebook || HABITS_BOOK,
      parentBookId: null,
      order,
      icon: { type: 'inline', svg: HABITS_ICON_SVG },
      count: 0,
      createdAt: now,
      updatedAt: now
    }
    await env.localDB.books.put(book as any)
    return book._id
  }
}

function loadNoteId(): string | null {
  try {
    return localStorage.getItem(NOTE_ID_KEY)
  } catch {
    return null
  }
}

function saveNoteId(id: string) {
  try {
    localStorage.setItem(NOTE_ID_KEY, id)
  } catch {
    // Found again by its marker next time.
  }
}

/** The smallest single replacement turning `a` into `b`, so the cursor stays put. */
function minimalChange(a: string, b: string) {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  return { from: start, to: endA, insert: b.slice(start, endB) }
}

/**
 * Saves the editing note after a programmatic editor change: wait for the
 * store to catch up with the editor, then dispatch `core:save-note`.
 */
async function saveEditingNote(expectedBody: string, timeoutMs = 3000): Promise<void> {
  const env = getEnv()
  const start = Date.now()
  while (env.store.getState().editingNote?.body !== expectedBody && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 50))
  }
  env.commands.dispatch(document.body, 'core:save-note' as any)
}

let store: HabitStore | null = null

export function getStore(): HabitStore | null {
  return store
}

export async function startStore() {
  store = new HabitStore()
  await store.start()
  return store
}

export function stopStore() {
  store?.stop()
  store = null
}

/** The store, for code paths that only run while the plugin is active. */
export function requireStore(): HabitStore {
  if (!store || !peekEnv()) throw new Error(tr('The Habits plugin has not started', '習慣プラグインが開始していません'))
  return store
}
