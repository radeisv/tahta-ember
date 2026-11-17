// The game's rules and state, with no drawing and no browser in it: four
// factions, workers gathering gold and wood, buildings under construction,
// training queues, combat, hero abilities, and a 2v2 win/lose. step() advances
// one fixed step and returns what happened as bit flags, so the caller can
// react (sounds, announcements, achievements) without the world knowing
// about screens or sound. Commands are the same functions the real mouse and
// keyboard call and the AI calls: nothing here is a mock of the game.
import { AI, BASE_SUPPLY, BUILD_TIMES, FIELD, GATHER, GOLD_MINE_AMOUNT, CENTER_MINE_AMOUNT, SEPARATION, AGGRO_RANGE, START, STEP, TRAIN_TIMES, TREE_WOOD, ABILITY_COOLDOWN } from './config.js';
import { FACTIONS, FACTION_IDS, alliesOf, enemiesOf, teamOf } from './factions.js';
import { createRandom } from './random.js';

export const EVENT_KILL = 1;
export const EVENT_TRAIN = 2;
export const EVENT_BUILD_DONE = 4;
export const EVENT_GOLD = 8;
export const EVENT_WIN = 16;
export const EVENT_LOSE = 32;
export const EVENT_ABILITY = 64;
export const EVENT_BUILDING_LOST = 128;
export const EVENT_HERO = 256;
export const EVENT_BUILD_START = 512;

const BUILD_SIZE = { hq: 76, barracks: 58, tower: 58, economy: 58, special: 58 };
const UNIT_RADIUS = { worker: 11, melee: 13, ranged: 12, heavy: 15, hero: 16 };

/** The river runs across the middle (y 294..366); it is crossed only on the
 * three bridges (x 170 / 640 / 1110, 68 wide), where the roads meet it. */
const RIVER_TOP = 294;
const RIVER_BOTTOM = 366;
const BRIDGES = [170, 640, 1110];
const BRIDGE_HALF = 34;

function inRiver(y) { return y > RIVER_TOP && y < RIVER_BOTTOM; }
function onBridge(x) {
  for (const bx of BRIDGES) if (Math.abs(x - bx) <= BRIDGE_HALF) return true;
  return false;
}
function nearestBridgeX(x) {
  let best = BRIDGES[0];
  for (const bx of BRIDGES) if (Math.abs(bx - x) < Math.abs(best - x)) best = bx;
  return best;
}

