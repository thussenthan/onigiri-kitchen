# Onigiri Kitchen · おにぎり食堂

A cozy pixel-art restaurant and pomodoro timer for Anki, made to sit alongside the
**Onigiri** add-on. You study, guests show up. You take a break, you get to enjoy them.

## Install

1. Double-click `onigiri_kitchen.ankiaddon`, or in Anki go to **Tools → Add-ons → Install from file…**
2. Restart Anki.

Onigiri is recommended but not required. With Onigiri installed, the kitchen uses your
restaurant's name, level and theme colour. Without it, the kitchen still works on its own.

## How it works

- **Open the kitchen:** click the restaurant picture on Onigiri's main screen, click the
  little shop-front icon next to Onigiri's buttons, click the dango timer in the corner, or use
  **Tools → Onigiri Kitchen** (Ctrl+Shift+K). Shift-click the picture to get Onigiri's normal
  expanded view.
- **Guests come from studying:** every 10 reviews in a deck brings a guest from that deck. There's no limit, so
  study in one big batch and catch up later: serve everyone at 4× or collect all tips at once.
  Each deck has its own look. Getting a leech card right sends a grumpy sour-plum guest who
  cheers up once fed. Finishing a focus session sends a golden guest.
- **Guests tip in 文 (mon):** use mon to buy decor. Some pieces unlock at higher Onigiri
  restaurant levels.
- **The timer:** a pomodoro timer, with one dango per focus session. When a break starts, the
  restaurant opens. When the break ends, it nudges you back to your cards. A long break
  turns into a festival night with fireworks outside the window.
- **Things to click:** the chef makes onigiri for the tray, Tama the cat enjoys being petted,
  the menu tags play koto notes, the window calls a sparrow, and the lanterns switch
  on and off. The window follows your real clock and the season.

## Companions & confetti

Save up mon for animal companions (rabbit, black cat, shiba, fox, tanuki, crane). They move into the
restaurant and each has a perk. Finishing a deck right after reviewing sets off 紙吹雪 confetti (turn it off with
`celebrate_deck_finish` in the config).

## Home-screen widget

With Onigiri, add **Onigiri Kitchen · おにぎり食堂** to your main menu from Onigiri's layout editor.
Without Onigiri, the widget shows under your decks (toggle `show_home_widget_without_onigiri` in the config).

## Tama, the shop cat 🐾

Tama is a gentle virtual pet. Open her panel with the **猫 Tama** button.

- **Needs:** お腹 tummy, 愛情 love and 元気 energy. She eats scraps while you review,
  gets a fish for every guest you serve, and perks up after focus sessions. Pet her,
  brush her, feed her fish, or play with the feather toy during breaks.
- **She can't get sick, run away or die.** While you're away her needs drift down only to a
  comfortable floor, so she gets sleepier, never sadder. After a while away she runs to the
  door to greet you.
- **She grows** with total study days, not streaks: 子猫 kitten, then 若猫 young cat (3 days), then 看板猫 shop
  cat (10), then 招き猫 maneki master (25). She learns a new trick at each stage.
- **Personality** comes from how you study: night owls get a moon-marked cat, heavy
  reviewers get a round one, and leech-slayers get a scrappy one with a bent ear.
- **Gifts:** a happy, well-fed Tama sometimes brings you something for your keepsake box,
  like a paper crane, a marble, an old coin or a fortune slip.
- During focus sessions she naps on the timer in the corner.

Settings live in the timer panel in the kitchen (⚙) and in **Tools → Add-ons → Onigiri Kitchen → Config**.

## Your data

- Onigiri Kitchen **never changes Onigiri's files, XP or Taiyaki coins.** It only reads
  your restaurant name, level and theme.
- Kitchen progress (mon, decor, waiting guests) is saved per profile in this add-on's
  `user_files` folder, which Anki keeps when the add-on is updated.

All art and sound are generated in code, so there are no image or audio files to license.
