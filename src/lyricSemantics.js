/**
 * @module lyricSemantics
 * Lyric semantic analysis — maps Japanese words to visual parameters.
 * Creates the illusion that the system "understands" the lyrics.
 *
 * Each entry maps a word/kanji to a visual descriptor that drives
 * color shifts, particle shapes, and scene effects.
 */

/**
 * @typedef {Object} SemanticDescriptor
 * @property {[number, number, number]} color - RGB color in 0-1 range.
 * @property {string} particle - Particle effect type (one of FX values).
 * @property {string|null} scene - Scene-level effect type (one of SCENE values), or null for no scene effect.
 * @property {string} category - Semantic category (one of CATEGORY values).
 * @property {number} intensity - Effect intensity from 0 to 1.
 */

/**
 * @typedef {Object} MemoryState
 * @property {number} warmth - Accumulated warmth dimension (0-1).
 * @property {number} melancholy - Accumulated melancholy dimension (0-1).
 * @property {number} energy - Accumulated energy dimension (0-1).
 * @property {number} wonder - Accumulated wonder dimension (0-1).
 * @property {number} wordCount - Total number of semantic words encountered.
 */

/** @enum {string} Visual particle effect types. */
const FX = {
  FLOAT_UP:    "floatUp",
  RAIN_DOWN:   "rainDown",
  SPIRAL:      "spiral",
  BURST:       "burst",
  SHIMMER:     "shimmer",
  SCATTER:     "scatter",
};

const SCENE = {
  BRIGHTEN:    "brighten",
  DARKEN:      "darken",
  WARM_SHIFT:  "warmShift",
  COOL_SHIFT:  "coolShift",
  FOG_DEEP:    "fogDeep",
  FOG_CLEAR:   "fogClear",
  BLOOM_SURGE: "bloomSurge",
};

/** @enum {string} Semantic categories for the memory system. */
export const CATEGORY = {
  NATURE:   "nature",
  EMOTION:  "emotion",
  LIGHT:    "light",
  DARK:     "dark",
  MOVEMENT: "movement",
  VOICE:    "voice",
  TIME:     "time",
  BOND:     "bond",
  WATER:    "water",
  SOUND:    "sound",
  MIKU:     "miku",
};

/**
 * Semantic dictionary: Japanese word -> visual descriptor.
 * Colors are [r, g, b] in 0-1 range.
 * @type {Map<string, SemanticDescriptor>}
 */
const SEMANTIC_MAP = new Map();

/**
 * Register one or more words with the same visual descriptor.
 * @param {string[]} words - Array of Japanese word strings (kanji, hiragana, katakana variants).
 * @param {SemanticDescriptor} descriptor - The visual descriptor to associate with each word.
 */
function define(words, descriptor) {
  for (const w of words) {
    SEMANTIC_MAP.set(w, descriptor);
  }
}

// ── Nature ──
define(["空", "そら", "ソラ"], {
  color: [0.4, 0.7, 1.0], particle: FX.FLOAT_UP, scene: SCENE.FOG_CLEAR,
  category: CATEGORY.NATURE, intensity: 0.8,
});
define(["海", "うみ", "ウミ"], {
  color: [0.1, 0.4, 0.9], particle: FX.RAIN_DOWN, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.NATURE, intensity: 0.7,
});
define(["星", "ほし", "ホシ"], {
  color: [1.0, 0.95, 0.6], particle: FX.SHIMMER, scene: SCENE.BRIGHTEN,
  category: CATEGORY.NATURE, intensity: 0.9,
});
define(["月", "つき", "ツキ"], {
  color: [0.9, 0.9, 0.75], particle: FX.SHIMMER, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.NATURE, intensity: 0.7,
});
define(["花", "はな", "ハナ"], {
  color: [1.0, 0.6, 0.7], particle: FX.SCATTER, scene: SCENE.WARM_SHIFT,
  category: CATEGORY.NATURE, intensity: 0.6,
});
define(["雨", "あめ", "アメ"], {
  color: [0.5, 0.6, 0.8], particle: FX.RAIN_DOWN, scene: SCENE.FOG_DEEP,
  category: CATEGORY.NATURE, intensity: 0.6,
});
define(["風", "かぜ", "カゼ"], {
  color: [0.6, 0.9, 0.8], particle: FX.SCATTER, scene: SCENE.FOG_CLEAR,
  category: CATEGORY.NATURE, intensity: 0.5,
});
define(["雪", "ゆき", "ユキ"], {
  color: [0.9, 0.95, 1.0], particle: FX.RAIN_DOWN, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.NATURE, intensity: 0.7,
});
define(["太陽", "たいよう"], {
  color: [1.0, 0.8, 0.3], particle: FX.BURST, scene: SCENE.BRIGHTEN,
  category: CATEGORY.LIGHT, intensity: 0.9,
});
define(["虹", "にじ"], {
  color: [0.8, 0.5, 1.0], particle: FX.SPIRAL, scene: SCENE.BRIGHTEN,
  category: CATEGORY.NATURE, intensity: 0.8,
});
define(["大地", "地球", "世界"], {
  color: [0.3, 0.7, 0.5], particle: FX.BURST, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.NATURE, intensity: 0.8,
});
define(["桜", "さくら", "サクラ"], {
  color: [1.0, 0.7, 0.8], particle: FX.SCATTER, scene: SCENE.WARM_SHIFT,
  category: CATEGORY.NATURE, intensity: 0.7,
});

