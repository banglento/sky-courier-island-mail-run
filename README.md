# SKY COURIER — Island Mail Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/banglento/sky-courier-island-mail-run/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/banglento/sky-courier-island-mail-run/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A 2D canvas flight game (no libraries, no network): fly a courier plane on an island mail run — through 8 rings in order, then land on the runway. Throttle, turning, fuel, hull damage, combos and a mail-delivered landing bonus. Chase view over sea, coastal city, snowy mountains and plains, with a lit HUD (altitude, speed, heading).

Controls: W/S throttle, arrow keys to turn/climb/descend, hold mouse to steer, P pause, Space start/restart.

Run it (no build step, static files under `game/`):

```sh
node serve.ts
# open http://localhost:8080
```

Screenshots in `screenshots/` are real renders of the game in a browser (the first is the cover). `main.ts` hands the entry in: it copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json`.
