/**
 * @typedef {Object} SongTheme
 * @property {number} hue - Base hue for the song's color palette (0-1).
 * @property {number} accent - Hex color for the primary accent (e.g., orb, rings).
 * @property {string} mood - Descriptive mood keyword (e.g., "longing", "bright", "epic").
 * @property {number} [bgColor] - Background clear color (hex integer).
 * @property {number} [fogColor] - Fog color (hex integer).
 * @property {number} [nebulaHue] - Nebula cloud hue (0-1).
 * @property {number} [nebulaSat] - Nebula cloud saturation (0-1).
 * @property {number} [nebulaLum] - Nebula cloud luminance (0-1).
 * @property {number} [starHueBase] - Star field base hue (0-1).
 * @property {number} [starHueRange] - Star field hue variation range.
 * @property {number} [starSatBase] - Star field base saturation.
 * @property {number} [orbScale] - Central orb base scale multiplier.
 * @property {number} [orbBreathSpeed] - Orb breathing animation speed.
 * @property {number} [ringCount] - Number of orbit rings to display.
 * @property {number} [ringSpacing] - Spacing between orbit rings.
 * @property {number} [bloomBase] - Baseline bloom strength for this song.
 * @property {string} [particleStyle] - Particle motion style: "drift"|"whirlpool"|"tide"|"splash"|"current"|"rain".
 * @property {string} [introStyle] - Intro animation variant: "emerge"|"splash"|"whirlpool".
 * @property {number} [constellationDensity] - Constellation connection aggressiveness (0.5-1.5, default 1.0).
 */

/**
 * @typedef {Object} SongVideoIds
 * @property {number} [beatId] - TextAlive beat analysis ID.
 * @property {number} [chordId] - TextAlive chord analysis ID.
 * @property {number} [repetitiveSegmentId] - TextAlive repetitive segment ID.
 * @property {number} [lyricId] - TextAlive lyric ID.
 * @property {number} [lyricDiffId] - TextAlive lyric diff ID.
 */

/**
 * @typedef {Object} SongDefinition
 * @property {string} title - Display title of the song.
 * @property {string} artist - Display artist name.
 * @property {string} [badge] - Optional badge label (e.g., "Grand Prize").
 * @property {string} url - Piapro URL for the song audio.
 * @property {SongVideoIds} video - TextAlive video analysis IDs (may be empty until published).
 * @property {SongTheme} theme - Visual theme parameters for the 3D scene.
 */

/**
 * Contest song definitions for Magical Mirai 2026.
 *
 * NOTE: The `video` fields (beatId, chordId, etc.) will be published on
 * https://developer.textalive.jp/events/magicalmirai2026 once available.
 * Update the values below when they are released.
 *
 * @type {SongDefinition[]}
 */