// ── Emotion ──
define(["愛", "あい", "アイ"], {
  color: [1.0, 0.3, 0.5], particle: FX.SPIRAL, scene: SCENE.WARM_SHIFT,
  category: CATEGORY.EMOTION, intensity: 1.0,
});
define(["恋", "こい", "コイ"], {
  color: [1.0, 0.4, 0.6], particle: FX.FLOAT_UP, scene: SCENE.WARM_SHIFT,
  category: CATEGORY.EMOTION, intensity: 0.9,
});
define(["涙", "なみだ", "ナミダ"], {
  color: [0.4, 0.5, 0.9], particle: FX.RAIN_DOWN, scene: SCENE.FOG_DEEP,
  category: CATEGORY.EMOTION, intensity: 0.9,
});
define(["泣", "泣く", "泣い"], {
  color: [0.4, 0.5, 0.9], particle: FX.RAIN_DOWN, scene: SCENE.FOG_DEEP,
  category: CATEGORY.EMOTION, intensity: 0.7,
});
define(["笑", "笑う", "笑っ", "わら", "えが"], {
  color: [1.0, 0.9, 0.4], particle: FX.BURST, scene: SCENE.BRIGHTEN,
  category: CATEGORY.EMOTION, intensity: 0.8,
});
define(["夢", "ゆめ", "ユメ"], {
  color: [0.7, 0.5, 1.0], particle: FX.FLOAT_UP, scene: SCENE.FOG_CLEAR,
  category: CATEGORY.EMOTION, intensity: 0.9,
});
define(["心", "こころ", "ココロ"], {
  color: [1.0, 0.45, 0.55], particle: FX.SPIRAL, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.EMOTION, intensity: 0.9,
});
define(["希望", "きぼう"], {
  color: [1.0, 0.85, 0.3], particle: FX.FLOAT_UP, scene: SCENE.BRIGHTEN,
  category: CATEGORY.EMOTION, intensity: 1.0,
});
define(["悲", "悲し", "かなし"], {
  color: [0.3, 0.3, 0.7], particle: FX.RAIN_DOWN, scene: SCENE.DARKEN,
  category: CATEGORY.EMOTION, intensity: 0.8,
});
define(["幸せ", "しあわせ", "幸"], {
  color: [1.0, 0.85, 0.5], particle: FX.SHIMMER, scene: SCENE.BRIGHTEN,
  category: CATEGORY.EMOTION, intensity: 0.8,
});
define(["寂し", "さびし", "さみし", "lonely"], {
  color: [0.4, 0.35, 0.6], particle: FX.SCATTER, scene: SCENE.FOG_DEEP,
  category: CATEGORY.EMOTION, intensity: 0.7,
});
define(["怒", "いか", "おこ"], {
  color: [1.0, 0.2, 0.1], particle: FX.BURST, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.EMOTION, intensity: 0.8,
});
define(["痛", "いた"], {
  color: [0.8, 0.2, 0.3], particle: FX.BURST, scene: SCENE.DARKEN,
  category: CATEGORY.EMOTION, intensity: 0.7,
});
define(["好き", "すき", "スキ"], {
  color: [1.0, 0.5, 0.65], particle: FX.FLOAT_UP, scene: SCENE.WARM_SHIFT,
  category: CATEGORY.EMOTION, intensity: 0.9,
});
define(["嫌い", "きらい"], {
  color: [0.5, 0.2, 0.4], particle: FX.SCATTER, scene: SCENE.DARKEN,
  category: CATEGORY.EMOTION, intensity: 0.6,
});

