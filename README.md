# Habits

**English** | [日本語](#日本語)

A habit tracker for Inkdrop, inspired by TickTick's Habits. Register things you want to keep doing every day or every week, get notified at the times you choose, check them off, and see your streaks and completion rates.

> The UI is in English, or in Japanese when Japanese is one of your system languages (see the Language setting). The habits note can be written in English or Japanese.

## Install

```sh
ipm install habits
```

Or search for "habits" in Inkdrop's Preferences → Plugins.

## Usage

- Open the habits page from **Habits** in the sidebar (`Cmd+Alt+B`).
  - Left: To do today / Done today / Off today / Archived. Click ○ to complete a habit, ⏭ to skip it for today. The seven cells on the right of each row are this week; clicking one cycles done → skipped → cleared, so you can also record past days.
  - Right: the selected habit's current streak, longest streak, total count and this month's completion rate, plus a monthly calendar and a six-month heatmap.
- **＋ Add habit** lets you set the name, emoji, frequency (daily / specific weekdays / N times a week / every N days), reminder times (more than one is fine) and start date.
- Reminders arrive as a desktop notification and a modal inside Inkdrop. From the modal you can mark the habit done, snooze it for a few minutes, or skip it for today. Once a habit is done or skipped, it won't notify again that day.

## Data

Habits and records are stored as Markdown in a note named "🔁 Habits" ("🔁 習慣" in Japanese). It syncs to your other devices through Inkdrop sync, and you're free to edit it by hand. The note is created when you add your first habit, and you can move it to another notebook afterwards.

```
## Habits
- 💧 Drink 2L of water | daily | 09:00, 15:00
- 🏃 Running | Mon Wed Fri | 07:00 | start 2026-10-01
- 📚 Reading | 3 times a week | 21:00
- 🧹 Cleaning | every 3 days | | start 2026-10-01 | archived

## Records
- 2026-10-16: ✓ Drink 2L of water · ⏭ Reading
```

- `## Habits`: one line per habit — `emoji name | frequency | reminder times | start YYYY-MM-DD | archived`.
  - Frequency: `daily`, `weekdays`, `weekends`, weekdays such as `Mon Wed Fri`, `3 times a week`, `every 3 days`, `every other day`.
- `## Records`: one line per day, newest first. `✓` is done and `⏭` is skipped.
- The Japanese format (`## 習慣` / `## 記録`, `毎日`, `月水金`, `週3回`, `3日ごと`, `開始 YYYY-MM-DD`, `アーカイブ`) is read too, and a note keeps its own language when the plugin edits it. A new note is written in the UI language.

How streaks are counted: skipped days don't break a streak. Today (or this week, for "N times a week" habits) doesn't break it either until the day is over.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| Notification style | `both` | `both`: desktop notification and modal / `desktop`: desktop notification only (falls back to the modal if it fails) / `inapp`: modal only |
| Notify missed reminders on startup | on | Notifies today's habits whose reminder time passed while Inkdrop was closed and that aren't recorded yet |
| Snooze minutes | `10` | |
| Week starts on | `monday` | Used for "N times a week" counts and the week display (`monday` / `sunday`) |
| Notebook for the habits note | empty | Name of the notebook where the habits note is created. If empty, a dedicated "Habits" notebook is created |
| Language | `auto` | UI language: `en` (English) / `ja` (Japanese). `auto` uses Japanese if it is one of your system languages, otherwise English |

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

---

# 日本語

[English](#habits) | **日本語**

TickTick の「習慣」のような習慣トラッカーです。毎日・毎週続けたいことを登録すると、決めた時刻に通知し、達成を記録して連続日数や達成率を表示します。

## インストール

```sh
ipm install habits
```

または Inkdrop の 設定 → プラグイン で「habits」を検索してインストールします。

## 使い方

- サイドバーの **Habits**（`Cmd+Alt+B`）で習慣ページを開きます。
  - 左側: 今日やる / 今日の記録済み / 今日はお休み / アーカイブ。○ をクリックで完了、⏭ で今日はスキップ。右側の7マスは今週で、クリックすると 完了 → スキップ → 取消 と切り替わります（過去の日もさかのぼって記録できます）。
  - 右側: 選んだ習慣の連続日数・最長連続・合計回数・今月の達成率、月のカレンダー、過去半年のヒートマップ。
- **＋ 習慣を追加** で名前、絵文字、頻度（毎日 / 曜日指定 / 週◯回 / ◯日ごと）、通知時刻（複数可）、開始日を設定します。
- 通知はデスクトップ通知と Inkdrop 内のモーダルで届きます。モーダルから「完了」「◯分後に再通知」「今日はスキップ」を選べます。完了またはスキップした習慣には、その日はもう通知しません。

## データ

習慣と記録は「🔁 習慣」ノートに Markdown で保存されます。Inkdrop の同期で他の端末にも共有され、手で編集しても構いません。最初の習慣を追加したときに作成され、あとから別のノートブックへ移動できます。

```
## 習慣
- 💧 水を2L飲む | 毎日 | 09:00, 15:00
- 🏃 ランニング | 月水金 | 07:00 | 開始 2026-10-01
- 📚 読書 | 週3回 | 21:00
- 🧹 掃除 | 3日ごと | | 開始 2026-10-01 | アーカイブ

## 記録
- 2026-10-16: ✓ 水を2L飲む · ⏭ 読書
```

- 英語の書式（`## Habits` / `## Records`、`daily`、`Mon Wed Fri`、`3 times a week`、`every 3 days`、`start YYYY-MM-DD`、`archived`）でも読めます。プラグインが書き換えるときはノートの言語のまま書き、新しく作るノートは表示言語で作ります。

連続日数の数え方: スキップした日は連続を途切れさせません。今日（「週◯回」なら今週）は、達成するまで連続を途切れさせません。

## 設定

| 設定 | 既定値 | 内容 |
| --- | --- | --- |
| 通知方法 | `both` | `both`: デスクトップ通知とモーダル / `desktop`: デスクトップ通知のみ（失敗時はモーダル） / `inapp`: モーダルのみ |
| 起動時に今日の見逃した通知を出す | オン | Inkdrop を閉じていた間に通知時刻を過ぎた、まだ記録していない今日の習慣を通知します |
| 「あとで」の再通知までの分数 | `10` | |
| 週の始まり | `monday` | 「週◯回」の集計と週の表示に使います（`monday` / `sunday`） |
| 習慣ノートを作るノートブック | 空 | 「🔁 習慣」ノートを作るノートブック名。空なら専用の「Habits」ノートブックを作ります |
| Language | `auto` | 表示言語。`en`（英語）/ `ja`（日本語）。`auto` はシステムの言語に日本語が含まれていれば日本語、それ以外は英語 |

## コマンド

| コマンド | 内容 |
| --- | --- |
| `habits:show` | 習慣ページを表示 |
| `habits:add` | 習慣を追加 |
| `habits:show-status` | 今日このあとの通知を一覧 |
| `habits:test-notification` | テスト通知 |

## 開発

```sh
npm install
npm run build      # lib/ に出力
npm run typecheck
```

## ライセンス

MIT
