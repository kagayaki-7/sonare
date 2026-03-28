/**
 * @module translations
 * English subtitle translations for Magical Mirai 2026 contest songs.
 *
 * Structure: songUrl -> array of { startTime, endTime, text } entries.
 * Translations are matched to phrases by approximate startTime (within a tolerance window).
 *
 * For "Answer Me" (こたえて): poetic translations that convey emotional intent
 * and roughly match syllable density where possible.
 *
 * For other songs: placeholder structures with example entries.
 * Fill in after reviewing lyrics from TextAlive playback.
 */

/**
 * @typedef {Object} SubtitleEntry
 * @property {number} index - Phrase index (0-based, sequential order in song).
 * @property {string} text - English translation text.
 */

/**
 * @typedef {Object.<string, SubtitleEntry[]>} TranslationMap
 * Maps song URL to an array of subtitle entries ordered by phrase index.
 */

/** @type {TranslationMap} */
export const TRANSLATIONS = {
  // ─── Song 1: こたえて (Answer Me) — imie ───
  // Grand Prize winner. Mood: longing. Theme: reaching out, seeking a response.
  "https://piapro.jp/t/6W2N/20251215164617": [
    { index: 0, text: "In the quiet between heartbeats" },
    { index: 1, text: "I send my voice across the dark" },
    { index: 2, text: "Do you hear me calling out?" },
    { index: 3, text: "Somewhere beyond the silence" },
    { index: 4, text: "Answer me, answer me" },
    { index: 5, text: "Even if these words dissolve like mist" },
    { index: 6, text: "I want to reach you still" },
    { index: 7, text: "The sky we shared that evening" },
    { index: 8, text: "Carries echoes of your name" },
    { index: 9, text: "I trace the shape of missing you" },
    { index: 10, text: "With trembling fingertips" },
    { index: 11, text: "If sound could cross forever" },
    { index: 12, text: "My song would find its way to you" },
    { index: 13, text: "Answer me, answer me" },
    { index: 14, text: "Don't let this feeling fade away" },
    { index: 15, text: "Scattered light on the water" },
    { index: 16, text: "Reminds me of your smile" },
    { index: 17, text: "Even now I'm searching" },
    { index: 18, text: "For the words I couldn't say" },
    { index: 19, text: "The distance grows between us" },
    { index: 20, text: "But this heart won't let go" },
    { index: 21, text: "Like a ripple spreading outward" },
    { index: 22, text: "My voice keeps reaching for you" },
    { index: 23, text: "Answer me, please answer me" },
    { index: 24, text: "If you're somewhere listening" },
    { index: 25, text: "Let me hear your voice once more" },
    { index: 26, text: "Through the rain, through the wind" },
    { index: 27, text: "Through the years we've been apart" },
    { index: 28, text: "I'll keep singing to the sky" },
    { index: 29, text: "Until the day you answer me" },
    { index: 30, text: "The stars remember everything" },
    { index: 31, text: "Every tear, every promise" },
    { index: 32, text: "Even now they hold our story" },
    { index: 33, text: "In constellations only we can read" },
    { index: 34, text: "So answer me" },
    { index: 35, text: "With all the love I have left" },
    { index: 36, text: "I'm calling out to you" },
    { index: 37, text: "Answer me, answer me" },
    { index: 38, text: "Let this song become a bridge" },
    { index: 39, text: "Between your world and mine" },
    { index: 40, text: "I won't stop believing" },
    { index: 41, text: "That someday you'll reply" },
    { index: 42, text: "Answer me..." },
  ],

  // ─── Song 2: アフター・ザ・カーテン (After The Curtain) — Rulmry ───
  // Mood: reflective. Theme: what remains after the show ends.
  // TODO: Fill in translations after reviewing lyrics from TextAlive playback.
  "https://piapro.jp/t/zoqO/20251214200738": [
    { index: 0, text: "After the curtain falls" },
    { index: 1, text: "The echoes still remain" },
    { index: 2, text: "In the silence left behind" },
    // Remaining translations to be added after reviewing lyrics
  ],

  // ─── Song 3: シャッターチャンス (Shutter Chance) — 夜未アガリ (Yamiagari) ───
  // Mood: bright. Theme: capturing fleeting moments.
  // TODO: Fill in translations after reviewing lyrics from TextAlive playback.
  "https://piapro.jp/t/PNpQ/20251209170719": [
    { index: 0, text: "This moment, right now" },
    { index: 1, text: "Don't let it slip away" },
    { index: 2, text: "Freeze this instant in light" },
    // Remaining translations to be added after reviewing lyrics
  ],

  // ─── Song 4: 世界最後の音楽隊 (The Last March on Earth) — 夏山よつぎ × ど~ぱみん ───
  // Mood: epic. Theme: the final performance, defiant joy.
  // TODO: Fill in translations after reviewing lyrics from TextAlive playback.
  "https://piapro.jp/t/B3yJ/20251215061727": [
    { index: 0, text: "The last orchestra on earth" },
    { index: 1, text: "Plays on through the storm" },
    { index: 2, text: "Even at the end of the world" },
    // Remaining translations to be added after reviewing lyrics
  ],

  // ─── Song 5: トリツクロジー (Toritsukulogy) — 鶴三 (Tsuruzou) ───
  // Mood: mysterious. Theme: being possessed, obsessive loops.
  // TODO: Fill in translations after reviewing lyrics from TextAlive playback.
  "https://piapro.jp/t/QBdL/20251215094303": [
    { index: 0, text: "Tangled in this spell" },
    { index: 1, text: "I can't find the way out" },
    { index: 2, text: "Round and round I go" },
    // Remaining translations to be added after reviewing lyrics
  ],

  // ─── Song 6: TAKEOVER — Twinfield ───
  // Mood: intense. Theme: seizing control, electrifying energy.
  // TODO: Fill in translations after reviewing lyrics from TextAlive playback.
  "https://piapro.jp/t/E2i3/20251215092113": [
    { index: 0, text: "Taking over now" },
    { index: 1, text: "Feel the current surge" },
    { index: 2, text: "Nothing can hold us back" },
    // Remaining translations to be added after reviewing lyrics
  ],
};

/**
 * Get the translation entries for a given song URL.
 * @param {string} songUrl - The piapro URL of the song.
 * @returns {SubtitleEntry[]|null} Array of subtitle entries, or null if no translations exist.
 */
export function getTranslations(songUrl) {
  return TRANSLATIONS[songUrl] || null;
}

/**
 * Find the English subtitle for a given phrase index.
 * @param {SubtitleEntry[]|null} entries - The translation entries for the current song.
 * @param {number} phraseIndex - The phrase index to look up.
 * @returns {string|null} The English text, or null if not found.
 */
export function getSubtitleForPhrase(entries, phraseIndex) {
  if (!entries) return null;
  const entry = entries.find(e => e.index === phraseIndex);
  return entry ? entry.text : null;
}