// ── Light / Dark ──
define(["光", "ひかり", "ヒカリ"], {
  color: [1.0, 1.0, 0.85], particle: FX.BURST, scene: SCENE.BRIGHTEN,
  category: CATEGORY.LIGHT, intensity: 1.0,
});
define(["輝", "かがや", "きらめ"], {
  color: [1.0, 0.95, 0.7], particle: FX.SHIMMER, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.LIGHT, intensity: 0.9,
});
define(["闇", "やみ", "ヤミ"], {
  color: [0.15, 0.1, 0.25], particle: FX.SCATTER, scene: SCENE.DARKEN,
  category: CATEGORY.DARK, intensity: 0.8,
});
define(["夜", "よる", "ヨル"], {
  color: [0.15, 0.15, 0.35], particle: FX.SHIMMER, scene: SCENE.DARKEN,
  category: CATEGORY.DARK, intensity: 0.6,
});
define(["影", "かげ"], {
  color: [0.2, 0.15, 0.3], particle: FX.SCATTER, scene: SCENE.FOG_DEEP,
  category: CATEGORY.DARK, intensity: 0.5,
});
define(["朝", "あさ", "dawn"], {
  color: [1.0, 0.7, 0.5], particle: FX.FLOAT_UP, scene: SCENE.BRIGHTEN,
  category: CATEGORY.LIGHT, intensity: 0.7,
});
define(["黄昏", "夕", "ゆう"], {
  color: [0.9, 0.5, 0.3], particle: FX.SCATTER, scene: SCENE.WARM_SHIFT,
  category: CATEGORY.LIGHT, intensity: 0.6,
});

// ── Movement ──
define(["走", "はし", "ハシ"], {
  color: [0.3, 0.9, 0.6], particle: FX.BURST, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.MOVEMENT, intensity: 0.7,
});
define(["飛", "と", "トブ", "飛ぶ", "飛ん", "飛べ"], {
  color: [0.5, 0.8, 1.0], particle: FX.FLOAT_UP, scene: SCENE.FOG_CLEAR,
  category: CATEGORY.MOVEMENT, intensity: 0.8,
});
define(["踊", "おど", "ダンス", "dance"], {
  color: [0.9, 0.5, 1.0], particle: FX.SPIRAL, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.MOVEMENT, intensity: 0.8,
});
define(["回", "まわ", "回る", "回し"], {
  color: [0.6, 0.7, 1.0], particle: FX.SPIRAL, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.MOVEMENT, intensity: 0.6,
});

// ── Voice / Sound / Song ──
define(["声", "こえ", "コエ"], {
  color: [0.4, 0.9, 0.8], particle: FX.FLOAT_UP, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.VOICE, intensity: 0.8,
});
define(["歌", "うた", "ウタ"], {
  color: [0.2, 0.8, 0.7], particle: FX.SPIRAL, scene: SCENE.BRIGHTEN,
  category: CATEGORY.VOICE, intensity: 0.9,
});
define(["音", "おと", "オト", "音楽"], {
  color: [0.3, 0.7, 0.9], particle: FX.SHIMMER, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.VOICE, intensity: 0.7,
});
define(["言葉", "ことば", "コトバ"], {
  color: [0.5, 0.8, 0.9], particle: FX.SCATTER, scene: SCENE.FOG_CLEAR,
  category: CATEGORY.VOICE, intensity: 0.7,
});
define(["叫", "さけ"], {
  color: [1.0, 0.4, 0.3], particle: FX.BURST, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.VOICE, intensity: 0.9,
});

