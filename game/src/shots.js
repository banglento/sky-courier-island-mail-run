// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward
// from a fresh world for a fixed number of steps, steered by a simple autopilot (aim at the
// next delivery ring, or at the runway once the rings are done), so the frame is what a short
// game really looks like and the same seed always gives the same frame. The end scene's pilot
// flies straight and level on full throttle, as a hurried player does — and the mountain pass
// catches it.
import { ROUTE, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 600;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function headingError(desired, heading) {
  let error = desired - heading;
  while (error > Math.PI) error -= Math.PI * 2;
  while (error < -Math.PI) error += Math.PI * 2;
  return error;
}

/** Steer toward a point in the sky: turn onto it, climb or descend to its altitude. */
function steerTo(state, targetX, targetZ, targetAlt) {
  const plane = state.plane;
  const desired = Math.atan2(targetX - plane.x, targetZ - plane.z);
  const turn = clamp(headingError(desired, plane.heading) * 1.8, -1, 1);
  const pitch = clamp((targetAlt - plane.alt) * 0.03, -1, 1);
  const throttleDelta = plane.speed < 68 ? 1 : plane.speed > 80 ? -1 : 0;
  return { turn, pitch, throttleDelta, mouse: null };
}

/** The play scene's pilot: ring to ring, then down the runway centreline. */
function playPilot(world) {
  const state = world.state;
  const ring = world.nextRing();
  if (ring !== null) return steerTo(state, ring.x, ring.z, ring.alt);
  // Rings done: line up on the runway and come down slow.
  const plane = state.plane;
  const runway = ROUTE.runway;
  const distToStrip = runway.z0 - plane.z;
  const targetAlt = distToStrip > 300 ? 60 : Math.max(2, distToStrip * 0.12);
  const controls = steerTo(state, 0, runway.z0 + 100, targetAlt);
  controls.throttleDelta = plane.speed > 58 ? -1 : plane.speed < 50 ? 1 : 0;
  return controls;
}

/** The end scene's pilot: it chases the rings but never climbs above the rooftops — fast,
 * low and blind, as a hurried player flies — so the city or the mountain pass catches it. */
function endPilot(world) {
  const state = world.state;
  const ring = world.nextRing();
  const target = ring !== null ? ring : { x: 0, z: ROUTE.runway.z0 + 100, alt: 2 };
  const controls = steerTo(state, target.x, target.z, Math.min(target.alt, 42));
  controls.throttleDelta = 1;
  return controls;
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { turn: 0, pitch: 0, throttleDelta: 0, mouse: null }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  const pilot = name === 'end' ? () => endPilot(world) : () => playPilot(world);
  for (let index = 0; index < limit / STEP; index += 1) {
    if (world.step(STEP, pilot(), false) & EVENT_OVER) break;
  }
  const over = world.state.over;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: Math.round(world.state.score) };
}
