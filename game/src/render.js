// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin
// filled with the backdrop colour. Flat vector shapes and canvas text; no
// images, no network. Text that holds a number is rebuilt only when the
// number changes, so a frame allocates nothing.
import { FIELD, FONT, PALETTE } from './config.js';
import { FACTIONS, FACTION_IDS, teamOf } from './factions.js';
import { ACHIEVEMENT_DEFS, unlockedCount } from './achievements.js';

export const SCREEN_SELECT = 'select';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_ACHIEVEMENTS = 'achievements';

/** Faction cards on the select screen: four cards in a row. */
export const CARD = { w: 284, h: 480, y: 170, gap: 24 };
export function cardRect(index) {
  const total = FACTION_IDS.length * CARD.w + (FACTION_IDS.length - 1) * CARD.gap;
  const x0 = (FIELD.width - total) / 2;
  return { x: x0 + index * (CARD.w + CARD.gap), y: CARD.y, w: CARD.w, h: CARD.h };
}

/** Command buttons in the bottom panel: five slots, left to right. */
export const PANEL_BUTTON = { w: 148, h: 84, y: 620, gap: 8 };
export function panelButtonRect(index) {
  return { x: 24 + index * (PANEL_BUTTON.w + PANEL_BUTTON.gap), y: PANEL_BUTTON.y, w: PANEL_BUTTON.w, h: PANEL_BUTTON.h };
}

