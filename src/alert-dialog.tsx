import type { ButtonProps, Dialog as DialogType } from '@inkdropapp/types'
import React, { useEffect, useState } from 'react'

import { mark } from './actions'
import { dismissAlert, dismissAllAlerts, subscribeAlerts, type HabitAlert } from './alerts'
import { getConfig, getEnv } from './env'
import { getScheduler } from './scheduler'
import { showHabits } from './view-state'

/**
 * Centered modal listing habits whose reminder time came. Each can be checked
 * off, snoozed or skipped for today right here.
 */
export const AlertDialog: React.FC = () => {
  const [{ Dialog, Button }] = useState(() => ({
    Dialog: getEnv().components.classes.Dialog as DialogType,
    Button: getEnv().components.getComponentClass<ButtonProps>('Button')!
  }))
  const [alerts, setAlerts] = useState<HabitAlert[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeAlerts(setAlerts)
    return () => {
      unsubscribe()
    }
  }, [])

  const act = async (alert: HabitAlert, value: 'done' | 'skip') => {
    try {
      await mark(alert.name, value, alert.date)
      setError(null)
      dismissAlert(alert.id)
    } catch (err) {
      console.error('[habits] update failed:', err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const open = () => {
    dismissAllAlerts()
    showHabits()
  }

  const { snoozeMinutes } = getConfig()

  return (
    <Dialog visible={alerts.length > 0} className="habits-alert-dialog" onEscKeyDown={dismissAllAlerts} autofocus>
      <Dialog.Content>
        <div className="habits-alert">
          <div className="habits-alert-header">
            <span className="icon">🔁</span>
            <span>習慣のリマインダー{alerts.length > 1 ? `（${alerts.length}件）` : ''}</span>
          </div>
          <ul className="habits-alert-list">
            {alerts.map(alert => (
              <li key={alert.id}>
                <div className="title">
                  {alert.emoji && <span className="emoji">{alert.emoji}</span>}
                  <span>{alert.name}</span>
                </div>
                {alert.time && <div className="when">{alert.time} の習慣です</div>}
                <div className="buttons">
                  {!alert.test && (
                    <>
                      <Button primary onClick={() => act(alert, 'done')}>
                        ✓ 完了
                      </Button>
                      <Button onClick={() => getScheduler()?.snooze(alert)}>{snoozeMinutes}分後に再通知</Button>
                      <Button onClick={() => act(alert, 'skip')}>⏭ 今日はスキップ</Button>
                    </>
                  )}
                  <Button basic onClick={() => dismissAlert(alert.id)}>
                    閉じる
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {error && <div className="habits-alert-error">{error}</div>}
        </div>
      </Dialog.Content>
      <Dialog.Actions className="habits-actions">
        <Button basic onClick={open}>
          習慣を開く
        </Button>
        {alerts.length > 1 && <Button onClick={dismissAllAlerts}>すべて閉じる</Button>}
      </Dialog.Actions>
    </Dialog>
  )
}

AlertDialog.displayName = 'HabitsAlertDialog'
