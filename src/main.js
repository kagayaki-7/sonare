/**
 * @module main
 * Sonare — 湖のソナーレ — Magical Mirai 2026 contest entry.
 *
 * Orchestrates the TextAlive API, 3D scene, lyric display, and user interactions.
 * This is the application entry point: it initializes the player, wires up
 * event handlers, and drives the render loop.
 */

import { Player } from "textalive-app-api";
import { SonareScene } from "./scene.js";
import { SONGS } from "./songs.js";
import { initSeed, deriveSeedFingerprint } from "./prng.js";
import { matchWord, LyricMemory } from "./lyricSemantics.js";
import { getLang, setLanguage, t, applyToDOM } from "./i18n.js";
import { getTranslations, getSubtitleForPhrase } from "./translations.js";

/** @type {import('./songs.js').SongDefinition[]} */
const ALL_SONGS = SONGS; // alias kept for readability across 30+ call sites

// ─── Seed system ───
const { seed, hex: seedHex } = initSeed();

// ─── DOM refs ───
// All DOM lookups are done once at startup. Null checks guard against missing elements.
const loadingEl = document.getElementById("loading");
const loadingStatus = document.getElementById("loading-status");
const songSelectEl = document.getElementById("song-select");
const songListEl = document.getElementById("song-list");
const hudEl = document.getElementById("hud");
const phraseDisplay = document.getElementById("phrase-display");
const songTitleEl = document.getElementById("song-title");
const songArtistEl = document.getElementById("song-artist");
const progressFill = document.getElementById("progress-fill");
const timeDisplay = document.getElementById("time-display");
const btnPlay = document.getElementById("btn-play");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnFullscreen = document.getElementById("btn-fullscreen");
const progressBar = document.getElementById("progress-bar");
const seedDisplay = document.getElementById("seed-display");
const retryBtn = document.getElementById("retry-btn");
const introCard = document.getElementById("intro-card");
const introSongTitle = document.getElementById("intro-song-title");
const introSongArtist = document.getElementById("intro-song-artist");
const outroCard = document.getElementById("outro-card");
const outroStats = document.getElementById("outro-stats");
const semanticTooltip = document.getElementById("semantic-tooltip");
const sectionAnnounce = document.getElementById("section-announce");
const rhythmAnnounce = document.getElementById("rhythm-announce");
const langToggle = document.getElementById("lang-toggle");
const subtitleEl = document.getElementById("subtitle-en");

// ─── Feature detection ───
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ─── State ───
/** @type {Player|null} */
let player = null;
/** @type {SonareScene|null} */
let scene = null;
let currentSongIndex = 0;
let isReady = false;
let animFrameId = null;
let lastBeatIndex = -1;
let lastChorusState = false;
let lastChordName = "";
let lastWordIndex = -1;
/** @type {Array<{el: HTMLSpanElement, startTime: number, endTime: number, semanticColor?: string, wordDuration?: number}>} */
let phraseChars = [];
let currentMoodClass = "mood-gentle";
let _smoothGlow = 0;    // smoothed glow radius (CSS property)
let _smoothScale = 0;   // smoothed active scale (CSS property)
/** @type {Set<string>} Track phrase repetition for visual callbacks */
let seenPhrases = new Set();
let rhythmCombo = 0;
let lastTapTime = 0;
/** @type {string[]} Last N chord names for progression detection */
let chordHistory = [];
let lastPhraseEndTime = 0;
let phraseSemanticCount = 0;
/** @type {Set<number>} Semantic group IDs that have already triggered their active-word ripple this phrase */
let activeSemanticGroupsTriggered = new Set();
let cachedDurationStr = "0:00";
let cachedDurationMs = 0;

// Lyric density tracking (words per second)
/** @type {number[]} Recent word timestamps for density calculation */
let recentWordTimes = [];
let currentLyricDensity = 0;

let lastSectionType = "";
/** @type {Object|null} Cached chorus segments for "familiar territory" detection */
let chorusSegments = null;
let inFamiliarTerritory = false;

/** Lyric memory -- accumulates semantic meaning over the song duration. */
const lyricMemory = new LyricMemory();

/** @type {import('./translations.js').SubtitleEntry[]|null} Current song's English subtitle entries. */
let currentTranslations = null;
/** @type {number} Tracks the current phrase index for subtitle lookup. */
let currentPhraseIndex = 0;

// Emotional journey timeline
const journeyFill = document.getElementById("journey-fill");

// ─── Initialize ───

/**
 * Initialize the entire application: create the 3D scene, set up the TextAlive player,
 * wire up all DOM event listeners, and start the render loop.
 */
function init() {
  const canvasContainer = document.getElementById("canvas-container");
  if (!canvasContainer) {
    console.error("[Sonare] Fatal: #canvas-container not found in DOM.");
    return;
  }

  // Create 3D scene with procedural seed
  try {
    scene = new SonareScene(canvasContainer, seed);
    scene.detectQuality(); // auto-adjusts for GPU capability
  } catch (err) {
    console.error("[Sonare] Failed to initialize 3D scene:", err);
    if (loadingStatus) loadingStatus.textContent = t("loading.status.gfx-error");
    return;
  }

  startRenderLoop();

  // Display seed with visual fingerprint dots
  if (seedDisplay) {
    const fp = deriveSeedFingerprint(seed);
    // Build fingerprint dots HTML
    const dotsHtml = fp.dotColors
      .map(({ h, s, l }) => {
        const hDeg = Math.round(h * 360);
        const sPct = Math.round(s * 100);
        const lPct = Math.round(l * 100);
        return `<span class="seed-dot" style="background:hsl(${hDeg},${sPct}%,${lPct}%)"></span>`;
      })
      .join("");
    // Highlight "39" (mi-ku) occurrences in the seed hex string
    const seedHexHighlighted = seedHex.replace(/39/g, '<span class="seed-39">39</span>');
    seedDisplay.innerHTML = `<span class="seed-dots">${dotsHtml}</span><span class="seed-hex">#${seedHexHighlighted}</span>`;
    seedDisplay.title = t("seed.title", { hex: seedHex });
    seedDisplay.addEventListener("click", copySeedLink);
  }

  // Create TextAlive player
  // Token loaded from .env (VITE_TEXTALIVE_TOKEN) — stored in macOS Keychain as backup
  player = new Player({
    app: {
      token: import.meta.env.VITE_TEXTALIVE_TOKEN || "OOg2GT3QN2gYMRLJ",
    },
    mediaElement: document.createElement("div"), // headless audio
  });

  player.addListener({
    onAppReady,
    onVideoReady,
    onTimerReady,
    onTimeUpdate,
    onPlay: () => {
      try {
        updatePlayButton(true);
        if (scene) scene.setPlaying(true);
      } catch (err) {
        console.error("[Sonare] Error in onPlay handler:", err);
      }
    },
    onPause: () => {
      try {
        updatePlayButton(false);
        if (scene) scene.setPlaying(false);
      } catch (err) {
        console.error("[Sonare] Error in onPause handler:", err);
      }
    },
    onStop: () => {
      try {
        updatePlayButton(false);
        if (scene) scene.setPlaying(false);
        clearPhraseDisplay();
      } catch (err) {
        console.error("[Sonare] Error in onStop handler:", err);
      }
    },
    onError: (error) => {
      console.error("TextAlive error:", error);
      if (loadingStatus) {
        loadingStatus.textContent = t("loading.status.error");
        loadingStatus.classList.add("error");
      }
    },
    onAppMediaChange: () => {
      try {
        // Song changed in managed mode
        clearPhraseDisplay();
        lastBeatIndex = -1;
        lastChorusState = false;
        lastChordName = "";
        lastWordIndex = -1;
        lyricMemory.reset();
      } catch (err) {
        console.error("[Sonare] Error in onAppMediaChange handler:", err);
      }
    },
  });

  // Wire up controls (with null guards)
  if (btnPlay) btnPlay.addEventListener("click", togglePlay);
  if (btnPrev) btnPrev.addEventListener("click", () => changeSong(-1));
  if (btnNext) btnNext.addEventListener("click", () => changeSong(1));
  if (btnFullscreen) btnFullscreen.addEventListener("click", toggleFullscreen);
  if (progressBar) progressBar.addEventListener("click", onProgressClick);

  // Touch/click anywhere on canvas to play (mobile audio policy) + rhythm tap
  canvasContainer.addEventListener("click", (e) => {
    if (!isReady || !player) return;
    if (!player.isPlaying) {
      player.requestPlay();
      return;
    }
    // Rhythm tap — compare tap time to nearest beat
    handleRhythmTap(e);
  });

  // Keyboard controls
  document.addEventListener("keydown", onKeyDown);

  // Focus trap for song selector dialog
  document.addEventListener("keydown", handleSongSelectFocusTrap);

  // Retry button
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      retryBtn.classList.remove("visible");
      if (loadingStatus) {
        loadingStatus.classList.remove("error");
        loadingStatus.textContent = t("loading.status.retrying");
      }
      location.reload();
    });
  }

  // Language toggle
  if (langToggle) {
    langToggle.addEventListener("click", () => {
      const newLang = getLang() === "ja" ? "en" : "ja";
      setLanguage(newLang);
      // Show English subtitles when language is EN, hide when JA
      document.body.dataset.subtitles = newLang === "en" ? "on" : "off";
      // Re-build song cards so water descriptors + badges update
      if (songListEl && !songSelectEl?.classList.contains("hidden")) {
        buildSongCards();
      }
    });
  }

  // Apply saved language preference to DOM
  applyToDOM();
  // Initialize subtitle visibility based on current language
  document.body.dataset.subtitles = getLang() === "en" ? "on" : "off";

  // Tell the scene about reduced-motion preference
  if (prefersReducedMotion && scene) {
    scene.setReducedMotion(true);
  }

  // B4: HUD auto-hide — fade out HUD elements during playback, show on mouse move
  let hudHideTimer = null;
  const hudContainer = document.body;
  function showHud() {
    hudContainer.classList.add("hud-visible");
    hudContainer.classList.remove("hud-hidden");
    clearTimeout(hudHideTimer);
    hudHideTimer = setTimeout(() => {
      if (player && player.isPlaying) {
        hudContainer.classList.remove("hud-visible");
        hudContainer.classList.add("hud-hidden");
      }
    }, 2000);
  }
  document.addEventListener("mousemove", showHud);
  document.addEventListener("touchstart", showHud, { passive: true });
  // Start in hidden state (will become visible when user moves mouse)
  hudContainer.classList.add("hud-hidden");

  if (loadingStatus) loadingStatus.textContent = t("loading.status.connecting");
  startLoadingTimeout(15000);
}

