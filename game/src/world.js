// The game's rules and state, with no drawing and no browser in it: the courier plane, the
// island mail route (sea, coastal city, mountain pass, plains and the home runway), the eight
// delivery rings, fuel, hull, score and combo. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react without the world knowing about screens or
// sound. Nothing here allocates after createWorld returns.
import { PLANE, ROUTE, SCORE, STEP } from './config.js';

export const EVENT_RING = 1;
export const EVENT_MISS = 2;
export const EVENT_HIT = 4;
export const EVENT_OVER = 8;
export const EVENT_LANDED = 16;
export const EVENT_FUEL_LOW = 32;

const TWO_PI = Math.PI * 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Which stretch of the island the route is over at distance z. */
export function zoneAt(z) {
  if (z < ROUTE.seaEnd) return 'sea';
  if (z < ROUTE.cityEnd) return 'city';
  if (z < ROUTE.mountainEnd) return 'mountains';
  return 'plains';
}

/** Where the sea meets the land at distance z; the sea is on the left (negative x). */
export function coastX(z) {
  if (z < ROUTE.seaEnd) return -80 + 50 * Math.sin(z * 0.003 + 1.2);
  if (z < ROUTE.cityEnd) return -220 + 30 * Math.sin(z * 0.002 + 0.4);
  return -420;
}