export const SONGS = [
  {
    title: "こたえて (Answer Me)",
    artist: "imie",
    // Grand Prize winner — no badge shown (Tufte: data-ink ratio)
    url: "https://piapro.jp/t/6W2N/20251215164617",
    video: {
      // Video analysis IDs will be populated when published at
      // https://developer.textalive.jp/events/magicalmirai2026
    },
    theme: {
      hue: 0.60, accent: 0x4a8fbf, mood: "longing",
      // Still mountain lake at twilight — deep blue-indigo, reflective
      bgColor: 0x0a1628,
      fogColor: 0x0a1628,
      nebulaHue: 0.62, nebulaSat: 0.25, nebulaLum: 0.08,
      starHueBase: 0.58, starHueRange: 0.10, starSatBase: 0.20,
      orbScale: 1.0, orbBreathSpeed: 1.2,
      ringCount: 3, ringSpacing: 2.5,
      bloomBase: 0.5,
      particleStyle: "drift", introStyle: "emerge", constellationDensity: 1.0,
    },
  },
  {
    title: "アフター・ザ・カーテン (After The Curtain)",
    artist: "Rulmry",
    url: "https://piapro.jp/t/zoqO/20251214200738",
    video: {},
    theme: {
      hue: 0.56, accent: 0x8faaba, mood: "reflective",
      // Misty morning lake — soft gray-blue, fog on water
      bgColor: 0x0c1e30,
      fogColor: 0x0c1e30,
      nebulaHue: 0.55, nebulaSat: 0.15, nebulaLum: 0.12,
      starHueBase: 0.54, starHueRange: 0.08, starSatBase: 0.15,
      orbScale: 0.9, orbBreathSpeed: 0.8,
      ringCount: 2, ringSpacing: 3.5,
      bloomBase: 0.6,
      particleStyle: "rain", introStyle: "emerge", constellationDensity: 0.7,
    },
  },
  {
    title: "シャッターチャンス (Shutter Chance)",
    artist: "夜未アガリ (Yamiagari)",
    url: "https://piapro.jp/t/PNpQ/20251209170719",
    video: {},
    theme: {
      hue: 0.50, accent: 0x47d4c0, mood: "bright",
      // Sparkling afternoon lake — bright teal-cyan, sunlight on water
      bgColor: 0x081e28,
      fogColor: 0x081e28,
      nebulaHue: 0.48, nebulaSat: 0.40, nebulaLum: 0.14,
      starHueBase: 0.50, starHueRange: 0.12, starSatBase: 0.35,
      orbScale: 1.2, orbBreathSpeed: 2.0,
      ringCount: 4, ringSpacing: 2.0,
      bloomBase: 0.65,
      particleStyle: "tide", introStyle: "splash", constellationDensity: 1.2,
    },
  },
  {
    title: "世界最後の音楽隊 (The Last March on Earth)",
    artist: "夏山よつぎ × ど~ぱみん (Natsuyama Yotsugi × Dopam!ne)",
    url: "https://piapro.jp/t/B3yJ/20251215061727",
    video: {},
    theme: {
      hue: 0.68, accent: 0x6b7fcc, mood: "epic",
      // Stormy ocean — dark navy-purple, whitecaps, dramatic
      bgColor: 0x080e22,
      fogColor: 0x080e22,
      nebulaHue: 0.70, nebulaSat: 0.35, nebulaLum: 0.08,
      starHueBase: 0.66, starHueRange: 0.12, starSatBase: 0.30,
      orbScale: 1.4, orbBreathSpeed: 1.8,
      ringCount: 5, ringSpacing: 1.8,
      bloomBase: 0.7,
      particleStyle: "splash", introStyle: "splash", constellationDensity: 1.4,
    },
  },
  {
    title: "トリツクロジー (Toritsukulogy)",
    artist: "鶴三 (Tsuruzou)",
    url: "https://piapro.jp/t/QBdL/20251215094303",
    video: {},
    theme: {
      hue: 0.42, accent: 0x3de8a0, mood: "mysterious",
      // Underground cave lake — deep emerald-green, bioluminescent
      bgColor: 0x061a14,
      fogColor: 0x061a14,
      nebulaHue: 0.40, nebulaSat: 0.30, nebulaLum: 0.09,
      starHueBase: 0.38, starHueRange: 0.15, starSatBase: 0.25,
      orbScale: 0.8, orbBreathSpeed: 1.0,
      ringCount: 3, ringSpacing: 3.0,
      bloomBase: 0.55,
      particleStyle: "whirlpool", introStyle: "whirlpool", constellationDensity: 0.8,
    },
  },
  {
    title: "TAKEOVER",
    artist: "Twinfield",
    url: "https://piapro.jp/t/E2i3/20251215092113",
    video: {},
    theme: {
      hue: 0.78, accent: 0xb06adb, mood: "intense",
      // Neon-lit city waterfront — electric blue-magenta, reflections of city lights
      bgColor: 0x0a0820,
      fogColor: 0x0a0820,
      nebulaHue: 0.76, nebulaSat: 0.40, nebulaLum: 0.10,
      starHueBase: 0.74, starHueRange: 0.18, starSatBase: 0.35,
      orbScale: 1.3, orbBreathSpeed: 2.5,
      ringCount: 4, ringSpacing: 2.2,
      bloomBase: 0.75,
      particleStyle: "current", introStyle: "whirlpool", constellationDensity: 1.5,
    },
  },
];