// ── Time ──
define(["時", "とき", "トキ"], {
  color: [0.6, 0.6, 0.8], particle: FX.FLOAT_UP, scene: SCENE.FOG_CLEAR,
  category: CATEGORY.TIME, intensity: 0.5,
});
define(["永遠", "えいえん", "forever"], {
  color: [0.7, 0.6, 1.0], particle: FX.SPIRAL, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.TIME, intensity: 0.9,
});
define(["未来", "みらい", "ミライ"], {
  color: [0.3, 1.0, 0.8], particle: FX.FLOAT_UP, scene: SCENE.BRIGHTEN,
  category: CATEGORY.TIME, intensity: 1.0,
});
define(["過去", "かこ"], {
  color: [0.5, 0.4, 0.6], particle: FX.RAIN_DOWN, scene: SCENE.FOG_DEEP,
  category: CATEGORY.TIME, intensity: 0.6,
});
define(["今", "いま", "イマ"], {
  color: [0.9, 0.9, 0.5], particle: FX.BURST, scene: SCENE.BRIGHTEN,
  category: CATEGORY.TIME, intensity: 0.7,
});
define(["明日", "あした", "あす"], {
  color: [0.8, 0.9, 0.5], particle: FX.FLOAT_UP, scene: SCENE.BRIGHTEN,
  category: CATEGORY.TIME, intensity: 0.7,
});

// ── Bond / Connection ──
define(["手", "て", "テ"], {
  color: [1.0, 0.75, 0.6], particle: FX.FLOAT_UP, scene: SCENE.WARM_SHIFT,
  category: CATEGORY.BOND, intensity: 0.5,
});
define(["繋", "つな", "ツナ"], {
  color: [0.9, 0.6, 0.8], particle: FX.SPIRAL, scene: SCENE.WARM_SHIFT,
  category: CATEGORY.BOND, intensity: 0.8,
});
define(["約束", "やくそく"], {
  color: [1.0, 0.8, 0.5], particle: FX.SHIMMER, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.BOND, intensity: 0.9,
});
define(["一緒", "いっしょ", "together"], {
  color: [1.0, 0.7, 0.6], particle: FX.SPIRAL, scene: SCENE.WARM_SHIFT,
  category: CATEGORY.BOND, intensity: 0.8,
});
define(["君", "きみ", "キミ"], {
  color: [0.5, 0.85, 0.9], particle: FX.SHIMMER, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.BOND, intensity: 0.6,
});
define(["僕", "ぼく", "ボク", "私", "わたし", "あたし", "俺", "おれ"], {
  color: [0.6, 0.6, 0.8], particle: FX.FLOAT_UP, scene: null,
  category: CATEGORY.BOND, intensity: 0.3,
});

// ── Abstract / Special ──
define(["自由", "じゆう", "freedom", "free"], {
  color: [0.3, 1.0, 0.7], particle: FX.BURST, scene: SCENE.FOG_CLEAR,
  category: CATEGORY.MOVEMENT, intensity: 0.9,
});
define(["奇跡", "きせき", "miracle"], {
  color: [1.0, 0.9, 0.5], particle: FX.SPIRAL, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.LIGHT, intensity: 1.0,
});
define(["命", "いのち", "生命"], {
  color: [0.9, 0.4, 0.4], particle: FX.BURST, scene: SCENE.WARM_SHIFT,
  category: CATEGORY.EMOTION, intensity: 0.9,
});
define(["魔法", "まほう", "magic"], {
  color: [0.8, 0.5, 1.0], particle: FX.SPIRAL, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.LIGHT, intensity: 1.0,
});
define(["答", "こたえ", "コタエ"], {
  color: [0.9, 0.85, 0.5], particle: FX.SHIMMER, scene: SCENE.BRIGHTEN,
  category: CATEGORY.VOICE, intensity: 0.8,
});