/** Corner bases: team A (player + ally) on the left, team B on the right. */
const BASES = { human: { x: 170, y: 480 }, nature: { x: 170, y: 150 }, orc: { x: 1110, y: 150 }, demon: { x: 1110, y: 480 } };
const MINES = { human: { x: 310, y: 480 }, nature: { x: 310, y: 150 }, orc: { x: 970, y: 150 }, demon: { x: 970, y: 480 } };

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function createWorld(random, seed) {
  let nextId = 1;
  const state = {
    time: 0,
    seed,
    playerFaction: 'human',
    factions: {},
    units: [],
    buildings: [],
    nodes: [],
    tracers: [],
    floaters: [],
    flashes: [],
    decor: [],
    selection: [],
    stats: null,
    result: null,
    winner: null,
  };

  function freshStats() {
    return { trained: 0, kills: 0, goldMined: 0, woodGathered: 0, abilities: 0, buildingsLost: 0, buildingsDestroyed: 0, result: null };
  }

  function ownerOf(factionId) {
    if (factionId === state.playerFaction) return 'player';
    return alliesOf(state.playerFaction).includes(factionId) ? 'ally' : 'enemy';
  }

  function addUnit(factionId, kind, x, y) {
    const def = FACTIONS[factionId].units[kind];
    const unit = {
      id: nextId++, kind: 'unit', unitKind: kind, faction: factionId, owner: ownerOf(factionId),
      x, y, hp: def.hp, maxHp: def.hp, speed: def.speed, dmg: def.dmg, range: def.range, atkCd: def.atkCd,
      cd: 0, state: 'idle', tx: x, ty: y, target: null, node: null, carry: null, carryAmt: 0,
      gatherTimer: 0, buildTarget: null, abilityCd: 0, slowUntil: 0, rootedUntil: 0, dead: false,
      attackMove: false, radius: UNIT_RADIUS[kind],
    };
    state.units.push(unit);
    return unit;
  }

  function addBuilding(factionId, kind, x, y, progress) {
    const def = kind === 'hq' ? FACTIONS[factionId].hq : FACTIONS[factionId].buildings[kind];
    const size = BUILD_SIZE[kind];
    // The rally point sits below the building — but never in the river.
    let rallyY = Math.min(FIELD.fieldBottom - 10, y + 60);
    if (inRiver(rallyY)) rallyY = y < 330 ? RIVER_TOP : RIVER_BOTTOM;
    const building = {
      id: nextId++, kind: 'building', buildingKind: kind, faction: factionId, owner: ownerOf(factionId),
      x, y, w: size, h: size, hp: def.hp, maxHp: def.hp, progress: progress === undefined ? 1 : progress,
      queue: [], trainTimer: 0, cd: 0, rallyX: x, rallyY,
      dead: false, name: def.name,
    };
    state.buildings.push(building);
    return building;
  }

  function addNode(kind, x, y, amount) {
    const node = { id: nextId++, kind, x, y, amount, maxAmount: amount, radius: kind === 'gold' ? 26 : 14, dead: false };
    state.nodes.push(node);
    return node;
  }

  function addTracer(x0, y0, x1, y1, color) {
    state.tracers.push({ x0, y0, x1, y1, ttl: 0.14, color });
  }

  function addFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, ttl: 1.1 });
  }

  /** A short hit flash at a point: an expanding ring the renderer draws. */
  function addFlash(x, y, color) {
    state.flashes.push({ x, y, color, ttl: 0.18 });
  }

  function setupMap() {
    state.units = [];
    state.buildings = [];
    state.nodes = [];
    state.tracers = [];
    state.floaters = [];
    state.flashes = [];
    state.decor = [];
    state.selection = [];
    state.time = 0;
    state.result = null;
    state.winner = null;
    state.stats = freshStats();
    for (const id of FACTION_IDS) {
      state.factions[id] = { gold: START.gold, wood: START.wood };
    }
    // Grass tufts and dirt patches, seeded so the map is the same every time.
    for (let i = 0; i < 46; i += 1) {
      state.decor.push({ x: 40 + random() * 1200, y: 60 + random() * 530, r: 8 + random() * 26, light: random() < 0.5 });
    }
    // Terrain dressing on its own seeded stream, so it never shifts the
    // main random draws (tree clusters, AI rolls) that follow: flowers,
    // rocks, bushes, ruins and stumps, all kept clear of the bases, the
    // mines and the river band (y 296..364).
    const decorRandom = createRandom((seed * 2654435761) >>> 0);
    const FLOWER_COLORS = ['#f472b6', '#facc15', '#f8fafc', '#c084fc'];
    const clearOfPlay = (x, y, margin) => {
      for (const id of FACTION_IDS) {
        if (dist(x, y, BASES[id].x, BASES[id].y) < 120 + margin) return false;
        if (dist(x, y, MINES[id].x, MINES[id].y) < 70 + margin) return false;
      }
      if (y > 292 && y < 368) return false;
      return x > 30 && x < 1250 && y > FIELD.fieldTop + 8 && y < FIELD.fieldBottom - 8;
    };
    for (let i = 0; i < 36; i += 1) {
      const x = 40 + decorRandom() * 1200;
      const y = 60 + decorRandom() * 530;
      if (clearOfPlay(x, y, 0)) state.decor.push({ type: 'flower', x, y, color: FLOWER_COLORS[i % FLOWER_COLORS.length] });
    }
    for (let i = 0; i < 16; i += 1) {
      const x = 40 + decorRandom() * 1200;
      const y = 60 + decorRandom() * 530;
      if (clearOfPlay(x, y, 0)) state.decor.push({ type: 'rock', x, y, r: 4 + decorRandom() * 8 });
    }
    for (let i = 0; i < 20; i += 1) {
      const x = 40 + decorRandom() * 1200;
      const y = 60 + decorRandom() * 530;
      if (clearOfPlay(x, y, 0)) state.decor.push({ type: 'bush', x, y, r: 7 + decorRandom() * 9 });
    }
    const RUIN_SPOTS = [[480, 220], [800, 470], [480, 540], [800, 110]];
    for (const [rx, ry] of RUIN_SPOTS) {
      if (clearOfPlay(rx, ry, 30)) state.decor.push({ type: 'ruin', x: rx, y: ry, r: 26 });
    }
    for (const id of FACTION_IDS) {
      const base = BASES[id];
      addBuilding(id, 'hq', base.x, base.y, 1);
      const mine = MINES[id];
      addNode('gold', mine.x, mine.y, GOLD_MINE_AMOUNT);
      const workerOffsets = [[58, -8], [-58, 12], [8, 58]];
      for (let i = 0; i < START.workers; i += 1) {
        addUnit(id, 'worker', base.x + workerOffsets[i][0], base.y + workerOffsets[i][1]);
      }
    }
    addNode('gold', 640, 92, CENTER_MINE_AMOUNT);
    addNode('gold', 640, 568, CENTER_MINE_AMOUNT);
    // Tree clusters: centre band and edges, kept clear of the bases and mines.
    // One cluster sits close to each base, so wood is a short walk at the start.
    // The two centre clusters sit clear of the river band (y 296..364).
    const clusters = [[640, 250], [60, 250], [1220, 250], [430, 120], [850, 480], [430, 480], [850, 120], [640, 210], [640, 430],
      [300, 570], [300, 80], [980, 80], [980, 570]];
    for (const cluster of clusters) {
      const count = 4 + Math.floor(random() * 3);
      for (let i = 0; i < count; i += 1) {
        const x = cluster[0] + (random() - 0.5) * 90;
        const y = cluster[1] + (random() - 0.5) * 70;
        if (x < 36 || x > 1244 || y < FIELD.fieldTop + 8 || y > FIELD.fieldBottom - 8) continue;
        // No tree in the river: wood is gathered on dry land.
        if (y > RIVER_TOP - 4 && y < RIVER_BOTTOM + 4) continue;
        let clear = true;
        for (const id of FACTION_IDS) {
          if (dist(x, y, BASES[id].x, BASES[id].y) < 120 || dist(x, y, MINES[id].x, MINES[id].y) < 70) { clear = false; break; }
        }
        if (clear) addNode('tree', x, y, TREE_WOOD);
      }
    }
    // Fallen stumps beside the lumber clusters, so the wood areas read as
    // worked forest rather than decoration.
    for (const cluster of clusters) {
      if (decorRandom() < 0.5) continue;
      const x = cluster[0] + (decorRandom() - 0.5) * 110;
      const y = cluster[1] + (decorRandom() - 0.5) * 80;
      if (clearOfPlay(x, y, 0)) state.decor.push({ type: 'stump', x, y, r: 7 });
    }
  }

  function reset(playerFaction) {
    state.playerFaction = playerFaction;
    nextId = 1;
    setupMap();
  }

  // ---- economy helpers -------------------------------------------------
  function supplyUsed(factionId) {
    let used = 0;
    for (const unit of state.units) {
      if (!unit.dead && unit.faction === factionId) used += FACTIONS[factionId].units[unit.unitKind].supply;
    }
    return used;
  }

  function supplyMax(factionId) {
    let max = BASE_SUPPLY;
    for (const building of state.buildings) {
      if (building.dead || building.faction !== factionId || building.buildingKind !== 'economy') continue;
      if (building.progress >= 1) max += FACTIONS[factionId].buildings.economy.supply;
    }
    return max;
  }

  function canAfford(factionId, cost) {
    const res = state.factions[factionId];
    return res.gold >= (cost.gold || 0) && res.wood >= (cost.wood || 0);
  }

  function pay(factionId, cost) {
    const res = state.factions[factionId];
    res.gold -= cost.gold || 0;
    res.wood -= cost.wood || 0;
  }

  /** Bank a worker's carried load at once, so re-tasking it never destroys resources. */
  function bankCarry(unit) {
    if (!unit.carry || unit.carryAmt <= 0) return;
    const res = state.factions[unit.faction];
    if (unit.carry === 'gold') {
      res.gold += unit.carryAmt;
      if (unit.owner === 'player') state.stats.goldMined += unit.carryAmt;
    } else if (unit.carry === 'wood') {
      res.wood += unit.carryAmt;
      if (unit.owner === 'player') state.stats.woodGathered += unit.carryAmt;
    }
    unit.carry = null;
    unit.carryAmt = 0;
  }

  function hqOf(factionId) {
    for (const building of state.buildings) {
      if (!building.dead && building.faction === factionId && building.buildingKind === 'hq') return building;
    }
    return null;
  }

  function buildingsOf(factionId, kind) {
    const out = [];
    for (const building of state.buildings) {
      if (!building.dead && building.faction === factionId && (kind === undefined || building.buildingKind === kind)) out.push(building);
    }
    return out;
  }

  function unitsOf(factionId, kind) {
    const out = [];
    for (const unit of state.units) {
      if (!unit.dead && unit.faction === factionId && (kind === undefined || unit.unitKind === kind)) out.push(unit);
    }
    return out;
  }

  function nearestNode(factionId, kind, x, y) {
    let best = null;
    let bestD = Infinity;
    for (const node of state.nodes) {
      if (node.dead || node.kind !== kind || node.amount <= 0) continue;
      const d = dist(x, y, node.x, node.y);
      if (d < bestD) { bestD = d; best = node; }
    }
    return best;
  }

  function spotFree(x, y, size) {
    if (x < 30 + size / 2 || x > FIELD.width - 30 - size / 2 || y < FIELD.fieldTop + size / 2 + 4 || y > FIELD.fieldBottom - size / 2 - 4) return false;
    // No building in the river: only the bridges cross it, and a building
    // there would block a crossing. The test is on the centre, not the
    // whole footprint — a bank-side building whose edge overlaps the
    // water by a few px is valid ground (a rect test rejected the
    // playtest's barracks spot at (430,380), whose centre is on dry land).
    if (inRiver(y)) return false;
    for (const building of state.buildings) {
      if (building.dead) continue;
      if (Math.abs(building.x - x) < (building.w + size) / 2 + 6 && Math.abs(building.y - y) < (building.h + size) / 2 + 6) return false;
    }
    for (const node of state.nodes) {
      if (node.dead) continue;
      if (dist(x, y, node.x, node.y) < node.radius + size / 2 + 4) return false;
    }
    return true;
  }

  /** A free building site near the faction's HQ, for the AI (and for the build menu's default). */
  function findBuildSpot(factionId, kind) {
    const hq = hqOf(factionId);
    if (!hq) return null;
    const size = BUILD_SIZE[kind];
    for (let ring = 0; ring < 4; ring += 1) {
      const radius = 110 + ring * 46;
      for (let a = 0; a < 12; a += 1) {
        const angle = (a / 12) * Math.PI * 2 + ring * 0.4;
        const x = hq.x + Math.cos(angle) * radius;
        const y = hq.y + Math.sin(angle) * radius * 0.8;
        if (spotFree(x, y, size)) return { x: Math.round(x), y: Math.round(y) };
      }
    }
    return null;
  }

  function damage(target, amount, attackerFaction) {
    if (!target || target.dead) return;
    target.hp -= amount;
    if (target.hp > 0) return;
    target.hp = 0;
    target.dead = true;
    if (target.kind === 'unit') {
      if (attackerFaction === state.playerFaction) state.stats.kills += 1;
      // War pays: destroying an enemy unit earns its killer's faction gold,
      // so a long battle keeps both sides able to rebuild instead of
      // stalemating once the mines run dry.
      if (attackerFaction) state.factions[attackerFaction].gold += 10;
    } else if (target.kind === 'building') {
      if (target.faction === state.playerFaction) {
        state.stats.buildingsLost += 1;
      } else if (attackerFaction === state.playerFaction) {
        state.stats.buildingsDestroyed += 1;
      }
    }
  }

  // ---- player commands (the same calls the mouse, the keyboard and the AI use) ----
  function selectedUnits() {
    return state.selection.filter((entity) => entity.kind === 'unit' && !entity.dead);
  }

  function selectedBuilding() {
    for (const entity of state.selection) {
      if (entity.kind === 'building' && !entity.dead) return entity;
    }
    return null;
  }

  function entityAt(x, y) {
    // Units first (small, on top), then buildings, then resource nodes, so a
    // right-click on a gold mine or a tree reaches the gather order.
    for (const unit of state.units) {
      if (unit.dead) continue;
      if (dist(x, y, unit.x, unit.y) <= unit.radius + 4) return unit;
    }
    for (const building of state.buildings) {
      if (building.dead) continue;
      if (Math.abs(x - building.x) <= building.w / 2 && Math.abs(y - building.y) <= building.h / 2) return building;
    }
    for (const node of state.nodes) {
      if (node.dead || node.amount <= 0) continue;
      if (dist(x, y, node.x, node.y) <= node.radius + 4) return node;
    }
    return null;
  }

  function selectAt(x, y, additive) {
    const entity = entityAt(x, y);
    if (!entity || entity.owner !== 'player') {
      if (!additive) state.selection = [];
      return state.selection;
    }
    if (additive) {
      if (!state.selection.includes(entity)) state.selection.push(entity);
    } else {
      state.selection = [entity];
    }
    return state.selection;
  }

  function selectBox(x0, y0, x1, y1, additive) {
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    const picked = [];
    for (const unit of state.units) {
      if (unit.dead || unit.owner !== 'player') continue;
      if (unit.x >= left && unit.x <= right && unit.y >= top && unit.y <= bottom) picked.push(unit);
    }
    if (additive) {
      for (const unit of picked) if (!state.selection.includes(unit)) state.selection.push(unit);
    } else {
      state.selection = picked;
    }
    return state.selection;
  }

  function clearSelection() {
    state.selection = [];
  }

  function orderUnit(unit, x, y, attackMove) {
    // A re-tasked worker banks its load first, so the trip is never lost.
    bankCarry(unit);
    // A destination in the river is corrected to the nearest bank (a point on
    // a bridge is fine), so the unit always has a reachable destination.
    const cx = Math.max(16, Math.min(FIELD.width - 16, x));
    let cy = Math.max(FIELD.fieldTop + 8, Math.min(FIELD.fieldBottom - 8, y));
    if (inRiver(cy) && !onBridge(cx)) cy = (cy - RIVER_TOP < RIVER_BOTTOM - cy) ? RIVER_TOP : RIVER_BOTTOM;
    unit.state = 'move';
    unit.tx = cx;
    unit.ty = cy;
    unit.target = null;
    unit.node = null;
    unit.buildTarget = null;
    unit.attackMove = attackMove;
  }

  /** Direct order for one unit — the AI's way in; the selection commands below call this too. */
  function issueOrder(unit, order) {
    if (!unit || unit.dead) return;
    if (order.type === 'move') orderUnit(unit, order.x, order.y, false);
    else if (order.type === 'attackMove') orderUnit(unit, order.x, order.y, true);
    else if (order.type === 'attack' && order.target && !order.target.dead) {
      unit.state = 'attack';
      unit.target = order.target;
      unit.node = null;
      unit.buildTarget = null;
      unit.attackMove = false;
    } else if (order.type === 'gather' && order.node && !order.node.dead) {
      bankCarry(unit);
      unit.state = 'gather';
      unit.node = order.node;
      unit.gatherKind = order.node.kind;
      unit.target = null;
      unit.buildTarget = null;
      unit.gatherTimer = 0;
    } else if (order.type === 'build' && order.building && !order.building.dead) {
      unit.state = 'build';
      unit.buildTarget = order.building;
      unit.target = null;
      unit.node = null;
      unit.tx = order.building.x;
      unit.ty = order.building.y;
    } else if (order.type === 'hold') {
      unit.state = 'hold';
      unit.target = null;
      unit.node = null;
      unit.buildTarget = null;
      unit.attackMove = false;
    }
  }

  function orderMove(x, y) {
    const units = selectedUnits();
    if (units.length === 0) return false;
    for (const unit of units) orderUnit(unit, x, y, false);
    return true;
  }

  function orderAttackMove(x, y) {
    const units = selectedUnits();
    if (units.length === 0) return false;
    for (const unit of units) orderUnit(unit, x, y, true);
    return true;
  }

  function orderAttack(target) {
    const units = selectedUnits();
    if (units.length === 0 || !target || target.dead) return false;
    for (const unit of units) {
      unit.state = 'attack';
      unit.target = target;
      unit.node = null;
      unit.buildTarget = null;
      unit.attackMove = false;
    }
    return true;
  }

  function orderGather(node) {
    const workers = selectedUnits().filter((unit) => unit.unitKind === 'worker');
    if (workers.length === 0 || !node || node.dead) return false;
    for (const worker of workers) issueOrder(worker, { type: 'gather', node });
    return true;
  }

  function orderHold() {
    const units = selectedUnits();
    if (units.length === 0) return false;
    for (const unit of units) {
      unit.state = 'hold';
      unit.target = null;
      unit.node = null;
      unit.buildTarget = null;
      unit.attackMove = false;
    }
    return true;
  }

  function placeBuilding(factionId, kind, x, y) {
    const def = FACTIONS[factionId].buildings[kind];
    if (!def) return null;
    if (!canAfford(factionId, def.cost)) return null;
    if (!spotFree(x, y, BUILD_SIZE[kind])) return null;
    pay(factionId, def.cost);
    return addBuilding(factionId, kind, x, y, 0);
  }

  function orderBuild(kind, x, y) {
    const workers = selectedUnits().filter((unit) => unit.unitKind === 'worker');
    if (workers.length === 0) return null;
    const building = placeBuilding(state.playerFaction, kind, x, y);
    if (!building) return null;
    for (const worker of workers) {
      worker.state = 'build';
      worker.buildTarget = building;
      worker.target = null;
      worker.node = null;
      worker.tx = building.x;
      worker.ty = building.y;
    }
    return building;
  }

  /** Train at any faction's building (the AI's way in); orderTrain adds the player checks. */
  function trainAt(building, kind) {
    if (!building || building.dead || building.progress < 1) return false;
    const factionId = building.faction;
    const def = FACTIONS[factionId].units[kind];
    if (!def) return false;
    const trains = building.buildingKind === 'hq'
      ? ['worker']
      : FACTIONS[factionId].buildings[building.buildingKind].trains || [];
    if (!trains.includes(kind)) return false;
    if (kind === 'hero') {
      for (const unit of state.units) {
        if (!unit.dead && unit.faction === factionId && unit.unitKind === 'hero') return false;
      }
      // One hero per faction, in any temple: a hero queued in another
      // building counts just as much as one already standing.
      for (const other of state.buildings) {
        if (other.dead || other.faction !== factionId) continue;
        for (const queued of other.queue) if (queued.kind === 'hero') return false;
      }
    }
    // Mercy rule: a faction with no workers left trains one for free, so a
    // lost workforce never soft-locks the game. A worker already queued
    // counts, so the free one cannot be queued twice.
    let workerCount = unitsOf(factionId, 'worker').length;
    for (const other of state.buildings) {
      if (other.dead || other.faction !== factionId) continue;
      for (const queued of other.queue) if (queued.kind === 'worker') workerCount += 1;
    }
    const cost = kind === 'worker' && workerCount === 0
      ? { gold: 0, wood: 0 }
      : def.cost;
    if (!canAfford(factionId, cost)) return false;
    if (supplyUsed(factionId) + def.supply > supplyMax(factionId)) return false;
    pay(factionId, cost);
    building.queue.push({ kind, t: TRAIN_TIMES[kind], total: TRAIN_TIMES[kind] });
    return true;
  }

  function orderTrain(building, kind) {
    if (!building || building.owner !== 'player') return false;
    return trainAt(building, kind);
  }

  /** Cast a hero's ability at a point — the AI's way in; useAbility adds the selection. */
  function castAbility(hero, x, y) {
    if (!hero || hero.dead || hero.abilityCd > 0) return 0;
    const ability = FACTIONS[hero.faction].units.hero.ability;
    const allies = teamOf(hero.faction) === 'A' ? ['human', 'nature'] : ['orc', 'demon'];
    const foes = teamOf(hero.faction) === 'A' ? ['orc', 'demon'] : ['human', 'nature'];
    hero.abilityCd = ABILITY_COOLDOWN;
    if (ability === 'heal') {
      for (const unit of state.units) {
        if (!unit.dead && allies.includes(unit.faction) && dist(unit.x, unit.y, hero.x, hero.y) <= 150) {
          unit.hp = Math.min(unit.maxHp, unit.hp + 80);
        }
      }
      addFloater(hero.x, hero.y - 26, '+80', '#7cfc9a');
    } else if (ability === 'stomp') {
      for (const unit of state.units) {
        if (!unit.dead && foes.includes(unit.faction) && dist(unit.x, unit.y, hero.x, hero.y) <= 150) {
          damage(unit, 45, hero.faction);
          unit.slowUntil = state.time + 2;
        }
      }
      addFloater(hero.x, hero.y - 26, 'WAR STOMP!', '#ffb347');
    } else if (ability === 'fireball') {
      // 60 damage in a 70 px radius: a real threat to a clump, but no
      // longer a wipe. (At 90 damage / 95 px the Demon Lord's fireball
      // cleared the whole defence during the 90 s harass — every
      // defender clumped by the headquarters died, the workers died
      // with them, and the pilot's economy never recovered: 12–25 units
      // trained per game against 27–63 with no heroes. The other heroes
      // heal 80 / stomp 45 / root 3 s, so 60 keeps the fireball in line.)
      for (const unit of state.units) {
        if (!unit.dead && foes.includes(unit.faction) && dist(unit.x, unit.y, x, y) <= 70) damage(unit, 60, hero.faction);
      }
      for (const building of state.buildings) {
        if (!building.dead && foes.includes(building.faction) && dist(building.x, building.y, x, y) <= 70) damage(building, 40, hero.faction);
      }
      addTracer(hero.x, hero.y, x, y, '#ff7b2f');
      addFloater(x, y - 20, 'FIREBALL!', '#ff7b2f');
    } else if (ability === 'entangle') {
      for (const unit of state.units) {
        if (unit.dead) continue;
        if (foes.includes(unit.faction) && dist(unit.x, unit.y, hero.x, hero.y) <= 150) unit.rootedUntil = state.time + 3;
        if (allies.includes(unit.faction) && dist(unit.x, unit.y, hero.x, hero.y) <= 150) unit.hp = Math.min(unit.maxHp, unit.hp + 25);
      }
      addFloater(hero.x, hero.y - 26, 'ROOTED!', '#7cfc9a');
    }
    if (hero.owner === 'player') state.stats.abilities += 1;
    return EVENT_ABILITY;
  }

  function useAbility(x, y) {
    const heroes = selectedUnits().filter((unit) => unit.unitKind === 'hero');
    if (heroes.length === 0) return 0;
    return castAbility(heroes[0], x, y);
  }

  // ---- simulation -------------------------------------------------------
  function moveToward(unit, tx, ty, dt) {
    const dx = tx - unit.x;
    const dy = ty - unit.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    // Arrived: 8px, not 2px — a group sharing one destination is always
    // jostled a few px by separation, and a 2px radius meant it never
    // arrived and stayed in 'move' forever (seed 9: melee parked at their
    // rally point for the whole game).
    if (d < 8) return true;
    const speed = unit.speed * (state.time < unit.slowUntil ? 0.5 : 1);
    const stepLen = speed * dt;
    if (stepLen >= d) {
      // Teleport only onto dry land (or a bridge): orders are clamped out of
      // the river, so this is a safety net, not a way across the water.
      if (inRiver(ty) && !onBridge(tx)) return false;
      unit.x = tx;
      unit.y = ty;
      return true;
    }
    let nx = unit.x + (dx / d) * stepLen;
    let ny = unit.y + (dy / d) * stepLen;
    if (inRiver(ny) && !onBridge(nx)) {
      if (inRiver(unit.y) && !onBridge(unit.x)) {
        // Already in the water off a bridge (pushed in, or staged there):
        // walk out to the nearest bank instead of swimming across.
        const exitY = (unit.y - RIVER_TOP < RIVER_BOTTOM - unit.y) ? RIVER_TOP : RIVER_BOTTOM;
        const edy = exitY - unit.y;
        nx = unit.x;
        ny = unit.y + (edy / (Math.abs(edy) || 1)) * stepLen;
      } else {
        // On dry land, about to step into the water: slide along the bank
        // toward the nearest bridge instead, so armies route through the
        // crossings like a real map.
        const bx = nearestBridgeX(unit.x);
        nx = unit.x + (bx > unit.x ? stepLen : -stepLen);
        ny = unit.y;
      }
    }
    // A step into a building slides along its edge instead of stopping:
    // the unit flows around the footprint toward its destination, so a
    // fleeing worker is never trapped against its own headquarters.
    // The slide runs toward the destination's side when the destination
    // lies clearly past the building on that side; when the destination
    // lies straight through the building (its line crosses the footprint),
    // the slide goes toward the nearer edge instead. Sliding "toward the
    // destination" in that case pulls the unit back to the centre line
    // and oscillates forever (seed 9: an army sat at its own HQ for 120s).
    for (const building of state.buildings) {
      if (building.dead) continue;
      const hw = building.w / 2 + unit.radius;
      const hh = building.h / 2 + unit.radius;
      if (Math.abs(nx - building.x) < hw && Math.abs(ny - building.y) < hh) {
        const penX = hw - Math.abs(nx - building.x);
        const penY = hh - Math.abs(ny - building.y);
        if (penX < penY) {
          // East/west face: slide north/south.
          let dir;
          if (ty < building.y - hh) dir = -1;
          else if (ty > building.y + hh) dir = 1;
          else dir = unit.y <= building.y ? -1 : 1;
          nx = unit.x;
          ny = unit.y + dir * stepLen;
        } else {
          // North/south face: slide east/west.
          let dir;
          if (tx < building.x - hw) dir = -1;
          else if (tx > building.x + hw) dir = 1;
          else dir = unit.x <= building.x ? -1 : 1;
          nx = unit.x + dir * stepLen;
          ny = unit.y;
        }
        break;
      }
    }
    unit.x = nx;
    unit.y = ny;
    return false;
  }

  function nearestEnemy(unit, range) {
    let best = null;
    let bestD = Infinity;
    const foes = teamOf(unit.faction) === 'A' ? ['orc', 'demon'] : ['human', 'nature'];
    for (const other of state.units) {
      if (other.dead || !foes.includes(other.faction)) continue;
      const d = dist(unit.x, unit.y, other.x, other.y);
      if (d < range && d < bestD) { bestD = d; best = other; }
    }
    for (const building of state.buildings) {
      if (building.dead || !foes.includes(building.faction)) continue;
      const d = dist(unit.x, unit.y, building.x, building.y) - Math.max(building.w, building.h) / 2;
      if (d < range && d < bestD) { bestD = d; best = building; }
    }
    return best;
  }

  function attackTarget(unit, target, dt) {
    const isBuilding = target.kind === 'building';
    if (isBuilding) {
      // Walk to the building's edge, not its centre: the centre is inside
      // the footprint and unreachable, so a diagonal approach stalls at a
      // corner and the unit never gets within the old centre-based reach.
      // The strike lands once the weapon reaches the wall; the +4 covers
      // the corner, where the diagonal is a few px longer than the range.
      const hw = target.w / 2 + unit.radius;
      const hh = target.h / 2 + unit.radius;
      const tx = Math.max(target.x - hw, Math.min(target.x + hw, unit.x));
      const ty = Math.max(target.y - hh, Math.min(target.y + hh, unit.y));
      const cx = Math.max(target.x - target.w / 2, Math.min(target.x + target.w / 2, unit.x));
      const cy = Math.max(target.y - target.h / 2, Math.min(target.y + target.h / 2, unit.y));
      // A unit that has reached the stand-off point is adjacent to the wall
      // and strikes even if the corner diagonal is a pixel past its range;
      // a ranged unit strikes from its weapon's reach without closing in.
      // The 12px slack matches building/returning: a unit crowded by allies
      // is nudged by separation and must still be able to strike.
      const atStandOff = dist(unit.x, unit.y, tx, ty) <= 12;
      if (dist(unit.x, unit.y, cx, cy) > unit.range + 4 && !atStandOff) {
        if (state.time < unit.rootedUntil) return;
        moveToward(unit, tx, ty, dt);
        return;
      }
    } else {
      const reach = unit.range + (target.radius || 12);
      const d = dist(unit.x, unit.y, target.x, target.y);
      if (d > reach) {
        if (state.time < unit.rootedUntil) return;
        moveToward(unit, target.x, target.y, dt);
        return;
      }
    }
    // The cooldown is decremented once per step, at the top of stepUnit;
    // decrementing it here too made every unit attack twice as fast as its
    // atkCd (a Footman swung every 0.45 s instead of 0.9 s).
    if (unit.cd > 0) return;
    unit.cd = unit.atkCd;
    // Buildings are tough: units deal half damage to them, so a base is not
    // flattened in seconds and a battle lasts long enough to be a battle.
    const dealt = isBuilding ? unit.dmg * 0.5 : unit.dmg;
    damage(target, dealt, unit.faction);
    // Every hit reads: a flash ring at the impact point, a slash tracer
    // for melee swings, and a damage number for hero strikes.
    addFlash(target.x, target.y, unit.unitKind === 'hero' ? '#ffd94c' : '#ffffff');
    if (unit.range <= 40) addTracer(unit.x, unit.y, target.x, target.y, '#ffffff');
    else addTracer(unit.x, unit.y, target.x, target.y, '#ffe08a');
    if (unit.unitKind === 'hero') addFloater(target.x, target.y - 18, '-' + Math.round(dealt), '#ffb3a7');
  }

  function stepUnit(unit, dt) {
    if (unit.dead) return 0;
    if (unit.cd > 0) unit.cd -= dt;
    if (unit.abilityCd > 0) unit.abilityCd -= dt;
    // Workers run from an enemy that gets close — outside a ranged unit's
    // reach, toward the nearest defended spot (a tower, else the
    // headquarters), so a raid must not end a faction by killing the workers
    // it started with — and go back to work once the danger has passed.
    // Workers run from an enemy that gets close — outside a ranged unit's
    // reach, toward the nearest defended spot (a tower, else the
    // headquarters), so a raid must not end a faction by killing the workers
    // it started with — and go back to work once the danger has passed.
    // A worker explicitly ordered to attack stands and fights instead.
    if (unit.unitKind === 'worker' && unit.state !== 'build' && unit.state !== 'attack') {
      const danger = nearestEnemy(unit, 160);
      if (danger) {
        // Remember an interrupted move order, so it resumes when the
        // danger has passed instead of being lost.
        if (!unit.fleeing && unit.state === 'move') {
          unit.savedTx = unit.tx;
          unit.savedTy = unit.ty;
        }
        unit.fleeing = true;
        let tx = unit.x;
        let ty = unit.y;
        let bestD = Infinity;
        let bestBuilding = null;
        for (const building of state.buildings) {
          if (building.dead || building.faction !== unit.faction) continue;
          if (building.buildingKind !== 'tower' && building.buildingKind !== 'hq') continue;
          // A defended spot the enemy is already camped on is not safe:
          // fleeing to it would park the worker next to the enemy.
          if (dist(danger.x, danger.y, building.x, building.y) < 120) continue;
          const d = dist(unit.x, unit.y, building.x, building.y);
          if (d < bestD) { bestD = d; bestBuilding = building; }
        }
        if (bestBuilding && bestD <= 320) {
          // Stop at the building's edge, not its centre: a worker cannot
          // stand inside a building, and the centre is unreachable.
          const hw = bestBuilding.w / 2 + unit.radius + 4;
          const hh = bestBuilding.h / 2 + unit.radius + 4;
          tx = Math.max(bestBuilding.x - hw, Math.min(bestBuilding.x + hw, unit.x));
          ty = Math.max(bestBuilding.y - hh, Math.min(bestBuilding.y + hh, unit.y));
        } else {
          const dx = unit.x - danger.x;
          const dy = unit.y - danger.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          tx = Math.max(24, Math.min(FIELD.width - 24, unit.x + (dx / d) * 150));
          ty = Math.max(FIELD.fieldTop + 12, Math.min(FIELD.fieldBottom - 12, unit.y + (dy / d) * 150));
          if (inRiver(ty) && !onBridge(tx)) ty = (ty - RIVER_TOP < RIVER_BOTTOM - ty) ? RIVER_TOP : RIVER_BOTTOM;
        }
        unit.state = 'move';
        unit.tx = tx;
        unit.ty = ty;
        unit.target = null;
        unit.attackMove = false;
      } else if (unit.fleeing) {
        unit.fleeing = false;
        if (unit.carry) unit.state = 'return';
        else if (unit.node && !unit.node.dead && unit.node.amount > 0) unit.state = 'gather';
        else if (unit.savedTx !== undefined && unit.savedTy !== undefined) {
          unit.state = 'move';
          unit.tx = unit.savedTx;
          unit.ty = unit.savedTy;
          unit.savedTx = undefined;
          unit.savedTy = undefined;
        } else unit.state = 'idle';
      }
    }
    if (unit.state === 'build') {
      const site = unit.buildTarget;
      if (!site || site.dead) { unit.state = 'idle'; unit.buildTarget = null; return 0; }
      if (site.progress >= 1) { unit.state = 'idle'; unit.buildTarget = null; return 0; }
      // A builder works from the site's edge, not its centre: the centre
      // is inside the footprint and unreachable, so a diagonal approach
      // stalls at a corner (57px from the centre, past the 44px reach)
      // and the building never gets built. Walk to the nearest point on
      // the footprint's edge instead and build once adjacent.
      const hw = site.w / 2 + unit.radius + 4;
      const hh = site.h / 2 + unit.radius + 4;
      const tx = Math.max(site.x - hw, Math.min(site.x + hw, unit.x));
      const ty = Math.max(site.y - hh, Math.min(site.y + hh, unit.y));
      // A few px of slack: a builder crowded by passing gatherers is
      // nudged by separation, and a 2px tolerance meant it almost never
      // accumulated build time (a barracks sat at 93% for 300s in seed 4;
      // even 8px sat exactly on the boundary and crept at 1.6% speed).
      if (dist(unit.x, unit.y, tx, ty) > 12) {
        if (state.time < unit.rootedUntil) return 0;
        moveToward(unit, tx, ty, dt);
        return 0;
      }
      site.progress += dt / BUILD_TIMES[site.buildingKind];
      if (site.progress >= 1) {
        site.progress = 1;
        addFloater(site.x, site.y - 36, FACTIONS[site.faction].buildings[site.buildingKind].name + ' complete', '#f2c94c');
        return EVENT_BUILD_DONE;
      }
      return 0;
    }
    if (unit.state === 'gather' || unit.state === 'return') {
      if (unit.state === 'gather') {
        let node = unit.node;
        if (!node || node.dead || node.amount <= 0) {
          // The node may have been swept (its reference cleared) after it
          // ran out: the worker's remembered kind keeps it on wood.
          const wantKind = node ? node.kind : (unit.gatherKind || 'gold');
          const next = nearestNode(unit.faction, wantKind, unit.x, unit.y)
            || nearestNode(unit.faction, 'gold', unit.x, unit.y)
            || nearestNode(unit.faction, 'tree', unit.x, unit.y);
          if (!next) { unit.state = 'idle'; unit.node = null; return 0; }
          unit.node = next;
          unit.gatherKind = next.kind;
          node = next;
        }
        const reach = node.radius + unit.radius + 2;
        if (dist(unit.x, unit.y, node.x, node.y) > reach) {
          if (state.time < unit.rootedUntil) return 0;
          moveToward(unit, node.x, node.y, dt);
          return 0;
        }
        unit.gatherTimer += dt;
        if (unit.gatherTimer >= GATHER.time) {
          unit.gatherTimer = 0;
          const take = Math.min(GATHER.amount, node.amount);
          node.amount -= take;
          unit.carry = node.kind === 'gold' ? 'gold' : 'wood';
          unit.carryAmt = take;
          // A gold mine never vanishes: it refills slowly (see step), so a
          // long battle keeps both sides able to rebuild. A tree is gone.
          if (node.amount <= 0 && node.kind !== 'gold') node.dead = true;
          unit.state = 'return';
        }
        return 0;
      }
      const hq = hqOf(unit.faction);
      if (!hq) { unit.state = 'idle'; return 0; }
      // Deposit at the headquarters' edge: the worker cannot walk into it,
      // and the centre is unreachable, so a diagonal approach stalls at a
      // corner past the old centre-based reach and the load is never banked.
      // Walk to the nearest point on the footprint's edge instead.
      const hw = hq.w / 2 + unit.radius + 4;
      const hh = hq.h / 2 + unit.radius + 4;
      const tx = Math.max(hq.x - hw, Math.min(hq.x + hw, unit.x));
      const ty = Math.max(hq.y - hh, Math.min(hq.y + hh, unit.y));
      // Same slack as building: a returning worker crowded at the
      // headquarters must still be able to bank its load.
      if (dist(unit.x, unit.y, tx, ty) > 12) {
        if (state.time < unit.rootedUntil) return 0;
        moveToward(unit, tx, ty, dt);
        return 0;
      }
      const res = state.factions[unit.faction];
      if (unit.carry === 'gold') {
        res.gold += unit.carryAmt;
        if (unit.owner === 'player') state.stats.goldMined += unit.carryAmt;
      } else if (unit.carry === 'wood') {
        res.wood += unit.carryAmt;
        if (unit.owner === 'player') state.stats.woodGathered += unit.carryAmt;
      }
      addFloater(unit.x, unit.y - 18, '+' + unit.carryAmt, unit.carry === 'gold' ? '#f2c94c' : '#d9a066');
      unit.carry = null;
      unit.carryAmt = 0;
      unit.state = 'gather';
      return unit.owner === 'player' ? EVENT_GOLD : 0;
    }
    if (unit.state === 'attack') {
      if (!unit.target || unit.target.dead) {
        // An attack-move resumes its march once the target is gone; a
        // plain attack order ends.
        unit.state = unit.attackMove ? 'move' : 'idle';
        unit.target = null;
        return 0;
      }
      attackTarget(unit, unit.target, dt);
      return 0;
    }
    if (unit.state === 'hold') {
      // Hold position: strike anything already in weapon range, never chase.
      const foe = nearestEnemy(unit, unit.range + 24);
      if (foe) {
        const reach = unit.range + (foe.kind === 'building' ? Math.max(foe.w, foe.h) / 2 : foe.radius || 12);
        if (dist(unit.x, unit.y, foe.x, foe.y) <= reach) attackTarget(unit, foe, dt);
      }
      return 0;
    }
    // idle / move: idle combat units look for a fight, and attack-move
    // orders engage on the way. A plain move order never diverts to fight:
    // the unit walks to its point, like any real RTS.
    if (unit.unitKind !== 'worker'
        && (unit.state === 'idle' || (unit.state === 'move' && unit.attackMove))) {
      const foe = nearestEnemy(unit, unit.state === 'move' && unit.attackMove ? 120 : AGGRO_RANGE);
      if (foe) {
        unit.state = 'attack';
        unit.target = foe;
        return 0;
      }
    }
    if (unit.state === 'move') {
      if (state.time < unit.rootedUntil) return 0;
      if (moveToward(unit, unit.tx, unit.ty, dt)) {
        unit.state = 'idle';
        unit.attackMove = false;
      }
    }
    return 0;
  }

  function stepBuilding(building, dt) {
    if (building.dead || building.progress < 1) return 0;
    // Train the first queued unit.
    if (building.queue.length > 0) {
      const job = building.queue[0];
      job.t -= dt;
      if (job.t <= 0) {
        building.queue.shift();
        const unit = addUnit(building.faction, job.kind, building.x + (building.w / 2 + 18), Math.min(FIELD.fieldBottom - 12, building.rallyY));
        unit.tx = building.rallyX;
        unit.ty = building.rallyY;
        unit.state = 'move';
        if (building.faction === state.playerFaction) state.stats.trained += 1;
        return EVENT_TRAIN;
      }
    }
    // Towers shoot the nearest enemy in range.
    const def = building.buildingKind === 'hq' ? null : FACTIONS[building.faction].buildings[building.buildingKind];
    if (def && def.dmg) {
      building.cd -= dt;
      if (building.cd <= 0) {
        const foes = teamOf(building.faction) === 'A' ? ['orc', 'demon'] : ['human', 'nature'];
        let best = null;
        let bestD = Infinity;
        for (const unit of state.units) {
          if (unit.dead || !foes.includes(unit.faction)) continue;
          const d = dist(building.x, building.y, unit.x, unit.y);
          if (d < def.range && d < bestD) { bestD = d; best = unit; }
        }
        if (best) {
          building.cd = def.atkCd;
          damage(best, def.dmg, building.faction);
          addTracer(building.x, building.y - 20, best.x, best.y, '#ffe08a');
          addFlash(best.x, best.y, '#ffe08a');
          addFloater(best.x, best.y - 16, '-' + def.dmg, '#ffb3a7');
        }
      }
    }
    return 0;
  }

  function sweepDead() {
    state.units = state.units.filter((unit) => !unit.dead);
    state.buildings = state.buildings.filter((building) => !building.dead);
    state.nodes = state.nodes.filter((node) => !node.dead);
    state.selection = state.selection.filter((entity) => !entity.dead);
    for (const unit of state.units) {
      if (unit.target && unit.target.dead) {
        unit.target = null;
        if (unit.state === 'attack') unit.state = unit.attackMove ? 'move' : 'idle';
      }
      if (unit.buildTarget && unit.buildTarget.dead) { unit.buildTarget = null; if (unit.state === 'build') unit.state = 'idle'; }
      if (unit.node && unit.node.dead) unit.node = null;
    }
  }

  function checkEnd() {
    if (state.result) return 0;
    const playerHq = hqOf(state.playerFaction);
    if (!playerHq) {
      state.result = 'lose';
      state.winner = enemiesOf(state.playerFaction)[0];
      state.stats.result = 'lose';
      return EVENT_LOSE;
    }
    const foes = enemiesOf(state.playerFaction);
    if (!hqOf(foes[0]) && !hqOf(foes[1])) {
      state.result = 'win';
      state.winner = state.playerFaction;
      state.stats.result = 'win';
      return EVENT_WIN;
    }
    return 0;
  }

  /** One fixed step. Returns event flags for the caller (sounds, announcements). */
  function step(dt) {
    if (state.result) return 0;
    let events = 0;
    state.time += dt;
    // Separation: units never stand on top of each other.
    for (let i = 0; i < state.units.length; i += 1) {
      const a = state.units[i];
      if (a.dead) continue;
      for (let j = i + 1; j < state.units.length; j += 1) {
        const b = state.units[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < SEPARATION * SEPARATION && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (SEPARATION - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          // A builder is braced against its site: it is not shoved off the
          // job by a passing gatherer — the passer takes the whole push.
          // Without this, a builder on the gather path is nudged out of
          // build range and the building creeps (seed 4: a barracks took
          // 500s to finish instead of 8s).
          const aAnchored = a.state === 'build';
          const bAnchored = b.state === 'build';
          if (!aAnchored && !bAnchored) {
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          } else if (aAnchored && !bAnchored) {
            b.x += nx * push * 2;
            b.y += ny * push * 2;
          } else if (!aAnchored && bAnchored) {
            a.x -= nx * push * 2;
            a.y -= ny * push * 2;
          }
          // Both anchored: neither moves; both are working the same site.
        }
      }
    }
    for (const unit of state.units) events |= stepUnit(unit, dt);
    for (const building of state.buildings) events |= stepBuilding(building, dt);
    // Keep every unit on solid ground: out of building footprints, out of
    // the river, and inside the field. Separation can push a unit into a
    // building or off the map, and a fight at the river's edge can push one
    // into the water, so this runs after all movement each step.
    for (const unit of state.units) {
      if (unit.dead) continue;
      for (const building of state.buildings) {
        if (building.dead) continue;
        const hw = building.w / 2 + unit.radius;
        const hh = building.h / 2 + unit.radius;
        const dx = unit.x - building.x;
        const dy = unit.y - building.y;
        if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
          // Push out along the smallest penetration axis.
          if (hw - Math.abs(dx) < hh - Math.abs(dy)) unit.x = building.x + (dx >= 0 ? hw : -hw);
          else unit.y = building.y + (dy >= 0 ? hh : -hh);
        }
      }
      if (inRiver(unit.y) && !onBridge(unit.x)) {
        unit.y = (unit.y - RIVER_TOP < RIVER_BOTTOM - unit.y) ? RIVER_TOP : RIVER_BOTTOM;
      }
      unit.x = Math.max(16, Math.min(FIELD.width - 16, unit.x));
      unit.y = Math.max(FIELD.fieldTop + 8, Math.min(FIELD.fieldBottom - 8, unit.y));
    }
    // Gold mines refill slowly, so the war never stalls for lack of gold.
    for (const node of state.nodes) {
      if (node.kind === 'gold' && node.amount < node.maxAmount) {
        node.amount = Math.min(node.maxAmount, node.amount + 2 * dt);
      }
    }
    for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
      state.tracers[i].ttl -= dt;
      if (state.tracers[i].ttl <= 0) state.tracers.splice(i, 1);
    }
    for (let i = state.flashes.length - 1; i >= 0; i -= 1) {
      state.flashes[i].ttl -= dt;
      if (state.flashes[i].ttl <= 0) state.flashes.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      state.floaters[i].ttl -= dt;
      state.floaters[i].y -= 22 * dt;
      if (state.floaters[i].ttl <= 0) state.floaters.splice(i, 1);
    }
    const killsBefore = state.stats.kills;
    sweepDead();
    if (state.stats.kills > killsBefore) events |= EVENT_KILL;
    events |= checkEnd();
    return events;
  }

  /** Spawn a unit directly — the staging path (screenshots) uses the same
   * unit creation training uses; the unit then fights by the real rules. */
  function spawnUnit(factionId, kind, x, y) {
    return addUnit(factionId, kind, x, y);
  }

  reset(state.playerFaction);
  return {
    state, reset, step,
    selectAt, selectBox, clearSelection, entityAt,
    orderMove, orderAttackMove, orderAttack, orderGather, orderHold, orderBuild, orderTrain, useAbility, placeBuilding,
    issueOrder, trainAt, castAbility, spawnUnit,
    selectedUnits, selectedBuilding,
    supplyUsed, supplyMax, canAfford, hqOf, buildingsOf, unitsOf, nearestNode, findBuildSpot, spotFree,
  };
}
