# tahta-ember

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/radeisv/tahta-ember/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/radeisv/tahta-ember/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Ember Throne — a 2D real-time strategy game in the style of classic RTS games, built from scratch. Pick one of four original factions — Human, Orc, Devil or Nature — and fight a 2v2 battle with an AI ally against two AI enemies. Workers gather gold and wood, you raise a base (headquarters, barracks, towers, economy buildings and a faction temple), train an army and a hero with a unique ability, and win by destroying both enemy headquarters. All art is procedural Canvas vector art and all sound is procedural Web Audio — no copied assets, no network.

## Factions

- **Human** (blue/gold) — disciplined soldiers; Paladin hero with Heal.
- **Orc** (green/red) — brutal and fast; Chieftain hero with War Stomp.
- **Devil** (purple/orange) — fire and darkness; Devil Lord hero with Fireball.
- **Nature** (green/teal) — the living forest; Druid hero with Entangle.

## Controls

- Left-click: select a unit or building; drag: box-select many units
- Right-click: move, attack, or gather (workers on a gold mine or tree)
- B: build menu, then 1-4 to pick a building, click to place it
- T: train menu for the selected production building, then 1-4 to train
- A: attack-move, Q: hero ability, H: hold position
- Space / P / Esc: pause and resume; R: restart; 1-4 on the faction screen picks a faction
- Click / Space / Enter: start, and restart from the win or game-over screen

## Achievements

Eight real achievements tracked from actual gameplay and saved in the browser: first blood, 1000 gold mined, 20 units trained, 30 enemies defeated, hero ability used 3 times, first victory, victory without losing a building, and victory as all four factions.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. Or open `game/index.html` directly from a static server — the game loads no network resources at all.

---

<sub>Entered on [make.fun](https://make.fun/?ref=f62prjm7&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