// ── Water / Lake ──
define(["湖", "みずうみ"], {
  color: [0.1, 0.7, 0.75], particle: FX.SHIMMER, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.WATER, intensity: 0.8,
});
define(["波", "なみ", "ナミ"], {
  color: [0.15, 0.6, 0.8], particle: FX.RAIN_DOWN, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.WATER, intensity: 0.7,
});
define(["水", "みず", "ミズ"], {
  color: [0.2, 0.7, 0.85], particle: FX.RAIN_DOWN, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.WATER, intensity: 0.6,
});
define(["泳ぐ", "泳", "およ"], {
  color: [0.1, 0.65, 0.8], particle: FX.SPIRAL, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.WATER, intensity: 0.7,
});
define(["流れ", "ながれ", "流"], {
  color: [0.15, 0.6, 0.75], particle: FX.SCATTER, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.WATER, intensity: 0.6,
});
define(["深い", "深", "ふか"], {
  color: [0.05, 0.35, 0.65], particle: FX.RAIN_DOWN, scene: SCENE.FOG_DEEP,
  category: CATEGORY.WATER, intensity: 0.8,
});
define(["沈む", "沈", "しず"], {
  color: [0.1, 0.3, 0.6], particle: FX.RAIN_DOWN, scene: SCENE.DARKEN,
  category: CATEGORY.WATER, intensity: 0.8,
});
define(["浮かぶ", "浮", "うか"], {
  color: [0.3, 0.75, 0.85], particle: FX.FLOAT_UP, scene: SCENE.FOG_CLEAR,
  category: CATEGORY.WATER, intensity: 0.6,
});
define(["溺れる", "溺", "おぼ"], {
  color: [0.05, 0.25, 0.55], particle: FX.RAIN_DOWN, scene: SCENE.DARKEN,
  category: CATEGORY.WATER, intensity: 0.9,
});
define(["潮", "しお", "シオ"], {
  color: [0.1, 0.55, 0.7], particle: FX.SCATTER, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.WATER, intensity: 0.6,
});
define(["霧", "きり", "キリ"], {
  color: [0.6, 0.7, 0.75], particle: FX.SCATTER, scene: SCENE.FOG_DEEP,
  category: CATEGORY.WATER, intensity: 0.5,
});
define(["氷", "こおり", "コオリ"], {
  color: [0.7, 0.9, 0.95], particle: FX.SHIMMER, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.WATER, intensity: 0.7,
});
define(["泡", "あわ", "アワ"], {
  color: [0.5, 0.85, 0.9], particle: FX.FLOAT_UP, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.WATER, intensity: 0.5,
});
define(["滴", "しずく", "シズク"], {
  color: [0.25, 0.7, 0.85], particle: FX.RAIN_DOWN, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.WATER, intensity: 0.5,
});
define(["川", "かわ", "カワ"], {
  color: [0.15, 0.6, 0.75], particle: FX.SCATTER, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.WATER, intensity: 0.6,
});
define(["池", "いけ", "イケ"], {
  color: [0.15, 0.65, 0.7], particle: FX.SHIMMER, scene: SCENE.COOL_SHIFT,
  category: CATEGORY.WATER, intensity: 0.5,
});
define(["渡る", "渡", "わた"], {
  color: [0.2, 0.65, 0.8], particle: FX.FLOAT_UP, scene: SCENE.FOG_CLEAR,
  category: CATEGORY.WATER, intensity: 0.6,
});

// ── Nature / Sky (additional) ──
define(["森", "もり", "モリ"], {
  color: [0.2, 0.6, 0.35], particle: FX.SCATTER, scene: SCENE.FOG_DEEP,
  category: CATEGORY.NATURE, intensity: 0.6,
});
define(["山", "やま", "ヤマ"], {
  color: [0.35, 0.55, 0.45], particle: FX.FLOAT_UP, scene: SCENE.FOG_CLEAR,
  category: CATEGORY.NATURE, intensity: 0.6,
});

// ── Sound / Music (additional) ──
define(["響く", "響", "ひび"], {
  color: [1.0, 0.55, 0.6], particle: FX.SPIRAL, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.SOUND, intensity: 0.8,
});
define(["奏でる", "奏", "かな"], {
  color: [0.95, 0.5, 0.55], particle: FX.SHIMMER, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.SOUND, intensity: 0.8,
});
define(["囁く", "囁", "ささや"], {
  color: [0.9, 0.6, 0.65], particle: FX.SCATTER, scene: SCENE.FOG_DEEP,
  category: CATEGORY.SOUND, intensity: 0.5,
});
define(["メロディ", "メロディー", "melody"], {
  color: [1.0, 0.5, 0.6], particle: FX.SPIRAL, scene: SCENE.BRIGHTEN,
  category: CATEGORY.SOUND, intensity: 0.7,
});
define(["リズム", "rhythm"], {
  color: [0.95, 0.55, 0.5], particle: FX.BURST, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.SOUND, intensity: 0.7,
});
define(["ハーモニー", "harmony"], {
  color: [1.0, 0.6, 0.65], particle: FX.SHIMMER, scene: SCENE.BRIGHTEN,
  category: CATEGORY.SOUND, intensity: 0.8,
});

