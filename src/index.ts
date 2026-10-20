import type { ConfigSchema, Environment, IInkdropPlugin } from '@inkdropapp/types'

import { AlertDialog } from './alert-dialog'
import { pushAlert } from './alerts'
import { EditDialog } from './edit-dialog'
import { setEnv } from './env'
import { languageConfig, tr } from './i18n'
import { addMenu } from './menus'
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
      title: tr('Notification style', '通知方法'),
      type: 'string',
      default: 'both',
      enum: ['both', 'desktop', 'inapp'],
      description:
        tr(
          'both: desktop notification and a modal in Inkdrop / desktop: desktop notification only (falls back to the modal if it fails) / inapp: modal only',
          'both: デスクトップ通知と Inkdrop 画面中央のモーダル / desktop: デスクトップ通知のみ（失敗時はモーダルで表示） / inapp: モーダルのみ'
        )
    },
    notifyMissed: {
      title: tr("Notify today's missed reminders on startup", '起動時に今日の見逃した通知を出す'),
      description: tr(
        "Today's habits whose reminder time passed while Inkdrop was closed and that aren't recorded yet",
        'Inkdrop を閉じていた間に通知時刻を過ぎた、まだ記録していない今日の習慣'
      ),
      type: 'boolean',
      default: true
    },
    snoozeMinutes: {
      title: tr('Snooze minutes', '「あとで」の再通知までの分数'),
      type: 'integer',
      default: 10,
      minimum: 1
    },
    weekStartsOn: {
      title: tr('Week starts on (for "N times a week" and the week display)', '週の始まり（「週◯回」の集計と週の表示）'),
      type: 'string',
      default: 'monday',
      enum: ['monday', 'sunday']
    },
    notebook: {
      title: tr('Notebook for the habits note', '習慣ノートを作るノートブック'),
      description: tr(
        'Name of the notebook where the habits note is created when you add your first habit. If empty, a "Habits" notebook is created. You can move the note afterwards',
        '最初の習慣を追加したときに「🔁 習慣」ノートを作る場所（ノートブック名）。空なら専用の「Habits」ノートブックを作ります。作成後は自由に移動できます'
      ),
      type: 'string',
      default: ''
    },
    language: languageConfig
  }

  private commands: { dispose(): void } | null = null
  private menu: { dispose(): void } | null = null
  private languageWatch: { dispose(): void } | null = null
  private marker: { dispose(): void } | null = null

  activate(env: Environment) {
    setEnv(env)
    this.commands = env.commands.add(document.body, {
      'habits:show': {
        description: tr('Habits: Show habits', 'Habits: 習慣を表示'),
        didDispatch: () => {
          if (env.isMainWindow) habitsView.set(true)
        }
      },
      'habits:add': {
        description: tr('Habits: Add habit', 'Habits: 習慣を追加'),
        didDispatch: () => editing.set({})
      },
      'habits:show-status': {
        description: tr("Habits: Show today's remaining reminders", 'Habits: 今日このあとの通知を表示'),
        didDispatch: () => this.showStatus(env)
      },
      'habits:test-notification': {
        description: tr('Habits: Send a test notification', 'Habits: テスト通知を送る'),
        didDispatch: () => this.testNotification(env)
      }
    } as any)
    this.menu = addMenu(env)
    this.languageWatch = env.config.onDidChange('habits.language', () => {
      this.menu?.dispose()
      this.menu = addMenu(env)
    })

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
        env.notifications.addError(tr('Habits: Failed to load habits', 'Habits: 習慣の読み込みに失敗しました'), {
          detail: err instanceof Error ? err.message : String(err),
          dismissable: true
        })
      })
  }

  private showStatus(env: Environment) {
    const scheduler = getScheduler()
    if (!scheduler) {
      env.notifications.addWarning(tr('Habits: Reminders are not running', 'Habits: 通知が動いていません'), {
        detail: tr('Run this in the main window.', 'メインウィンドウで実行してください。'),
        dismissable: true
      })
      return
    }
    const list = scheduler.upcoming()
    env.notifications.addInfo(tr(`Habits: ${list.length} reminders left today`, `Habits: 今日このあとの通知 ${list.length}件`), {
      detail: list.map(({ habit, time }) => `${tr('•', '・')} ${time} ${habit.emoji} ${habit.name}`).join('\n') || tr('None', 'ありません'),
      dismissable: true
    })
  }

  private async testNotification(env: Environment) {
    const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
    const result = await showDesktopNotification(
      tr('🔁 Habits test', '🔁 Habits テスト'),
      tr('Desktop notifications are working', 'デスクトップ通知は正常に動いています')
    )
    pushAlert({ id: `test:${Date.now()}`, name: tr('This is a Habits test notification', 'Habits のテスト通知です'), emoji: '🔁', date: '', time: '', test: true })
    const detail = `Notification.permission: ${permission} → ${tr('result', '結果')}: ${result}`
    if (result === 'shown') env.notifications.addSuccess(tr('Test notification sent', 'テスト通知を送りました'), { detail, dismissable: true })
    else env.notifications.addWarning(tr('Could not show a desktop notification', 'デスクトップ通知を出せませんでした'), {
        detail,
        dismissable: true
      })
  }

  deactivate(env: Environment) {
    habitsView.set(false)
    editing.set(null)
    getScheduler()?.stop()
    setScheduler(null)
    stopStore()
    this.commands?.dispose()
    this.commands = null
    this.menu?.dispose()
    this.menu = null
    this.languageWatch?.dispose()
    this.languageWatch = null
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