// ─── Seed link copy ───

/**
 * Copy a shareable URL with the current seed to the clipboard.
 */
function copySeedLink() {
  try {
    const url = new URL(window.location);
    url.searchParams.set("seed", seedHex);
    navigator.clipboard?.writeText(url.toString()).then(() => {
      if (seedDisplay) {
        seedDisplay.textContent = `#${seedHex} ✓`;
        setTimeout(() => { seedDisplay.textContent = `#${seedHex}`; }, 1500);
      }
    });
  } catch (err) {
    console.error("[Sonare] Failed to copy seed link:", err);
  }
}

// ─── TextAlive callbacks ───

/**
 * Called when the TextAlive app connection is established.
 * Determines whether to show the song selector or wait for managed mode.
 * @param {Object} app - The TextAlive app info object.
 * @param {boolean} app.managed - Whether the app is running in managed mode.
 * @param {string} [app.songUrl] - Song URL if provided via query param.
 */
function onAppReady(app) {
  try {
    if (loadingStatus) loadingStatus.textContent = t("loading.status.connected");

    if (app.managed) {
      // Running inside TextAlive host — song is provided
      return;
    }

    if (app.songUrl) {
      // Song URL provided via query param
      return;
    }

    // Show song selector
    showSongSelect();
  } catch (err) {
    console.error("[Sonare] Error in onAppReady:", err);
  }
}

/**
 * Called when the video (song + lyrics) data is loaded and ready.
 * Assigns word-level animate callbacks and updates the HUD with song info.
 * @param {Object} _v - The video object (unused; we access player.video directly).
 */
function onVideoReady(_v) {
  try {
    if (loadingStatus) loadingStatus.textContent = t("loading.status.preparing");

    // Assign animate callbacks to all words
    if (player && player.video) {
      let w = player.video.firstWord;
      while (w) {
        w.animate = animateWord;
        w = w.next;
      }
    }

    // Update song info in HUD
    const song = player?.data?.song;
    if (song) {
      if (songTitleEl) songTitleEl.textContent = song.name || "";
      if (songArtistEl) songArtistEl.textContent = song.artist?.name || "";
      // Announce song change to screen readers
      if (sectionAnnounce) sectionAnnounce.textContent = t("announce.playing", { title: song.name || "", artist: song.artist?.name ? ` by ${song.artist.name}` : "" });
    }

    // Cache chorus segments for "familiar territory" detection
    chorusSegments = null;
    try {
      if (player.findChorus) {
        // Probe for chorus segments by scanning the timeline
        const dur = player.video?.duration || 0;
        const segments = [];
        let scanPos = 0;
        while (scanPos < dur) {
          const c = player.findChorus(scanPos);
          if (c) {
            if (!segments.length || segments[segments.length - 1].startTime !== c.startTime) {
              segments.push({ startTime: c.startTime, endTime: c.endTime || (c.startTime + (c.duration || 0)) });
            }
            scanPos = (c.endTime || (c.startTime + (c.duration || 0))) + 100;
          } else {
            scanPos += 5000;
          }
        }
        if (segments.length > 1) {
          chorusSegments = segments;
        }
      }
    } catch (_) { /* findChorus may not be available */ }
  } catch (err) {
    console.error("[Sonare] Error in onVideoReady:", err);
  }
}

let introShown = false;

/**
 * Called when the TextAlive timer is ready (audio loaded, playback possible).
 * Triggers the cinematic intro sequence and auto-play.
 */
function onTimerReady() {
  try {
    clearLoadingTimeout();
    if (loadingStatus) loadingStatus.textContent = t("loading.status.ready");
    isReady = true;

    // Only show intro once per song load
    if (introShown) return;
    introShown = true;

    // Start cinematic intro
    if (scene) scene.startIntro();

    // Fade out loading screen
    if (loadingEl) loadingEl.classList.add("fade-out");
    setTimeout(() => {
      if (loadingEl) loadingEl.classList.add("hidden");
      if (songSelectEl) songSelectEl.classList.add("hidden");

      // Show intro title card
      showIntroCard();

      // After intro card, reveal HUD and auto-play
      setTimeout(() => {
        hideIntroCard();
        if (hudEl) hudEl.classList.remove("hidden");
        if (phraseDisplay) phraseDisplay.classList.remove("hidden");
        // Auto-play after intro
        if (player && !player.isPlaying) player.requestPlay();
      }, 2500);
    }, 800);
  } catch (err) {
    console.error("[Sonare] Error in onTimerReady:", err);
  }
}

/**
 * Called on every timer tick during playback. This is the main per-frame logic
 * for beat detection, chord analysis, lyric display, and semantic effects.
 * @param {number} position - Current playback position in milliseconds.
 */