// ── Miku-specific ──
define(["ミク", "みく"], {
  color: [0.224, 0.773, 0.733], particle: FX.SPIRAL, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.MIKU, intensity: 1.0,
});
define(["初音", "はつね"], {
  color: [0.224, 0.773, 0.733], particle: FX.SHIMMER, scene: SCENE.BRIGHTEN,
  category: CATEGORY.MIKU, intensity: 1.0,
});
define(["ボーカロイド", "VOCALOID", "ボカロ"], {
  color: [0.224, 0.773, 0.733], particle: FX.BURST, scene: SCENE.BLOOM_SURGE,
  category: CATEGORY.MIKU, intensity: 0.9,
});
define(["セカイ", "せかい"], {
  color: [0.224, 0.773, 0.733], particle: FX.FLOAT_UP, scene: SCENE.FOG_CLEAR,
  category: CATEGORY.MIKU, intensity: 0.8,
});

/**
 * Match a word's text against the semantic dictionary.
 * Supports exact matches and substring/prefix matching for compound words.
 *
 * Matching priority:
 * 1. Exact match against dictionary keys.
 * 2. Substring match for multi-character dictionary keys (compound words).
 * 3. Single kanji containment check for single-character kanji keys.
 *
 * @param {string} text - The word text to look up (typically from TextAlive word.text).
 * @returns {SemanticDescriptor|null} The visual descriptor if matched, or null.
 */
export function matchWord(text) {
  if (!text || text.length === 0) return null;

  // Exact match first
  const exact = SEMANTIC_MAP.get(text);
  if (exact) return exact;

  // Check if any dictionary key is contained in the text (compound words)
  // Only check for keys ≥ 2 chars to avoid false positives with single hiragana
  for (const [key, desc] of SEMANTIC_MAP) {
    if (key.length >= 2 && text.includes(key)) {
      return desc;
    }
  }

  // Single kanji check: if the text starts with a kanji in our map
  for (const [key, desc] of SEMANTIC_MAP) {
    if (key.length === 1 && isKanji(key) && text.includes(key)) {
      return desc;
    }
  }

  return null;
}

/**
 * Check whether a single character is a CJK Unified Ideograph (common kanji range).
 * @param {string} ch - A single character string.
 * @returns {boolean} True if the character is in the CJK Unified Ideographs block.
 */
function isKanji(ch) {
  const code = ch.charCodeAt(0);
  return code >= 0x4e00 && code <= 0x9fff;
}

/**
 * Accumulates semantic meaning over the song's duration.
 * The scene "remembers" what has been sung and evolves accordingly.
 *
 * Tracks four emotional dimensions (warmth, melancholy, energy, wonder)
 * that slowly build as semantic words are encountered, shaping how the
 * 3D scene evolves over time.
 */
/**
 * Category color map: canonical RGB colors for each semantic category.
 * Used for the outro emotional summary bars and reflection map.
 * @type {Record<string, [number, number, number]>}
 */
export const CATEGORY_COLORS = {
  [CATEGORY.NATURE]:   [0.3, 0.8, 0.5],   // green
  [CATEGORY.EMOTION]:  [1.0, 0.45, 0.6],   // pink
  [CATEGORY.LIGHT]:    [1.0, 0.9, 0.5],    // warm gold
  [CATEGORY.DARK]:     [0.35, 0.3, 0.6],   // deep indigo
  [CATEGORY.MOVEMENT]: [0.3, 0.7, 0.9],    // sky blue
  [CATEGORY.VOICE]:    [0.9, 0.55, 0.3],   // amber
  [CATEGORY.TIME]:     [0.6, 0.5, 0.9],    // lavender
  [CATEGORY.BOND]:     [0.85, 0.4, 0.75],  // magenta-pink
  [CATEGORY.WATER]:    [0.2, 0.7, 0.8],    // teal
  [CATEGORY.SOUND]:    [0.5, 0.8, 0.7],    // seafoam
  [CATEGORY.MIKU]:     [0.22, 0.77, 0.73], // Miku teal
};

export class LyricMemory {
  constructor() {
    this.reset();
  }

  /**
   * Reset all accumulated state. Called at the start of each new song.
   */
  reset() {
    // Accumulated emotional dimensions (0-1)
    this.warmth = 0;      // love, joy, bonds
    this.melancholy = 0;  // sadness, darkness, loneliness
    this.energy = 0;      // movement, shouts, intensity
    this.wonder = 0;      // nature, light, dreams
    this.wordCount = 0;   // total semantic words encountered
    this.recentWords = []; // last N words for constellation system

    // Per-category tracking for the outro emotional summary
    /** @type {Record<string, number>} */
    this.categoryCounts = {};
    /** @type {Record<string, Record<string, number>>} word frequency per category */
    this.categoryWords = {};
    /** @type {Array<{word: string, category: string, color: [number,number,number]}>} */
    this.topWordsOrdered = [];
  }

