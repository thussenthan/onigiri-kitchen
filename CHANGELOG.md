# Changelog

What changed in each release. Newest first. (The last release's short note is also shown inside the kitchen, once, after you update.)

## 1.11.1

- Keyboard: Tab to the restaurant picture, then the arrow keys step through everything you can tap, Enter or Space taps it and Esc lets go (it is read out to screen readers too). Plain letters open the buttons: **S** shop, **P** pets, **T** stats, **F** focus timer, **,** timer settings, **M** mute, **C** postcard, **?** the list. Nothing with Ctrl, Cmd or Alt is used, and none work while you're typing or in a pop-up.
- An animated demo (`docs/kitchen.gif`) at the top of the README.

## 1.11.0

**Fixes**

- Guests who are mid-meal when you close the kitchen (or when Anki quits) are put back in the queue, so their tip is never lost. Tips are now worked out in one place (Python); the page only rolls the base tip and picks the dish.
- Reviews are counted by deck id, so renaming or moving a deck mid-day no longer brings a second round of guests.
- Each save is named by a stable id kept in the profile's collection settings, so renaming a profile no longer starts a fresh kitchen. An older name-based save is carried over (and left in place as a backup).
- A save with the wrong kind of value in a field (a hand-edited file, a restored backup) is repaired when loaded instead of failing later. Saves now carry a schema version.
- Reviews that reach Anki's log after their day closed (a phone synced the next morning) bring takeout guests, and a sync refreshes an open kitchen.
- The daily petting cap and the day boundary follow Anki's day (not the calendar day). The Anki day is now clock-change safe.
- A computer that sleeps mid-focus no longer credits the sleeping time when the idle pause is off.
- Working in the editor, the browser or Add counts as activity for the focus timer's idle pause.
- A page script can no longer break out of its `<script>` tag through a deck name (`<` is escaped).
- If the kitchen fails to open you get a message (and a debug-log line) instead of nothing.
- The Stats window releases its web view when it closes.
- Settings numbers are kept in sensible bounds.

**Faster**

- Stats open without freezing Anki: the review history is read in the background, and the Records page only reads answers added since last time.
- A save no longer re-reads and parses the whole save file just to check whether today's backup exists.
- Web files for the main screens are read from disk once, and a kitchen window you're not looking at redraws slowly.

**For Anki's newer scheduler**

- Average ease is hidden when FSRS is on (ease factors mean nothing there).

**For people who help**

- The bug-report info says which parts of Onigiri's data could be read.
- Many more tests (guests and tips, the Pomodoro state machine, reading Onigiri's files, the page itself in a headless browser, and a check against a real `aqt`). `dev/release_check.py` checks the version is the same everywhere.

## 1.10.10

- A postcard of your restaurant, to save as a PNG or copy

## 1.10.9

- Safer saves (daily backups, never overwrite an unreadable save), Back up and Restore, a What's new note, tests and CI, review stats in its own module, accessibility and readability fixes

## 1.10.8

- New-record note on Today, change vs the previous period on Reviews, faster Stats, reduced-motion support

## 1.10.7

- Grouped, foldable Stats tiles, a Records tab with personal bests for any range, no quiet-moment status line

## 1.10.6

- Leaner widget (30-day studied %, daily average, 30-day retention, time left), cleared-day streaks and percentages in Stats for reviews and all cards, focus and kitchen totals on every Reviews range, Onigiri 2.0 level difficulty

## 1.10.5

- Mount Fuji grows to peer over the forest, shop Buy buttons bottom-aligned, no Saved popup

## 1.10.4

- A forest outside the window and a bonsai that grows for a year, unlock notices for what unlocks by itself, hunger thought bubbles you can read and tap, widget text that fits, slimmer pet tabs, tidier credit and settings buttons

## 1.10.3

- Timer chip: even left and right padding, no blank gap when idle, and a hover tint that matches the pill's curve

## 1.10.2

- Remembers shop folds, radio, last pet and the daily focus note; pets in adoption order; slimmer Pets tabs; Reviews before Pomodoro, a year by default; no hover text on the widget

## 1.10.1

- Stats in separate pages (Today first), widget tiles in one row, panels aligned right, themed scroll bars, tidier Pets card, stats fixes

## 1.10.0

- Each pet has its own care and keepsakes, pet tabs, bowls and beds per pet, new 2x2 widget, Stats button, foldable shop

## 1.9.0

- Quieter notifications, pet switching, collect all on the widget, shorter tour

## 1.8.0

- 統計 Stats, with pomodoro stats recorded from now on

## 1.7.3

- Daruma grants its wish, finished specials tip more

## 1.7.2

- お品書き menu, real-time clock, quieter wind chime

## 1.7.1

- Endless focus (no breaks), chef announces new dishes, koto radio phrases

## 1.7.0

- Your Onigiri Specials Book is the menu; daily goal party; fixes

## 1.6.2

- Java sparrow colours and redraw, candles on tables, fixes

## 1.6.0

- Choose a starter pet (cat, puffle or Java sparrow), shop pets, candles

## 1.5.8

- A little variety in each celebration (piece counts, cannon spots, petal timing)

## 1.5.7

- Confetti spreads a little wider

## 1.5.6

- Confetti falls fully off screen; petals from the top, paper from the sides

## 1.5.5

- Count reviews from Anki's log (fixes overcounting after undo)

## 1.5.4

- Confetti survives Anki redrawing the congrats page

## 1.5.3

- More reliable deck-finished confetti + diagnostic log

## 1.5.2

- Feather toy button toggles; no overlay

## 1.5.1

- Stop the feather toy any time

## 1.5.0

- Rewards for caring for Tama, test-confetti menu item

## 1.4.0

- Focus timer pauses when you stop reviewing

## 1.3.2

- A little randomness in tips

## 1.3.1

- Companions are long-term milestones

## 1.3.0

- Animal companions, deck-finished confetti, sound tip in tour

## 1.2.2

- Fix kitten Tama rendering

## 1.2.1

- Fix Cmd+W, remove style mixing, widget shows today's progress

## 1.2.0

- Home-screen widget

## 1.1.0

- Batch catch-up, tutorial, suggestion box, style mixing
