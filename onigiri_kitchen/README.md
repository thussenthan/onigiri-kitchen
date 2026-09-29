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
  **Tools → Onigiri Kitchen** (Ctrl+Shift+K, or Cmd+Shift+K on a Mac). Shift-click the picture to get Onigiri's normal
  expanded view.
- **Guests come from studying:** every 10 reviews in a deck brings a guest from that deck. There's no limit, so
  study in one big batch and catch up later: 急 Serve faster serves everyone at 4×, and tapped again collects all tips at once.
  Each deck has its own look. Getting a leech card right sends a grumpy sour-plum guest who
  cheers up once fed. Finishing a focus session sends a golden guest, and if you own the
  daruma, your 4th session of the day paints its second eye for +30 mon.
- **The menu:** guests order dishes from your Onigiri Specials Book (it grows with every Daily
  Special you finish), and golden guests order today's special. Without Onigiri, onigiri
  flavours unlock as your restaurant levels up. Tap the chef to make dishes ahead for the tray.
  Rarer specials tip more, golden guests tip +3 more for today's special once you've
  finished it in Onigiri (the chef cheers and the 本日 tag gets a 済 seal), and collecting specials earns rewards (see the shop).
- **Daily goal:** reach `daily_card_goal` reviews (100 by default; change it in ⚙) and the
  kitchen throws a little fireworks party on your next visit.
- **Guests tip in 文 (mon):** spend mon in the shop on decor and pets. Some pieces
  unlock at higher Onigiri restaurant levels.
- **The timer:** a pomodoro timer, with one dango per focus session. When a break starts, the
  restaurant opens. When the break ends, it nudges you back to your cards. A long break
  turns into a festival night with fireworks outside the window. Tap ∞ for endless focus:
  no breaks, the clock counts up, and every focus-length still counts as a session.
- **Things to click:** the chef makes onigiri for the tray, your pet enjoys being petted,
  the menu tags play koto notes, the window calls a sparrow, and the lanterns switch
  on and off. The window follows your real clock and the season.

## Pets, candles & confetti

Save up mon for more pets (rabbit, black cat, shiba, fox, tanuki, crane), or adopt the starter
pets you didn't pick (1,000 mon each). They move into the restaurant and each has a perk (hover
one in the shop to see it). Tap the bed to tuck everyone in; it grows a spot for each pet.
The wall clock keeps real time (tap it for a flip clock), and the specials board opens a
お品書き menu. Each table has a candle you can light or snuff with a click; lanterns and candles light
themselves at dusk and go out at dawn. Without Onigiri, the restaurant level (which unlocks
some shop items) goes up every 3 days you've studied.
Once you have a puffle, puffle colours (250 mon each), an igloo lamp and penguins passing the
window appear too. Finishing a deck right after reviewing sets off 紙吹雪 confetti and falling sakura petals (turn it off with
`celebrate_deck_finish` in the config).

## Home-screen widget

With Onigiri, add **Onigiri Kitchen · おにぎり食堂** to your main menu from Onigiri's layout editor.
Without Onigiri, the widget shows under your decks (toggle `show_home_widget_without_onigiri` in the config).

## Your shop pet 🐾

On your first visit you choose a starter: **Tama the cat**, a **puffle** (pick its colour) or a
**文鳥 Java sparrow** (it flies between perches around the restaurant). They all work the same
way; the notes below use Tama. Open your pet's
card with the **Pet** button (Care, Style and Keepsakes tabs). Double-click the name to rename it.

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
- **Rewards for caring:** all three needs at 70+ → she beckons guests in (+1 tip). Pet her (up to 20
  counted a day) and feed her fish to unlock collar colours, a bandana, a golden bell, a fancy cushion and a
  kotatsu. All 12 keepsakes → +500 mon and a treasure shelf. Love 90+ → a chance of rare golden keepsakes.

Settings live in the timer panel in the kitchen (⚙) and in **Tools → Add-ons → Onigiri Kitchen → Config**.

## Your data

- Onigiri Kitchen **never changes Onigiri's files, XP or Taiyaki coins.** It only reads
  your restaurant name, level and theme.
- Kitchen progress (mon, decor, waiting guests) is saved per profile in this add-on's
  `user_files` folder, which Anki keeps when the add-on is updated.

All art and sound are generated in code, so there are no image or audio files to license.
