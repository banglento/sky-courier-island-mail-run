// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// Sky Courier: a courier plane flies the island mail run — sea, coastal city, mountain pass,
// then plains and the home runway — through eight delivery rings.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'sky-courier.best';

/** The route: zones along +z, the eight rings, and the home runway at its end. */
export const ROUTE = {
  seaEnd: 350,
  cityEnd: 950,
  mountainEnd: 1500,
  routeEnd: 2400,
  runway: { x0: -25, x1: 25, z0: 2200, z1: 2400 },
  ringCount: 8,
  ringRadius: 26,
};

export const PLANE = {
  startX: 0,
  startZ: 0,
  startAlt: 70,
  startSpeed: 42,
  startThrottle: 0.55,
  maxSpeed: 92,
  minSpeed: 18,
  accel: 26,
  drag: 10,
  turnRate: 0.85,
  climbRate: 30,
  sinkRate: 9,
  maxAlt: 260,
  fuelMax: 100,
  fuelBurn: 0.55,
  fuelBurnThrottle: 1.05,
  ringFuel: 9,
  hullMax: 100,
  scrapeDamage: 34,
  scrapeSpeed: 90,
  invulnerable: 1.6,
  landingSpeed: 60,
  touchdownSpeed: 25,
};

export const SCORE = {
  ringBase: 100,
  distancePerUnit: 0.05,
  landingBase: 500,
  fuelBonus: 5,
  hullBonus: 2,
};

/** How far ahead the renderer draws, and the camera's focal length in pixels. */
export const VIEW = {
  drawDistance: 620,
  focal: 620,
  horizonY: 300,
  camBehind: 17,
  camAbove: 7,
};

export const PALETTE = {
  backdrop: '#0b1020',
  skyTop: '#1d3a6e',
  skyMid: '#4a7ab8',
  horizon: '#f2b879',
  sun: '#ffd98a',
  sunCore: '#fff3c4',
  sea: '#1e5f8a',
  seaDeep: '#174a6e',
  land: '#4d8a4a',
  landDark: '#3d7040',
  fieldA: '#5d9a4e',
  fieldB: '#7a9a4a',
  city: '#6f7480',
  cityDark: '#565b66',
  rock: '#6b5d4f',
  rockDark: '#54483c',
  snow: '#e8eef2',
  runway: '#2e3138',
  runwayLine: '#e8e4d2',
  ringNext: '#ffb02e',
  ringLater: '#37c8e8',
  ringDone: '#7ddb8a',
  planeBody: '#f2ead8',
  planeTrim: '#c8442c',
  planeGlass: '#1d3a5e',
  panel: 'rgba(8, 12, 20, 0.72)',
  panelEdge: '#ffb02e',
  text: '#f4f1e6',
  lit: '#9fe870',
  amber: '#ffb02e',
  red: '#ff5a4e',
  muted: '#9aa3b2',
  cloud: 'rgba(255, 255, 255, 0.92)',
  cloudShade: 'rgba(226, 232, 240, 0.85)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