export function createWorld(random) {
  // The mountain ridge is four seeded sine waves summed and squared, so the same seed
  // always builds the same peaks.
  const ridge = [];
  for (let index = 0; index < 4; index += 1) {
    ridge.push({
      amp: 0.22 + random() * 0.2,
      freq: 0.008 + random() * 0.014,
      phase: random() * TWO_PI,
      drift: 0.0006 + random() * 0.0012,
    });
  }

  const rings = [];
  for (let index = 0; index < ROUTE.ringCount; index += 1) {
    rings.push({
      x: (random() * 2 - 1) * 130,
      z: 320 + index * 235,
      alt: 50 + random() * 75,
      radius: ROUTE.ringRadius,
      passed: false,
    });
  }

  const buildings = [];
  for (let index = 0; index < 46; index += 1) {
    const width = 14 + random() * 20;
    const depth = 14 + random() * 20;
    buildings.push({
      x: -170 + random() * 340,
      z: 520 + random() * 420,
      width,
      depth,
      height: 16 + random() * 32,
    });
  }

  const clouds = [];
  for (let index = 0; index < 16; index += 1) {
    clouds.push({
      x: -320 + random() * 640,
      z: 100 + random() * 2250,
      alt: 150 + random() * 80,
      scale: 30 + random() * 42,
    });
  }

  const plane = {
    x: PLANE.startX,
    z: PLANE.startZ,
    alt: PLANE.startAlt,
    heading: 0,
    speed: PLANE.startSpeed,
    throttle: PLANE.startThrottle,
    pitch: 0,
    bank: 0,
  };

  const state = {
    plane,
    rings,
    buildings,
    clouds,
    fuel: PLANE.fuelMax,
    hull: PLANE.hullMax,
    score: 0,
    combo: 0,
    ringIndex: 0,
    ringsCleared: 0,
    ringsMissed: 0,
    elapsed: 0,
    distance: 0,
    invulnerable: 0,
    turnSmooth: 0,
    rolling: false,
    over: false,
    overReason: '',
    landed: false,
    message: '',
    messageTimer: 0,
    fuelWarned: false,
  };

  /** Height of the ground (or a rooftop) under world point (x, z). */
  function terrainHeight(x, z) {
    const zone = zoneAt(z);
    if (zone === 'mountains') {
      const mask = smoothstep(950, 1060, z) * (1 - smoothstep(1400, 1500, z));
      let value = 0;
      for (let index = 0; index < ridge.length; index += 1) {
        const wave = ridge[index];
        value += wave.amp * (0.5 + 0.5 * Math.sin(wave.freq * x + wave.phase + wave.drift * z));
      }
      return Math.pow(value / 1.68, 1.5) * 110 * mask;
    }
    if (zone === 'city') {
      for (let index = 0; index < buildings.length; index += 1) {
        const b = buildings[index];
        if (x > b.x - b.width / 2 && x < b.x + b.width / 2 && z > b.z - b.depth / 2 && z < b.z + b.depth / 2) {
          return b.height;
        }
      }
      return 0;
    }
    if (zone === 'plains' && z > 1500 && z < 2100) {
      const hill = 0.5 + 0.5 * Math.sin(x * 0.01 + z * 0.004);
      return hill * hill * 6;
    }
    return 0;
  }

  function isWater(x, z) {
    return z < ROUTE.cityEnd && x < coastX(z);
  }

  function onRunway(x, z) {
    const r = ROUTE.runway;
    return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  }

  function nextRing() {
    return state.ringIndex < rings.length ? rings[state.ringIndex] : null;
  }

  function setMessage(text, seconds) {
    state.message = text;
    state.messageTimer = seconds;
  }

  function crash(reason) {
    if (state.over) return EVENT_OVER;
    state.over = true;
    state.overReason = reason;
    state.combo = 0;
    return EVENT_OVER;
  }

  function reset() {
    plane.x = PLANE.startX;
    plane.z = PLANE.startZ;
    plane.alt = PLANE.startAlt;
    plane.heading = 0;
    plane.speed = PLANE.startSpeed;
    plane.throttle = PLANE.startThrottle;
    plane.pitch = 0;
    plane.bank = 0;
    for (const ring of rings) ring.passed = false;
    state.fuel = PLANE.fuelMax;
    state.hull = PLANE.hullMax;
    state.score = 0;
    state.combo = 0;
    state.ringIndex = 0;
    state.ringsCleared = 0;
    state.ringsMissed = 0;
    state.elapsed = 0;
    state.distance = 0;
    state.invulnerable = 0;
    state.turnSmooth = 0;
    state.rolling = false;
    state.over = false;
    state.overReason = '';
    state.landed = false;
    state.message = '';
    state.messageTimer = 0;
    state.fuelWarned = false;
  }

  /**
   * One fixed step. `controls` carries turn (-1..1), pitch (-1..1) and throttleDelta (-1..1),
   * plus an optional mouse steer {turn, pitch} that blends in. With `harmless` set (the title
   * screen's backdrop) the plane flies itself in a gentle loop: nothing scores, nothing hurts.
   */
  function step(dt, controls, harmless) {
    if (state.over) return 0;
    let events = 0;
    state.elapsed += dt;
    if (state.messageTimer > 0) state.messageTimer = Math.max(0, state.messageTimer - dt);
    if (state.invulnerable > 0) state.invulnerable = Math.max(0, state.invulnerable - dt);

    const mouseTurn = controls.mouse ? controls.mouse.turn : 0;
    const mousePitch = controls.mouse ? controls.mouse.pitch : 0;
    const turn = clamp(controls.turn + mouseTurn * 0.8, -1, 1);
    const pitch = clamp(controls.pitch + mousePitch * 0.8, -1, 1);

    if (harmless) {
      // Attract mode: cruise the route in a lazy S, looping back to the sea when it ends.
      plane.heading = Math.sin(state.elapsed * 0.11) * 0.35;
      plane.alt = 80 + Math.sin(state.elapsed * 0.23) * 18;
      plane.speed = 62;
      plane.throttle = 0.6;
      plane.bank += (Math.sin(state.elapsed * 0.11 + 0.6) * 0.3 - plane.bank) * Math.min(1, dt * 3);
      plane.z += Math.cos(plane.heading) * plane.speed * dt;
      plane.x += Math.sin(plane.heading) * plane.speed * dt;
      if (plane.z > ROUTE.routeEnd) {
        plane.z = 0;
        plane.x = 0;
      }
      return 0;
    }

    // Throttle, speed and fuel.
    if (state.fuel > 0) {
      plane.throttle = clamp(plane.throttle + controls.throttleDelta * 0.55 * dt, 0, 1);
      state.fuel = Math.max(0, state.fuel - (PLANE.fuelBurn + plane.throttle * PLANE.fuelBurnThrottle) * dt);
      if (state.fuel <= 0) {
        plane.throttle = 0;
        if (!state.fuelWarned) {
          state.fuelWarned = true;
          setMessage('FUEL EMPTY — gliding', 3);
          events |= EVENT_FUEL_LOW;
        }
      }
    } else {
      plane.throttle = 0;
    }
    const targetSpeed = plane.throttle * PLANE.maxSpeed;
    if (targetSpeed > plane.speed) plane.speed = Math.min(targetSpeed, plane.speed + PLANE.accel * dt);
    else plane.speed = Math.max(0, plane.speed - PLANE.drag * dt);

    // Steering: turn rate grows with speed; the turn itself eases in over a quarter of a
    // second, so binary key taps steer instead of jerking the nose around.
    const speedFactor = 0.55 + 0.45 * (plane.speed / PLANE.maxSpeed);
    state.turnSmooth += (turn - state.turnSmooth) * Math.min(1, dt * 4);
    plane.heading += state.turnSmooth * PLANE.turnRate * speedFactor * dt;
    plane.bank += (state.turnSmooth * 0.55 - plane.bank) * Math.min(1, dt * 5);

    // Climb and sink: pitch authority needs airspeed; no fuel means a steady glide down.
    const climbAuthority = 0.4 + 0.6 * (plane.speed / PLANE.maxSpeed);
    let climb = pitch * PLANE.climbRate * climbAuthority;
    if (state.fuel <= 0) climb -= PLANE.sinkRate;
    if (plane.speed < PLANE.minSpeed && plane.alt > 2) climb -= PLANE.sinkRate * 0.6;
    plane.alt = clamp(plane.alt + climb * dt, 0, PLANE.maxAlt);
    plane.pitch = clamp(climb / PLANE.climbRate, -1, 1);

    const prevZ = plane.z;
    plane.z += Math.cos(plane.heading) * plane.speed * dt;
    plane.x += Math.sin(plane.heading) * plane.speed * dt;
    state.distance += plane.speed * dt;
    state.score += plane.speed * dt * SCORE.distancePerUnit;

    // Delivery rings: crossing a ring's plane scores by how close to its centre we pass.
    const ring = nextRing();
    if (ring !== null && prevZ < ring.z && plane.z >= ring.z) {
      const dx = plane.x - ring.x;
      const dy = plane.alt - ring.alt;
      const miss = Math.sqrt(dx * dx + dy * dy);
      ring.passed = true;
      state.ringIndex += 1;
      if (miss < ring.radius) {
        state.combo += 1;
        state.ringsCleared += 1;
        const points = SCORE.ringBase * state.combo;
        state.score += points;
        state.fuel = Math.min(PLANE.fuelMax, state.fuel + PLANE.ringFuel);
        setMessage(`RING ${state.ringsCleared} — +${points}  ·  COMBO x${state.combo}`, 2.2);
        events |= EVENT_RING;
      } else {
        state.ringsMissed += 1;
        state.combo = 0;
        setMessage('RING MISSED — combo lost', 2);
        events |= EVENT_MISS;
      }
    }

    // The home runway: touch down slow and straight and the mail run is complete. Once the
    // wheels are on the strip the plane straightens itself along it and brakes.
    if (onRunway(plane.x, plane.z) && plane.alt <= 3) {
      if (state.rolling || Math.abs(plane.heading) < 0.7) {
        state.rolling = true;
        plane.heading *= Math.max(0, 1 - dt * 3);
        plane.alt = 2;
        if (plane.speed <= PLANE.landingSpeed) {
          state.landed = true;
          state.over = true;
          state.overReason = 'landed';
          state.score += SCORE.landingBase + Math.round(state.fuel) * SCORE.fuelBonus + Math.round(state.hull) * SCORE.hullBonus;
          events |= EVENT_LANDED | EVENT_OVER;
          return events;
        }
        // Too fast to stop yet: brake hard along the strip.
        plane.speed = Math.max(0, plane.speed - 42 * dt);
        if (plane.speed <= PLANE.touchdownSpeed) {
          state.landed = true;
          state.over = true;
          state.overReason = 'landed';
          state.score += SCORE.landingBase + Math.round(state.fuel) * SCORE.fuelBonus + Math.round(state.hull) * SCORE.hullBonus;
          events |= EVENT_LANDED | EVENT_OVER;
          return events;
        }
        return events;
      }
      return crash('crashed');
    }

    // Ground and water: a fast hit ends the run; a slow scrape costs hull and bounces off.
    const ground = terrainHeight(plane.x, plane.z);
    if (plane.alt <= ground + 1.5 || (isWater(plane.x, plane.z) && plane.alt <= 1.5)) {
      if (isWater(plane.x, plane.z) && plane.alt <= 1.5) return crash('ditched');
      if (plane.speed > PLANE.scrapeSpeed) return crash('crashed');
      if (state.invulnerable === 0) {
        state.hull -= PLANE.scrapeDamage;
        plane.alt = ground + 6;
        plane.speed *= 0.5;
        state.invulnerable = PLANE.invulnerable;
        setMessage(state.hull > 0 ? `SCRAPED — hull ${Math.max(0, Math.round(state.hull))}%` : 'HULL GONE', 2);
        events |= EVENT_HIT;
        if (state.hull <= 0) return crash('crashed') | events;
      } else {
        plane.alt = ground + 2;
      }
    }

    // Ran past the end of the strip without landing: the run is over, mail undelivered.
    if (plane.z > ROUTE.runway.z1 + 30) {
      setMessage('FLEW PAST THE RUNWAY', 2);
      return crash('overshot') | events;
    }
    return events;
  }

  reset();
  return { state, reset, step, terrainHeight, zoneAt, coastX, nextRing, isWater, onRunway };
}
