import type { Environment } from '@inkdropapp/types'

import { tr } from './i18n'

/** Registers the Plugins menu in the UI language. */
export function addMenu(env: Environment): { dispose(): void } {
  return env.menu.add([
    {
      label: 'Plugins',
      submenu: [
        {
          label: 'Habits',
          submenu: [
            { label: tr('Show Habits', '習慣を表示'), command: 'habits:show' },
            { label: tr('Add Habit…', '習慣を追加…'), command: 'habits:add' },
            { label: tr("Show Today's Remaining Reminders", '今日このあとの通知を表示'), command: 'habits:show-status' },
            { label: tr('Send Test Notification', 'テスト通知を送る'), command: 'habits:test-notification' }
          ]
        }
      ]
    }
  ] as any)
}
