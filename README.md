# Habits

**English** | [日本語](https://github.com/oba18/inkdrop-habits/blob/main/README.ja.md)

A habit tracker for Inkdrop, inspired by TickTick's Habits. Register things you want to keep doing every day or every week, get notified at the times you choose, check them off, and see your streaks and completion rates.

> The plugin's UI and the habits note format are in Japanese.

## Install

```sh
ipm install habits
```

Or search for "habits" in Inkdrop's Preferences → Plugins.

## Usage

- Open the habits page from **Habits** in the sidebar (`Cmd+Alt+B`).
  - Left: To do today / Done today / Off today / Archived. Click ○ to complete a habit, ⏭ to skip it for today. The seven cells on the right of each row are this week; clicking one cycles done → skipped → cleared, so you can also record past days.
  - Right: the selected habit's current streak, longest streak, total count and this month's completion rate, plus a monthly calendar and a six-month heatmap.
- **＋ 習慣を追加** (Add habit) lets you set the name, emoji, frequency (daily / specific weekdays / N times a week / every N days), reminder times (more than one is fine) and start date.
- Reminders arrive as a desktop notification and a modal inside Inkdrop. From the modal you can mark the habit done, snooze it for a few minutes, or skip it for today. Once a habit is done or skipped, it won't notify again that day.

## Data

Habits and records are stored as Markdown in a note named "🔁 習慣". It syncs to your other devices through Inkdrop sync, and you're free to edit it by hand. The note is created when you add your first habit, and you can move it to another notebook afterwards.

```
## 習慣
- 💧 水を2L飲む | 毎日 | 09:00, 15:00
- 🏃 ランニング | 月水金 | 07:00 | 開始 2026-10-01
- 📚 読書 | 週3回 | 21:00
- 🧹 掃除 | 3日ごと | | 開始 2026-10-01 | アーカイブ

## 記録
- 2026-10-16: ✓ 水を2L飲む · ⏭ 読書
```

- `## 習慣` (Habits): one line per habit — `emoji name | frequency | reminder times | 開始 YYYY-MM-DD (start date) | アーカイブ (archived)`.
  - Frequency: `毎日` daily, `平日` weekdays, `週末` weekends, weekday letters such as `月水金` (Mon/Wed/Fri), `週3回` 3 times a week, `3日ごと` every 3 days.
- `## 記録` (Records): one line per day, newest first. `✓` is done and `⏭` is skipped.

How streaks are counted: skipped days don't break a streak. Today (or this week, for "N times a week" habits) doesn't break it either until the day is over.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| Notification style | `both` | `both`: desktop notification and modal / `desktop`: desktop notification only (falls back to the modal if it fails) / `inapp`: modal only |
| Notify missed reminders on startup | on | Notifies today's habits whose reminder time passed while Inkdrop was closed and that aren't recorded yet |
| Snooze minutes | `10` | |
| Week starts on | `monday` | Used for "N times a week" counts and the week display (`monday` / `sunday`) |
| Notebook for the habits note | empty | Name of the notebook where the "🔁 習慣" note is created. If empty, a dedicated "Habits" notebook is created |

## Commands

| Command | Description |
| --- | --- |
| `habits:show` | Show the habits page |
| `habits:add` | Add a habit |
| `habits:show-status` | List today's remaining reminders |
| `habits:test-notification` | Send a test notification |

## Development

```sh
npm install
npm run build      # outputs to lib/
npm run typecheck
```

## License

MIT
