// Keyboard and pointer input for the RTS. One-shot presses (start, pause,
// restart, build, train, attack-move, hold, ability, cancel, digits) are
// queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. Pointer positions are kept
// in logical 1280x720 coordinates through the `toLogical` the renderer
// supplies. Left drag box-selects; a left click without a drag selects one
// thing; a right click orders the selection.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_BUILD = 8;
export const ACTION_TRAIN = 16;
export const ACTION_ATTACK = 32;
export const ACTION_HOLD = 64;
export const ACTION_ABILITY = 128;
export const ACTION_CANCEL = 256;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP']);
const RESTART = new Set(['KeyR']);
const DIGITS = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4 };

export function createInput(target, toLogical) {
  let actions = 0;
  let digit = 0;
  const pointer = {
    x: 0, y: 0, down: false, pressed: false, released: false,
    dragStartX: 0, dragStartY: 0, dragged: false,
    rightPressed: false, rightX: 0, rightY: 0,
  };

  function logical(event) {
    return toLogical(event.clientX, event.clientY);
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (event.code === 'Escape') actions |= ACTION_CANCEL | ACTION_PAUSE;
    else if (RESTART.has(event.code)) actions |= ACTION_RESTART;
    else if (event.code === 'KeyB') actions |= ACTION_BUILD;
    else if (event.code === 'KeyT') actions |= ACTION_TRAIN;
    else if (event.code === 'KeyA') actions |= ACTION_ATTACK;
    else if (event.code === 'KeyH') actions |= ACTION_HOLD;
    else if (event.code === 'KeyQ') actions |= ACTION_ABILITY;
    else if (DIGITS[event.code]) digit = DIGITS[event.code];
    else return;
    event.preventDefault();
  });

  target.addEventListener('contextmenu', (event) => event.preventDefault());

  target.addEventListener('pointerdown', (event) => {
    const point = logical(event);
    if (event.button === 2) {
      pointer.rightPressed = true;
      pointer.rightX = point.x;
      pointer.rightY = point.y;
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.dragStartX = point.x;
    pointer.dragStartY = point.y;
    pointer.down = true;
    pointer.pressed = true;
    pointer.dragged = false;
    event.preventDefault();
  });
  target.addEventListener('pointermove', (event) => {
    const point = logical(event);
    pointer.x = point.x;
    pointer.y = point.y;
    if (pointer.down && Math.hypot(point.x - pointer.dragStartX, point.y - pointer.dragStartY) > 6) {
      pointer.dragged = true;
    }
  });
  target.addEventListener('pointerup', (event) => {
    if (event.button !== 0) return;
    const point = logical(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.down = false;
    pointer.released = true;
  });
  target.addEventListener('pointercancel', () => {
    pointer.down = false;
    pointer.released = true;
  });
  window.addEventListener('blur', () => {
    pointer.down = false;
    pointer.released = true;
  });

  return {
    pointer,
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last digit key (1-4) pressed since the last call, or 0. */
    takeDigit() {
      const taken = digit;
      digit = 0;
      return taken;
    },
    /** Consume the pointer's pressed/released edges since the last call. */
    takePointerEdges() {
      const edges = { pressed: pointer.pressed, released: pointer.released };
      pointer.pressed = false;
      pointer.released = false;
      return edges;
    },
    /** Consume a right-click order since the last call, or null. */
    takeRightClick() {
      if (!pointer.rightPressed) return null;
      pointer.rightPressed = false;
      return { x: pointer.rightX, y: pointer.rightY };
    },
  };
}