function onTimeUpdate(position) {
  try {
    if (!player || !player.video) return;

    const duration = player.video.duration;
    const progress = duration > 0 ? position / duration : 0;

    if (progressFill) progressFill.style.width = `${progress * 100}%`;
    if (progressBar) progressBar.setAttribute("aria-valuenow", Math.round(progress * 100));
    if (timeDisplay) {
      if (duration !== cachedDurationMs) {
        cachedDurationMs = duration;
        cachedDurationStr = formatTime(duration);
      }
      timeDisplay.textContent = `${formatTime(position)} / ${cachedDurationStr}`;
    }

    // Feed song progress to scene for visual arc
    if (scene) scene.setSongProgress(progress);

    // ── Beat detection — hierarchical beat strength ──
    // Beat 1 strongest (1.0), beat 3 next (0.65), beats 2/4 lightest (0.3)
    const beat = player.findBeat?.(position);
    if (beat && beat.index !== lastBeatIndex) {
      lastBeatIndex = beat.index;
      const beatPos = beat.position || 1;
      let intensity;
      if (beatPos === 1) intensity = 1.0;
      else if (beatPos === 3) intensity = 0.65;
      else intensity = 0.3;
      if (scene) scene.triggerBeat(intensity);
      if (beatPos === 1 && lastChorusState && scene) {
        scene.triggerBeat(1.2);
      }
    }

    // ── Chorus detection ──
    const chorus = player.findChorus?.(position);
    const inChorus = !!chorus;
    if (inChorus !== lastChorusState) {
      lastChorusState = inChorus;
      if (scene) scene.setChorus(inChorus);
      if (phraseDisplay) phraseDisplay.classList.toggle("chorus", inChorus);
    }

    // ── Repetitive segment / "familiar territory" detection ──
    // When we're in a chorus that appeared earlier, trigger enhanced visuals
    if (chorusSegments && chorusSegments.length > 1 && inChorus) {
      const currentChorus = chorusSegments.find(s => position >= s.startTime && position <= s.endTime);
      const isRepeat = currentChorus && currentChorus !== chorusSegments[0];
      if (isRepeat && !inFamiliarTerritory) {
        inFamiliarTerritory = true;
        if (scene) scene.triggerFamiliarTerritory(true);
      }
    } else if (inFamiliarTerritory && !inChorus) {
      inFamiliarTerritory = false;
      if (scene) scene.triggerFamiliarTerritory(false);
    }

    // ── Section structure (verse/chorus/bridge awareness) ──
    const currentPhrase = player.video.findPhrase?.(position);
    const hasLyrics = !!currentPhrase;
    const sectionType = inChorus ? "chorus" : hasLyrics ? "verse" : "bridge";
    if (scene) scene.setSection(sectionType);

    // Announce section changes to screen readers
    if (sectionType !== lastSectionType) {
      lastSectionType = sectionType;
      if (sectionAnnounce) {
        const sectionI18nKeys = { chorus: "section.chorus", verse: "section.verse", bridge: "section.bridge" };
        sectionAnnounce.textContent = sectionI18nKeys[sectionType] ? t(sectionI18nKeys[sectionType]) : sectionType;
      }
    }

    // ── Chord detection -> harmonic visual shifts ──
    const chord = player.findChord?.(position);
    if (chord && chord.name !== lastChordName) {
      lastChordName = chord.name;
      if (scene) scene.triggerChordChange(chord.name);

      chordHistory.push(chord.name);
      if (chordHistory.length > 8) chordHistory.shift();

      if (chordHistory.length >= 4) {
        const current = chordHistory[chordHistory.length - 1];
        const earlier = chordHistory.slice(0, -3);
        if (earlier.includes(current) && scene) {
          scene.triggerChordResolution();
        }
      }

      const isMinor = chord.name.includes("m") && !chord.name.includes("maj");
      if (scene) scene.setHarmonicMode(isMinor ? -1 : 1);
    }

    // ── Valence/Arousal energy -> mood-responsive lyrics ──
    const va = player.getValenceArousal?.(position);
    if (va) {
      if (scene) scene.setEnergy(va.v, va.a);
      updateLyricMood(va.v, va.a);
    }

    // ── Vocal amplitude -> orb breath (scene only) ──
    // NOTE: --glow-radius is set by updateLyricMood() with smoothing.
    // Do NOT set it here — that caused two systems fighting over the same property.
    const vocalAmp = player.getVocalAmplitude?.(position);
    if (vocalAmp !== undefined && vocalAmp !== null) {
      if (scene) scene.setVocalAmplitude(vocalAmp);
    }

    // ── Phrase display (DOM-based for crisp text) ──
    const phrase = player.video.findPhrase?.(position) ?? null;
    updatePhraseDisplay(phrase, position);

    // ── Word-level: semantic analysis, duration effects, beat emphasis ──
    const word = player.video.findWord?.(position);
    if (word && word.startTime <= position && position < word.endTime) {
      const wordProgress = (position - word.startTime) / (word.endTime - word.startTime);
      const wordDuration = word.endTime - word.startTime;

      if (word.index !== lastWordIndex && wordProgress < 0.15) {
        lastWordIndex = word.index;
        const text = word.text;

        // Lyric density tracking: record word timestamp and compute running WPS
        recentWordTimes.push(position);
        // Keep only words from the last 3 seconds
        while (recentWordTimes.length > 0 && position - recentWordTimes[0] > 3000) {
          recentWordTimes.shift();
        }
        currentLyricDensity = recentWordTimes.length / 3; // words per second over 3s window
        if (scene) scene.setLyricDensity(currentLyricDensity);

        // Apply density CSS classes so high-density (rapid lyrics) and low-density
        // (sparse, breathing) moments have visually distinct character treatments
        if (phraseDisplay) {
          phraseDisplay.classList.toggle("density-high", currentLyricDensity > 2.5);
          phraseDisplay.classList.toggle("density-low", currentLyricDensity < 0.8 && currentLyricDensity > 0);
        }

        const semantic = matchWord(text);
        if (semantic) {
          lyricMemory.accumulate(semantic, text);
          if (scene) {
            scene.triggerSemanticEffect(semantic);
            scene.setMemoryState(lyricMemory.getState());
          }
          colorSemanticChars(word, semantic);
        } else {
          if (scene) scene.triggerWordEffect("burst", text);
        }

        // Word-level timing: mark chars with duration class
        applyWordTimingClass(word, wordDuration);

        // Beat strength -> character emphasis
        if (beat) {
          const beatPos = beat.position || 1;
          applyBeatEmphasis(word, beatPos);
        }
      }

      // Sustained word: if >800ms and past halfway, add "held" shimmer
      if (wordDuration > 800 && wordProgress > 0.5) {
        markHeldChars(word);
      }
    }

    // ── Emotional journey (updates continuously) ──
    updateEmotionalJourney(progress);

    // ── Outro detection — trigger near end of song ──
    if (progress > 0.97 && !outroTriggered) {
      triggerOutro();
    }
  } catch (err) {
    console.error("[Sonare] Error in onTimeUpdate:", err);
  }
}

/**
 * Word animate callback (called by the TextAlive API per word per frame).
 * Rendering is handled in onTimeUpdate; this stub keeps the API happy.
 * @param {number} _now - Current time.
 * @param {Object} _unit - The word unit.
 */
function animateWord(_now, _unit) {
  // We handle rendering in onTimeUpdate, but this keeps the API happy
}

// ─── Build phrase characters (DOM) ───

/**
 * Build character-level span elements for a phrase and append them to the display.
 * Groups characters by their parent word to prevent mid-word line breaks.
 * @param {Object} phrase - The TextAlive phrase object.
 */
function buildPhraseChars(phrase) {
  if (!phrase || !phraseDisplay) return;
  let c = phrase.firstChar;
  let currentWordEl = null;
  let currentWord = null;

  while (c) {
    const charWord = c.parent;
    if (charWord !== currentWord) {
      const prevWord = currentWord;
      currentWord = charWord;
      // Merge single-kana particles (て, に, を, は, が, の, で, と, も, か, へ, よ, ね, な, さ, ら)
      // with the previous word to avoid awkward line breaks on verb conjugations
      const wordText = charWord.text || "";
      const isParticle = wordText.length === 1 && /[てにをはがのでともかへよねなさらけだばたりれ]/.test(wordText);
      if (isParticle && prevWord && currentWordEl) {
        // Don't create a new word element — append to the previous one
      } else {
        currentWordEl = document.createElement("span");
        currentWordEl.className = "word";
        phraseDisplay.appendChild(currentWordEl);
      }
    }

    const span = document.createElement("span");
    span.className = "char";
    span.textContent = c.text;
    span.style.setProperty("--char-i", phraseChars.length);
    currentWordEl.appendChild(span);
    phraseChars.push({ el: span, startTime: c.startTime, endTime: c.endTime });
    c = c.next;
    if (c && c.parent?.parent !== phrase) break;
  }

  phraseDisplay.querySelectorAll(".word").forEach(wordEl => {
    wordEl.addEventListener("click", (e) => {
      e.stopPropagation();
      if (wordEl.querySelector(".semantic")) {
        showSemanticTooltip(wordEl, e);
      }
    });
  });
}

// ─── Phrase display (DOM) ───

/**
 * Update the lyric phrase display. Manages phrase transitions, character state
 * (upcoming/active/sung), and inter-phrase timing analysis.
 * @param {Object|null} phrase - The current TextAlive phrase, or null if between phrases.
 * @param {number} position - Current playback position in ms.
 */
