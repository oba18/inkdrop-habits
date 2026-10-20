import type { ConfigSchema, Environment, IInkdropPlugin } from '@inkdropapp/types'

import { AlertDialog } from './alert-dialog'
import { pushAlert } from './alerts'
import { EditDialog } from './edit-dialog'
import { setEnv } from './env'
import { HabitScheduler, getScheduler, setScheduler, showDesktopNotification } from './scheduler'
import { getStore, startStore, stopStore } from './store'
import { DASHBOARD_TAG, EditorBanner, HabitsDashboard, remarkHabits, startNoteListMarker } from './preview'
import { HabitsView, SideBarMenuItemHabits } from './view'
import { editing, habitsView } from './view-state'

/** Main layouts that hold the note list, where the Habits page takes its place. */
const MAIN_LAYOUTS = ['main:full', 'main:slim']

class HabitsPlugin implements IInkdropPlugin {
  config: Record<string, ConfigSchema> = {
    notificationStyle: {
      title: '通知方法',
      type: 'string',
      default: 'both',
      enum: ['both', 'desktop', 'inapp'],
      description:
        'both: デスクトップ通知と Inkdrop 画面中央のモーダル / desktop: デスクトップ通知のみ（失敗時はモーダルで表示） / inapp: モーダルのみ'
    },
    notifyMissed: {
      title: '起動時に今日の見逃した通知を出す',
      description: 'Inkdrop を閉じていた間に通知時刻を過ぎた、まだ記録していない今日の習慣',
      type: 'boolean',
      default: true
    },
    snoozeMinutes: {
      title: '「あとで」の再通知までの分数',
      type: 'integer',
      default: 10,
      minimum: 1
    },
    weekStartsOn: {
      title: '週の始まり（「週◯回」の集計と週の表示）',
      type: 'string',
      default: 'monday',
      enum: ['monday', 'sunday']
    },
    notebook: {
      title: '習慣ノートを作るノートブック',
      description: '最初の習慣を追加したときに「🔁 習慣」ノートを作る場所（ノートブック名）。空なら専用の「Habits」ノートブックを作ります。作成後は自由に移動できます',
      type: 'string',
      default: ''
    }
  }

  private commands: { dispose(): void } | null = null
  private marker: { dispose(): void } | null = null

  activate(env: Environment) {
    setEnv(env)
    this.commands = env.commands.add(document.body, {
      'habits:show': {
        description: 'Habits: 習慣を表示',
        didDispatch: () => {
          if (env.isMainWindow) habitsView.set(true)
        }
      },
      'habits:add': {
        description: 'Habits: 習慣を追加',
        didDispatch: () => editing.set({})
      },
      'habits:show-status': {
        description: 'Habits: 今日このあとの通知を表示',
        didDispatch: () => this.showStatus(env)
      },
      'habits:test-notification': {
        description: 'Habits: テスト通知を送る',
        didDispatch: () => this.testNotification(env)
      }
    } as any)

    // Only the main window keeps the page and notifies, so a note opened in a
    // separate window doesn't produce duplicate notifications.
    if (!env.isMainWindow) return
    env.components.registerClass(AlertDialog, 'HabitsAlertDialog')
    env.layouts.addComponentToLayout('modal', 'HabitsAlertDialog')
    env.components.registerClass(EditDialog, 'HabitsEditDialog')
    env.layouts.addComponentToLayout('modal', 'HabitsEditDialog')
    env.components.registerClass(SideBarMenuItemHabits, 'HabitsSideBarMenuItem')
    env.layouts.insertComponentToLayoutAfter('sidebar-menu', 'SideBarMenuItemTemplates', 'HabitsSideBarMenuItem')
    env.components.registerClass(HabitsView, 'HabitsView')
    for (const layout of MAIN_LAYOUTS) env.layouts.insertComponentToLayoutBefore(layout, 'NoteListBarLayout', 'HabitsView')
    // The habits note: a banner over the editor, a dashboard in the preview, a mark in the note list.
    env.components.registerClass(EditorBanner, 'HabitsEditorBanner')
    env.layouts.insertComponentToLayoutBefore('editor', 'MDELayout', 'HabitsEditorBanner')
    env.markdownRenderer.remarkPlugins.push(remarkHabits)
    env.markdownRenderer.remarkReactComponents[DASHBOARD_TAG] = HabitsDashboard
    this.marker = startNoteListMarker()

    startStore()
      .then(() => {
        if (getStore() === null) return
        const scheduler = new HabitScheduler()
        setScheduler(scheduler)
        scheduler.start()
        console.info(`[habits] started: ${getStore()!.data.habits.length} habits`)
      })
      .catch(err => {
        console.error('[habits] failed to start:', err)
        env.notifications.addError('Habits: 習慣の読み込みに失敗しました', {
          detail: err instanceof Error ? err.message : String(err),
          dismissable: true
        })
      })
  }

  private showStatus(env: Environment) {
    const scheduler = getScheduler()
    if (!scheduler) {
      env.notifications.addWarning('Habits: 通知が動いていません', {
        detail: 'メインウィンドウで実行してください。',
        dismissable: true
      })
      return
    }
    const list = scheduler.upcoming()
    env.notifications.addInfo(`Habits: 今日このあとの通知 ${list.length}件`, {
      detail: list.map(({ habit, time }) => `・${time} ${habit.emoji} ${habit.name}`).join('\n') || 'ありません',
      dismissable: true
    })
  }

  private async testNotification(env: Environment) {
    const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
    const result = await showDesktopNotification('🔁 Habits テスト', 'デスクトップ通知は正常に動いています')
    pushAlert({ id: `test:${Date.now()}`, name: 'Habits のテスト通知です', emoji: '🔁', date: '', time: '', test: true })
    const detail = `Notification.permission: ${permission} → 結果: ${result}`
    if (result === 'shown') env.notifications.addSuccess('テスト通知を送りました', { detail, dismissable: true })
    else env.notifications.addWarning('デスクトップ通知を出せませんでした', { detail, dismissable: true })
  }

  deactivate(env: Environment) {
    habitsView.set(false)
    editing.set(null)
    getScheduler()?.stop()
    setScheduler(null)
    stopStore()
    this.commands?.dispose()
    this.commands = null
    this.marker?.dispose()
    this.marker = null
    const i = env.markdownRenderer.remarkPlugins.indexOf(remarkHabits)
    if (i >= 0) env.markdownRenderer.remarkPlugins.splice(i, 1)
    if (env.markdownRenderer.remarkReactComponents[DASHBOARD_TAG] === HabitsDashboard) {
      delete env.markdownRenderer.remarkReactComponents[DASHBOARD_TAG]
    }
    env.layouts.removeComponentFromLayout('editor', 'HabitsEditorBanner')
    env.components.deleteClass(EditorBanner, 'HabitsEditorBanner')
    for (const layout of MAIN_LAYOUTS) env.layouts.removeComponentFromLayout(layout, 'HabitsView')
    env.components.deleteClass(HabitsView, 'HabitsView')
    env.layouts.removeComponentFromLayout('sidebar-menu', 'HabitsSideBarMenuItem')
    env.components.deleteClass(SideBarMenuItemHabits, 'HabitsSideBarMenuItem')
    env.layouts.removeComponentFromLayout('modal', 'HabitsEditDialog')
    env.components.deleteClass(EditDialog, 'HabitsEditDialog')
    env.layouts.removeComponentFromLayout('modal', 'HabitsAlertDialog')
    env.components.deleteClass(AlertDialog, 'HabitsAlertDialog')
    setEnv(undefined)
  }
}

export default new HabitsPlugin()
