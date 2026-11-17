// Ember Throne — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, the three AI factions think on their own
// timers, and the renderer paints what is there. The game moves between five
// screens: faction select, play, paused, game over and achievements.
//
// ?seed=N fixes the map and the AI rolls. ?shot=select|buildings|play|
// achievements (with &seed=N) stages that scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot. ?speed=N
// (test only) runs the simulation N times faster.
import { ACHIEVEMENTS_KEY, BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { FACTIONS, FACTION_IDS, alliesOf, enemiesOf } from './factions.js';
import { createWorld, EVENT_ABILITY, EVENT_BUILDING_LOST, EVENT_BUILD_DONE, EVENT_GOLD, EVENT_KILL, EVENT_LOSE, EVENT_TRAIN, EVENT_WIN } from './world.js';
import { createAI } from './ai.js';
import { ACTION_ABILITY, ACTION_ATTACK, ACTION_BUILD, ACTION_CANCEL, ACTION_CONFIRM, ACTION_HOLD, ACTION_PAUSE, ACTION_RESTART, ACTION_TRAIN, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_ACHIEVEMENTS, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_SELECT } from './render.js';
import { stageShot } from './shots.js';
import { ACHIEVEMENT_DEFS, checkAchievements, loadAchievements, recordFactionWin } from './achievements.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const speedParam = Number.parseInt(params.get('speed') ?? '1', 10);
const speed = Number.isInteger(speedParam) && speedParam >= 1 && speedParam <= 16 ? speedParam : 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed), seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
const achievements = loadAchievements(!shot, ACHIEVEMENTS_KEY);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world, seed, achievements);
  const view = {
    screen: scene.screen, mode: scene.view.mode, placeKind: scene.view.placeKind, placeValid: false,
    pointer: { x: 640, y: 360 }, box: null, toast: null, achievements, newUnlocks: [], result: null,
  };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, view);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (x, y) => renderer.toLogical(x, y));
  let screen = SCREEN_SELECT;
  let prevScreen = SCREEN_SELECT;
  let mode = null;
  let placeKind = null;
  let placeValid = false;
  let result = null;
  let newUnlocks = [];
  let toast = null;
  let toastTimer = 0;
  let best = readBest();
  let ais = [];
  let dragStart = null;
  let box = null;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and the big events.
  function announce(message) {
    status.textContent = message;
  }

  function setToast(message) {
    toast = { text: message, ttl: 3 };
    toastTimer = 3;
  }

  function startGame(factionId) {
    world.reset(factionId);
    ais = [];
    const aiRandom = createRandom(seed + 77);
    for (const id of FACTION_IDS) {
      if (id === factionId) continue;
      ais.push(createAI(world, id, aiRandom));
    }
    screen = SCREEN_PLAY;
    mode = null;
    placeKind = null;
    result = null;
    newUnlocks = [];
    toast = null;
    audio.resume();
    audio.click();
    announce('Playing as ' + FACTIONS[factionId].name + '. Destroy both enemy headquarters: '
      + enemiesOf(factionId).map((id) => FACTIONS[id].name).join(' and ') + '.');
  }

  function endGame(won) {
    result = won ? 'win' : 'lose';
    screen = SCREEN_OVER;
    if (won) {
      best += 1;
      saveBest(best);
      recordFactionWin(achievements, world.state.playerFaction, true, ACHIEVEMENTS_KEY);
      audio.win();
    } else {
      audio.lose();
    }
    newUnlocks = checkAchievements(achievements, world.state.stats, true, ACHIEVEMENTS_KEY);
    if (newUnlocks.length > 0) audio.achievement();
    announce(won ? 'Victory! Both enemy headquarters are destroyed.' : 'Defeat. Your headquarters is destroyed.');
  }

  function checkUnlocks() {
    const fresh = checkAchievements(achievements, world.state.stats, true, ACHIEVEMENTS_KEY);
    if (fresh.length > 0) {
      newUnlocks = newUnlocks.concat(fresh);
      audio.achievement();
      setToast('Achievement unlocked: ' + fresh.map((id) => {
        const def = ACHIEVEMENT_DEFS.find((d) => d.id === id);
        return def ? def.name : id;
      }).join(', '));
    }
  }

  function cancelMode() {
    mode = null;
    placeKind = null;
  }

  function heroAbilityAt(x, y) {
    const done = world.useAbility(x, y);
    if (done) {
      audio.ability();
      checkUnlocks();
    } else {
      audio.error();
    }
  }

  function handlePanelButton(button) {
    if (button.disabled) {
      audio.error();
      return;
    }
    if (button.id === 'cancel') { cancelMode(); return; }
    if (button.id === 'build') { mode = 'build'; audio.click(); return; }
    if (button.id === 'train') { mode = 'train'; audio.click(); return; }
    if (button.id === 'attack') { mode = 'attack'; audio.click(); return; }
    if (button.id === 'hold') { world.orderHold(); audio.order(); return; }
    if (button.id === 'ability') {
      const heroes = world.selectedUnits().filter((u) => u.unitKind === 'hero');
      if (heroes.length === 0) return;
      if (FACTIONS[world.state.playerFaction].units.hero.ability === 'fireball') mode = 'ability-target';
      else heroAbilityAt(heroes[0].x, heroes[0].y);
      return;
    }
    if (button.id.startsWith('build:')) {
      placeKind = button.id.slice(6);
      mode = 'place';
      audio.click();
      return;
    }
    if (button.id.startsWith('train:')) {
      const building = world.selectedBuilding();
      if (building && world.orderTrain(building, button.id.slice(6))) audio.train();
      else audio.error();
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    const digit = input.takeDigit();
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_OVER)) {
      startGame(world.state.playerFaction);
      return;
    }
    if (actions & ACTION_CANCEL) {
      if (mode) { cancelMode(); return; }
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); return; }
      if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); return; }
      if (screen === SCREEN_ACHIEVEMENTS) { screen = prevScreen; return; }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); return; }
      if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); return; }
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_SELECT) { startGame('human'); return; }
      if (screen === SCREEN_OVER) { startGame(world.state.playerFaction); return; }
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); return; }
      if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); return; }
      if (screen === SCREEN_ACHIEVEMENTS) { screen = prevScreen; return; }
    }
    if (digit > 0) {
      if (screen === SCREEN_SELECT && digit <= FACTION_IDS.length) { startGame(FACTION_IDS[digit - 1]); return; }
      if (screen === SCREEN_PLAY) {
        if (mode === 'build') {
          const kinds = ['barracks', 'tower', 'economy', 'special'];
          if (digit <= kinds.length) { placeKind = kinds[digit - 1]; mode = 'place'; }
          return;
        }
        if (mode === 'train') {
          const building = world.selectedBuilding();
          if (building) {
            // Towers and farms train nothing: their list is empty, not a crash.
            const trains = building.buildingKind === 'hq'
              ? ['worker']
              : FACTIONS[world.state.playerFaction].buildings[building.buildingKind].trains || [];
            if (digit <= trains.length) {
              if (world.orderTrain(building, trains[digit - 1])) audio.train();
              else audio.error();
            }
          }
          return;
        }
      }
    }
    if (screen !== SCREEN_PLAY) return;
    if (actions & ACTION_BUILD) {
      if (world.selectedUnits().some((u) => u.unitKind === 'worker')) { mode = 'build'; audio.click(); }
      else audio.error();
    } else if (actions & ACTION_TRAIN) {
      if (world.selectedBuilding()) { mode = 'train'; audio.click(); }
      else audio.error();
    } else if (actions & ACTION_ATTACK) {
      if (world.selectedUnits().some((u) => u.unitKind !== 'worker')) { mode = 'attack'; audio.click(); }
      else audio.error();
    } else if (actions & ACTION_HOLD) {
      world.orderHold();
      audio.order();
    } else if (actions & ACTION_ABILITY) {
      const heroes = world.selectedUnits().filter((u) => u.unitKind === 'hero');
      if (heroes.length === 0) { audio.error(); return; }
      if (FACTIONS[world.state.playerFaction].units.hero.ability === 'fireball') mode = 'ability-target';
      else heroAbilityAt(heroes[0].x, heroes[0].y);
    }
  }

  function handlePointer() {
    const edges = input.takePointerEdges();
    const pointer = input.pointer;
    const rightClick = input.takeRightClick();
    if (rightClick && screen === SCREEN_PLAY) {
      if (mode === 'place') { cancelMode(); return; }
      const units = world.selectedUnits();
      if (units.length === 0) return;
      const target = world.entityAt(rightClick.x, rightClick.y);
      if (target && target.kind === 'building' && target.owner === 'enemy') {
        if (world.orderAttack(target)) audio.order();
      } else if (target && target.kind === 'unit' && target.owner === 'enemy') {
        if (world.orderAttack(target)) audio.order();
      } else if (target && (target.kind === 'gold' || target.kind === 'tree')) {
        if (world.orderGather(target)) audio.order();
        else if (world.orderMove(rightClick.x, rightClick.y)) audio.order();
      } else if (world.orderMove(rightClick.x, rightClick.y)) {
        audio.order();
      }
      return;
    }
    if (!edges.pressed && !edges.released) return;
    // A press and its release can land in the same animation frame (a fast
    // click, or a synthetic one): the release must still select, so the
    // press handling falls through instead of returning early.
    let startedDrag = false;
    if (edges.pressed) {
      audio.resume();
      const x = pointer.x;
      const y = pointer.y;
      if (screen === SCREEN_SELECT) {
        if (renderer.selectAchievementsAt(x, y)) { prevScreen = SCREEN_SELECT; screen = SCREEN_ACHIEVEMENTS; audio.click(); return; }
        const faction = renderer.factionAt(x, y);
        if (faction) { startGame(faction); return; }
      } else if (screen === SCREEN_ACHIEVEMENTS) {
        if (renderer.achievementsBackAt(x, y)) { screen = prevScreen; audio.click(); }
        return;
      } else if (screen === SCREEN_OVER) {
        const button = renderer.overButtonAt(x, y);
        if (button === 'again') startGame(world.state.playerFaction);
        else if (button === 'menu') screen = SCREEN_SELECT;
        else if (button === 'achievements') { prevScreen = SCREEN_OVER; screen = SCREEN_ACHIEVEMENTS; }
        return;
      } else if (screen === SCREEN_PLAY) {
        // The command panel is always clickable, whatever mode is armed:
        // a click on a button must hit the button, not order a build,
        // an attack-move or an ability at the panel's coordinates.
        if (y >= 608) {
          const buttons = renderer.panelButtons(world.state, { mode, placeKind });
          for (const button of buttons) {
            if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
              handlePanelButton(button);
              dragStart = null;
              return;
            }
          }
          dragStart = null;
          return;
        }
        if (mode === 'place' && placeKind) {
          const building = world.orderBuild(placeKind, x, y);
          if (building) { audio.build(); cancelMode(); }
          else audio.error();
          dragStart = null;
          return;
        }
        if (mode === 'attack') {
          if (world.orderAttackMove(x, y)) audio.order();
          cancelMode();
          dragStart = null;
          return;
        }
        if (mode === 'ability-target') {
          heroAbilityAt(x, y);
          cancelMode();
          dragStart = null;
          return;
        }
        dragStart = { x, y };
        box = null;
        startedDrag = true;
      }
    }
    // Left release: a drag box-selects, a plain click selects one thing.
    if (edges.released && screen === SCREEN_PLAY && (startedDrag || dragStart)) {
      const x = pointer.x;
      const y = pointer.y;
      if (pointer.dragged) {
        world.selectBox(dragStart.x, dragStart.y, x, y, false);
        if (world.state.selection.length > 0) audio.select();
      } else {
        world.selectAt(x, y, false);
        if (world.state.selection.length > 0) audio.select();
      }
      dragStart = null;
      box = null;
    }
  }

  function stepOnce() {
    for (const ai of ais) ai.step(STEP);
    const events = world.step(STEP);
    if (events & EVENT_GOLD) audio.coin();
    if (events & EVENT_TRAIN) audio.train();
    if (events & EVENT_BUILD_DONE) audio.buildDone();
    if (events & EVENT_KILL) audio.fight();
    if (events & EVENT_ABILITY) audio.ability();
    if (events & EVENT_BUILDING_LOST) announce('One of your buildings was destroyed!');
    if (events & (EVENT_KILL | EVENT_TRAIN | EVENT_GOLD | EVENT_ABILITY | EVENT_BUILDING_LOST)) checkUnlocks();
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_LOSE) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handlePointer();
    // Drag box follows the pointer while the button is held.
    if (input.pointer.down && dragStart && input.pointer.dragged) {
      box = { x0: dragStart.x, y0: dragStart.y, x1: input.pointer.x, y1: input.pointer.y };
    }
    if (toastTimer > 0) {
      toastTimer -= delta;
      if (toast) toast.ttl = Math.max(0, toastTimer);
      if (toastTimer <= 0) toast = null;
    }
    if (screen === SCREEN_PLAY) {
      for (let s = 0; s < speed; s += 1) {
        stepOnce();
        if (screen !== SCREEN_PLAY) break;
      }
    }
    // Placement ghost validity, refreshed every frame.
    if (mode === 'place' && placeKind) {
      const def = FACTIONS[world.state.playerFaction].buildings[placeKind];
      const size = placeKind === 'hq' ? 76 : 58;
      placeValid = world.canAfford(world.state.playerFaction, def.cost)
        && world.spotFree(input.pointer.x, input.pointer.y, size);
    }
    const view = {
      screen, mode, placeKind, placeValid,
      pointer: { x: input.pointer.x, y: input.pointer.y },
      box, toast, achievements, newUnlocks, result,
    };
    renderer.draw(world.state, view);
  }

  // Leaving the tab pauses a running game rather than letting the war run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // Debug handle for the playtest: read-only state, never a way to play the game.
  window.__game = {
    get state() { return world.state; },
    get screen() { return screen; },
    get mode() { return mode; },
    get result() { return result; },
  };

  announce('Ember Throne. Choose your faction: Human, Orc, Devil or Nature.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
