/**
 * @module i18n
 * Internationalization support for Sonare — Japanese/English language toggle.
 *
 * All translatable UI strings are organized by key. Each key maps to
 * { ja: "...", en: "..." }. The active language is stored in localStorage
 * and applied via data-i18n attributes on DOM elements.
 */

/** @type {'ja'|'en'} */
let currentLang = localStorage.getItem("sonare-lang") || "ja";

/**
 * All translatable strings keyed by identifier.
 * @type {Record<string, {ja: string, en: string}>}
 */
export const strings = {
  // ─── Loading screen ───
  "loading.title": {
    ja: "湖のソナーレ",
    en: "Sonare of the Lake",
  },
  "loading.subtitle": {
    ja: "ミクの歌声が湖を満たす",
    en: "Her voice fills the lake",
  },
  "loading.status.init": {
    ja: "初期化中...",
    en: "Initializing...",
  },
  "loading.status.connecting": {
    ja: "TextAliveに接続中...",
    en: "Connecting to TextAlive...",
  },
  "loading.status.connected": {
    ja: "接続完了。楽曲データを読み込み中...",
    en: "Connected. Loading song data...",
  },
  "loading.status.preparing": {
    ja: "歌詞を準備中...",
    en: "Preparing lyrics...",
  },
  "loading.status.ready": {
    ja: "準備完了！",
    en: "Ready!",
  },
  "loading.status.slow": {
    ja: "読み込みに時間がかかっています...",
    en: "Loading is taking longer than expected...",
  },
  "loading.status.error": {
    ja: "接続エラー — ページを再読み込みしてください。",
    en: "Connection error — please reload the page.",
  },
  "loading.status.gfx-error": {
    ja: "3Dグラフィックスを初期化できませんでした。別のブラウザをお試しください。",
    en: "Could not initialize 3D graphics. Please try a different browser.",
  },
  "loading.status.retrying": {
    ja: "再試行中...",
    en: "Retrying...",
  },
  "loading.retry": {
    ja: "再試行",
    en: "Retry",
  },

  // ─── Song selector ───
  "select.title": {
    ja: "湖のソナーレ",
    en: "Sonare of the Lake",
  },
  "select.prompt": {
    ja: "ミクの歌を選んでください",
    en: "Choose Miku's song",
  },
  "select.subtitle": {
    ja: "彼女の歌を選んで",
    en: "Choose her song",
  },

  // ─── Song card water descriptors ───
  "song.desc.0": {
    ja: "静かな湖",
    en: "Still waters at twilight",
  },
  "song.desc.1": {
    ja: "朝霧の湖",
    en: "Mist on the morning lake",
  },
  "song.desc.2": {
    ja: "煌めく湖面",
    en: "Sunlight dancing on waves",
  },
  "song.desc.3": {
    ja: "嵐の海",
    en: "Storm over the deep",
  },
  "song.desc.4": {
    ja: "地底湖",
    en: "Bioluminescent cavern",
  },
  "song.desc.5": {
    ja: "夜の水面",
    en: "Neon reflections at night",
  },

  // ─── Song card badge ───
  "badge.grand-prize": {
    ja: "グランプリ",
    en: "Grand Prize",
  },

  // ─── Intro card ───
  // (song title and artist are kept bilingual as-is; no separate i18n needed)

  // ─── Outro card ───
  "outro.message": {
    ja: "ミクの歌が湖に刻まれた",
    en: "Her song lives in the lake",
  },
  "outro.dominant": {
    ja: "主要な感情:",
    en: "Dominant:",
  },
  "outro.wordsRecognized": {
    ja: "認識された言葉",
    en: "words recognized",
  },
  "outro.topWords": {
    ja: "最も響いた言葉",
    en: "Words that echoed most",
  },
  "outro.emotionalMap": {
    ja: "感情の地図",
    en: "Emotional map",
  },
  "outro.fullOf": {
    ja: "この歌は{categories}に満ちていた",
    en: "This song was full of {categories}",
  },

  // ─── Emotion labels ───
  "emotion.warmth": {
    ja: "温もり",
    en: "Warmth",
  },
  "emotion.melancholy": {
    ja: "哀愁",
    en: "Melancholy",
  },
  "emotion.energy": {
    ja: "活力",
    en: "Energy",
  },
  "emotion.wonder": {
    ja: "驚嘆",
    en: "Wonder",
  },

  // ─── Section labels (screen reader) ───
  "section.chorus": {
    ja: "サビ",
    en: "Chorus",
  },
  "section.verse": {
    ja: "Aメロ",
    en: "Verse",
  },
  "section.bridge": {
    ja: "間奏",
    en: "Instrumental break",
  },

  // ─── Semantic category labels ───
  "category.nature": {
    ja: "🌿 自然",
    en: "🌿 Nature",
  },
  "category.emotion": {
    ja: "💫 感情",
    en: "💫 Emotion",
  },
  "category.light": {
    ja: "✨ 光",
    en: "✨ Light",
  },
  "category.dark": {
    ja: "🌑 闇",
    en: "🌑 Dark",
  },
  "category.movement": {
    ja: "💨 動き",
    en: "💨 Movement",
  },
  "category.voice": {
    ja: "🎤 声",
    en: "🎤 Voice",
  },
  "category.time": {
    ja: "⏳ 時間",
    en: "⏳ Time",
  },
  "category.bond": {
    ja: "💕 絆",
    en: "💕 Bond",
  },
  "category.water": {
    ja: "💧 水",
    en: "💧 Water",
  },
  "category.sound": {
    ja: "🎵 音",
    en: "🎵 Sound",
  },
  "category.miku": {
    ja: "✨ ミク",
    en: "✨ Miku",
  },

  // ─── HUD controls ───
  "controls.prev": {
    ja: "前の曲",
    en: "Previous song",
  },
  "controls.play": {
    ja: "再生",
    en: "Play",
  },
  "controls.pause": {
    ja: "一時停止",
    en: "Pause",
  },
  "controls.next": {
    ja: "次の曲",
    en: "Next song",
  },
  "controls.fullscreen": {
    ja: "全画面",
    en: "Fullscreen",
  },

  // ─── Seed display ───
  "seed.title": {
    ja: "シード: {hex} — 各シードはユニークな映像を生成します",
    en: "Seed: {hex} — Each seed produces a unique visual",
  },
  "seed.copied": {
    ja: "✓ コピー済み",
    en: "✓ Copied",
  },

  // ─── Rhythm feedback (screen reader) ───
  "rhythm.perfect": {
    ja: "パーフェクト！コンボ {combo}",
    en: "Perfect! Combo {combo}",
  },
  "rhythm.good": {
    ja: "グッド",
    en: "Good",
  },

  // ─── Attribution ───
  "attribution": {
    ja: '<a href="https://developer.textalive.jp/" target="_blank" rel="noopener">TextAlive App API</a> を使用',
    en: 'Powered by <a href="https://developer.textalive.jp/" target="_blank" rel="noopener">TextAlive App API</a>',
  },

  // ─── Now playing announcement ───
  "announce.playing": {
    ja: "再生中: {title}{artist}",
    en: "Now playing: {title}{artist}",
  },

  // ─── Language toggle ───
  "lang.label": {
    ja: "言語切替",
    en: "Language toggle",
  },
};