  /**
   * Accumulate a semantic descriptor into the memory dimensions.
   * Each category maps to one of the four emotional dimensions.
   * Also tracks per-category counts and top words for the outro summary.
   * @param {SemanticDescriptor|null} descriptor - The descriptor to accumulate. Null is safely ignored.
   * @param {string} [wordText] - The original word text (for top-words display).
   */
  accumulate(descriptor, wordText) {
    if (!descriptor) return;

    const { category, intensity } = descriptor;
    const amount = intensity * 0.04; // slow accumulation

    switch (category) {
      case CATEGORY.EMOTION:
      case CATEGORY.BOND:
        this.warmth = Math.min(1, this.warmth + amount);
        break;
      case CATEGORY.DARK:
      case CATEGORY.WATER:
        this.melancholy = Math.min(1, this.melancholy + amount);
        break;
      case CATEGORY.MOVEMENT:
      case CATEGORY.VOICE:
      case CATEGORY.SOUND:
        this.energy = Math.min(1, this.energy + amount);
        break;
      case CATEGORY.NATURE:
      case CATEGORY.LIGHT:
      case CATEGORY.TIME:
      case CATEGORY.MIKU:
        this.wonder = Math.min(1, this.wonder + amount);
        break;
    }

    this.wordCount++;

    // Track per-category counts
    this.categoryCounts[category] = (this.categoryCounts[category] || 0) + 1;

    // Track word frequency per category
    if (wordText) {
      if (!this.categoryWords[category]) this.categoryWords[category] = {};
      this.categoryWords[category][wordText] = (this.categoryWords[category][wordText] || 0) + 1;
      // Maintain ordered list of top words (deduplicated, most recent appearance order)
      const existing = this.topWordsOrdered.findIndex(w => w.word === wordText);
      if (existing >= 0) this.topWordsOrdered.splice(existing, 1);
      this.topWordsOrdered.push({ word: wordText, category, color: descriptor.color });
    }
  }

  /**
   * Store a 3D position where a semantic word appeared (for the constellation system).
   * Maintains a rolling window of the last 40 positions.
   * @param {number} x - X coordinate in world space.
   * @param {number} y - Y coordinate in world space.
   * @param {number} z - Z coordinate in world space.
   * @param {*} color - Color value associated with this word (typically THREE.Color).
   */
  recordPosition(x, y, z, color) {
    this.recentWords.push({ x, y, z, color, time: performance.now() });
    if (this.recentWords.length > 40) {
      this.recentWords.shift();
    }
  }

  /**
   * Get a snapshot of the current accumulated emotional state.
   * Includes per-category breakdowns and top words for the outro summary.
   * @returns {MemoryState} The current state of all emotional dimensions.
   */
  getState() {
    return {
      warmth: this.warmth,
      melancholy: this.melancholy,
      energy: this.energy,
      wonder: this.wonder,
      wordCount: this.wordCount,
      categoryCounts: { ...this.categoryCounts },
      topWordsOrdered: [...this.topWordsOrdered],
    };
  }

  /**
   * Get the top N semantic categories sorted by count (descending).
   * @param {number} [n=3] - Number of top categories to return.
   * @returns {Array<{category: string, count: number, color: [number,number,number]}>}
   */
  getTopCategories(n = 3) {
    return Object.entries(this.categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([category, count]) => ({
        category,
        count,
        color: CATEGORY_COLORS[category] || [0.5, 0.5, 0.5],
      }));
  }

  /**
   * Get the top N most-seen semantic words, each with its category color.
   * @param {number} [n=3] - Number of top words to return.
   * @returns {Array<{word: string, category: string, count: number, color: [number,number,number]}>}
   */
  getTopWords(n = 3) {
    // Flatten all category word counts into a single sorted list
    const allWords = [];
    for (const [category, words] of Object.entries(this.categoryWords)) {
      for (const [word, count] of Object.entries(words)) {
        const color = CATEGORY_COLORS[category] || [0.5, 0.5, 0.5];
        allWords.push({ word, category, count, color });
      }
    }
    allWords.sort((a, b) => b.count - a.count);
    return allWords.slice(0, n);
  }
}