function updatePhraseDisplay(phrase, position) {
  if (!phraseDisplay) return;

  try {
    if (!phrase) {
      // B2: No lyrics visible — let the scene breathe at full intensity
      if (scene) scene.setLyricActive(false);
      clearSubtitle();
      if (phraseDisplay.dataset.phrase) {
        phraseDisplay.classList.add("fade-out-phrase");
        setTimeout(() => {
          if (phraseDisplay) {
            phraseDisplay.innerHTML = "";
            phraseDisplay.dataset.phrase = "";
            phraseDisplay.classList.remove("fade-out-phrase");
          }
        }, 500);
        phraseDisplay.dataset.phrase = "";
        phraseChars = [];
      }
      if (lastPhraseEndTime > 0 && position - lastPhraseEndTime > 2000) {
        if (scene) scene.setBreathingSpace(true);
        // Sparse section: decay lyric density to zero for spacious feel
        if (scene) scene.setLyricDensity(0);
      }
      return;
    }

    // B2: Lyrics are active — dim the scene so lyrics are primary
    if (scene) scene.setLyricActive(true);
    // Dismiss intro card immediately when first lyrics appear
    hideIntroCard();

    const phraseText = phrase.text;
    if (phraseDisplay.dataset.phrase !== phraseText) {
      const hadContent = phraseDisplay.dataset.phrase && phraseDisplay.innerHTML;
      phraseDisplay.dataset.phrase = phraseText;
      const announceEl = document.getElementById("lyric-announce");
      if (announceEl) announceEl.textContent = phraseText;
      phraseChars = [];
      phraseDisplay.classList.remove("fade-out-phrase", "phrase-enter", "dense-semantic", "density-high", "density-low");
      phraseSemanticCount = 0;
      activeSemanticGroupsTriggered.clear();

      // Show English subtitle for this phrase
      showSubtitle(currentPhraseIndex);
      currentPhraseIndex++;

      if (hadContent) {
        phraseDisplay.classList.add("phrase-exit");
        setTimeout(() => {
          if (!phraseDisplay) return;
          phraseDisplay.innerHTML = "";
          phraseDisplay.classList.remove("phrase-exit");
          buildPhraseChars(phrase);
          phraseDisplay.classList.add("phrase-enter");
          phraseDisplay.addEventListener("animationend", function onEnd() {
            phraseDisplay.classList.remove("phrase-enter");
            phraseDisplay.removeEventListener("animationend", onEnd);
          });
        }, 350);
      } else {
        phraseDisplay.innerHTML = "";
        buildPhraseChars(phrase);
        phraseDisplay.classList.add("phrase-enter");
        phraseDisplay.addEventListener("animationend", function onEnd() {
          phraseDisplay.classList.remove("phrase-enter");
          phraseDisplay.removeEventListener("animationend", onEnd);
        });
      }

      // Phrase repetition
      if (seenPhrases.has(phraseText)) {
        phraseDisplay.classList.add("phrase-echo");
        if (scene) scene.triggerBeat(0.6);
      } else {
        seenPhrases.add(phraseText);
        phraseDisplay.classList.remove("phrase-echo");
      }

      // Inter-phrase timing analysis
      const gapMs = phrase.startTime - lastPhraseEndTime;
      if (lastPhraseEndTime > 0 && scene) {
        if (gapMs > 2000) {
          scene.setBreathingSpace(false);
        } else if (gapMs < 200) {
          scene.setIntenseMode(true);
        } else {
          scene.setIntenseMode(false);
        }
      }
      lastPhraseEndTime = phrase.endTime;
    }

    // ── Disney-quality character state machine ──
    // Longer foreshadowing, proximity glow, multi-stage anticipation
    const currentBeat = player?.findBeat?.(position);
    const isCurrentDownbeat = currentBeat && currentBeat.position === 1;

    // Find the currently active character index for proximity effects
    let activeCharIdx = -1;
    for (let ci = 0; ci < phraseChars.length; ci++) {
      if (position >= phraseChars[ci].startTime && position < phraseChars[ci].endTime) {
        activeCharIdx = ci;
        break;
      }
    }

    for (let ci = 0; ci < phraseChars.length; ci++) {
      const ch = phraseChars[ci];
      if (!ch.el) continue;
      const isSemantic = ch.semanticColor ? " semantic" : "";

      if (position >= ch.startTime && position < ch.endTime) {
        // ── ACTIVE ──
        const activeDuration = position - ch.startTime;
        let extra = "";
        if (isCurrentDownbeat && activeDuration < 150) extra += " char-downbeat";
        if (activeDuration > 500) extra += " char-held";
        if (ch.timingClass) extra += " " + ch.timingClass;
        ch.el.className = "char active" + isSemantic + extra;
        ch.el.style.removeProperty("opacity");
        ch.el.style.removeProperty("transform");
        ch.el.style.removeProperty("--char-glow-t");

      } else if (position >= ch.endTime) {
        // ── SUNG ──
        // Proximity afterglow: recently-sung chars near the active one stay brighter
        const timeSinceSung = position - ch.endTime;
        const distFromActive = activeCharIdx >= 0 ? Math.abs(ci - activeCharIdx) : 99;
        ch.el.className = "char sung" + isSemantic;
        ch.el.style.removeProperty("transform");

        if (timeSinceSung < 1200 && distFromActive <= 3) {
          // Trailing warmth — chars just sung near the active char glow brighter
          const recency = 1 - (timeSinceSung / 1200);
          const proximity = 1 - (distFromActive / 4);
          const afterglow = recency * proximity * 0.12;
          ch.el.style.opacity = (0.88 + afterglow).toFixed(3);
        } else {
          ch.el.style.removeProperty("opacity");
        }
        ch.el.style.removeProperty("--char-glow-t");

      } else {
        // ── UPCOMING ──
        const timeUntilActive = ch.startTime - position;

        if (timeUntilActive <= 600 && timeUntilActive > 0) {
          // Multi-stage anticipation: 600ms foreshadowing window
          // Stage 1 (600-300ms): distant shimmer — barely noticeable brightening
          // Stage 2 (300-100ms): gathering breath — clear glow buildup
          // Stage 3 (100-0ms):   imminent flash — nearly active brightness
          const tLinear = 1 - (timeUntilActive / 600);

          let opacity, scale, glowClass;
          if (timeUntilActive > 300) {
            // Stage 1: distant shimmer (ease-in-cubic for very slow start)
            const t1 = (tLinear / 0.5); // 0→1 over first half
            const t1e = t1 * t1 * t1;
            opacity = 0.25 + t1e * 0.12; // 0.25→0.37
            scale = 1.0;
            glowClass = "char char-foreshadow" + isSemantic;
          } else if (timeUntilActive > 100) {
            // Stage 2: gathering breath (ease-in-out-quad)
            const t2 = 1 - ((timeUntilActive - 100) / 200); // 0→1
            const t2e = t2 < 0.5 ? 2 * t2 * t2 : 1 - (-2 * t2 + 2) * (-2 * t2 + 2) / 2;
            opacity = 0.37 + t2e * 0.25; // 0.37→0.62
            scale = 1.0 + t2e * 0.03; // 1.0→1.03
            glowClass = "char char-anticipation" + isSemantic;
          } else {
            // Stage 3: imminent (ease-out — fast start, smooth landing)
            const t3 = 1 - (timeUntilActive / 100);
            const t3e = 1 - (1 - t3) * (1 - t3);
            opacity = 0.62 + t3e * 0.28; // 0.62→0.90
            scale = 1.03 + t3e * 0.04; // 1.03→1.07
            glowClass = "char char-imminent" + isSemantic;
          }

          ch.el.className = glowClass;
          ch.el.style.opacity = opacity.toFixed(3);
          ch.el.style.transform = `scale(${scale.toFixed(4)})`;
          ch.el.style.setProperty("--char-glow-t", tLinear.toFixed(3));
        } else {
          // Beyond 600ms — proximity wave: chars near the active point brighten subtly
          ch.el.className = "char" + isSemantic;
          ch.el.style.removeProperty("transform");

          if (activeCharIdx >= 0) {
            const charDist = ci - activeCharIdx;
            // Only brighten upcoming chars (positive distance), up to 6 chars ahead
            if (charDist > 0 && charDist <= 6) {
              const wave = 1 - (charDist / 7);
              const waveOpacity = 0.25 + wave * 0.1;
              ch.el.style.opacity = waveOpacity.toFixed(3);
            } else {
              ch.el.style.removeProperty("opacity");
            }
          } else {
            ch.el.style.removeProperty("opacity");
          }
          ch.el.style.removeProperty("--char-glow-t");
        }
      }
    }

    // Semantic resonance pass: when any char in a semantic word is active,
    // all sibling chars in that word get a sympathetic glow + scene ripple on first activation
    let activeSemanticGroups = null;
    for (const ch of phraseChars) {
      if (ch.semanticGroupId && position >= ch.startTime && position < ch.endTime) {
        if (!activeSemanticGroups) activeSemanticGroups = new Set();
        activeSemanticGroups.add(ch.semanticGroupId);
        // First time this semantic word becomes active — trigger scene moment
        if (!activeSemanticGroupsTriggered.has(ch.semanticGroupId)) {
          activeSemanticGroupsTriggered.add(ch.semanticGroupId);
          if (scene && ch.semanticCategory) {
            scene.onSemanticWordActive(ch.semanticCategory, ch.semanticColor);
          }
        }
      }
    }
    if (activeSemanticGroups) {
      for (const ch of phraseChars) {
        if (!ch.el || !ch.semanticGroupId) continue;
        if (activeSemanticGroups.has(ch.semanticGroupId)) {
          // Add resonance to non-active siblings
          if (!(position >= ch.startTime && position < ch.endTime)) {
            ch.el.classList.add("semantic-resonance");
          }
          // Mark the word container as actively being sung
          const wordEl = ch.el.closest(".word");
          if (wordEl) wordEl.classList.add("semantic-word-active");
        } else {
          ch.el.classList.remove("semantic-resonance");
          const wordEl = ch.el.closest(".word");
          if (wordEl) wordEl.classList.remove("semantic-word-active");
        }
      }
    } else {
      // No active semantic words — clear all resonance and word-active states
      for (const ch of phraseChars) {
        if (ch.el && ch.semanticGroupId) {
          ch.el.classList.remove("semantic-resonance");
          const wordEl = ch.el.closest(".word");
          if (wordEl) wordEl.classList.remove("semantic-word-active");
        }
      }
    }
  } catch (err) {
    console.error("[Sonare] Error in updatePhraseDisplay:", err);
  }
}

