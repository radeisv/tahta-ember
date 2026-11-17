// The four factions of Ember Throne. Original names, colours and units only:
// nothing here is copied from any commercial game. Each faction has its own
// colour, headquarters, four buildable buildings, a worker, three combat
// units and one hero with an ability. Buildings are data: the world builds
// them, the renderer draws them, the AI picks them — all from these tables.
// Display strings are all English. The `emblem` names the faction's motif,
// drawn large on the faction-select card and on its headquarters banner:
// shield (Human), totem (Orc), horns (Devil), leaf (Nature).

export const FACTION_IDS = ['human', 'orc', 'demon', 'nature'];

export const FACTIONS = {
  human: {
    id: 'human',
    name: 'Human',
    title: 'Human Kingdom',
    color: '#3b82f6',
    dark: '#1e40af',
    accent: '#f2c94c',
    emblem: 'shield',
    desc: 'A disciplined army of arrows and steel. Strong towers, steady economy.',
    hq: { name: 'Town Hall', hp: 2200 },
    buildings: {
      barracks: { name: 'Barracks', hp: 520, cost: { gold: 150, wood: 50 }, trains: ['melee', 'ranged'] },
      tower: { name: 'Arrow Tower', hp: 400, cost: { gold: 100, wood: 100 }, dmg: 16, range: 210, atkCd: 1.0 },
      economy: { name: 'Farm', hp: 320, cost: { gold: 80, wood: 80 }, supply: 8 },
      special: { name: 'Temple of Light', hp: 560, cost: { gold: 60, wood: 30 }, trains: ['heavy', 'hero'] },
    },
    units: {
      worker: { name: 'Worker', hp: 65, speed: 75, dmg: 4, range: 16, atkCd: 1.0, cost: { gold: 50, wood: 0 }, supply: 1 },
      melee: { name: 'Footman', hp: 130, speed: 58, dmg: 12, range: 18, atkCd: 0.9, cost: { gold: 90, wood: 0 }, supply: 1 },
      ranged: { name: 'Archer', hp: 75, speed: 58, dmg: 10, range: 150, atkCd: 1.1, cost: { gold: 70, wood: 40 }, supply: 1 },
      heavy: { name: 'Knight', hp: 230, speed: 72, dmg: 20, range: 18, atkCd: 1.0, cost: { gold: 140, wood: 60 }, supply: 2 },
      hero: {
        name: 'Paladin', hp: 400, speed: 62, dmg: 24, range: 20, atkCd: 1.0,
        cost: { gold: 50, wood: 0 }, supply: 2,
        ability: 'heal', abilityName: 'Heal',
        abilityDesc: 'Restores 80 HP to nearby allies.',
      },
    },
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    title: 'Orc Horde',
    color: '#4ade80',
    dark: '#166534',
    accent: '#ef4444',
    emblem: 'totem',
    desc: 'Brutal and fast. Tough units, cheap buildings, relentless attacks.',
    hq: { name: 'Great Hall', hp: 2200 },
    buildings: {
      barracks: { name: 'War Camp', hp: 520, cost: { gold: 150, wood: 50 }, trains: ['melee', 'ranged'] },
      tower: { name: 'Watch Tower', hp: 400, cost: { gold: 100, wood: 100 }, dmg: 16, range: 210, atkCd: 1.0 },
      economy: { name: 'Ranch', hp: 320, cost: { gold: 80, wood: 80 }, supply: 8 },
      special: { name: 'War Altar', hp: 560, cost: { gold: 60, wood: 30 }, trains: ['heavy', 'hero'] },
    },
    units: {
      worker: { name: 'Peon', hp: 65, speed: 75, dmg: 4, range: 16, atkCd: 1.0, cost: { gold: 50, wood: 0 }, supply: 1 },
      melee: { name: 'Grunt', hp: 140, speed: 56, dmg: 13, range: 18, atkCd: 0.9, cost: { gold: 90, wood: 0 }, supply: 1 },
      ranged: { name: 'Axe Thrower', hp: 75, speed: 56, dmg: 10, range: 140, atkCd: 1.1, cost: { gold: 70, wood: 40 }, supply: 1 },
      heavy: { name: 'Raider', hp: 230, speed: 76, dmg: 20, range: 18, atkCd: 1.0, cost: { gold: 140, wood: 60 }, supply: 2 },
      hero: {
        name: 'Chieftain', hp: 420, speed: 60, dmg: 24, range: 20, atkCd: 1.0,
        cost: { gold: 50, wood: 0 }, supply: 2,
        ability: 'stomp', abilityName: 'War Stomp',
        abilityDesc: '45 damage and slows nearby enemies.',
      },
    },
  },
  demon: {
    id: 'demon',
    name: 'Devil',
    title: 'Devil Legion',
    color: '#a855f7',
    dark: '#6b21a8',
    accent: '#f97316',
    emblem: 'horns',
    desc: 'Fire and darkness. Painful ranged attacks and a devastating hero.',
    hq: { name: 'Dark Gate', hp: 2200 },
    buildings: {
      barracks: { name: "Devil's Nest", hp: 520, cost: { gold: 150, wood: 50 }, trains: ['melee', 'ranged'] },
      tower: { name: 'Fire Tower', hp: 400, cost: { gold: 100, wood: 100 }, dmg: 16, range: 210, atkCd: 1.0 },
      economy: { name: 'Soul Well', hp: 320, cost: { gold: 80, wood: 80 }, supply: 8 },
      special: { name: 'Devil Throne', hp: 560, cost: { gold: 60, wood: 30 }, trains: ['heavy', 'hero'] },
    },
    units: {
      worker: { name: 'Cultist', hp: 65, speed: 75, dmg: 4, range: 16, atkCd: 1.0, cost: { gold: 50, wood: 0 }, supply: 1 },
      melee: { name: 'Imp', hp: 120, speed: 62, dmg: 12, range: 18, atkCd: 0.9, cost: { gold: 90, wood: 0 }, supply: 1 },
      ranged: { name: 'Hellhound', hp: 80, speed: 60, dmg: 11, range: 140, atkCd: 1.1, cost: { gold: 70, wood: 40 }, supply: 1 },
      heavy: { name: 'Destroyer', hp: 240, speed: 68, dmg: 21, range: 18, atkCd: 1.0, cost: { gold: 140, wood: 60 }, supply: 2 },
      hero: {
        name: 'Devil Lord', hp: 400, speed: 62, dmg: 24, range: 20, atkCd: 1.0,
        cost: { gold: 50, wood: 0 }, supply: 2,
        ability: 'fireball', abilityName: 'Fireball',
        abilityDesc: 'Fireball: 60 damage in the clicked area.',
      },
    },
  },
  nature: {
    id: 'nature',
    name: 'Nature',
    title: 'Guardians of Nature',
    color: '#22c55e',
    dark: '#14532d',
    accent: '#67e8f9',
    emblem: 'leaf',
    desc: 'The living forest. Fast, tough units, healers and trappers.',
    hq: { name: 'Tree of Life', hp: 2200 },
    buildings: {
      barracks: { name: 'Ancient Grove', hp: 520, cost: { gold: 150, wood: 50 }, trains: ['melee', 'ranged'] },
      tower: { name: 'Thorn Tower', hp: 400, cost: { gold: 100, wood: 100 }, dmg: 16, range: 210, atkCd: 1.0 },
      economy: { name: 'Moonwell', hp: 320, cost: { gold: 80, wood: 80 }, supply: 8 },
      special: { name: 'Druid Circle', hp: 560, cost: { gold: 60, wood: 30 }, trains: ['heavy', 'hero'] },
    },
    units: {
      worker: { name: 'Wisp', hp: 65, speed: 78, dmg: 4, range: 16, atkCd: 1.0, cost: { gold: 50, wood: 0 }, supply: 1 },
      melee: { name: 'Forest Guardian', hp: 135, speed: 58, dmg: 12, range: 18, atkCd: 0.9, cost: { gold: 90, wood: 0 }, supply: 1 },
      ranged: { name: 'Moon Archer', hp: 75, speed: 58, dmg: 10, range: 155, atkCd: 1.1, cost: { gold: 70, wood: 40 }, supply: 1 },
      heavy: { name: 'Treant', hp: 250, speed: 62, dmg: 20, range: 18, atkCd: 1.0, cost: { gold: 140, wood: 60 }, supply: 2 },
      hero: {
        name: 'Druid', hp: 380, speed: 62, dmg: 22, range: 20, atkCd: 1.0,
        cost: { gold: 50, wood: 0 }, supply: 2,
        ability: 'entangle', abilityName: 'Entangle',
        abilityDesc: 'Roots enemies for 3 seconds, heals allies 25 HP.',
      },
    },
  },
};

/** Fixed teams for the 2v2 mode: Human + Nature against Orc + Devil. */
export const TEAMS = { A: ['human', 'nature'], B: ['orc', 'demon'] };

export function teamOf(factionId) {
  return TEAMS.A.includes(factionId) ? 'A' : 'B';
}

export function alliesOf(factionId) {
  return (teamOf(factionId) === 'A' ? TEAMS.A : TEAMS.B).filter((id) => id !== factionId);
}

export function enemiesOf(factionId) {
  return teamOf(factionId) === 'A' ? TEAMS.B : TEAMS.A;
}
