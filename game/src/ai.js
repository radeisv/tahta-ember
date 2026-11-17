// The AI for one faction: a simple build-order brain that thinks on a timer.
// It gathers with idle workers, trains workers, follows a build order, trains
// an army, casts the hero ability when a fight is close, and attacks the
// nearest enemy headquarters once its army is big enough. It only uses the
// world's own commands (issueOrder / trainAt / placeBuilding / castAbility),
// so it plays by exactly the same rules as the player.
import { AI } from './config.js';
import { FACTIONS, enemiesOf, teamOf } from './factions.js';

// Build priority, in strict order: barracks, tower, economy, then the
// temple — and nothing after it. The tower must stand before the first
// enemy harass at 90 s and the economy must open the supply cap before
// the 150 s attack. The list deliberately ends at the temple: in the
// original the 250-gold temple was never affordable, so the loop never
// reached the second tower and economy and every resource went to the
// army. A cheap temple unlocks those two slots, and they drain 180 gold
// + 180 wood in the critical 60–100 s window — the army froze at seven
// units and the harass wiped the base. The temple is cheap now, so it
// still goes up around 100 s and the hero fights with minutes to spare.
const BUILD_ORDER = [['barracks', 1], ['tower', 1], ['economy', 1], ['special', 1]];

export function createAI(world, factionId, random) {
  let timer = random() * AI.thinkInterval;
  let attackTarget = null;
  let meleeAlt = false;

  function think() {
    const state = world.state;
    if (state.result) return;
    const hq = world.hqOf(factionId);
    if (!hq) return;
    const res = state.factions[factionId];
    const workers = world.unitsOf(factionId, 'worker');
    const combat = state.units.filter((unit) => !unit.dead && unit.faction === factionId && unit.unitKind !== 'worker');
    const barracks = world.buildingsOf(factionId, 'barracks').filter((b) => b.progress >= 1);
    const special = world.buildingsOf(factionId, 'special').filter((b) => b.progress >= 1);
    // The next building in the build order is saved for: training only
    // spends gold above its cost, so the build loop always wins the race
    // for the tower and the economy. (Without this, the barracks grabs
    // gold at 90 for a melee while the tower needs 100, so the tower
    // only goes up when the barracks queue happens to be full — team B
    // won that race at 20 s and team A at 64 s, and the late tower lost
    // the game.) The order ends at the temple, so the reserve lifts
    // once the infrastructure stands and the army is never starved.
    const built = {};
    for (const building of world.buildingsOf(factionId)) built[building.buildingKind] = (built[building.buildingKind] || 0) + 1;
    let reserve = 0;
    for (const [kind, want] of BUILD_ORDER) {
      if ((built[kind] || 0) >= want) continue;
      reserve = FACTIONS[factionId].buildings[kind].cost.gold || 0;
      break;
    }

    // 1. Idle workers gather: keep the 3-gold / 2-wood split. A worker that
    // already has a node keeps it — raids and finished buildings must not
    // flip the whole workforce onto gold — and an idle worker with a node
    // resumes work at that node instead of standing around.
    let goldWorkers = 0;
    for (const worker of workers) {
      const kind = worker.node && !worker.node.dead && worker.node.amount > 0
        ? worker.node.kind
        : worker.gatherKind;
      if (kind === 'gold') goldWorkers += 1;
    }
    for (const worker of workers) {
      if (worker.state === 'build') continue;
      if (worker.node && !worker.node.dead && worker.node.amount > 0) {
        if (worker.state === 'idle' || (worker.state === 'move' && !worker.fleeing)) {
          world.issueOrder(worker, { type: 'gather', node: worker.node });
        }
        continue;
      }
      if (worker.gatherKind) {
        const node = world.nearestNode(factionId, worker.gatherKind, worker.x, worker.y);
        if (node) {
          world.issueOrder(worker, { type: 'gather', node });
          continue;
        }
        worker.gatherKind = null;
      }
      if (worker.state !== 'idle') continue;
      const node = goldWorkers < 3
        ? world.nearestNode(factionId, 'gold', worker.x, worker.y)
        : world.nearestNode(factionId, 'tree', worker.x, worker.y) || world.nearestNode(factionId, 'gold', worker.x, worker.y);
      if (node) {
        world.issueOrder(worker, { type: 'gather', node });
        if (node.kind === 'gold') goldWorkers += 1;
      }
    }

    // 2. Keep the worker count up, without eating the building fund. A
    // faction with no workers left trains the free mercy worker even when
    // broke: the reserve gate must not block the one train that is free.
    if (workers.length < AI.workersTarget && hq.queue.length === 0
        && (workers.length === 0 || res.gold - 50 >= reserve)) world.trainAt(hq, 'worker');

    // 3. Build order, one building at a time. A building whose builder died
    // gets a new one, so construction never stalls unfinished.
    for (const building of world.buildingsOf(factionId)) {
      if (building.progress >= 1) continue;
      const hasBuilder = state.units.some((u) => !u.dead && u.faction === factionId && u.state === 'build' && u.buildTarget === building);
      if (hasBuilder) continue;
      let best = null;
      let bestD = Infinity;
      for (const worker of workers) {
        if (worker.state === 'build') continue;
        const d = Math.hypot(worker.x - building.x, worker.y - building.y);
        if (d < bestD) { bestD = d; best = worker; }
      }
      if (best) world.issueOrder(best, { type: 'build', building });
    }
    const underConstruction = state.buildings.some((b) => !b.dead && b.faction === factionId && b.progress < 1);
    if (!underConstruction) {
      for (const [kind, want] of BUILD_ORDER) {
        if ((built[kind] || 0) >= want) continue;
        const spot = world.findBuildSpot(factionId, kind);
        if (spot) {
          const site = world.placeBuilding(factionId, kind, spot.x, spot.y);
          if (site) {
            let best = null;
            let bestD = Infinity;
            for (const worker of workers) {
              if (worker.state === 'build') continue;
              const d = Math.hypot(worker.x - spot.x, worker.y - spot.y);
              if (d < bestD) { bestD = d; best = worker; }
            }
            if (best) world.issueOrder(best, { type: 'build', building: site });
          }
        }
        break;
      }
    }

    // 4. Train the army: the special building makes the hero first (it
    // trains before the barracks spend, so a gold spike is spent on the
    // hero first), then the heavy unit; the barracks alternate melee and
    // ranged. The temple and hero are cheap, so they are bought on the
    // gold spikes the queue-full pauses create — no saving rule is needed,
    // and the early army is never starved for them.
    const specialBuilt = special.length > 0;
    for (const building of special) {
      if (building.queue.length >= 1) continue;
      const heroes = world.unitsOf(factionId, 'hero');
      if (heroes.length === 0) {
        // trainAt refuses when the gold is not there yet, so just ask.
        world.trainAt(building, 'hero');
      } else if (combat.length >= 8 && res.gold >= 250) {
        // The heavy is a late-game luxury: at 140 gold every 6 s it
        // would otherwise drain the whole income ahead of the barracks
        // and starve the army. Only train it with a big army and gold
        // to spare.
        world.trainAt(building, 'heavy');
      }
    }
    for (const building of barracks) {
      if (building.queue.length >= 2) continue;
      meleeAlt = !meleeAlt;
      const order = meleeAlt ? ['melee', 'ranged'] : ['ranged', 'melee'];
      for (const kind of order) {
        const def = FACTIONS[factionId].units[kind];
        // Until the temple stands, save wood for it: only the gold-only
        // melee unit may train while wood is short. (The threshold is
        // high on purpose: ranged units eat the wood the tower and the
        // economy need, and a late tower leaves the base defenceless at
        // the 90 s harass. A low threshold flipped the win rate.)
        if (!specialBuilt && res.wood < 200 && kind !== 'melee') continue;
        // Only spend gold above the building fund.
        if (res.gold - (def.cost.gold || 0) < reserve) continue;
        if (world.trainAt(building, kind)) break;
      }
    }

    // 5. Hero ability: cast it when an enemy is close, or heal wounded allies.
    const ability = FACTIONS[factionId].units.hero.ability;
    for (const hero of world.unitsOf(factionId, 'hero')) {
      if (hero.abilityCd > 0) continue;
      let foe = null;
      let foeD = 150;
      for (const unit of state.units) {
        if (unit.dead || teamOf(unit.faction) === teamOf(factionId)) continue;
        const d = Math.hypot(unit.x - hero.x, unit.y - hero.y);
        if (d < foeD) { foeD = d; foe = unit; }
      }
      if (foe) {
        if (ability === 'fireball') world.castAbility(hero, foe.x, foe.y);
        else world.castAbility(hero, hero.x, hero.y);
      } else if (ability === 'heal') {
        const wounded = state.units.some((unit) => !unit.dead && unit.faction === factionId
          && unit.hp < unit.maxHp * 0.6 && Math.hypot(unit.x - hero.x, unit.y - hero.y) < 150);
        if (wounded) world.castAbility(hero, hero.x, hero.y);
      }
    }

    // 6. Defence first: if enemies are near our own headquarters, the whole
    // army comes home instead of marching on. Then attack once the army is
    // big enough and the game is old enough; harass with a small force.
    let intruder = null;
    let intruderD = 280;
    for (const unit of state.units) {
      if (unit.dead || teamOf(unit.faction) === teamOf(factionId)) continue;
      const d = Math.hypot(unit.x - hq.x, unit.y - hq.y);
      if (d < intruderD) { intruderD = d; intruder = unit; }
    }
    if (intruder) {
      for (const unit of combat) {
        world.issueOrder(unit, { type: 'attackMove', x: intruder.x, y: intruder.y });
      }
    } else if (state.time >= AI.attackAfter && combat.length >= AI.attackArmy) {
      if (!attackTarget || attackTarget.dead) {
        attackTarget = null;
        let bestD = Infinity;
        for (const foeId of enemiesOf(factionId)) {
          const foeHq = world.hqOf(foeId);
          if (!foeHq) continue;
          const d = Math.hypot(foeHq.x - hq.x, foeHq.y - hq.y);
          if (d < bestD) { bestD = d; attackTarget = foeHq; }
        }
      }
      if (attackTarget) {
        for (const unit of combat) {
          if (unit.state === 'idle' || unit.state === 'move') {
            world.issueOrder(unit, { type: 'attackMove', x: attackTarget.x, y: attackTarget.y });
          }
        }
      }
    } else if (state.time >= AI.harassAfter && combat.length >= AI.harassArmy && random() < 0.3) {
      // Harass either enemy headquarters, not always the first one: every
      // raid went at Human, so Nature was never pressured and Human was
      // always the one raided. The target is picked fresh per wave, so
      // both bases are pressured over a game; only idle units are ordered,
      // so a wave already marching is never redirected.
      const living = enemiesOf(factionId).map((id) => world.hqOf(id)).filter(Boolean);
      const foeHq = living.length > 0 ? living[Math.floor(random() * living.length)] : null;
      if (foeHq) {
        for (const unit of combat) {
          if (unit.state === 'idle') {
            world.issueOrder(unit, {
              type: 'attackMove',
              x: foeHq.x + (random() - 0.5) * 120,
              y: foeHq.y + (random() - 0.5) * 120,
            });
          }
        }
      }
    }
  }

  function step(dt) {
    timer += dt;
    if (timer >= AI.thinkInterval) {
      timer = 0;
      think();
    }
  }

  return { step };
}