/**
 * Clear the phrase display, removing all character elements and resetting state.
 */
function clearPhraseDisplay() {
  if (phraseDisplay) {
    phraseDisplay.innerHTML = "";
    phraseDisplay.dataset.phrase = "";
  }
  phraseChars = [];
  clearSubtitle();
}

// ─── English subtitle helpers ───

/**
 * Show the English subtitle for the current phrase.
 * @param {number} phraseIndex - The sequential index of the current phrase.
 */
function showSubtitle(phraseIndex) {
  if (!subtitleEl) return;
  const text = getSubtitleForPhrase(currentTranslations, phraseIndex);
  if (text) {
    subtitleEl.textContent = text;
    subtitleEl.classList.remove("fade-out");
    subtitleEl.classList.add("visible");
  } else {
    clearSubtitle();
  }
}

/**
 * Hide and clear the English subtitle with a fade-out transition.
 */
function clearSubtitle() {
  if (!subtitleEl) return;
  subtitleEl.classList.remove("visible");
  subtitleEl.classList.add("fade-out");
}

// ─── Semantic character coloring ───

/**
 * Tint the characters of a semantically recognized word with its category color.
 * When 3+ semantic words appear in one phrase, triggers a dense-semantic emphasis.
 * @param {Object} word - The TextAlive word object.
 * @param {import('./lyricSemantics.js').SemanticDescriptor} semantic - The matched descriptor.
 */
/** @type {number} Counter for unique semantic word group IDs */
let semanticGroupId = 0;

function colorSemanticChars(word, semantic) {
  if (!semantic || !word) return;
  try {
    phraseSemanticCount++;
    semanticGroupId++;
    const [r, g, b] = semantic.color;
    const cssColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    const ws = word.startTime - 50;
    const we = word.endTime + 50;
    /** @type {HTMLSpanElement|null} */
    let wordEl = null;
    for (const ch of phraseChars) {
      if (ch.startTime < we && ch.endTime > ws) {
        ch.semanticColor = cssColor;
        ch.semanticCategory = semantic.category;
        ch.semanticGroupId = semanticGroupId;
        if (ch.el) {
          ch.el.style.setProperty("--semantic-color", cssColor);
          ch.el.classList.add("semantic");
          // Tag the parent .word container for the underline shimmer
          if (!wordEl) wordEl = ch.el.closest(".word");
        }
      }
    }
    // Apply category color and semantic-word class to the word container
    if (wordEl) {
      wordEl.classList.add("semantic-word");
      wordEl.style.setProperty("--word-semantic-color", cssColor);
    }

    // Dense phrase detection
    if (phraseSemanticCount >= 3) {
      if (phraseDisplay) phraseDisplay.classList.add("dense-semantic");
      if (scene) {
        scene.triggerBeat(0.5);
        scene.triggerSemanticEffect({ color: semantic.color, particle: "burst", scene: "bloomSurge", category: semantic.category, intensity: 0.9 });
      }
    }
  } catch (err) {
    console.error("[Sonare] Error in colorSemanticChars:", err);
  }
}

// ─── Semantic touch — show word meaning on tap ───

/** @type {Record<string, string>} Category i18n keys for semantic tooltip labels. */
const CATEGORY_I18N_KEYS = {
  nature: "category.nature", emotion: "category.emotion", light: "category.light", dark: "category.dark",
  movement: "category.movement", voice: "category.voice", time: "category.time", bond: "category.bond",
  water: "category.water", sound: "category.sound", miku: "category.miku",
};

/** @type {Record<string, string>} Category icons for the semantic tooltip. */
const CATEGORY_ICONS = {
  water: "💧", nature: "🌿", emotion: "❤️", time: "⏳", sound: "🎵",
  miku: "✨", light: "💫", dark: "🌑", movement: "🌊", voice: "🎤",
  bond: "💜",
};

/**
 * Show a tooltip with semantic info when a recognized word is tapped.
 * Appears like a bubble surfacing from the lake — rising with clearing blur.
 * @param {HTMLElement} wordEl - The .word span element that was tapped.
 * @param {MouseEvent} e - The click event for positioning.
 */
function showSemanticTooltip(wordEl, e) {
  if (!semanticTooltip) return;
  try {
    const text = wordEl.textContent;
    const semantic = matchWord(text);
    if (!semantic) return;

    const label = CATEGORY_I18N_KEYS[semantic.category]
      ? t(CATEGORY_I18N_KEYS[semantic.category])
      : semantic.category;
    const icon = CATEGORY_ICONS[semantic.category] || "✦";
    const [r, g, b] = semantic.color;
    const cssColor = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;

    // Build tooltip content: word, optional reading, category badge
    // Strip the icon prefix from the i18n label if present (it has emoji already)
    const labelText = label.replace(/^[\p{Emoji}\s]+/u, "").trim() || label;
    const iconSpan = `<span class="tooltip-icon">${icon}</span>`;
    const wordSpan = `<span class="tooltip-word">${text}</span>`;
    const categorySpan = `<span class="tooltip-category" style="--cat-color:${cssColor}">${iconSpan} ${labelText}</span>`;

    semanticTooltip.innerHTML = `${wordSpan}${categorySpan}`;
    semanticTooltip.style.setProperty("--tooltip-accent", cssColor);

    // Position above the clicked word, centered horizontally
    const wordRect = wordEl.getBoundingClientRect();
    const tooltipX = wordRect.left + wordRect.width / 2;
    const tooltipY = wordRect.top;
    semanticTooltip.style.left = `${tooltipX}px`;
    semanticTooltip.style.top = `${tooltipY}px`;

    // Reset animation state: remove both classes, force reflow, then show
    semanticTooltip.classList.remove("visible", "sinking");
    void semanticTooltip.offsetWidth; // force reflow
    semanticTooltip.classList.add("visible");

    if (scene) scene.triggerBeat(0.3);

    // Dismiss on click anywhere
    const dismiss = () => {
      sinkAndHide();
      document.removeEventListener("click", dismiss, true);
    };
    document.removeEventListener("click", semanticTooltip._dismissHandler, true);
    semanticTooltip._dismissHandler = dismiss;
    // Delay adding the listener so the current click doesn't immediately dismiss
    requestAnimationFrame(() => {
      document.addEventListener("click", dismiss, true);
    });

    // Auto-dismiss after 3 seconds with sinking animation
    clearTimeout(semanticTooltip._hideTimer);
    semanticTooltip._hideTimer = setTimeout(() => {
      sinkAndHide();
      document.removeEventListener("click", dismiss, true);
    }, 3000);
  } catch (err) {
    console.error("[Sonare] Error in showSemanticTooltip:", err);
  }
}

