/**
 * Seedable pseudo-random number generator (Mulberry32).
 * Enables procedural uniqueness — each playthrough has a reproducible visual fingerprint.
 *
 * @example
 * const rng = new SeededRandom(12345);
 * rng.random();        // deterministic float in [0, 1)
 * rng.range(10, 20);   // deterministic float in [10, 20)
 */
export class SeededRandom {
  /**
   * Create a new seeded PRNG instance.
   * @param {number} seed - Integer seed value. Non-integers are truncated via bitwise OR.
   */
  constructor(seed) {
    this.seed = seed | 0;
    this._state = this.seed;
  }

  /**
   * Generate the next pseudo-random float using the Mulberry32 algorithm.
   * @returns {number} A float in the range [0, 1).
   */
  random() {
    this._state |= 0;
    this._state = (this._state + 0x6d2b79f5) | 0;
    let t = Math.imul(this._state ^ (this._state >>> 15), 1 | this._state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generate a pseudo-random float within a specified range.
   * @param {number} min - Lower bound (inclusive).
   * @param {number} max - Upper bound (exclusive).
   * @returns {number} A float in the range [min, max).
   */
  range(min, max) {
    return min + this.random() * (max - min);
  }

  /**
   * Generate a pseudo-random value with approximate Gaussian (normal) distribution
   * using the Box-Muller transform.
   * @param {number} [mean=0] - The mean of the distribution.
   * @param {number} [stdDev=1] - The standard deviation of the distribution.
   * @returns {number} A normally-distributed pseudo-random value.
   */
  gaussian(mean = 0, stdDev = 1) {
    const u1 = this.random() || 1e-10;
    const u2 = this.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }

  /**
   * Pick a uniformly random element from an array.
   * @template T
   * @param {T[]} arr - The array to pick from. Must be non-empty.
   * @returns {T} A randomly selected element.
   */
  pick(arr) {
    return arr[Math.floor(this.random() * arr.length)];
  }
}

/**
 * @typedef {Object} SeedResult
 * @property {number} seed - The numeric seed value.
 * @property {string} hex - The 6-character uppercase hex representation of the seed.
 */

/**
 * Initialize the procedural seed from the URL `?seed=` query parameter,
 * or generate a fresh random seed if none is provided.
 * @returns {SeedResult} The resolved seed and its hex string.
 */
export function initSeed() {
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get("seed");

  let seed;
  if (seedParam) {
    seed = parseInt(seedParam, 16);
    if (isNaN(seed)) seed = generateSeed();
  } else {
    seed = generateSeed();
  }

  const hex = (seed >>> 0).toString(16).padStart(6, "0").slice(-6).toUpperCase();
  return { seed, hex };
}

/**
 * Derive a stable fingerprint from a seed: accent hue shift, nebula offsets,
 * anchor jitter values, and visual dot colors for the seed display.
 * All values are deterministic for a given seed.
 * @param {number} seed - The numeric seed.
 * @returns {Object} Derived fingerprint values.
 */
export function deriveSeedFingerprint(seed) {
  const rng = new SeededRandom(seed);
  // Accent hue shift: ±15° mapped to ±0.042 in [0,1] hue space
  const accentHueShift = (rng.random() - 0.5) * 0.083; // ±15° / 360°
  // Nebula offsets
  const nebulaHueOffset = (rng.random() - 0.5) * 0.06;  // ±~11°
  const nebulaDensityScale = 0.85 + rng.random() * 0.3;  // 0.85–1.15
  const nebulaRadiusOffset = (rng.random() - 0.5) * 20;  // ±10 units
  // Orbit ring radii jitter
  const ringRadiusJitter = [];
  for (let i = 0; i < 6; i++) ringRadiusJitter.push((rng.random() - 0.5) * 1.2);
  // Category anchor jitters (8 categories × 3 axes)
  const anchorJitters = {};
  const cats = ["nature", "emotion", "light", "dark", "movement", "voice", "time", "bond"];
  for (const cat of cats) {
    anchorJitters[cat] = {
      x: (rng.random() - 0.5) * 6,
      y: (rng.random() - 0.5) * 6,
      z: (rng.random() - 0.5) * 6,
    };
  }
  // Visual fingerprint: 5 colored dots
  const dotColors = [];
  for (let i = 0; i < 5; i++) {
    const h = rng.random();
    const s = 0.5 + rng.random() * 0.4;
    const l = 0.45 + rng.random() * 0.25;
    dotColors.push({ h, s, l });
  }
  return {
    accentHueShift,
    nebulaHueOffset,
    nebulaDensityScale,
    nebulaRadiusOffset,
    ringRadiusJitter,
    anchorJitters,
    dotColors,
  };
}

/**
 * Generate a random seed from the current timestamp and Math.random().
 * @returns {number} An unsigned 32-bit integer seed.
 */
function generateSeed() {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}