/**
 * Get the current language.
 * @returns {'ja'|'en'}
 */
export function getLang() {
  return currentLang;
}

/**
 * Get a translated string by key, with optional placeholder substitution.
 * @param {string} key - The i18n string key.
 * @param {Record<string, string>} [params] - Placeholder values (e.g., {hex: "abc123"}).
 * @returns {string} The translated string, or the key itself if not found.
 */
export function t(key, params) {
  const entry = strings[key];
  if (!entry) return key;
  let str = entry[currentLang] || entry.ja || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}

/**
 * Set the active language and persist to localStorage.
 * Updates all DOM elements that have a `data-i18n` attribute.
 * @param {'ja'|'en'} lang - The language code.
 */
export function setLanguage(lang) {
  if (lang !== "ja" && lang !== "en") return;
  currentLang = lang;
  localStorage.setItem("sonare-lang", lang);
  document.documentElement.lang = lang;
  applyToDOM();
}

/**
 * Apply current language to all elements with data-i18n attributes.
 * Supports data-i18n (textContent), data-i18n-html (innerHTML),
 * data-i18n-title (title attribute), and data-i18n-aria (aria-label).
 */
export function applyToDOM() {
  // Text content
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
  // Inner HTML (for links, badges, etc.)
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (key) el.innerHTML = t(key);
  });
  // Title attribute
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (key) el.title = t(key);
  });
  // Aria-label
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });

  // Update the toggle button active states
  const toggleBtn = document.getElementById("lang-toggle");
  if (toggleBtn) {
    const jaSpan = toggleBtn.querySelector(".lang-ja");
    const enSpan = toggleBtn.querySelector(".lang-en");
    if (jaSpan) jaSpan.classList.toggle("active", currentLang === "ja");
    if (enSpan) enSpan.classList.toggle("active", currentLang === "en");
  }
}