/**
 * Dismiss the semantic tooltip with a sinking animation (reverse of surfacing).
 */
function sinkAndHide() {
  if (!semanticTooltip) return;
  semanticTooltip.classList.add("sinking");
  semanticTooltip.classList.remove("visible");
  clearTimeout(semanticTooltip._hideTimer);
}

// ─── Mood-responsive lyrics ───

/**
 * Update lyric styling based on the current valence/arousal state.
 * Sets CSS custom properties for smooth interpolation and discrete mood classes.
 * @param {number} valence - Current valence (0-1).
 * @param {number} arousal - Current arousal (0-1).
 */
function updateLyricMood(valence, arousal) {
  if (!phraseDisplay) return;

  let moodClass;
  if (arousal < 0.35) {
    moodClass = valence > 0.5 ? "mood-gentle" : "mood-still";
  } else {
    moodClass = valence > 0.45 ? "mood-stormy" : "mood-flowing";
  }
  if (moodClass !== currentMoodClass) {
    phraseDisplay.classList.remove(currentMoodClass);
    phraseDisplay.classList.add(moodClass);
    currentMoodClass = moodClass;
  }

  // Smooth CSS custom properties toward targets — never jump, always glide.
  // Uses exponential decay (~60fps assumed for CSS properties since onTimeUpdate
  // fires from the TextAlive timer, not rAF; consistent enough for visual smoothing).
  const root = phraseDisplay.style;
  const targetGlow = 18 + arousal * 30; // 18-48px (narrower, calmer range)
  const targetScale = 1.08 + arousal * 0.08; // 1.08-1.16 (subtle, not jarring)
  const smoothSpeed = 1 - Math.exp(-2.5 * (1 / 60)); // ~0.04 at 60fps, frame-rate aware
  _smoothGlow = _smoothGlow === 0 ? targetGlow : _smoothGlow + (targetGlow - _smoothGlow) * smoothSpeed;
  _smoothScale = _smoothScale === 0 ? targetScale : _smoothScale + (targetScale - _smoothScale) * smoothSpeed;
  root.setProperty("--glow-radius", `${_smoothGlow.toFixed(0)}px`);
  root.setProperty("--active-scale", _smoothScale.toFixed(3));
  // Letter-spacing is set by mood class only — no per-frame changes that cause text reflow
}

// ─── Emotional journey visualization ───

/**
 * Update the emotional journey gradient bar that visualizes the song's accumulated
 * emotional arc across all four dimensions.
 * @param {number} progress - Song progress from 0 to 1.
 */
function updateEmotionalJourney(progress) {
  if (!journeyFill) return;
  const state = lyricMemory.getState();
  const warmColor = `rgba(255, ${Math.round(100 + state.warmth * 155)}, ${Math.round(80 + state.warmth * 100)}, 0.8)`;
  const coolColor = `rgba(${Math.round(80 + state.wonder * 50)}, ${Math.round(150 + state.wonder * 105)}, 255, 0.8)`;
  const darkColor = `rgba(80, ${Math.round(60 + state.melancholy * 40)}, ${Math.round(120 + state.melancholy * 80)}, 0.8)`;
  const hotColor = `rgba(255, ${Math.round(80 + state.energy * 100)}, ${Math.round(60 + state.energy * 60)}, 0.8)`;

  const gradientStops = [
    `${warmColor} 0%`,
    `${coolColor} 33%`,
    `${hotColor} 66%`,
    `${darkColor} 100%`,
  ];
  journeyFill.style.width = `${progress * 100}%`;
  journeyFill.style.background = `linear-gradient(90deg, ${gradientStops.join(", ")})`;
  journeyFill.style.opacity = Math.min(1, state.wordCount * 0.05 + 0.2);
}

// ─── Intro / Outro cards ───
let outroTriggered = false;
let introCardTimeoutId = null;

/**
 * Display the intro title card with the current song name and artist.
 */
function showIntroCard() {
  if (!introCard || !introSongTitle || !introSongArtist) return;
  const song = ALL_SONGS[currentSongIndex];
  if (!song) return;
  introSongTitle.textContent = song.title;
  introSongArtist.textContent = song.artist;
  requestAnimationFrame(() => introCard.classList.add("visible"));
  clearTimeout(introCardTimeoutId);
  introCardTimeoutId = setTimeout(hideIntroCard, 3500);
}

/**
 * Hide the intro title card.
 */
function hideIntroCard() {
  clearTimeout(introCardTimeoutId);
  if (introCard) introCard.classList.remove("visible");
}

/** Color mapping for the four emotional dimensions (CSS rgba strings). */
const EMOTION_DIMENSION_COLORS = {
  warmth:     { r: 255, g: 130, b: 100 }, // warm coral
  melancholy: { r: 100, g: 120, b: 200 }, // deep blue
  energy:     { r: 255, g: 160, b: 60  }, // vibrant amber
  wonder:     { r: 100, g: 210, b: 200 }, // luminous teal
};

/**
 * Convert a 0-1 RGB array to a CSS rgb string.
 * @param {[number, number, number]} c - RGB in 0-1 range.
 * @returns {string}
 */
function catColorCSS(c) {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}

/**
 * Trigger the outro sequence: start scene outro animation, reveal the lake reflection,
 * display the rich emotional summary card, then smoothly return to song select.
 */
