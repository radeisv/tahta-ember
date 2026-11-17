// Achievements: real gameplay events only. Each definition has a test over
// the world's stats; the store unlocks one only when its test passes on a
// real battle, and persists the unlock in localStorage. Nothing in the game
// ever marks an achievement unlocked by hand, and the achievements screen
// renders exactly what this store holds.

export const ACHIEVEMENT_DEFS = [
  {
    id: 'first-blood', name: 'First Blood', desc: 'Defeat your first enemy in battle.',
    test: (stats) => stats.kills >= 1,
  },
  {
    id: 'rich', name: 'Riches', desc: 'Gather 1000 gold in a single battle.',
    test: (stats) => stats.goldMined >= 1000,
  },
  {
    id: 'train-20', name: 'Warlord', desc: 'Train 20 units in a single battle.',
    test: (stats) => stats.trained >= 20,
  },
  {
    id: 'kill-30', name: 'Exterminator', desc: 'Defeat 30 enemies in a single battle.',
    test: (stats) => stats.kills >= 30,
  },
  {
    id: 'hero-power', name: 'Hero Power', desc: 'Use the hero ability 3 times in a single battle.',
    test: (stats) => stats.abilities >= 3,
  },
  {
    id: 'first-win', name: 'First Victory', desc: 'Win one 2v2 battle.',
    test: (stats) => stats.result === 'win',
  },
  {
    id: 'no-loss', name: 'Unbreakable Fortress', desc: 'Win without losing a single building.',
    test: (stats) => stats.result === 'win' && stats.buildingsLost === 0,
  },
  {
    id: 'four-flags', name: 'Four Banners', desc: 'Win as all four factions: Human, Orc, Devil and Nature.',
    test: (stats, store) => {
      const wins = store.winsByFaction;
      return wins.human > 0 && wins.orc > 0 && wins.demon > 0 && wins.nature > 0;
    },
  },
];

/** Load the persistent store: unlocked ids with timestamps, and wins per faction. */
export function loadAchievements(persist, key) {
  const store = { unlocked: {}, winsByFaction: { human: 0, orc: 0, demon: 0, nature: 0 } };
  if (!persist) return store;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return store;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.unlocked && typeof parsed.unlocked === 'object') store.unlocked = parsed.unlocked;
      if (parsed.winsByFaction && typeof parsed.winsByFaction === 'object') {
        for (const id of ['human', 'orc', 'demon', 'nature']) {
          if (Number.isFinite(parsed.winsByFaction[id])) store.winsByFaction[id] = parsed.winsByFaction[id];
        }
      }
    }
  } catch {
    // A corrupt store starts empty rather than breaking the game.
  }
  return store;
}

export function saveAchievements(store, persist, key) {
  if (!persist) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // Storage can be off (private windows): achievements then last this visit only.
  }
}

/**
 * Check every definition against the battle stats. Returns the ids newly
 * unlocked by this check. Call recordFactionWin once, at the moment the
 * battle is won, before this check — never from inside it, so a win is
 * counted exactly once.
 */
export function checkAchievements(store, stats, persist, key) {
  const newly = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (store.unlocked[def.id]) continue;
    if (def.test(stats, store)) {
      store.unlocked[def.id] = Date.now();
      newly.push(def.id);
    }
  }
  if (newly.length > 0) saveAchievements(store, persist, key);
  return newly;
}

/** Record one faction victory (call exactly once per won battle). */
export function recordFactionWin(store, factionId, persist, key) {
  if (!factionId) return;
  store.winsByFaction[factionId] = (store.winsByFaction[factionId] || 0) + 1;
  saveAchievements(store, persist, key);
}

export function unlockedCount(store) {
  return Object.keys(store.unlocked).length;
}
