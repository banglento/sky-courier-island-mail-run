// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. A pseudo-3D chase view: the camera sits behind the courier plane and looks down
// the mail route, so the sea, the coastal city, the mountain pass and the home runway scroll
// past under a lit HUD. Text that holds a number is rebuilt only when the number changes, so
// a frame allocates almost nothing.
import { FIELD, FONT, PALETTE, ROUTE, VIEW } from './config.js';
import { zoneAt } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };
const PLANE_SCREEN = { x: 640, y: 472 };

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mixHex(a, b, t) {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)},${Math.round(ca[1] + (cb[1] - ca[1]) * t)},${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`;
}

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

function hash01(value) {
  const s = Math.sin(value * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cam = { x: 0, y: 0, z: 0 };
  let cosH = 1;
  let sinH = 0;

  const altLabel = cachedLabel('ALT ');
  const spdLabel = cachedLabel('SPD ');
  const hdgLabel = cachedLabel('HDG ');
  const scoreLabel = cachedLabel('SCORE ');
  const finalLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');
  const ringLabel = cachedLabel('RING ');
  const comboLabel = cachedLabel('COMBO x');

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

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Project a world point into the playfield; null when it is behind the camera. */
  function project(x, y, z) {
    const rx = x - cam.x;
    const ry = y - cam.y;
    const rz = z - cam.z;
    const cx = rx * cosH - rz * sinH;
    const cz = rx * sinH + rz * cosH;
    if (cz < 2) return null;
    const s = VIEW.focal / cz;
    return { x: FIELD.width / 2 + cx * s, y: VIEW.horizonY - ry * s, s };
  }

  /** Screen y of the ground plane at a distance dz straight ahead of the camera. */
  function groundY(dz) {
    return VIEW.horizonY + (cam.y * VIEW.focal) / dz;
  }

  function updateCamera(state) {
    const plane = state.plane;
    cam.x = plane.x - Math.sin(plane.heading) * VIEW.camBehind;
    cam.z = plane.z - Math.cos(plane.heading) * VIEW.camBehind;
    cam.y = plane.alt + VIEW.camAbove;
    cosH = Math.cos(plane.heading);
    sinH = Math.sin(plane.heading);
  }

  function drawSky() {
    const gradient = context.createLinearGradient(0, 0, 0, VIEW.horizonY + 40);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.horizon);
    context.fillStyle = gradient;
    // Painted to the bottom of the field: the farthest ground band starts below the
    // horizon, and the gradient's horizon colour fills the haze gap between the two.
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Low sun, late-afternoon mail run.
    context.fillStyle = PALETTE.sun;
    context.beginPath();
    context.arc(1020, 168, 46, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.sunCore;
    context.beginPath();
    context.arc(1020, 168, 30, 0, Math.PI * 2);
    context.fill();
  }

  function drawRidges(world) {
    const layers = [
      { dz: 560, color: mixHex(PALETTE.rock, PALETTE.horizon, 0.55) },
      { dz: 330, color: mixHex(PALETTE.rockDark, PALETTE.horizon, 0.3) },
    ];
    for (const layer of layers) {
      const zR = cam.z + layer.dz;
      const tops = [];
      let maxH = 0;
      for (let x = -640; x <= 640; x += 32) {
        const wx = cam.x + x;
        const h = world.terrainHeight(wx, zR);
        if (h > maxH) maxH = h;
        const p = project(wx, h, zR);
        tops.push(p === null ? { x: FIELD.width / 2 + x, y: VIEW.horizonY } : p);
      }
      if (maxH < 10) continue;
      context.fillStyle = layer.color;
      context.beginPath();
      context.moveTo(tops[0].x, VIEW.horizonY + 2);
      for (const p of tops) context.lineTo(p.x, p.y);
      context.lineTo(tops[tops.length - 1].x, VIEW.horizonY + 2);
      context.closePath();
      context.fill();
      // Snow on the high tops.
      for (let index = 0; index < tops.length; index += 1) {
        const wx = cam.x - 640 + index * 32;
        const h = world.terrainHeight(wx, zR);
        if (h > 62) {
          const p = tops[index];
          context.fillStyle = PALETTE.snow;
          context.beginPath();
          context.moveTo(p.x - 14, p.y + 10);
          context.lineTo(p.x, p.y - 2);
          context.lineTo(p.x + 14, p.y + 10);
          context.closePath();
          context.fill();
        }
      }
    }
  }

  function groundColor(zone, zMid) {
    if (zone === 'sea') return PALETTE.land;
    if (zone === 'city') return PALETTE.city;
    if (zone === 'mountains') return Math.floor(zMid / 70) % 2 === 0 ? PALETTE.rock : PALETTE.landDark;
    return Math.floor(zMid / 90) % 2 === 0 ? PALETTE.fieldA : PALETTE.fieldB;
  }

  function drawGround(world) {
    const dzs = [];
    for (let d = VIEW.drawDistance; d > 2.5; d *= 0.86) dzs.push(d);
    dzs.push(2.5);
    for (let index = 0; index < dzs.length - 1; index += 1) {
      const dzFar = dzs[index];
      const dzNear = dzs[index + 1];
      const yTop = groundY(dzFar);
      const yBot = Math.min(groundY(dzNear), FIELD.height);
      if (yTop >= FIELD.height || yBot <= yTop) continue;
      const zMid = cam.z + (dzFar + dzNear) / 2;
      const zone = zoneAt(zMid);
      const fog = clamp((dzFar - 90) / 520, 0, 0.55);
      const base = mixHex(groundColor(zone, zMid), PALETTE.horizon, fog);
      const height = yBot - yTop + 1;
      if (zMid < ROUTE.cityEnd) {
        // Sea on the left of the coastline, land on the right.
        const coast = project(world.coastX(zMid), 0, zMid);
        const sea = mixHex(PALETTE.sea, PALETTE.horizon, fog);
        if (coast !== null && coast.x > 0 && coast.x < FIELD.width) {
          context.fillStyle = sea;
          context.fillRect(0, yTop, coast.x, height);
          context.fillStyle = base;
          context.fillRect(coast.x, yTop, FIELD.width - coast.x, height);
        } else if (coast === null || coast.x <= 0) {
          context.fillStyle = base;
          context.fillRect(0, yTop, FIELD.width, height);
        } else {
          context.fillStyle = sea;
          context.fillRect(0, yTop, FIELD.width, height);
        }
      } else {
        context.fillStyle = base;
        context.fillRect(0, yTop, FIELD.width, height);
      }
      // Ground streaks: cheap speed cue, seeded by the slice so they never shimmer.
      if (height > 3) {
        context.fillStyle = 'rgba(0, 0, 0, 0.22)';
        const h1 = hash01(zMid);
        const h2 = hash01(zMid * 1.7 + 5);
        context.fillRect(h1 * FIELD.width, yTop + height * 0.4, 26 + h2 * 40, 2);
        context.fillRect(((h1 * 0.61 + 0.5) % 1) * FIELD.width, yTop + height * 0.7, 18 + h1 * 30, 2);
      }
    }
  }

  function drawRunway() {
    const r = ROUTE.runway;
    if (cam.z > r.z1 || cam.z + VIEW.drawDistance < r.z0) return;
    const a = project(r.x0, 0.4, r.z0);
    const b = project(r.x1, 0.4, r.z0);
    const c = project(r.x1, 0.4, r.z1);
    const d = project(r.x0, 0.4, r.z1);
    if (a === null || b === null || c === null || d === null) return;
    context.fillStyle = PALETTE.runway;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.lineTo(c.x, c.y);
    context.lineTo(d.x, d.y);
    context.closePath();
    context.fill();
    // Centreline dashes and threshold bars.
    context.fillStyle = PALETTE.runwayLine;
    for (let z = r.z0 + 12; z < r.z1 - 8; z += 22) {
      const p0 = project(-1.6, 0.6, z);
      const p1 = project(1.6, 0.6, z);
      const p2 = project(1.6, 0.6, z + 11);
      const p3 = project(-1.6, 0.6, z + 11);
      if (p0 === null || p1 === null || p2 === null || p3 === null) continue;
      context.beginPath();
      context.moveTo(p0.x, p0.y);
      context.lineTo(p1.x, p1.y);
      context.lineTo(p2.x, p2.y);
      context.lineTo(p3.x, p3.y);
      context.closePath();
      context.fill();
    }
    for (const side of [-1, 1]) {
      const t0 = project(side * 20, 0.6, r.z0 + 4);
      const t1 = project(side * 8, 0.6, r.z0 + 4);
      const t2 = project(side * 8, 0.6, r.z0 + 12);
      const t3 = project(side * 20, 0.6, r.z0 + 12);
      if (t0 === null || t1 === null || t2 === null || t3 === null) continue;
      context.beginPath();
      context.moveTo(t0.x, t0.y);
      context.lineTo(t1.x, t1.y);
      context.lineTo(t2.x, t2.y);
      context.lineTo(t3.x, t3.y);
      context.closePath();
      context.fill();
    }
    // Edge lights.
    context.fillStyle = PALETTE.amber;
    for (let z = r.z0; z <= r.z1; z += 40) {
      for (const x of [r.x0, r.x1]) {
        const p = project(x, 0.8, z);
        if (p === null) continue;
        context.beginPath();
        context.arc(p.x, p.y, Math.max(1.5, 3 * p.s), 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawBuildings(state) {
    const sorted = state.buildings.slice().sort((a, b) => b.z - a.z);
    for (const b of sorted) {
      const near = b.z - b.depth / 2;
      const far = b.z + b.depth / 2;
      if (far - cam.z < 4 || near - cam.z > VIEW.drawDistance) continue;
      const x0 = b.x - b.width / 2;
      const x1 = b.x + b.width / 2;
      const a = project(x0, 0, near);
      const bb = project(x1, 0, near);
      const c = project(x1, b.height, near);
      const d = project(x0, b.height, near);
      const c2 = project(x1, b.height, far);
      const d2 = project(x0, b.height, far);
      const b2 = project(x1, 0, far);
      const a2 = project(x0, 0, far);
      if (a === null || bb === null || c === null || d === null) continue;
      const shade = 0.85 + hash01(b.z) * 0.3;
      // Near face.
      context.fillStyle = mixHex(PALETTE.cityDark, '#000000', 1 - shade);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(bb.x, bb.y);
      context.lineTo(c.x, c.y);
      context.lineTo(d.x, d.y);
      context.closePath();
      context.fill();
      // Top face.
      if (c2 !== null && d2 !== null) {
        context.fillStyle = PALETTE.city;
        context.beginPath();
        context.moveTo(c.x, c.y);
        context.lineTo(c2.x, c2.y);
        context.lineTo(d2.x, d2.y);
        context.lineTo(d.x, d.y);
        context.closePath();
        context.fill();
      }
      // The side facing the camera's lateral offset.
      if (b.x > cam.x && bb !== null && b2 !== null && c2 !== null) {
        context.fillStyle = mixHex(PALETTE.cityDark, '#000000', 0.25);
        context.beginPath();
        context.moveTo(bb.x, bb.y);
        context.lineTo(b2.x, b2.y);
        context.lineTo(c2.x, c2.y);
        context.lineTo(c.x, c.y);
        context.closePath();
        context.fill();
      } else if (a2 !== null && d2 !== null) {
        context.fillStyle = mixHex(PALETTE.cityDark, '#000000', 0.25);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(a2.x, a2.y);
        context.lineTo(d2.x, d2.y);
        context.lineTo(d.x, d.y);
        context.closePath();
        context.fill();
      }
      // Lit windows on the near face when close.
      if (near - cam.z < 220) {
        context.fillStyle = 'rgba(255, 214, 130, 0.85)';
        for (let row = 0; row < 3; row += 1) {
          for (let col = 0; col < 4; col += 1) {
            if (hash01(b.z * 3 + row * 7 + col) < 0.45) continue;
            const u = 0.16 + col * 0.22;
            const v = 0.2 + row * 0.26;
            const px = a.x + (bb.x - a.x) * u;
            const py = a.y + (d.y - a.y) * v;
            context.fillRect(px, py, Math.max(2, 3 * c.s), Math.max(2, 4 * c.s));
          }
        }
      }
    }
  }

  function drawClouds(state) {
    for (const cloud of state.clouds) {
      const p = project(cloud.x, cloud.alt, cloud.z);
      if (p === null || p.y < -80 || p.y > FIELD.height + 40) continue;
      const radius = cloud.scale * p.s;
      if (radius < 2) continue;
      context.fillStyle = PALETTE.cloud;
      context.globalAlpha = clamp(1.15 - (cloud.z - cam.z) / VIEW.drawDistance, 0.25, 0.95);
      // One fill per puff: ellipses joined in a single path cancel where they cross.
      for (const puff of [
        [0, 0, 1, 0.36],
        [-0.7, 0.08, 0.6, 0.28],
        [0.7, 0.06, 0.62, 0.3],
      ]) {
        context.beginPath();
        context.ellipse(p.x + puff[0] * radius, p.y + puff[1] * radius, puff[2] * radius, puff[3] * radius, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    }
  }

  function drawRings(state) {
    for (let index = 0; index < state.rings.length; index += 1) {
      const ring = state.rings[index];
      if (ring.passed) continue;
      const p = project(ring.x, ring.alt, ring.z);
      if (p === null) continue;
      const radius = ring.radius * p.s;
      if (radius < 1.5) continue;
      const isNext = index === state.ringIndex;
      const color = isNext ? PALETTE.ringNext : PALETTE.ringLater;
      // Tether line down to the ground, for depth.
      const ground = project(ring.x, 0, ring.z);
      if (ground !== null) {
        context.strokeStyle = color;
        context.globalAlpha = 0.25;
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(p.x, p.y + radius);
        context.lineTo(ground.x, ground.y);
        context.stroke();
        context.globalAlpha = 1;
      }
      context.fillStyle = color;
      context.globalAlpha = 0.1;
      context.beginPath();
      context.arc(p.x, p.y, radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = color;
      context.lineWidth = Math.max(2, radius * 0.11);
      context.beginPath();
      context.arc(p.x, p.y, radius, 0, Math.PI * 2);
      context.stroke();
      if (isNext) {
        context.globalAlpha = 0.55 + 0.35 * Math.sin(state.elapsed * 5);
        context.lineWidth = 2;
        context.beginPath();
        context.arc(p.x, p.y, radius * 1.18, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 1;
      }
      if (ring.z - cam.z < 260) {
        text(`RING ${index + 1}`, p.x, p.y - radius - 12, 16, color, 'center', 'alphabetic');
      }
    }
  }

  function drawPlane(state) {
    const plane = state.plane;
    // Ground shadow: a stylised ellipse that grows and darkens as the plane comes down.
    const shadowScale = clamp(1 - plane.alt / 420, 0.25, 1);
    context.fillStyle = `rgba(0, 0, 0, ${0.34 * shadowScale})`;
    context.beginPath();
    context.ellipse(
      PLANE_SCREEN.x + plane.bank * 46,
      648 - plane.alt * 0.62,
      66 * shadowScale,
      12 * shadowScale,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();

    // Blink while invulnerable after a scrape: hidden on every other tenth of a second.
    if (state.invulnerable > 0 && Math.floor(state.invulnerable * 10) % 2 === 0) return;
    context.save();
    context.translate(PLANE_SCREEN.x, PLANE_SCREEN.y - plane.pitch * 16);
    context.rotate(plane.bank);
    const stretch = 1 + plane.pitch * 0.04;
    context.scale(1, stretch);
    // Wings.
    context.fillStyle = PALETTE.planeBody;
    context.strokeStyle = PALETTE.planeTrim;
    context.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(side * 6, -14);
      context.lineTo(side * 104, 26);
      context.lineTo(side * 104, 40);
      context.lineTo(side * 8, 16);
      context.closePath();
      context.fill();
      context.stroke();
    }
    // Tailplane.
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(side * 4, 44);
      context.lineTo(side * 46, 62);
      context.lineTo(side * 46, 70);
      context.lineTo(side * 4, 56);
      context.closePath();
      context.fill();
      context.stroke();
    }
    // Fuselage: nose up (away), tail down (toward the camera).
    context.beginPath();
    context.moveTo(0, -96);
    context.quadraticCurveTo(17, -42, 15, 30);
    context.quadraticCurveTo(14, 58, 0, 64);
    context.quadraticCurveTo(-14, 58, -15, 30);
    context.quadraticCurveTo(-17, -42, 0, -96);
    context.closePath();
    context.fill();
    context.stroke();
    // Trim stripe down the fuselage.
    context.strokeStyle = PALETTE.planeTrim;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(0, -84);
    context.lineTo(0, 56);
    context.stroke();
    // Cockpit glass.
    context.fillStyle = PALETTE.planeGlass;
    context.beginPath();
    context.ellipse(0, -58, 9, 18, 0, 0, Math.PI * 2);
    context.fill();
    // Tail fin.
    context.fillStyle = PALETTE.planeTrim;
    context.beginPath();
    context.moveTo(0, 62);
    context.lineTo(-9, 82);
    context.lineTo(9, 82);
    context.closePath();
    context.fill();
    // Spinning prop at the nose.
    const spin = state.elapsed * 28;
    context.strokeStyle = 'rgba(40, 40, 46, 0.55)';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(-Math.sin(spin) * 24, -96 - Math.cos(spin) * 5);
    context.lineTo(Math.sin(spin) * 24, -96 + Math.cos(spin) * 5);
    context.stroke();
    context.fillStyle = 'rgba(255, 255, 255, 0.28)';
    context.beginPath();
    context.ellipse(0, -96, 26, 6, 0, 0, Math.PI * 2);
    context.fill();
    // Engine glow with the throttle.
    if (plane.throttle > 0.08) {
      context.fillStyle = `rgba(255, 176, 46, ${0.35 + plane.throttle * 0.5})`;
      for (const side of [-1, 1]) {
        context.beginPath();
        context.arc(side * 11, 58, 4 + plane.throttle * 3, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  function bar(x, y, width, height, fraction, color, bg) {
    context.fillStyle = bg || 'rgba(255, 255, 255, 0.14)';
    context.fillRect(x, y, width, height);
    context.fillStyle = color;
    context.fillRect(x, y, width * clamp(fraction, 0, 1), height);
  }

  function drawHud(state) {
    const plane = state.plane;
    const altFt = Math.round(plane.alt * 32);
    const spdKt = Math.round(plane.speed * 2.2);
    const hdg = Math.round((((plane.heading * 180) / Math.PI) % 360 + 360) % 360);
    const next = state.ringIndex < state.rings.length ? state.rings[state.ringIndex] : null;
    const ringDist = next === null ? 0 : Math.max(0, Math.round((next.z - plane.z) * 3.2));

    // Left instrument panel: altitude, speed, heading, throttle, fuel, hull.
    context.fillStyle = PALETTE.panel;
    context.fillRect(16, 16, 296, 148);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1;
    context.strokeRect(16.5, 16.5, 296, 148);
    text(altLabel(altFt) + ' FT', 30, 26, 26, PALETTE.lit, 'left', 'top');
    text(spdLabel(spdKt) + ' KT', 30, 58, 26, PALETTE.lit, 'left', 'top');
    text(hdgLabel(String(hdg).padStart(3, '0')) + '°', 30, 90, 26, PALETTE.lit, 'left', 'top');
    text('THR', 178, 28, 15, PALETTE.muted, 'left', 'top');
    bar(178, 48, 118, 10, plane.throttle, PALETTE.amber);
    text('FUEL', 178, 64, 15, state.fuel < 20 ? PALETTE.red : PALETTE.muted, 'left', 'top');
    bar(178, 84, 118, 10, state.fuel / 100, state.fuel < 20 ? PALETTE.red : PALETTE.lit);
    text('HULL', 178, 100, 15, PALETTE.muted, 'left', 'top');
    bar(178, 120, 118, 10, state.hull / 100, state.hull < 35 ? PALETTE.red : PALETTE.lit);
    if (state.fuel < 20 && Math.floor(state.elapsed * 2) % 2 === 0) {
      text('LOW FUEL', 178, 136, 15, PALETTE.red, 'left', 'top');
    }

    // Right panel: score, combo, next ring.
    context.fillStyle = PALETTE.panel;
    context.fillRect(FIELD.width - 312, 16, 296, 116);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(FIELD.width - 311.5, 16.5, 296, 116);
    text(scoreLabel(Math.round(state.score)), FIELD.width - 30, 26, 26, PALETTE.text, 'right', 'top');
    text(comboLabel(state.combo), FIELD.width - 30, 60, 20, state.combo > 1 ? PALETTE.amber : PALETTE.muted, 'right', 'top');
    text(
      next === null ? 'ALL RINGS DONE — LAND IT' : `${ringLabel(state.ringIndex + 1)}/8 · ${ringDist} m`,
      FIELD.width - 30,
      90,
      20,
      PALETTE.lit,
      'right',
      'top',
    );

    // Route progress: rings as ticks, runway flag at the end, plane marker on top.
    const barX = 400;
    const barW = 480;
    const barY = 30;
    context.fillStyle = PALETTE.panel;
    context.fillRect(barX - 12, barY - 10, barW + 24, 30);
    context.fillStyle = 'rgba(255, 255, 255, 0.2)';
    context.fillRect(barX, barY + 4, barW, 3);
    for (let index = 0; index < state.rings.length; index += 1) {
      const rx = barX + (state.rings[index].z / ROUTE.routeEnd) * barW;
      context.fillStyle = state.rings[index].passed ? PALETTE.ringDone : PALETTE.ringLater;
      context.beginPath();
      context.arc(rx, barY + 5, 5, 0, Math.PI * 2);
      context.fill();
    }
    const runwayX = barX + (ROUTE.runway.z0 / ROUTE.routeEnd) * barW;
    context.fillStyle = PALETTE.amber;
    context.fillRect(runwayX, barY - 2, 10, 16);
    text('RWY', runwayX + 5, barY + 22, 12, PALETTE.amber, 'center');
    const px = barX + clamp(plane.z / ROUTE.routeEnd, 0, 1) * barW;
    context.fillStyle = PALETTE.text;
    context.beginPath();
    context.moveTo(px, barY - 8);
    context.lineTo(px - 6, barY - 18);
    context.lineTo(px + 6, barY - 18);
    context.closePath();
    context.fill();

    // Attitude indicator, bottom right: the horizon tilts with the bank.
    const ax = 1196;
    const ay = 632;
    const ar = 44;
    context.save();
    context.beginPath();
    context.arc(ax, ay, ar, 0, Math.PI * 2);
    context.clip();
    context.translate(ax, ay);
    context.rotate(-plane.bank);
    context.translate(0, plane.pitch * 18);
    context.fillStyle = '#2f6db3';
    context.fillRect(-ar, -ar, ar * 2, ar);
    context.fillStyle = '#7a5a34';
    context.fillRect(-ar, 0, ar * 2, ar);
    context.restore();
    context.strokeStyle = PALETTE.text;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(ax, ay, ar, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = PALETTE.amber;
    context.beginPath();
    context.moveTo(ax - 22, ay);
    context.lineTo(ax + 22, ay);
    context.moveTo(ax, ay - 6);
    context.lineTo(ax, ay + 6);
    context.stroke();
    text('ATT', ax, ay + ar + 16, 12, PALETTE.muted, 'center');

    // Controls hint, bottom left.
    text('W/S throttle · ←/→ turn · ↑/↓ climb · hold mouse to steer · P pause', 16, FIELD.height - 18, 15, PALETTE.muted, 'left');

    // Centre flash message.
    if (state.messageTimer > 0 && state.message !== '') {
      context.save();
      context.globalAlpha = clamp(state.messageTimer, 0, 1);
      context.shadowColor = PALETTE.amber;
      context.shadowBlur = 18;
      text(state.message, FIELD.width / 2, 210, 30, PALETTE.amber, 'center', 'alphabetic');
      context.restore();
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(6, 10, 18, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.amber, 'center');
  }

  const TITLE_LINES = [
    'Fly the island mail run: sea, city, mountains — then land it.',
    'Thread 8 delivery rings. Mind your fuel and the rocks.',
    'W/S throttle · ←/→ turn · ↑/↓ climb · hold mouse to steer.',
    '',
  ];
  const PAUSED_LINES = ['The mail will wait for you.'];
  const OVER_LINES = ['', '', ''];

  function overTitle(reason) {
    if (reason === 'landed') return 'MAIL DELIVERED!';
    if (reason === 'ditched') return 'DITCHED IN THE SEA';
    if (reason === 'overshot') return 'FLEW PAST THE RUNWAY';
    return 'CRASHED';
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(world, screen, best) {
    const state = world.state;
    updateCamera(state);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSky();
    drawRidges(world);
    drawGround(world);
    drawRunway();
    drawBuildings(state);
    drawClouds(state);
    drawRings(state);
    drawPlane(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[3] = bestLabel(best);
      drawPanel('SKY COURIER', TITLE_LINES, 'Press Space or click to fly');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(Math.round(state.score));
      OVER_LINES[1] = `Rings ${state.ringsCleared} of ${state.rings.length} · ${Math.round(state.distance * 3.2)} m flown`;
      OVER_LINES[2] = bestLabel(best);
      drawPanel(overTitle(state.overReason), OVER_LINES, 'Press Space or click to fly again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