function triggerOutro() {
  if (outroTriggered) return;
  outroTriggered = true;

  try {
    // ── Phase 1: Start the 3D lake reveal (camera sweeps up and back) ──
    if (scene) {
      scene.startOutro();
      scene.revealStarMap();
    }

    if (phraseDisplay) phraseDisplay.classList.add("fade-out-phrase");

    // ── Phase 2: Build the emotional summary card ──
    const state = lyricMemory.getState();
    const topCategories = lyricMemory.getTopCategories(3);
    const topWords = lyricMemory.getTopWords(3);

    // Emotion dimension bars (warmth, melancholy, energy, wonder)
    const emotionI18nKeys = { warmth: "emotion.warmth", melancholy: "emotion.melancholy", energy: "emotion.energy", wonder: "emotion.wonder" };
    const emotions = Object.entries(state)
      .filter(([k]) => emotionI18nKeys[k] !== undefined)
      .sort(([, a], [, b]) => b - a);
    const dominant = emotions[0];

    const bars = emotions.map(([key, val]) => {
      const label = emotionI18nKeys[key] ? t(emotionI18nKeys[key]) : key;
      const pct = Math.min(100, Math.round(val * 100));
      const dimColor = EMOTION_DIMENSION_COLORS[key] || { r: 57, g: 197, b: 187 };
      const barGradient = `linear-gradient(90deg, rgba(${dimColor.r},${dimColor.g},${dimColor.b},0.5), rgba(${dimColor.r},${dimColor.g},${dimColor.b},0.7))`;
      return `<div class="outro-emotion-row">
        <span class="outro-emotion-label">${label}</span>
        <div class="outro-emotion-bar">
          <div class="outro-emotion-fill" style="width:${pct}%;background:${barGradient}"></div>
        </div>
        <span class="outro-emotion-pct">${pct}%</span>
      </div>`;
    }).join("");

    // Top words section: the 3 most-seen semantic words with their category colors
    let topWordsHTML = "";
    if (topWords.length > 0) {
      const wordChips = topWords.map(w => {
        const css = catColorCSS(w.color);
        return `<span class="outro-word-chip" style="--chip-color:${css}">${w.word}</span>`;
      }).join("");
      topWordsHTML = `<div class="outro-top-words">
        <div class="outro-section-label">${t("outro.topWords")}</div>
        <div class="outro-word-chips">${wordChips}</div>
      </div>`;
    }

    // Category summary sentence (e.g., "This song was full of Emotion and Light")
    let categorySentence = "";
    if (topCategories.length > 0) {
      const catNames = topCategories.map(c => {
        const key = CATEGORY_I18N_KEYS[c.category];
        const label = key ? t(key) : c.category;
        const css = catColorCSS(c.color);
        return `<span class="outro-cat-name" style="color:${css}">${label}</span>`;
      });
      const joined = catNames.length > 1 ? catNames.slice(0, -1).join("、") + "、" + catNames[catNames.length - 1] : catNames[0];
      categorySentence = `<div class="outro-category-sentence">${t("outro.fullOf").replace("{categories}", joined)}</div>`;
    }

    // Word count badge
    const wordCountHTML = state.wordCount > 0
      ? `<div class="outro-word-count"><span class="outro-count-number">${state.wordCount}</span> ${t("outro.wordsRecognized")}</div>`
      : "";

    // Dominant emotion label
    const dominantLabel = dominant ? (emotionI18nKeys[dominant[0]] ? t(emotionI18nKeys[dominant[0]]) : dominant[0]) : "";
    const dominantHTML = dominant && dominant[1] > 0.01
      ? `<div class="outro-dominant">${t("outro.dominant")} ${dominantLabel}</div>`
      : "";

    if (outroStats) {
      outroStats.innerHTML = `
        ${categorySentence}
        ${topWordsHTML}
        ${wordCountHTML}
        <div class="outro-section-label outro-map-label">${t("outro.emotionalMap")}</div>
        ${dominantHTML}
        ${bars}
      `;
    }

    // ── Phase 3: Reveal the card (delayed to let the camera reveal play first) ──
    setTimeout(() => {
      if (outroCard) requestAnimationFrame(() => outroCard.classList.add("visible"));
    }, 1800); // longer delay to let the lake reveal camera sweep play

    // ── Phase 4: Smooth transition back to song selector ──
    setTimeout(() => {
      if (outroCard) outroCard.classList.add("fading");
      setTimeout(() => {
        if (outroCard) {
          outroCard.classList.remove("visible", "fading");
        }
        if (phraseDisplay) phraseDisplay.classList.add("hidden");
        if (hudEl) hudEl.classList.add("hidden");
        if (player) player.requestStop();
        resetOutro();
        showSongSelect();
      }, 1200);
    }, 8000); // longer display time to let audience absorb the summary
  } catch (err) {
    console.error("[Sonare] Error in triggerOutro:", err);
  }
}

/**
 * Reset all outro-related state for a fresh song.
 */
function resetOutro() {
  outroTriggered = false;
  isReady = false;
  clearPhraseDisplay();
  lyricMemory.reset();
  recentWordTimes = [];
  currentLyricDensity = 0;
  if (scene) scene.setLyricDensity(0);
  if (introCard) introCard.classList.remove("visible");
  if (outroCard) outroCard.classList.remove("visible", "fading");
  if (journeyFill) { journeyFill.style.width = "0%"; journeyFill.style.opacity = "0"; }
}

// ─── Song selector ───

/**
 * Display the song selection screen with cards for each available song.
 */
function showSongSelect() {
  if (introCard) introCard.classList.remove("visible");
  if (outroCard) outroCard.classList.remove("visible", "fading");

  if (loadingEl) loadingEl.classList.add("fade-out");
  setTimeout(() => {
    if (loadingEl) loadingEl.classList.add("hidden");
    if (songSelectEl) songSelectEl.classList.remove("hidden");
  }, 600);

  buildSongCards();
}

/**
 * Build (or rebuild) the song cards in the song selector.
 * Separated so the language toggle can refresh card text without full re-init.
 */
function buildSongCards() {
  if (!songListEl) return;
  songListEl.innerHTML = "";

  ALL_SONGS.forEach((song, i) => {
    const card = document.createElement("div");
    card.className = "song-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${getLang() === "ja" ? "再生" : "Play"} ${song.title} — ${song.artist}`);
    // Set accent color as CSS custom property for border glow
    const accent = song.theme?.accent ?? 0x39c5bb;
    const r = (accent >> 16) & 0xff, g = (accent >> 8) & 0xff, b = accent & 0xff;
    card.style.setProperty("--card-accent", `rgba(${r},${g},${b},0.6)`);
    card.style.setProperty("--card-i", i);
    card.innerHTML = `
      <div class="song-card-title">${song.title}</div>
      <div class="song-card-meta"><span class="song-card-artist">${song.artist}</span><span class="song-card-desc">${t(`song.desc.${i}`)}</span></div>
    `;
    card.addEventListener("click", () => loadSong(i));
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); loadSong(i); } });
    songListEl.appendChild(card);
  });

  // Focus first song card for keyboard users (after DOM settles)
  setTimeout(() => {
    const firstCard = songListEl.querySelector(".song-card");
    if (firstCard) firstCard.focus();
  }, 650);
}

/**
 * Load a song by index: reset state, apply the song theme, and tell TextAlive to load it.
 * @param {number} index - Index into the ALL_SONGS array.
 */
function loadSong(index) {
  if (index < 0 || index >= ALL_SONGS.length) {
    console.error("[Sonare] Invalid song index:", index);
    return;
  }

  currentSongIndex = index;
  const song = ALL_SONGS[index];

  // Show loading again briefly
  if (songSelectEl) songSelectEl.classList.add("hidden");
  if (loadingEl) loadingEl.classList.remove("hidden", "fade-out");
  if (loadingStatus) loadingStatus.textContent = `${getLang() === "ja" ? "読み込み中" : "Loading"} "${song.title}"...`;

  // Reset state
  lastBeatIndex = -1;
  lastChorusState = false;
  lastChordName = "";
  lastWordIndex = -1;
  introShown = false;
  outroTriggered = false;
  lastSectionType = "";
  chorusSegments = null;
  inFamiliarTerritory = false;
  clearPhraseDisplay();
  clearSubtitle();
  currentPhraseIndex = 0;
  lyricMemory.reset();
  seenPhrases = new Set();
  rhythmCombo = 0;
  lastTapTime = 0;
  chordHistory = [];
  lastPhraseEndTime = 0;
  if (introCard) introCard.classList.remove("visible");
  if (outroCard) outroCard.classList.remove("visible", "fading");
  if (journeyFill) { journeyFill.style.width = "0%"; journeyFill.style.opacity = "0"; }

  // Apply per-song theme to the 3D scene
  if (song.theme && scene) {
    scene.setSongTheme(song.theme);
  }

  // Load English subtitle translations for this song
  currentTranslations = getTranslations(song.url);

  if (player) {
    player.createFromSongUrl(song.url, { video: song.video });
  }
  startLoadingTimeout(20000);
}

// ─── Word timing + beat emphasis helpers ───

/**
 * Apply sustained/staccato CSS classes to characters based on word duration.
 * Long words (>800ms) get "sustained" treatment, short words (<200ms) get "staccato".
 * @param {Object} word - The TextAlive word object.
 * @param {number} duration - Word duration in ms.
 */
function applyWordTimingClass(word, duration) {
  if (!word) return;
  const ws = word.startTime - 50;
  const we = word.endTime + 50;
  let cls = "";
  if (duration > 800) cls = "char-sustained";
  else if (duration < 200) cls = "char-staccato";
  if (!cls) return;
  for (const ch of phraseChars) {
    if (ch.startTime < we && ch.endTime > ws && ch.el) {
      ch.el.classList.add(cls);
      ch.wordDuration = duration;
      ch.timingClass = cls;
    }
  }
}

/**
 * Apply beat-position emphasis to characters of the current word.
 * Beat 1 -> "char-downbeat" (strongest), Beat 3 -> normal, Beats 2/4 -> "char-anticipation" (lightest).
 * @param {Object} word - The TextAlive word object.
 * @param {number} beatPos - Beat position within the bar (1-based).
 */