export const SELECT_ACHIEVEMENTS_RECT = { x: 1010, y: 20, w: 246, h: 40 };
export const ACHIEVEMENTS_BACK_RECT = { x: 490, y: 646, w: 300, h: 48 };
export const OVER_BUTTONS = {
  again: { x: 340, y: 560, w: 280, h: 52 },
  menu: { x: 660, y: 560, w: 280, h: 52 },
  achievements: { x: 490, y: 626, w: 300, h: 44 },
};

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function pointIn(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const goldLabel = cachedLabel('Gold ');
  const woodLabel = cachedLabel('Wood ');
  const supplyLabel = cachedLabel('Army ');
  const timeLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  /** Client (CSS pixel) coordinates to logical 1280x720 coordinates. */
  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x / (window.devicePixelRatio || 1)) / (view.scale / (window.devicePixelRatio || 1)),
      y: (clientY - rect.top - view.y / (window.devicePixelRatio || 1)) / (view.scale / (window.devicePixelRatio || 1)),
    };
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function hpBar(x, y, w, ratio, color) {
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.fillRect(x, y, w, 5);
    context.fillStyle = color;
    context.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, 5);
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return minutes + ':' + (secs < 10 ? '0' : '') + secs;
  }

  /** Deterministic value noise in [0,1): a pure function of tile and seed,
   * so the ground texture is the same every run and needs no state. */
  function hashNoise(tx, ty, seed) {
    let h = (tx * 374761393 + ty * 668265263 + (seed | 0) * 974634211) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (((h ^ (h >>> 16)) >>> 0) % 1000) / 1000;
  }

  function drawDirtPath(x0, y0, x1, y1, width) {
    context.strokeStyle = PALETTE.pathEdge;
    context.lineWidth = width + 4;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.stroke();
    context.strokeStyle = PALETTE.path;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.stroke();
    // Wheel ruts: two darker lines along the path.
    context.strokeStyle = PALETTE.pathEdge;
    context.lineWidth = 2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (width / 2 - 4);
    const ny = (dx / len) * (width / 2 - 4);
    context.beginPath();
    context.moveTo(x0 + nx, y0 + ny);
    context.lineTo(x1 + nx, y1 + ny);
    context.moveTo(x0 - nx, y0 - ny);
    context.lineTo(x1 - nx, y1 - ny);
    context.stroke();
  }

  function drawBridge(cx, cy) {
    // Planks across the river, where a road crosses it.
    context.fillStyle = PALETTE.bridgeDark;
    context.fillRect(cx - 34, cy - 36, 68, 72);
    context.fillStyle = PALETTE.bridge;
    for (let i = 0; i < 6; i += 1) {
      context.fillRect(cx - 32, cy - 32 + i * 11, 64, 8);
    }
    context.strokeStyle = PALETTE.bridgeDark;
    context.lineWidth = 3;
    context.strokeRect(cx - 34, cy - 36, 68, 72);
  }

  function drawMountain(x, y, s) {
    // Three grey peaks with snow caps, fixed at the map corners.
    const peaks = [[-34, 10, 30], [0, -6, 38], [34, 12, 28]];
    for (const [dx, dy, w] of peaks) {
      const px = x + dx;
      const py = y + dy;
      const h = w * 1.15;
      context.fillStyle = PALETTE.rockDark;
      context.beginPath();
      context.moveTo(px - w, py + h / 2);
      context.lineTo(px, py - h / 2);
      context.lineTo(px + w, py + h / 2);
      context.closePath();
      context.fill();
      context.fillStyle = '#e8e8e8';
      context.beginPath();
      context.moveTo(px - w * 0.34, py - h * 0.12);
      context.lineTo(px, py - h / 2);
      context.lineTo(px + w * 0.34, py - h * 0.12);
      context.lineTo(px, py + h * 0.02);
      context.closePath();
      context.fill();
    }
  }

  // ---- battlefield ------------------------------------------------------
  function drawTerrain(state) {
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, FIELD.fieldTop, FIELD.width, FIELD.fieldBottom - FIELD.fieldTop);
    // Noise ground: 32 px tiles shaded by a seeded hash, so the grass
    // reads as real terrain instead of a flat green sheet.
    const TILE = 32;
    for (let ty = 0; ty < (FIELD.fieldBottom - FIELD.fieldTop) / TILE; ty += 1) {
      for (let tx = 0; tx < FIELD.width / TILE; tx += 1) {
        const n = hashNoise(tx, ty, state.seed);
        if (n < 0.20) {
          context.fillStyle = PALETTE.grassDark;
          context.fillRect(tx * TILE, FIELD.fieldTop + ty * TILE, TILE, TILE);
        } else if (n > 0.88) {
          context.fillStyle = PALETTE.grassLight;
          context.fillRect(tx * TILE, FIELD.fieldTop + ty * TILE, TILE, TILE);
        } else if (n > 0.80) {
          context.fillStyle = '#335f2d';
          context.fillRect(tx * TILE + 8, FIELD.fieldTop + ty * TILE + 8, 10, 6);
        }
      }
    }
    for (const patch of state.decor) {
      if (patch.type === 'flower') {
        context.fillStyle = patch.color;
        context.beginPath();
        context.arc(patch.x, patch.y, 3, 0, Math.PI * 2);
        context.fill();
      } else if (patch.type === 'rock') {
        context.fillStyle = PALETTE.rock;
        context.beginPath();
        context.ellipse(patch.x, patch.y, patch.r, patch.r * 0.7, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.rockDark;
        context.beginPath();
        context.ellipse(patch.x - 2, patch.y + 2, patch.r * 0.5, patch.r * 0.35, 0, 0, Math.PI * 2);
        context.fill();
      } else if (patch.type === 'bush') {
        context.fillStyle = '#1e4d1e';
        context.beginPath();
        context.arc(patch.x, patch.y, patch.r, 0, Math.PI * 2);
        context.arc(patch.x + patch.r * 0.7, patch.y + 3, patch.r * 0.7, 0, Math.PI * 2);
        context.fill();
      } else if (patch.type === 'ruin') {
        context.strokeStyle = PALETTE.rock;
        context.lineWidth = 4;
        context.beginPath();
        context.arc(patch.x, patch.y, patch.r, 0.4, Math.PI * 1.4);
        context.stroke();
        context.fillStyle = PALETTE.rockDark;
        context.fillRect(patch.x - 18, patch.y + 8, 10, 8);
        context.fillRect(patch.x + 8, patch.y - 14, 8, 10);
      } else if (patch.type === 'stump') {
        context.fillStyle = '#5d3a1a';
        context.beginPath();
        context.arc(patch.x, patch.y, patch.r, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#a9803e';
        context.beginPath();
        context.arc(patch.x, patch.y, patch.r * 0.6, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = patch.light ? PALETTE.grassLight : PALETTE.grassDark;
        context.beginPath();
        context.ellipse(patch.x, patch.y, patch.r, patch.r * 0.55, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Dirt roads: a rectangle joining the four bases, plus the central
    // road where the armies meet.
    drawDirtPath(170, 150, 170, 480, 24);
    drawDirtPath(1110, 150, 1110, 480, 24);
    drawDirtPath(170, 150, 1110, 150, 24);
    drawDirtPath(170, 480, 1110, 480, 24);
    drawDirtPath(640, 48, 640, 604, 30);
    // A river across the middle, with bridges where the roads cross it.
    context.fillStyle = PALETTE.riverBank;
    context.beginPath();
    for (let x = 0; x <= 1280; x += 16) {
      const y = 330 + Math.sin(x * 0.008) * 10;
      if (x === 0) context.moveTo(x, y - 34);
      else context.lineTo(x, y - 34);
    }
    for (let x = 1280; x >= 0; x -= 16) {
      const y = 330 + Math.sin(x * 0.008) * 10;
      context.lineTo(x, y + 34);
    }
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.river;
    context.beginPath();
    for (let x = 0; x <= 1280; x += 16) {
      const y = 330 + Math.sin(x * 0.008) * 10;
      if (x === 0) context.moveTo(x, y - 26);
      else context.lineTo(x, y - 26);
    }
    for (let x = 1280; x >= 0; x -= 16) {
      const y = 330 + Math.sin(x * 0.008) * 10;
      context.lineTo(x, y + 26);
    }
    context.closePath();
    context.fill();
    context.strokeStyle = PALETTE.riverLight;
    context.lineWidth = 2;
    context.globalAlpha = 0.6;
    for (let x = 60; x < 1280; x += 180) {
      const y = 330 + Math.sin(x * 0.008) * 10;
      context.beginPath();
      context.moveTo(x, y - 6);
      context.lineTo(x + 40, y - 2);
      context.stroke();
    }
    context.globalAlpha = 1;
    drawBridge(170, 330);
    drawBridge(640, 330);
    drawBridge(1110, 330);
    // Mountains in the four corners, clear of every base.
    drawMountain(56, 66, 1);
    drawMountain(1224, 66, 1);
    drawMountain(56, 656, 1);
    drawMountain(1224, 656, 1);
    context.fillStyle = PALETTE.panel;
    context.fillRect(0, 0, FIELD.width, FIELD.fieldTop);
    context.fillRect(0, FIELD.panelTop, FIELD.width, FIELD.height - FIELD.panelTop);
  }

  function drawNode(node) {
    if (node.kind === 'gold') {
      // A gold mine: grey rock outcrop ringed around bright gold nuggets,
      // so the gold areas read as mines at a glance.
      context.fillStyle = PALETTE.rockDark;
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 + 0.4;
        context.beginPath();
        context.arc(node.x + Math.cos(angle) * (node.radius - 2), node.y + Math.sin(angle) * (node.radius - 2), 8, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = '#8a6d1f';
      context.beginPath();
      context.arc(node.x, node.y, node.radius - 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(node.x - 8, node.y - 4, 8, 0, Math.PI * 2);
      context.arc(node.x + 9, node.y + 3, 7, 0, Math.PI * 2);
      context.arc(node.x + 2, node.y - 10, 6, 0, Math.PI * 2);
      context.fill();
      // The label is drawn in a separate pass (drawNodeLabels), after the
      // buildings and units, so it is never painted over or clipped.
    } else {
      // A lumber tree: thick trunk and a full two-layer canopy.
      context.fillStyle = '#5d3a1a';
      context.fillRect(node.x - 3, node.y + 4, 6, 12);
      context.fillStyle = '#1f7a33';
      context.beginPath();
      context.arc(node.x - 6, node.y - 2, 10, 0, Math.PI * 2);
      context.arc(node.x + 6, node.y - 2, 10, 0, Math.PI * 2);
      context.arc(node.x, node.y - 12, 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2fa04a';
      context.beginPath();
      context.arc(node.x - 4, node.y - 8, 7, 0, Math.PI * 2);
      context.arc(node.x + 5, node.y - 6, 6, 0, Math.PI * 2);
      context.fill();
    }
  }

  // ---- faction silhouettes ----------------------------------------------
  // Every faction reads by SHAPE, not just colour. Human: square stone
  // keeps with crenellations and blue banners. Orc: rough spiked huts with
  // tusks and totems. Devil: jagged black towers with horns, lava cracks
  // and flames. Nature: organic rounded trees with leaves and glow.
  function drawEmblem(faction, cx, cy, r) {
    context.save();
    context.translate(cx, cy);
    if (faction.emblem === 'shield') {
      context.fillStyle = faction.color;
      context.beginPath();
      context.moveTo(-r * 0.7, -r * 0.8);
      context.lineTo(r * 0.7, -r * 0.8);
      context.lineTo(r * 0.7, 0);
      context.quadraticCurveTo(r * 0.7, r * 0.8, 0, r);
      context.quadraticCurveTo(-r * 0.7, r * 0.8, -r * 0.7, 0);
      context.closePath();
      context.fill();
      context.strokeStyle = faction.accent;
      context.lineWidth = 3;
      context.stroke();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, -r * 0.55);
      context.lineTo(0, r * 0.55);
      context.moveTo(-r * 0.4, -r * 0.2);
      context.lineTo(r * 0.4, -r * 0.2);
      context.stroke();
    } else if (faction.emblem === 'totem') {
      context.fillStyle = '#8a6a42';
      context.fillRect(-r * 0.28, -r, r * 0.56, r * 2);
      context.fillStyle = faction.color;
      context.beginPath();
      context.arc(0, -r * 0.72, r * 0.42, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = faction.accent;
      context.beginPath();
      context.arc(-r * 0.16, -r * 0.78, r * 0.09, 0, Math.PI * 2);
      context.arc(r * 0.16, -r * 0.78, r * 0.09, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#f2f0e4';
      context.beginPath();
      context.moveTo(-r * 0.5, r * 0.35);
      context.lineTo(-r * 0.85, r * 0.85);
      context.lineTo(-r * 0.3, r * 0.6);
      context.closePath();
      context.moveTo(r * 0.5, r * 0.35);
      context.lineTo(r * 0.85, r * 0.85);
      context.lineTo(r * 0.3, r * 0.6);
      context.closePath();
      context.fill();
    } else if (faction.emblem === 'horns') {
      context.fillStyle = faction.dark;
      context.beginPath();
      context.arc(0, r * 0.15, r * 0.62, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = faction.accent;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(-r * 0.55, -r * 0.25, r * 0.55, Math.PI * 0.9, Math.PI * 1.9);
      context.arc(r * 0.55, -r * 0.25, r * 0.55, Math.PI * 1.1, Math.PI * 0.1);
      context.stroke();
      context.fillStyle = '#ff5a4e';
      context.beginPath();
      context.arc(-r * 0.22, r * 0.05, r * 0.1, 0, Math.PI * 2);
      context.arc(r * 0.22, r * 0.05, r * 0.1, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillStyle = faction.color;
      context.beginPath();
      context.ellipse(0, 0, r * 0.45, r * 0.9, -0.5, 0, Math.PI * 2);
      context.ellipse(0, 0, r * 0.45, r * 0.9, 0.5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = faction.accent;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, -r * 0.85);
      context.lineTo(0, r * 0.85);
      context.stroke();
    }
    context.restore();
  }

  function drawHqBanner(building) {
    const faction = FACTIONS[building.faction];
    const x = building.x;
    const y = building.y - building.h / 2;
    context.strokeStyle = '#3a2e1e';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x, y - 24);
    context.stroke();
    context.fillStyle = faction.color;
    context.beginPath();
    context.moveTo(x, y - 24);
    context.lineTo(x + 26, y - 19);
    context.lineTo(x, y - 13);
    context.closePath();
    context.fill();
    context.fillStyle = faction.accent;
    context.beginPath();
    context.arc(x + 9, y - 18, 3, 0, Math.PI * 2);
    context.fill();
  }

  function drawBuildingShape(faction, kind, x, y, w, h) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (faction.id === 'human') {
      // Stone keep: grey block, crenellated top, blue banner, arched door.
      context.fillStyle = '#7a8288';
      context.fillRect(x + 4, y + 12, w - 8, h - 12);
      context.fillStyle = '#9aa2a8';
      for (let i = 0; i < 3; i += 1) context.fillRect(x + 6 + i * (w - 12) / 3, y + 4, (w - 12) / 6, 10);
      context.fillStyle = faction.color;
      context.fillRect(x + w / 2 - 8, y + 14, 16, 20);
      context.fillStyle = '#3a2e1e';
      context.beginPath();
      context.arc(cx, y + h - 6, 7, Math.PI, 0);
      context.fill();
      if (kind === 'hq') {
        context.fillStyle = '#6a7278';
        context.fillRect(x - 4, y + 18, 10, h - 18);
        context.fillRect(x + w - 6, y + 18, 10, h - 18);
        context.fillStyle = faction.accent;
        context.beginPath();
        context.moveTo(cx - 14, y + 2);
        context.lineTo(cx, y - 6);
        context.lineTo(cx + 14, y + 2);
        context.closePath();
        context.fill();
      } else if (kind === 'tower') {
        context.fillStyle = faction.color;
        context.fillRect(x + w / 2 - 3, y + 26, 6, 14);
      } else if (kind === 'economy') {
        context.fillStyle = '#d9a066';
        for (let i = 0; i < 4; i += 1) {
          context.fillRect(x + 10 + i * 11, y + h - 22, 3, 12);
          context.beginPath();
          context.arc(x + 11 + i * 11, y + h - 22, 4, 0, Math.PI * 2);
          context.fill();
        }
      } else if (kind === 'special') {
        context.fillStyle = '#f2f0e4';
        context.fillRect(x + 8, y + 20, 5, h - 24);
        context.fillRect(x + w - 13, y + 20, 5, h - 24);
        context.fillStyle = faction.accent;
        context.beginPath();
        context.arc(cx, y + 14, 9, Math.PI, 0);
        context.fill();
      } else {
        context.fillStyle = faction.accent;
        context.fillRect(x + w / 2 - 2, y + 16, 4, 20);
        context.fillRect(x + w / 2 - 10, y + 22, 20, 4);
      }
    } else if (faction.id === 'orc') {
      // Rough hut: brown body, slanted thatch roof, tusks at the corners.
      context.fillStyle = '#6b4a26';
      context.fillRect(x + 5, y + 16, w - 10, h - 16);
      context.fillStyle = '#8a6a42';
      context.beginPath();
      context.moveTo(x, y + 20);
      context.lineTo(cx, y + 2);
      context.lineTo(x + w, y + 20);
      context.closePath();
      context.fill();
      context.strokeStyle = '#3a2e1e';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + 8, y + 20);
      context.lineTo(cx, y + 6);
      context.lineTo(x + w - 8, y + 20);
      context.stroke();
      context.fillStyle = '#f2f0e4';
      context.beginPath();
      context.moveTo(x + 4, y + h - 4);
      context.lineTo(x + 14, y + h - 16);
      context.lineTo(x + 16, y + h - 2);
      context.closePath();
      context.moveTo(x + w - 4, y + h - 4);
      context.lineTo(x + w - 14, y + h - 16);
      context.lineTo(x + w - 16, y + h - 2);
      context.closePath();
      context.fill();
      if (kind === 'hq') {
        context.fillStyle = faction.color;
        context.fillRect(x + w / 2 - 3, y + 22, 6, 14);
      } else if (kind === 'tower') {
        context.fillStyle = faction.accent;
        context.beginPath();
        context.moveTo(cx - 12, y + 8);
        context.lineTo(cx - 4, y + 22);
        context.lineTo(cx - 12, y + 22);
        context.closePath();
        context.moveTo(cx + 12, y + 8);
        context.lineTo(cx + 4, y + 22);
        context.lineTo(cx + 12, y + 22);
        context.closePath();
        context.fill();
      } else if (kind === 'economy') {
        context.strokeStyle = '#a9803e';
        context.lineWidth = 3;
        context.strokeRect(x + 8, y + h - 18, w - 16, 12);
      } else if (kind === 'special') {
        drawEmblem(faction, cx, cy + 6, 12);
      } else {
        context.strokeStyle = faction.accent;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(cx - 12, y + 22);
        context.lineTo(cx + 12, y + 38);
        context.moveTo(cx + 12, y + 22);
        context.lineTo(cx - 12, y + 38);
        context.stroke();
      }
    } else if (faction.id === 'demon') {
      // Jagged black tower: dark body, spiked top, lava cracks, flame.
      context.fillStyle = '#1a1026';
      context.beginPath();
      context.moveTo(x + 6, y + h);
      context.lineTo(x + 10, y + 14);
      context.lineTo(cx - 10, y + 6);
      context.lineTo(cx, y - 2);
      context.lineTo(cx + 10, y + 6);
      context.lineTo(x + w - 10, y + 14);
      context.lineTo(x + w - 6, y + h);
      context.closePath();
      context.fill();
      context.strokeStyle = faction.accent;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + 12, y + h - 10);
      context.lineTo(cx - 4, y + h / 2 + 8);
      context.lineTo(x + 16, y + h / 2 - 4);
      context.moveTo(x + w - 12, y + h - 12);
      context.lineTo(cx + 6, y + h / 2 + 6);
      context.stroke();
      context.fillStyle = '#ff7b2f';
      context.beginPath();
      context.moveTo(cx, y - 8);
      context.quadraticCurveTo(cx + 8, y + 4, cx, y + 10);
      context.quadraticCurveTo(cx - 8, y + 4, cx, y - 8);
      context.fill();
      if (kind === 'hq') {
        context.fillStyle = faction.color;
        context.fillRect(x + 10, y + h - 16, 10, 16);
        context.fillRect(x + w - 20, y + h - 16, 10, 16);
      } else if (kind === 'economy') {
        context.fillStyle = faction.color;
        context.beginPath();
        context.ellipse(cx, y + h - 12, 14, 8, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#e9d5ff';
        context.beginPath();
        context.arc(cx - 5, y + h - 13, 2.5, 0, Math.PI * 2);
        context.arc(cx + 4, y + h - 10, 2.5, 0, Math.PI * 2);
        context.fill();
      } else if (kind === 'special') {
        context.strokeStyle = faction.accent;
        context.lineWidth = 4;
        context.beginPath();
        context.arc(cx - 12, y + 12, 10, Math.PI * 0.9, Math.PI * 1.9);
        context.arc(cx + 12, y + 12, 10, Math.PI * 1.1, Math.PI * 0.1);
        context.stroke();
      }
    } else {
      // Nature: organic rounded shapes — big tree, grove, thorn vine, pool.
      if (kind === 'hq') {
        context.fillStyle = '#5d3a1a';
        context.fillRect(cx - 6, y + 26, 12, h - 26);
        context.fillStyle = faction.color;
        context.beginPath();
        context.arc(cx - 12, y + 20, 16, 0, Math.PI * 2);
        context.arc(cx + 12, y + 20, 16, 0, Math.PI * 2);
        context.arc(cx, y + 6, 18, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#2fa04a';
        context.beginPath();
        context.arc(cx - 8, y + 12, 9, 0, Math.PI * 2);
        context.arc(cx + 9, y + 8, 8, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = faction.accent;
        context.beginPath();
        context.arc(cx - 4, y + 16, 3, 0, Math.PI * 2);
        context.arc(cx + 6, y + 22, 3, 0, Math.PI * 2);
        context.fill();
      } else if (kind === 'tower') {
        context.strokeStyle = '#1e4d1e';
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(cx, y + h);
        context.quadraticCurveTo(cx - 10, y + h / 2, cx, y + 4);
        context.stroke();
        context.fillStyle = faction.accent;
        for (let i = 0; i < 3; i += 1) {
          context.beginPath();
          context.moveTo(cx - 8, y + 16 + i * 12);
          context.lineTo(cx - 16, y + 20 + i * 12);
          context.lineTo(cx - 8, y + 24 + i * 12);
          context.closePath();
          context.fill();
        }
      } else if (kind === 'economy') {
        context.fillStyle = '#1e3a5f';
        context.beginPath();
        context.ellipse(cx, cy + 6, 20, 12, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#67e8f9';
        context.beginPath();
        context.ellipse(cx, cy + 6, 14, 8, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.rock;
        context.beginPath();
        context.arc(x + 8, y + h - 8, 5, 0, Math.PI * 2);
        context.arc(x + w - 8, y + h - 10, 5, 0, Math.PI * 2);
        context.fill();
      } else if (kind === 'special') {
        context.fillStyle = PALETTE.rock;
        for (let i = 0; i < 5; i += 1) {
          const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
          context.beginPath();
          context.ellipse(cx + Math.cos(angle) * 16, cy + 6 + Math.sin(angle) * 12, 5, 9, angle, 0, Math.PI * 2);
          context.fill();
        }
        context.fillStyle = faction.accent;
        context.beginPath();
        context.arc(cx, cy + 6, 5, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = faction.color;
        context.beginPath();
        context.arc(cx - 8, cy, 12, 0, Math.PI * 2);
        context.arc(cx + 8, cy + 4, 12, 0, Math.PI * 2);
        context.arc(cx, cy - 10, 12, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#5d3a1a';
        context.fillRect(cx - 3, cy + 8, 6, h - cy - 8);
      }
    }
  }

  function drawBuilding(building, selected) {
    const faction = FACTIONS[building.faction];
    const x = building.x - building.w / 2;
    const y = building.y - building.h / 2;
    const underConstruction = building.progress < 1;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(x + 3, y + 5, building.w, building.h);
    if (underConstruction) {
      // Unfinished: grey scaffold with the faction colour as trim.
      context.fillStyle = '#8a8a7a';
      roundRect(x, y, building.w, building.h, 6);
      context.fill();
      context.strokeStyle = faction.color;
      context.lineWidth = 2;
      context.stroke();
      context.strokeStyle = '#5f5f5f';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + 8, y + 8);
      context.lineTo(x + building.w - 8, y + building.h - 8);
      context.moveTo(x + building.w - 8, y + 8);
      context.lineTo(x + 8, y + building.h - 8);
      context.stroke();
    } else {
      drawBuildingShape(faction, building.buildingKind, x, y, building.w, building.h);
    }
    if (building.buildingKind === 'hq' && !underConstruction) drawHqBanner(building);
    if (underConstruction) {
      hpBar(x, y - 10, building.w, building.progress, '#f2c94c');
      text(Math.floor(building.progress * 100) + '%', x + building.w / 2, y - 14, 11, PALETTE.gold, 'center');
    } else if (building.hp < building.maxHp) {
      hpBar(x, y - 10, building.w, building.hp / building.maxHp, '#7cfc9a');
    }
    if (selected) {
      context.strokeStyle = PALETTE.select;
      context.lineWidth = 2;
      roundRect(x - 4, y - 4, building.w + 8, building.h + 8, 8);
      context.stroke();
      text(building.name, building.x, y + building.h + 16, 12, PALETTE.text, 'center');
    }
    // Training progress pip.
    if (building.queue.length > 0) {
      const job = building.queue[0];
      hpBar(x, y + building.h + 4, building.w, 1 - job.t / job.total, faction.accent);
    }
  }

  function drawUnit(unit, selected) {
    const faction = FACTIONS[unit.faction];
    const r = unit.radius;
    const teamColor = teamOf(unit.faction) === 'A' ? PALETTE.teamA : PALETTE.teamB;
    if (selected) {
      // Team-coloured selection ring with a white outer edge: the two
      // teams read at a glance, and the ring never blends into a faction.
      context.strokeStyle = teamColor;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(unit.x, unit.y, r + 4, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(unit.x, unit.y, r + 6, 0, Math.PI * 2);
      context.stroke();
    }
    // Body by faction: Human a square-shouldered soldier, Orc a bulky
    // brute with tusks, Devil a horned triangle, Nature a leaf orb — and
    // the Wisp is a glowing ball with no body at all.
    if (unit.unitKind === 'worker' && faction.id === 'nature') {
      context.fillStyle = faction.accent;
      context.globalAlpha = 0.45;
      context.beginPath();
      context.arc(unit.x, unit.y, r + 4, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = '#e6fffa';
      context.beginPath();
      context.arc(unit.x, unit.y, r - 3, 0, Math.PI * 2);
      context.fill();
    } else if (faction.id === 'human') {
      context.fillStyle = faction.color;
      roundRect(unit.x - r + 1, unit.y - r + 1, (r - 1) * 2, (r - 1) * 2, 4);
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.6)';
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = '#9aa2a8';
      context.fillRect(unit.x - r + 2, unit.y - r - 1, (r - 2) * 2, 3);
    } else if (faction.id === 'orc') {
      context.fillStyle = faction.color;
      context.beginPath();
      context.arc(unit.x, unit.y, r, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.6)';
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = '#f2f0e4';
      context.beginPath();
      context.moveTo(unit.x - r + 1, unit.y + r * 0.4);
      context.lineTo(unit.x - r - 3, unit.y + r + 2);
      context.lineTo(unit.x - r + 5, unit.y + r * 0.7);
      context.closePath();
      context.moveTo(unit.x + r - 1, unit.y + r * 0.4);
      context.lineTo(unit.x + r + 3, unit.y + r + 2);
      context.lineTo(unit.x + r - 5, unit.y + r * 0.7);
      context.closePath();
      context.fill();
    } else if (faction.id === 'demon') {
      context.fillStyle = faction.dark;
      context.beginPath();
      context.moveTo(unit.x, unit.y - r - 2);
      context.lineTo(unit.x + r, unit.y + r * 0.7);
      context.lineTo(unit.x - r, unit.y + r * 0.7);
      context.closePath();
      context.fill();
      context.strokeStyle = faction.accent;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(unit.x - r * 0.55, unit.y - r * 0.5, r * 0.45, Math.PI * 0.9, Math.PI * 1.9);
      context.arc(unit.x + r * 0.55, unit.y - r * 0.5, r * 0.45, Math.PI * 1.1, Math.PI * 0.1);
      context.stroke();
      context.fillStyle = '#ff5a4e';
      context.beginPath();
      context.arc(unit.x - 3, unit.y - 1, 1.8, 0, Math.PI * 2);
      context.arc(unit.x + 3, unit.y - 1, 1.8, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillStyle = faction.color;
      context.beginPath();
      context.ellipse(unit.x, unit.y, r * 0.85, r, -0.4, 0, Math.PI * 2);
      context.ellipse(unit.x, unit.y, r * 0.85, r, 0.4, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.5)';
      context.lineWidth = 1.5;
      context.stroke();
      context.strokeStyle = faction.accent;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(unit.x, unit.y - r + 2);
      context.lineTo(unit.x, unit.y + r - 2);
      context.stroke();
    }
    // Role weapon, in white: melee a sword or axe, ranged a bow or bolt,
    // heavy a big weapon, hero a star. Size and weapon make the role read
    // even at a glance.
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#ffffff';
    if (unit.unitKind === 'worker' && faction.id !== 'nature') {
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(unit.x - 5, unit.y + 5);
      context.lineTo(unit.x + 5, unit.y - 5);
      context.stroke();
    } else if (unit.unitKind === 'melee') {
      if (faction.id === 'orc') {
        context.lineWidth = 2.5;
        context.beginPath();
        context.moveTo(unit.x - 6, unit.y + 6);
        context.lineTo(unit.x + 6, unit.y - 6);
        context.stroke();
        context.beginPath();
        context.moveTo(unit.x + 6, unit.y - 6);
        context.lineTo(unit.x + 1, unit.y - 9);
        context.lineTo(unit.x + 9, unit.y - 1);
        context.closePath();
        context.fill();
      } else if (faction.id === 'demon') {
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(unit.x - 6, unit.y - 2);
        context.lineTo(unit.x + 6, unit.y - 2);
        context.moveTo(unit.x - 5, unit.y + 3);
        context.lineTo(unit.x + 5, unit.y + 3);
        context.stroke();
      } else if (faction.id === 'nature') {
        context.lineWidth = 2.5;
        context.beginPath();
        context.moveTo(unit.x, unit.y - 9);
        context.lineTo(unit.x, unit.y + 9);
        context.stroke();
        context.beginPath();
        context.moveTo(unit.x, unit.y - 9);
        context.lineTo(unit.x - 4, unit.y - 3);
        context.lineTo(unit.x + 4, unit.y - 3);
        context.closePath();
        context.fill();
      } else {
        context.lineWidth = 2.5;
        context.beginPath();
        context.moveTo(unit.x, unit.y - 8);
        context.lineTo(unit.x, unit.y + 8);
        context.stroke();
        context.fillRect(unit.x - 5, unit.y - 1, 10, 2);
      }
    } else if (unit.unitKind === 'ranged') {
      if (faction.id === 'demon') {
        context.fillStyle = '#ff7b2f';
        context.beginPath();
        context.arc(unit.x + 3, unit.y - 3, 4, 0, Math.PI * 2);
        context.fill();
      } else if (faction.id === 'orc') {
        context.lineWidth = 2.5;
        context.beginPath();
        context.moveTo(unit.x - 6, unit.y + 6);
        context.lineTo(unit.x + 6, unit.y - 6);
        context.stroke();
        context.beginPath();
        context.moveTo(unit.x + 6, unit.y - 6);
        context.lineTo(unit.x + 1, unit.y - 9);
        context.lineTo(unit.x + 9, unit.y - 1);
        context.closePath();
        context.fill();
      } else {
        context.lineWidth = 2;
        context.beginPath();
        context.arc(unit.x, unit.y, 7, -0.9, 0.9);
        context.stroke();
        context.beginPath();
        context.moveTo(unit.x - 5, unit.y - 4);
        context.lineTo(unit.x - 5, unit.y + 4);
        context.stroke();
      }
    } else if (unit.unitKind === 'heavy') {
      if (faction.id === 'nature') {
        context.strokeStyle = '#1e4d1e';
        context.lineWidth = 2.5;
        context.beginPath();
        context.moveTo(unit.x - 6, unit.y - 6);
        context.lineTo(unit.x - 12, unit.y - 12);
        context.moveTo(unit.x + 6, unit.y - 6);
        context.lineTo(unit.x + 12, unit.y - 12);
        context.stroke();
      } else if (faction.id === 'demon') {
        context.strokeStyle = faction.accent;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(unit.x - 7, unit.y - 6, 6, Math.PI * 0.9, Math.PI * 1.9);
        context.arc(unit.x + 7, unit.y - 6, 6, Math.PI * 1.1, Math.PI * 0.1);
        context.stroke();
      } else {
        context.fillStyle = '#ffffff';
        context.fillRect(unit.x - 7, unit.y - 7, 14, 14);
        context.fillStyle = faction.color;
        context.fillRect(unit.x - 4, unit.y - 4, 8, 8);
      }
    } else if (unit.unitKind === 'hero') {
      context.fillStyle = '#ffffff';
      context.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const angle = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        const px = unit.x + Math.cos(angle) * 8;
        const py = unit.y + Math.sin(angle) * 8;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.strokeStyle = faction.accent;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(unit.x, unit.y, r + 2, 0, Math.PI * 2);
      context.stroke();
    }
    if (unit.carry) {
      context.fillStyle = unit.carry === 'gold' ? PALETTE.gold : PALETTE.wood;
      context.beginPath();
      context.arc(unit.x, unit.y - r - 5, 4, 0, Math.PI * 2);
      context.fill();
    }
    // Health bar: always on for heroes and selected units, otherwise when hurt.
    if (unit.hp < unit.maxHp || unit.unitKind === 'hero' || selected) {
      hpBar(unit.x - 13, unit.y - r - 12, 26, unit.hp / unit.maxHp, unit.owner === 'enemy' ? '#ff5a4e' : '#7cfc9a');
    }
    if (unit.state === 'build') {
      context.strokeStyle = '#f2c94c';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(unit.x, unit.y, r + 7, 0, Math.PI * 2);
      context.stroke();
    }
  }

  // Gold-mine amounts, drawn last so no building or unit can cover them.
  // A mine in the lower half gets its label above it: below it the text
  // would run into the bottom panel (the centre mine sits at y 568, its
  // old label landed exactly on the panel edge). The dark pill keeps the
  // text readable over grass, roads and buildings alike.
  function drawNodeLabels(state) {
    if (!fonts.has(12)) fonts.set(12, `12px ${FONT}`);
    context.font = fonts.get(12);
    context.textAlign = 'center';
    for (const node of state.nodes) {
      if (node.kind !== 'gold' || node.dead || node.amount <= 0) continue;
      const label = 'Gold ' + Math.floor(node.amount);
      const y = node.y > 400
        ? node.y - node.radius - 8
        : node.y + node.radius + 14;
      const cy = Math.max(FIELD.fieldTop + 12, Math.min(FIELD.panelTop - 8, y));
      const w = context.measureText(label).width;
      context.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(node.x - w / 2 - 5, cy - 11, w + 10, 16, 4);
      context.fill();
      context.fillStyle = PALETTE.gold;
      context.fillText(label, node.x, cy + 1);
    }
  }

  function drawField(state, view) {
    drawTerrain(state);
    for (const node of state.nodes) drawNode(node);
    for (const building of state.buildings) {
      drawBuilding(building, state.selection.includes(building));
    }
    for (const unit of state.units) {
      drawUnit(unit, state.selection.includes(unit));
    }
    drawNodeLabels(state);
    // Tracers: a wide translucent core plus a bright thin line, so ranged
    // fire and fireballs read in the middle of a battle.
    for (const tracer of state.tracers) {
      const alpha = Math.max(0, tracer.ttl / 0.14);
      context.globalAlpha = alpha * 0.45;
      context.strokeStyle = tracer.color;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(tracer.x0, tracer.y0);
      context.lineTo(tracer.x1, tracer.y1);
      context.stroke();
      context.globalAlpha = alpha;
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(tracer.x0, tracer.y0);
      context.lineTo(tracer.x1, tracer.y1);
      context.stroke();
      context.globalAlpha = 1;
    }
    // Hit flashes: expanding rings at every impact.
    for (const flash of state.flashes) {
      const progress = 1 - Math.max(0, flash.ttl) / 0.18;
      context.globalAlpha = Math.max(0, 1 - progress);
      context.strokeStyle = flash.color;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(flash.x, flash.y, 4 + progress * 14, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
    for (const floater of state.floaters) {
      context.globalAlpha = Math.max(0, floater.ttl);
      text(floater.text, floater.x, floater.y, 15, floater.color, 'center');
      context.globalAlpha = 1;
    }
    // Placement ghost.
    if (view.mode === 'place' && view.placeKind) {
      const size = view.placeKind === 'hq' ? 76 : 58;
      const valid = view.placeValid;
      context.strokeStyle = valid ? '#7cfc9a' : '#ff5a4e';
      context.lineWidth = 2;
      context.fillStyle = valid ? 'rgba(124,252,154,0.25)' : 'rgba(255,90,78,0.25)';
      context.fillRect(view.pointer.x - size / 2, view.pointer.y - size / 2, size, size);
      context.strokeRect(view.pointer.x - size / 2, view.pointer.y - size / 2, size, size);
    }
    // Box select.
    if (view.box) {
      context.strokeStyle = '#ffffff';
      context.fillStyle = 'rgba(255,255,255,0.12)';
      const x = Math.min(view.box.x0, view.box.x1);
      const y = Math.min(view.box.y0, view.box.y1);
      const w = Math.abs(view.box.x1 - view.box.x0);
      const h = Math.abs(view.box.y1 - view.box.y0);
      context.fillRect(x, y, w, h);
      context.strokeRect(x, y, w, h);
    }
    // Attack-move / ability crosshair.
    if (view.mode === 'attack' || view.mode === 'ability-target') {
      context.strokeStyle = '#ff5a4e';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(view.pointer.x, view.pointer.y, 12, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(view.pointer.x - 18, view.pointer.y);
      context.lineTo(view.pointer.x + 18, view.pointer.y);
      context.moveTo(view.pointer.x, view.pointer.y - 18);
      context.lineTo(view.pointer.x, view.pointer.y + 18);
      context.stroke();
    }
  }

  // ---- HUD and command panel --------------------------------------------
  function wrapText(value, maxChars) {
    const words = value.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > maxChars && line.length > 0) {
        lines.push(line.trim());
        line = word;
      } else {
        line += ' ' + word;
      }
    }
    if (line.trim().length > 0) lines.push(line.trim());
    return lines;
  }

  function costText(cost) {
    const parts = [];
    if (cost.gold) parts.push(cost.gold + ' gold');
    if (cost.wood) parts.push(cost.wood + ' wood');
    return parts.join(' + ') || 'Free';
  }

  /** The command buttons for the current context, with hit rectangles. */
  function panelButtons(state, view) {
    const buttons = [];
    const faction = FACTIONS[state.playerFaction];
    if (view.mode === 'build') {
      const kinds = ['barracks', 'tower', 'economy', 'special'];
      for (let i = 0; i < kinds.length; i += 1) {
        const def = faction.buildings[kinds[i]];
        const rect = panelButtonRect(i);
        buttons.push({
          id: 'build:' + kinds[i], label: def.name, sub: costText(def.cost),
          hotkey: String(i + 1), disabled: !canAffordHere(state, def.cost), ...rect,
        });
      }
      buttons.push({ id: 'cancel', label: 'Cancel', sub: 'Esc', hotkey: 'Esc', disabled: false, ...panelButtonRect(4) });
      return buttons;
    }
    if (view.mode === 'train') {
      const building = state.selection.find((e) => e.kind === 'building' && !e.dead);
      if (building) {
        // Towers and farms train nothing: their list is empty, not a crash.
        const trains = building.buildingKind === 'hq' ? ['worker'] : faction.buildings[building.buildingKind].trains || [];
        // The mercy worker is free when the faction has no workers left
        // (living or already queued), so the button stays usable when broke.
        const workersLeft = state.units.filter((u) => !u.dead && u.faction === state.playerFaction && u.unitKind === 'worker').length
          + state.buildings.filter((b) => !b.dead && b.faction === state.playerFaction)
            .reduce((sum, b) => sum + b.queue.filter((job) => job.kind === 'worker').length, 0);
        for (let i = 0; i < trains.length; i += 1) {
          const def = faction.units[trains[i]];
          const rect = panelButtonRect(i);
          const freeWorker = trains[i] === 'worker' && workersLeft === 0;
          buttons.push({
            id: 'train:' + trains[i], label: def.name, sub: freeWorker ? 'Free' : costText(def.cost),
            hotkey: String(i + 1), disabled: freeWorker ? false : !canAffordHere(state, def.cost), ...rect,
          });
        }
      }
      buttons.push({ id: 'cancel', label: 'Cancel', sub: 'Esc', hotkey: 'Esc', disabled: false, ...panelButtonRect(4) });
      return buttons;
    }
    const units = state.selection.filter((e) => e.kind === 'unit' && !e.dead);
    const workers = units.filter((u) => u.unitKind === 'worker');
    const heroes = units.filter((u) => u.unitKind === 'hero');
    const combat = units.filter((u) => u.unitKind !== 'worker');
    const building = state.selection.find((e) => e.kind === 'building' && !e.dead);
    buttons.push({ id: 'build', label: 'Build', sub: 'B', hotkey: 'B', disabled: workers.length === 0, ...panelButtonRect(0) });
    buttons.push({ id: 'train', label: 'Train', sub: 'T', hotkey: 'T', disabled: !building, ...panelButtonRect(1) });
    buttons.push({ id: 'attack', label: 'Attack', sub: 'A', hotkey: 'A', disabled: combat.length === 0, ...panelButtonRect(2) });
    buttons.push({
      id: 'ability', label: heroes.length > 0 ? FACTIONS[state.playerFaction].units.hero.abilityName : 'Ability',
      sub: 'Q', hotkey: 'Q', disabled: heroes.length === 0 || (heroes[0] && heroes[0].abilityCd > 0), ...panelButtonRect(3),
    });
    buttons.push({ id: 'hold', label: 'Hold', sub: 'H', hotkey: 'H', disabled: units.length === 0, ...panelButtonRect(4) });
    return buttons;
  }

  function canAffordHere(state, cost) {
    const res = state.factions[state.playerFaction];
    return res.gold >= (cost.gold || 0) && res.wood >= (cost.wood || 0);
  }

  function drawHud(state, view) {
    context.textBaseline = 'top';
    const res = state.factions[state.playerFaction];
    text('EMBER THRONE', 20, 12, 20, PALETTE.text, 'left');
    text(formatTime(state.time), 200, 14, 18, PALETTE.muted, 'left');
    text(goldLabel(Math.floor(res.gold)), 420, 12, 20, PALETTE.gold, 'left');
    text(woodLabel(Math.floor(res.wood)), 580, 12, 20, PALETTE.wood, 'left');
    text(supplyLabel(supplyUsedHere(state) + '/' + supplyMaxHere(state)), 740, 12, 20, PALETTE.text, 'left');
    // Team chips: each faction's HQ health.
    let x = 900;
    for (const id of FACTION_IDS) {
      const faction = FACTIONS[id];
      const hq = state.buildings.find((b) => !b.dead && b.faction === id && b.buildingKind === 'hq');
      context.fillStyle = faction.color;
      context.beginPath();
      context.arc(x + 8, 22, 7, 0, Math.PI * 2);
      context.fill();
      text(faction.name, x + 20, 14, 14, hq ? PALETTE.text : '#ff5a4e', 'left');
      if (hq) hpBar(x + 20, 32, 56, hq.hp / hq.maxHp, faction.color);
      else text('DESTROYED', x + 20, 30, 11, '#ff5a4e', 'left');
      x += 96;
    }
    if (view.toast) {
      context.globalAlpha = Math.max(0, Math.min(1, view.toast.ttl));
      text(view.toast.text, FIELD.width / 2, 52, 18, PALETTE.gold, 'center');
      context.globalAlpha = 1;
    }
  }

  function supplyUsedHere(state) {
    let used = 0;
    for (const unit of state.units) {
      if (!unit.dead && unit.faction === state.playerFaction) used += FACTIONS[state.playerFaction].units[unit.unitKind].supply;
    }
    return used;
  }

  function supplyMaxHere(state) {
    let max = 10;
    for (const building of state.buildings) {
      if (!building.dead && building.faction === state.playerFaction && building.buildingKind === 'economy' && building.progress >= 1) max += 8;
    }
    return max;
  }

  function drawPanel(state, view) {
    context.fillStyle = PALETTE.panel;
    context.fillRect(0, FIELD.panelTop, FIELD.width, FIELD.height - FIELD.panelTop);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, FIELD.panelTop);
    context.lineTo(FIELD.width, FIELD.panelTop);
    context.stroke();
    // Selection summary on the right side of the panel.
    const selection = state.selection.filter((e) => !e.dead);
    let summary = 'Nothing selected. Click one of your units or buildings.';
    if (selection.length === 1) {
      const entity = selection[0];
      if (entity.kind === 'unit') {
        const def = FACTIONS[entity.faction].units[entity.unitKind];
        summary = def.name + ' — HP ' + Math.ceil(entity.hp) + '/' + entity.maxHp
          + (entity.unitKind === 'worker' && entity.carry ? ' — carrying ' + entity.carryAmt + ' ' + entity.carry : '')
          + (entity.unitKind === 'hero' ? ' — ' + FACTIONS[entity.faction].units.hero.abilityName + (entity.abilityCd > 0 ? ' (' + Math.ceil(entity.abilityCd) + 's)' : ' ready') : '');
      } else {
        summary = entity.name + ' — HP ' + Math.ceil(entity.hp) + '/' + entity.maxHp
          + (entity.progress < 1 ? ' — under construction ' + Math.floor(entity.progress * 100) + '%' : '')
          + (entity.queue.length > 0 ? ' — training ' + FACTIONS[entity.faction].units[entity.queue[0].kind].name : '');
      }
    } else if (selection.length > 1) {
      summary = selection.length + ' units selected.';
    }
    if (view.mode === 'place') summary = 'Click the field to build ' + FACTIONS[state.playerFaction].buildings[view.placeKind].name + '. Esc to cancel.';
    else if (view.mode === 'attack') summary = 'Click a destination for the attack-move order.';
    else if (view.mode === 'ability-target') summary = 'Click a point for ' + FACTIONS[state.playerFaction].units.hero.abilityName + '.';
    else if (view.mode === 'build') summary = 'Choose a building to build (1-4), or click its button.';
    else if (view.mode === 'train') summary = 'Choose a unit to train (1-4), or click its button.';
    text(summary, 800, 626, 16, PALETTE.text, 'left');
    text('Left-click select · Drag to box-select · Right-click to order', 800, 654, 13, PALETTE.muted, 'left');
    text('B build · T train · A attack · Q ability · H hold · Space pause · R restart', 800, 672, 13, PALETTE.muted, 'left');
    const units = state.units.filter((u) => !u.dead && u.faction === state.playerFaction);
    const kills = state.stats.kills;
    text('Your units: ' + units.length + '   Enemies defeated: ' + kills + '   Enemy buildings destroyed: ' + state.stats.buildingsDestroyed, 800, 684, 13, PALETTE.muted, 'left');
    for (const button of panelButtons(state, view)) {
      context.fillStyle = button.disabled ? '#2a2f26' : PALETTE.panelEdge;
      roundRect(button.x, button.y, button.w, button.h, 8);
      context.fill();
      context.strokeStyle = button.disabled ? '#3a4034' : PALETTE.text;
      context.lineWidth = 1;
      context.stroke();
      text(button.label, button.x + button.w / 2, button.y + 14, 16, button.disabled ? PALETTE.muted : PALETTE.text, 'center');
      text(button.sub, button.x + button.w / 2, button.y + 40, 13, button.disabled ? PALETTE.muted : PALETTE.gold, 'center');
      text('[' + button.hotkey + ']', button.x + button.w / 2, button.y + 60, 12, PALETTE.muted, 'center');
    }
  }

  // ---- screens ----------------------------------------------------------
  function drawSelect(state, view) {
    drawTerrain(state);
    for (const node of state.nodes) drawNode(node);
    for (const building of state.buildings) drawBuilding(building, false);
    for (const unit of state.units) drawUnit(unit, false);
    drawNodeLabels(state);
    context.fillStyle = 'rgba(10,14,8,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('EMBER THRONE', FIELD.width / 2, 66, 56, PALETTE.gold, 'center');
    text('2v2 Battle — Human + Nature vs Orc + Devil', FIELD.width / 2, 128, 20, PALETTE.text, 'center');
    text('Choose your faction. Destroy both enemy headquarters to win.', FIELD.width / 2, 156, 16, PALETTE.muted, 'center');
    for (let i = 0; i < FACTION_IDS.length; i += 1) {
      const faction = FACTIONS[FACTION_IDS[i]];
      const rect = cardRect(i);
      context.fillStyle = PALETTE.panel;
      roundRect(rect.x, rect.y, rect.w, rect.h, 10);
      context.fill();
      context.strokeStyle = faction.color;
      context.lineWidth = 3;
      context.stroke();
      context.fillStyle = faction.color;
      context.fillRect(rect.x, rect.y, rect.w, 10);
      // Large faction emblem: the card reads by shape before any text.
      drawEmblem(faction, rect.x + rect.w / 2, rect.y + 46, 26);
      text(faction.name, rect.x + rect.w / 2, rect.y + 98, 30, faction.color, 'center');
      text(faction.title, rect.x + rect.w / 2, rect.y + 124, 15, PALETTE.muted, 'center');
      const descLines = wrapText(faction.desc, 30);
      for (let l = 0; l < descLines.length; l += 1) {
        text(descLines[l], rect.x + rect.w / 2, rect.y + 148 + l * 20, 14, PALETTE.text, 'center');
      }
      let y = rect.y + 212;
      text('Headquarters: ' + faction.hq.name, rect.x + 18, y, 14, PALETTE.text, 'left');
      y += 22;
      text('Buildings:', rect.x + 18, y, 14, PALETTE.gold, 'left');
      y += 20;
      for (const kind of ['barracks', 'tower', 'economy', 'special']) {
        text('• ' + faction.buildings[kind].name, rect.x + 30, y, 13, PALETTE.text, 'left');
        y += 18;
      }
      y += 6;
      text('Units:', rect.x + 18, y, 14, PALETTE.gold, 'left');
      y += 20;
      for (const kind of ['worker', 'melee', 'ranged', 'heavy']) {
        text('• ' + faction.units[kind].name, rect.x + 30, y, 13, PALETTE.text, 'left');
        y += 18;
      }
      y += 4;
      text('Hero: ' + faction.units.hero.name, rect.x + 18, y, 14, faction.accent, 'left');
      y += 20;
      const abilityLines = wrapText(faction.units.hero.abilityName + ': ' + faction.units.hero.abilityDesc, 30);
      for (let l = 0; l < abilityLines.length; l += 1) {
        text(abilityLines[l], rect.x + 18, y + l * 17, 12, PALETTE.muted, 'left');
      }
    }
    context.fillStyle = PALETTE.panelEdge;
    roundRect(SELECT_ACHIEVEMENTS_RECT.x, SELECT_ACHIEVEMENTS_RECT.y, SELECT_ACHIEVEMENTS_RECT.w, SELECT_ACHIEVEMENTS_RECT.h, 8);
    context.fill();
    text('Achievements (' + unlockedCount(view.achievements) + '/' + ACHIEVEMENT_DEFS.length + ')', SELECT_ACHIEVEMENTS_RECT.x + SELECT_ACHIEVEMENTS_RECT.w / 2, SELECT_ACHIEVEMENTS_RECT.y + 26, 16, PALETTE.text, 'center');
    // The hint sits in its own pill well below the cards, so it can never
    // touch a card border or run off the bottom edge.
    context.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(380, 660, 520, 28, 8);
    context.fill();
    text('Click a faction card to play — or press 1-4', FIELD.width / 2, 679, 16, PALETTE.gold, 'center');
  }

  function drawAchievements(state, view) {
    context.fillStyle = 'rgba(10,14,8,0.85)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('ACHIEVEMENTS', FIELD.width / 2, 66, 44, PALETTE.gold, 'center');
    text(unlockedCount(view.achievements) + ' of ' + ACHIEVEMENT_DEFS.length + ' unlocked', FIELD.width / 2, 106, 18, PALETTE.text, 'center');
    let y = 140;
    for (const def of ACHIEVEMENT_DEFS) {
      const unlocked = view.achievements.unlocked[def.id];
      context.fillStyle = unlocked ? '#2c3a22' : '#1c2418';
      roundRect(240, y, 800, 50, 8);
      context.fill();
      context.strokeStyle = unlocked ? PALETTE.gold : '#3a4034';
      context.lineWidth = 1;
      context.stroke();
      text(unlocked ? '★' : '☆', 268, y + 34, 24, unlocked ? PALETTE.gold : PALETTE.muted, 'left');
      text(def.name, 306, y + 13, 18, unlocked ? PALETTE.text : PALETTE.muted, 'left');
      text(def.desc, 306, y + 34, 14, unlocked ? PALETTE.muted : '#6b725f', 'left');
      if (unlocked) text('Unlocked', 1010, y + 25, 14, PALETTE.gold, 'right');
      y += 58;
    }
    const wins = view.achievements.winsByFaction;
    text('Wins per faction — Human ' + wins.human + ' · Orc ' + wins.orc + ' · Devil ' + wins.demon + ' · Nature ' + wins.nature, FIELD.width / 2, y + 8, 15, PALETTE.muted, 'center');
    context.fillStyle = PALETTE.panelEdge;
    roundRect(ACHIEVEMENTS_BACK_RECT.x, ACHIEVEMENTS_BACK_RECT.y, ACHIEVEMENTS_BACK_RECT.w, ACHIEVEMENTS_BACK_RECT.h, 8);
    context.fill();
    text('Back', ACHIEVEMENTS_BACK_RECT.x + ACHIEVEMENTS_BACK_RECT.w / 2, ACHIEVEMENTS_BACK_RECT.y + 32, 18, PALETTE.text, 'center');
  }

  function drawOver(state, view) {
    drawField(state, view);
    context.fillStyle = 'rgba(10,14,8,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const won = view.result === 'win';
    text(won ? 'VICTORY!' : 'DEFEAT', FIELD.width / 2, 150, 56, won ? PALETTE.gold : '#ff5a4e', 'center');
    text(won ? 'Both enemy headquarters are destroyed. The Ember Throne is yours.' : 'Your headquarters is destroyed. The Ember Throne falls to the enemy.', FIELD.width / 2, 200, 18, PALETTE.text, 'center');
    const stats = state.stats;
    const lines = [
      'Time: ' + formatTime(state.time),
      'Units trained: ' + stats.trained,
      'Enemies defeated: ' + stats.kills,
      'Gold gathered: ' + Math.floor(stats.goldMined),
      'Your buildings lost: ' + stats.buildingsLost,
    ];
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, 250 + i * 28, 18, PALETTE.muted, 'center');
    }
    if (view.newUnlocks.length > 0) {
      text('New achievements:', FIELD.width / 2, 410, 18, PALETTE.gold, 'center');
      for (let i = 0; i < view.newUnlocks.length; i += 1) {
        const def = ACHIEVEMENT_DEFS.find((d) => d.id === view.newUnlocks[i]);
        if (def) text('★ ' + def.name, FIELD.width / 2, 438 + i * 24, 16, PALETTE.text, 'center');
      }
    }
    for (const key of ['again', 'menu', 'achievements']) {
      const rect = OVER_BUTTONS[key];
      context.fillStyle = PALETTE.panelEdge;
      roundRect(rect.x, rect.y, rect.w, rect.h, 8);
      context.fill();
    }
    text('Play Again (R)', OVER_BUTTONS.again.x + OVER_BUTTONS.again.w / 2, OVER_BUTTONS.again.y + 34, 18, PALETTE.text, 'center');
    text('Main Menu', OVER_BUTTONS.menu.x + OVER_BUTTONS.menu.w / 2, OVER_BUTTONS.menu.y + 34, 18, PALETTE.text, 'center');
    text('Achievements', OVER_BUTTONS.achievements.x + OVER_BUTTONS.achievements.w / 2, OVER_BUTTONS.achievements.y + 30, 16, PALETTE.text, 'center');
  }

  function drawPaused() {
    context.fillStyle = 'rgba(10,14,8,0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('PAUSED', FIELD.width / 2, 340, 56, PALETTE.text, 'center');
    text('Press Space or P to continue', FIELD.width / 2, 390, 20, PALETTE.muted, 'center');
  }

  /** Paint one frame: the field, the HUD, the panel, or a full screen. */
  function draw(state, view) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.textBaseline = 'alphabetic';
    if (view.screen === SCREEN_SELECT) {
      drawSelect(state, view);
      return;
    }
    if (view.screen === SCREEN_ACHIEVEMENTS) {
      drawAchievements(state, view);
      return;
    }
    drawField(state, view);
    drawHud(state, view);
    if (view.screen === SCREEN_PLAY) {
      drawPanel(state, view);
    } else if (view.screen === SCREEN_PAUSED) {
      drawPanel(state, view);
      drawPaused();
    } else if (view.screen === SCREEN_OVER) {
      drawOver(state, view);
    }
  }

  function factionAt(x, y) {
    for (let i = 0; i < FACTION_IDS.length; i += 1) {
      if (pointIn(cardRect(i), x, y)) return FACTION_IDS[i];
    }
    return null;
  }

  function overButtonAt(x, y) {
    for (const key of ['again', 'menu', 'achievements']) {
      if (pointIn(OVER_BUTTONS[key], x, y)) return key;
    }
    return null;
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw, toLogical, panelButtons, factionAt, overButtonAt,
    selectAchievementsAt(x, y) { return pointIn(SELECT_ACHIEVEMENTS_RECT, x, y); },
    achievementsBackAt(x, y) { return pointIn(ACHIEVEMENTS_BACK_RECT, x, y); },
  };
}
