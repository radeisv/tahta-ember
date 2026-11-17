// Ember Throne — tuning numbers, colours and keys in one place. The playfield
// is a fixed 1280x720 logical area; the renderer scales it to the window, so
// no rule below depends on the screen size. Top bar is 44 px, the command
// panel is the bottom 112 px; the battlefield is y 48..604.

export const FIELD = { width: 1280, height: 720, hudTop: 44, panelTop: 608, fieldTop: 48, fieldBottom: 604 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Base supply every faction starts with; economy buildings add more. */
export const BASE_SUPPLY = 10;

export const START = { gold: 200, wood: 150, workers: 3 };

export const GOLD_MINE_AMOUNT = 2500;
export const CENTER_MINE_AMOUNT = 1500;
export const TREE_WOOD = 180;

/** A worker carries this much per trip and mines this long per load. */
export const GATHER = { amount: 10, time: 1.6 };

/** How far apart units stand, and how far a combat unit looks for a fight. */
export const SEPARATION = 13;
export const AGGRO_RANGE = 210;

export const BUILD_TIMES = { hq: 0, barracks: 8, tower: 6, economy: 6, special: 10 };
export const TRAIN_TIMES = { worker: 3, melee: 4, ranged: 4, heavy: 6, hero: 8 };

/** Hero ability cooldown, in seconds. */
export const ABILITY_COOLDOWN = 12;

/** AI thinks this often (seconds), attacks with this many combat units, and only after this many seconds. */
export const AI = { thinkInterval: 0.75, workersTarget: 5, attackArmy: 8, harassArmy: 5, attackAfter: 150, harassAfter: 90 };

export const PALETTE = {
  backdrop: '#141a12',
  grass: '#2f5d2a',
  grassDark: '#274d23',
  grassLight: '#3a6d33',
  dirt: '#6b5233',
  panel: '#1c2418',
  panelEdge: '#4a5a3a',
  text: '#f2f0e4',
  muted: '#b9c4a8',
  gold: '#f2c94c',
  wood: '#a9803e',
  select: '#ffffff',
  enemyRing: '#ff5a4e',
  // Terrain extras: river, dirt paths, rock and sand.
  river: '#2e6f9e',
  riverLight: '#5aa3cc',
  riverBank: '#c2a878',
  path: '#7d5f38',
  pathEdge: '#5d4526',
  rock: '#8d8d8d',
  rockDark: '#5f5f5f',
  bridge: '#8a6a42',
  bridgeDark: '#6b4e2e',
  teamA: '#38bdf8',
  teamB: '#fb923c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where achievements are kept between visits (this browser only). */
export const ACHIEVEMENTS_KEY = 'tahta-ember.achievements.v1';
/** Where the best result (wins) is kept. */
export const BEST_KEY = 'tahta-ember.best.v1';