function applyBeatEmphasis(word, beatPos) {
  if (!word) return;
  const ws = word.startTime - 50;
  const we = word.endTime + 50;
  let cls = "";
  if (beatPos === 1) cls = "char-downbeat";
  else if (beatPos === 2 || beatPos === 4) cls = "char-anticipation";
  // Beat 3 gets no extra class (neutral emphasis)
  if (!cls) return;
  for (const ch of phraseChars) {
    if (ch.startTime < we && ch.endTime > ws && ch.el) {
      ch.el.classList.add(cls);
    }
  }
}

/**
 * Mark chars of a long word as "held" once the word is past its midpoint,
 * giving them a gentle shimmer to convey sustained vocal.
 * @param {Object} word - The TextAlive word object.
 */
function markHeldChars(word) {
  if (!word) return;
  const ws = word.startTime - 50;
  const we = word.endTime + 50;
  for (const ch of phraseChars) {
    if (ch.startTime < we && ch.endTime > ws && ch.el && !ch.el.classList.contains("char-held")) {
      ch.el.classList.add("char-held");
    }
  }
}

// ─── Focus trap for song selector ───

/**
 * Trap keyboard focus within the song selector dialog when it is visible.
 * Tab and Shift+Tab cycle through focusable elements without escaping.
 * Escape closes the dialog (returns to HUD if a song was previously loaded).
 * @param {KeyboardEvent} e - The keydown event.
 */
function handleSongSelectFocusTrap(e) {
  if (!songSelectEl || songSelectEl.classList.contains("hidden")) return;
  if (e.key === "Escape") {
    // Only close if we've previously loaded a song (i.e. not the initial selector)
    if (isReady && player) {
      songSelectEl.classList.add("hidden");
      if (hudEl) hudEl.classList.remove("hidden");
    }
    return;
  }
  if (e.key !== "Tab") return;

  const focusable = songSelectEl.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"]), .song-card');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first || !songSelectEl.contains(document.activeElement)) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last || !songSelectEl.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }
}

// ─── Rhythm tap ───

/**
 * Handle a rhythm tap interaction: compare the tap timing to the nearest beat
 * and reward the player with visual feedback based on accuracy.
 * @param {MouseEvent} e - The click event.
 */
function handleRhythmTap(e) {
  try {
    if (!player) return;
    const now = player.timer?.position ?? 0;
    if (now - lastTapTime < 100) return;
    lastTapTime = now;

    const beat = player.findBeat?.(now);
    if (!beat) return;

    const beatDuration = beat.duration || 500;
    const beatStart = beat.startTime;
    const beatEnd = beatStart + beatDuration;
    const distToStart = Math.abs(now - beatStart);
    const distToEnd = Math.abs(now - beatEnd);
    const dist = Math.min(distToStart, distToEnd);

    // Convert tap screen position to water plane coordinates for ripple origin
    const canvasContainer = document.getElementById("canvas-container");
    const ndcX = canvasContainer ? (e.clientX / canvasContainer.clientWidth) * 2 - 1 : 0;
    const ndcY = canvasContainer ? -(e.clientY / canvasContainer.clientHeight) * 2 + 1 : 0;
    const tapPos = scene ? scene.screenToWaterPlane(ndcX, ndcY) : null;

    if (dist < 80) {
      rhythmCombo++;
      if (scene) {
        scene.triggerBeat(0.8 + Math.min(rhythmCombo * 0.1, 0.5), tapPos);
        scene.triggerRhythmReward("perfect", rhythmCombo, tapPos);
      }
      showRhythmFeedback("perfect", e);
      if (rhythmAnnounce) rhythmAnnounce.textContent = t("rhythm.perfect", { combo: String(rhythmCombo) });
      // "39" (mi-ku) Easter egg: special celebration at combo 39
      if (rhythmCombo === 39 && scene) {
        scene.triggerMiku39Celebration();
      }
    } else if (dist < 200) {
      rhythmCombo = Math.max(0, rhythmCombo - 1);
      if (scene) {
        scene.triggerBeat(0.4, tapPos);
        scene.triggerRhythmReward("good", rhythmCombo, tapPos);
      }
      showRhythmFeedback("good", e);
      if (rhythmAnnounce) rhythmAnnounce.textContent = t("rhythm.good");
    } else {
      rhythmCombo = 0;
    }
  } catch (err) {
    console.error("[Sonare] Error in handleRhythmTap:", err);
  }
}

/**
 * Show a visual ripple effect at the tap location.
 * @param {"perfect"|"good"} quality - The tap quality.
 * @param {MouseEvent} e - The click event for coordinates.
 */
function showRhythmFeedback(quality, e) {
  const ripple = document.createElement("div");
  ripple.className = `rhythm-ripple rhythm-${quality}`;
  ripple.style.left = `${e.clientX}px`;
  ripple.style.top = `${e.clientY}px`;
  document.body.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
}

// ─── Controls ───

/** Toggle play/pause state. */
function togglePlay() {
  if (!isReady || !player) return;
  if (player.isPlaying) {
    player.requestPause();
  } else {
    player.requestPlay();
  }
}

/**
 * Update the play button icon.
 * @param {boolean} playing - Whether the player is currently playing.
 */
function updatePlayButton(playing) {
  if (btnPlay) btnPlay.textContent = playing ? "⏸" : "▶";
}

/**
 * Change to the next or previous song.
 * @param {number} direction - +1 for next, -1 for previous.
 */
function changeSong(direction) {
  const newIndex = (currentSongIndex + direction + ALL_SONGS.length) % ALL_SONGS.length;
  if (player) player.requestStop();
  clearPhraseDisplay();
  setTimeout(() => loadSong(newIndex), 300);
}

/** Toggle fullscreen mode. */
function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  } catch (err) {
    console.error("[Sonare] Fullscreen toggle failed:", err);
  }
}

/**
 * Seek to a position when the progress bar is clicked.
 * @param {MouseEvent} e - The click event.
 */
function onProgressClick(e) {
  if (!player || !player.video || !progressBar) return;
  const rect = progressBar.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  const position = ratio * player.video.duration;
  player.requestMediaSeek(position);
}

// ─── Render loop ───

/**
 * Start the requestAnimationFrame render loop.
 * The loop is protected by a try/catch so that a single frame error
 * does not permanently kill the animation.
 */
function startRenderLoop() {
  function loop() {
    animFrameId = requestAnimationFrame(loop);
    try {
      if (scene) scene.update();
    } catch (err) {
      console.error("[Sonare] Render loop error:", err);
      // Continue the loop — don't let a transient error kill the animation
    }
  }
  loop();
}

// ─── Keyboard controls ───

/**
 * Handle keyboard shortcuts for playback control.
 * @param {KeyboardEvent} e - The keydown event.
 */
function onKeyDown(e) {
  try {
    switch (e.code) {
      case "Space":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowRight":
        if (player && player.video) {
          const pos = player.timer?.position ?? 0;
          player.requestMediaSeek(Math.min(pos + 5000, player.video.duration));
        }
        break;
      case "ArrowLeft":
        if (player && player.video) {
          const pos = player.timer?.position ?? 0;
          player.requestMediaSeek(Math.max(pos - 5000, 0));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        changeSong(-1);
        break;
      case "ArrowDown":
        e.preventDefault();
        changeSong(1);
        break;
      case "KeyF":
        toggleFullscreen();
        break;
    }
  } catch (err) {
    console.error("[Sonare] Error in keyboard handler:", err);
  }
}

// ─── Loading timeout ───
let loadingTimeoutId = null;

/**
 * Start a loading timeout that shows a retry option if loading takes too long.
 * @param {number} [ms=20000] - Timeout duration in milliseconds.
 */
function startLoadingTimeout(ms = 20000) {
  clearTimeout(loadingTimeoutId);
  loadingTimeoutId = setTimeout(() => {
    if (!isReady) {
      if (loadingStatus) loadingStatus.textContent = t("loading.status.slow");
      if (retryBtn) retryBtn.classList.add("visible");
    }
  }, ms);
}

/** Clear the loading timeout. */
function clearLoadingTimeout() {
  clearTimeout(loadingTimeoutId);
}

// ─── Helpers ───

/**
 * Format a millisecond value as m:ss for the time display.
 * @param {number} ms - Time in milliseconds.
 * @returns {string} Formatted time string.
 */
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Start ───
init();
