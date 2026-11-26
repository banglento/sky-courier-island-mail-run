// Keyboard and pointer input. Held keys give steering, pitch and throttle; one-shot presses
// (start or restart, pause) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. A mouse press-and-hold steers toward
// the pointer: left/right of centre turns, above/below centre climbs or descends.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CLIMB = new Set(['ArrowUp', 'KeyR']);
const DESCEND = new Set(['ArrowDown', 'KeyF']);
const THROTTLE_UP = new Set(['KeyW']);
const THROTTLE_DOWN = new Set(['KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  let left = false;
  let right = false;
  let climb = false;
  let descend = false;
  let throttleUp = false;
  let throttleDown = false;
  let actions = 0;
  // Pointer steer target, normalised -1..1 from the canvas centre, or null when not steering.
  let mouse = null;

  function pointerSteer(event) {
    const rect = target.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    mouse = { turn: Math.max(-1, Math.min(1, nx * 1.4)), pitch: Math.max(-1, Math.min(1, -ny * 1.4)) };
  }

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CLIMB.has(event.code)) climb = true;
    else if (DESCEND.has(event.code)) descend = true;
    else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (CLIMB.has(event.code)) climb = false;
    else if (DESCEND.has(event.code)) descend = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    climb = false;
    descend = false;
    throttleUp = false;
    throttleDown = false;
    mouse = null;
  });
  target.addEventListener('pointerdown', (event) => {
    actions |= ACTION_CONFIRM;
    pointerSteer(event);
  });
  target.addEventListener('pointermove', (event) => {
    if (mouse !== null) pointerSteer(event);
  });
  target.addEventListener('pointerup', () => {
    mouse = null;
  });
  target.addEventListener('pointercancel', () => {
    mouse = null;
  });

  return {
    /** The held controls for this frame: turn, pitch, throttleDelta and the mouse steer. */
    controls() {
      return {
        turn: (right ? 1 : 0) - (left ? 1 : 0),
        pitch: (climb ? 1 : 0) - (descend ? 1 : 0),
        throttleDelta: (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0),
        mouse,
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
