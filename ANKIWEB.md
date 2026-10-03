# AnkiWeb listing

Live at <https://ankiweb.net/shared/info/427107295> (install code `427107295`).
To publish an update: run `./build.sh`, open the AnkiWeb page while logged in, choose **Update**, and upload the new zip.

| Field | Value |
|---|---|
| **File** | `dist/onigiri_kitchen-ankiweb.zip` (run `./build.sh` first) |
| **Title** | Onigiri Kitchen · おにぎり食堂 |
| **Tags** | `onigiri gamification pomodoro timer pet cozy pixel motivation` |
| **Support page** | https://github.com/thussenthan/onigiri-kitchen/issues |
| **Branches** | minimum `23.10.0`, maximum the newest Anki you've tested (from Help → About, e.g. `25.09.2`; no `-` prefix, so newer versions can still download it). A blank maximum gives "invalid version range". |

Anki names AnkiWeb installs after the download's file name, which AnkiWeb makes from the title with anything non-ASCII removed (`Onigiri_Kitchen__.ankiaddon`), so the add-on list shows plain "Onigiri Kitchen". The title still shows in full on AnkiWeb, so keep the Japanese in it.


## Description (paste into the description box, which accepts Markdown)

```markdown
**A cozy pixel-art restaurant, pomodoro timer and shop pets. Made as a companion to [Onigiri](https://ankiweb.net/shared/info/1011095603).**

You study, guests arrive. You take a break, you get to enjoy them.

![Daytime in the restaurant](https://raw.githubusercontent.com/thussenthan/onigiri-kitchen/main/docs/day.png)

### Features
- **A living pixel restaurant.** Click Onigiri's restaurant widget to open it. Lanterns, a noren curtain in your theme colour, and a window onto Mt. Fuji that follows your real clock and the seasons.
- **Guests come from studying.** Every 10 reviews in a deck brings a guest from that deck, and each deck has its own look. Getting a leech right sends a grumpy sour-plum guest who cheers up once fed.
- **Your Onigiri Specials are on the menu:** guests order dishes from your Specials Book, so the menu grows with every Daily Special you finish, and golden guests order today's special. Rarer specials tip more (and once you've finished today's special in Onigiri, golden guests tip extra, the chef cheers and the 本日 tag gets a 済 seal), collecting them earns rewards for your restaurant (including a お品書き menu board), the chef announces each new dish, and he cheers when your Onigiri restaurant levels up.
- **A daily goal party:** reach your daily card goal (100 by default, change it in settings) and your restaurant throws a little fireworks party the next time you visit.
- **Study in one big batch.** No limit on waiting guests. After a big session, serve everyone at 4× speed or collect every tip at once. Reviews from your phone count too once synced.
- **Pomodoro timer.** One dango per focus session. It only counts while you're reviewing (it pauses after two minutes idle). The restaurant opens when your break starts, and nudges you back when it ends. Long breaks are festival nights with fireworks. Prefer no breaks? Tap ∞ for endless focus: it counts up and every session still counts.
- **Pick a starter pet:** Tama the cat, a puffle in your favourite colour, or a Java sparrow (grey, white, sakura or cinnamon) that flies around the restaurant. Adopt the others later from the shop.
- **Your shop pet.** A gentle virtual pet. Studying feeds it, and it grows with total study days (never streaks), develops a personality, learns tricks and brings you gifts. Caring for it unlocks accessories, a happy-pet tip bonus, rare keepsakes and a treasure shelf. It can't get sick, run away or die.
- **The shop.** Guests tip in mon. Spend it on a bonsai, wind chime, maneki-neko, daruma (4 focus sessions in a day grants its wish: +30 mon), goldfish and more. Some items unlock at higher restaurant levels (without Onigiri, you level up every 3 days you study). Puffle owners also get puffle colours, an igloo lamp and penguins strolling past the window.
- **More pets:** milestone buys that move in, each with a perk. A rabbit, a black cat, a shiba, a fox, a tanuki and a crane. Tap the bed to tuck everyone in; it grows with every pet.
- **A real-time clock:** a wooden wall clock, or tap it for a flip clock.
- **Candles on the tables:** click one to light or snuff it. Lanterns and candles light themselves at dusk and go out at dawn.
- **Confetti and sakura petals** when you finish a deck: 紙吹雪 bursts in from the sides and petals drift down over the "Congratulations" screen, with a little fanfare.
- **統計 Stats, lots of them:** ⚙ → Open stats, for the last 7 days, 30 days, year or all time. Today's cards, time, pace and how long what's due will take at your pace; pomodoro focus time, streaks, completion rate, best days and time-of-day patterns; your Anki reviews with a year heatmap, retention, answer buttons and your collection's new, young and mature cards; and the kitchen's guests, mon and pet.
- **Home-screen widget** with your all-time reviews, daily average, days studied, longest streak and total time studied (big widgets add how long today's due cards will take at your pace): add it to your Onigiri main menu from Onigiri's layout editor (or see it under your decks without Onigiri).
- **Several pets, your pick.** Adopt more than one and switch which is your main pet. **Collect all** is on the home-screen widget too, and unsaved settings ask before they're lost.
- **A guided tour** the first time you open it, and a **目安箱 suggestion box** for ideas and bug reports.
- **Matches your Onigiri theme:** your colours, font and dark mode, or light by day and dark at night by your clock.

![Night and festival](https://raw.githubusercontent.com/thussenthan/onigiri-kitchen/main/docs/night.png)

### How to open it
Click the restaurant picture on Onigiri's main screen (Shift-click keeps Onigiri's normal view), click the shop-front icon next to Onigiri's buttons, click the dango timer in the corner, or use **Tools → Onigiri Kitchen** (Ctrl+Shift+K, or Cmd+Shift+K on a Mac).

### Your data
Onigiri Kitchen never modifies Onigiri. It only reads your restaurant name, level, theme and Specials Book. Your XP and Taiyaki coins are untouched. Onigiri is recommended but not required.

### Bugs & ideas
Click the 目安箱 suggestion box on the restaurant wall, or use **⚙ → Suggest a feature / Report a bug**, or open an issue on [GitHub](https://github.com/thussenthan/onigiri-kitchen). Please report problems there rather than in AnkiWeb reviews, since I can't reply to reviews.
```
