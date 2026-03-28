# Stellar Verses — Contest Rubric & Gap Analysis

Based on the three official judging criteria from
https://magicalmirai.com/2026/procon/index_en.html

---

## Criterion 1: Aesthetic Quality (歌詞の演出)
> "Synchronized animation effectiveness and visual appeal"

| Sub-criterion | Weight | Score (1-10) | Notes |
|---|---|---|---|
| **Lyric sync precision** — chars light up exactly when sung | High | 9 | Character-level timing from TextAlive API. Active/sung/upcoming states. Smooth CSS transitions. |
| **Typography quality** — text is beautiful, readable, well-positioned | High | 7 | Good base: mood-responsive weight/spacing, semantic coloring, glow layers. **Gap**: single font family, no custom web font (Japanese typography matters hugely). No furigana support. Long phrases can still crowd. |
| **Visual storytelling** — visuals amplify the *meaning* of lyrics | High | 8 | Semantic dictionary maps 270+ words to colors/particles/effects. Constellation system connects word meanings over time. Emotional journey bar. **Gap**: no visual motifs specific to each song's narrative; all songs get the same generic cosmic theme. |
| **Mood/energy arc** — visuals follow the emotional shape of the song | Med | 8 | Valence/arousal → 4 mood presets. Chorus amplification. Chord-driven harmonic color. Memory accumulation. **Gap**: transitions between sections (verse→chorus→bridge) could be more dramatic. |
| **Color palette cohesion** — colors feel intentional, not random | Med | 7 | Per-song accent color + theme hue. Miku teal/pink/gold brand colors. **Gap**: palette sometimes feels monotone in calm sections; could use more contrast. Song-specific palettes aren't deeply differentiated. |
| **Polish/refinement** — no visual glitches, smooth at all times | Med | 6 | Bloom tuned down from initial over-bright. Smooth lerps everywhere. **Gap**: 3D text sprites still overlap DOM lyrics occasionally. Shockwaves can be barely visible. Nebula particles are generic blobs. No intro/outro visual sequence. |

**Aesthetic Quality subtotal: ~7.5/10**

---

## Criterion 2: Innovative Technology (新規性)
> "Unique concepts demonstrating creative future potential"

| Sub-criterion | Weight | Score (1-10) | Notes |
|---|---|---|---|
| **Core concept originality** — is the idea fresh? | High | 7 | "Cosmic lyrics" is aesthetically strong but not unprecedented in procon entries. Starfield + bloom is a well-trodden visual path. **Gap**: needs a more distinctive conceptual hook — what makes this *this* and not "another space visualizer"? |
| **Semantic lyric understanding** — app "reads" the lyrics | High | 9 | This is the standout innovation. 270+ word dictionary, 8 semantic categories, per-word visual effects, memory accumulation. Constellation system connecting related words. This is genuinely novel. |
| **Procedural generation / seed system** — unique per viewing | Med | 8 | Mulberry32 PRNG, shareable seed URLs, deterministic visual fingerprint. Creative and technically sound. Few contest entries do this. |
| **Mood-responsive typography** — text itself morphs to music | Med | 8 | Font weight, spacing, glow color, and scale all shift with valence/arousal. Chorus amplification. 4 distinct mood styles. This is unusual and effective. |
| **Chord-aware visuals** — harmonic analysis drives color | Med | 7 | Root-to-hue mapping, chord quality → tension/warmth. **Gap**: effect is subtle; most viewers won't consciously notice it. Could be more dramatic. |
| **Interactive elements** — viewer participation | Low | 5 | Mouse parallax, click-to-burst, light trail. **Gap**: interaction feels peripheral, not integral. No audience participation mechanic, no generative input that changes the experience meaningfully. |
| **Multi-song adaptability** — works across all 6 songs | Med | 6 | Per-song theme object (hue, accent, mood). Same visual language for all. **Gap**: each song should feel distinct — different visual motifs, custom particle sets, or structural variation. Currently all songs play in the same cosmic void. |

**Innovative Technology subtotal: ~7.1/10**

---

## Criterion 3: Technical Excellence (完成度)
> "Successful execution across PC, tablet, and smartphone browsers; code quality"

| Sub-criterion | Weight | Score (1-10) | Notes |
|---|---|---|---|
| **Cross-device compatibility** — works on PC, tablet, phone | High | 7 | Responsive CSS with clamp(), media queries, safe-area-insets. Touch events. **Gap**: not tested on actual mobile devices. WebGL can be slow on low-end phones. No performance fallback (e.g., reduce star count). No orientation handling. |
| **Performance** — smooth 60fps, no jank | High | 6 | Instanced particles, shader-based rendering. **Gap**: 2500 stars + 400 nebula + 120 word particles + shockwaves + constellations + bloom pass = heavy. No LOD, no adaptive quality. Three.js chunk is 864KB. Could use dynamic import for code splitting. |
| **Code quality** — readable, well-structured, documented | Med | 7 | Clean module separation (scene, semantics, PRNG, songs). Clear naming. Comments where non-obvious. **Gap**: scene.js is very large (likely 500+ lines). Some magic numbers. No TypeScript. |
| **Error handling** — graceful degradation | Med | 6 | onError callback added. **Gap**: no handling for WebGL unavailability, no offline fallback, no loading timeout, no retry logic for song data. If TextAlive API is slow, user sees infinite loading. |
| **Build/deployment** — clean production build | Med | 8 | Vite build works. Output is correct. **Gap**: large Three.js chunk warning. Could add manual chunks config. No service worker. No meta tags for OG/Twitter cards. |
| **TextAlive API integration** — correct use of all features | High | 8 | Uses beats, chords, choruses, phrases, words, chars, valence/arousal, vocal amplitude(?). Supports managed mode. Handles onAppMediaChange. **Gap**: video IDs for 2026 songs not yet available (external dependency). Token is demo token. |
| **Accessibility** — usable by diverse audiences | Low | 4 | **Gap**: no keyboard controls, no reduced-motion support, no high-contrast mode, no screen reader announcements, no captions/subtitles alternative. Bloom/glow could be problematic for photosensitive users. |

**Technical Excellence subtotal: ~6.6/10**

---

## OVERALL SCORE: ~7.1/10

For context, winning entries typically score 8.5+ with standout scores (9+) in at least one criterion.

---

## PRIORITY GAP ANALYSIS

### P0 — Critical (blocks winning)

1. **No loading timeout / error recovery** — If song data takes too long or fails, the user is stuck on the loading screen forever. Need a timeout + retry + fallback.

2. **Performance on mobile** — No adaptive quality. Need to detect device capability and reduce particle count, disable bloom, or lower resolution on weak GPUs.

3. **Missing 2026 video IDs** — External blocker. Must update `songs.js` as soon as TextAlive publishes the code snippets.

4. **Your own TextAlive token** — Currently using demo token. Must register at developer.textalive.jp.

### P1 — High (significant scoring impact)

5. **Song-specific visual identity** — All 6 songs currently look the same (cosmic void). Each song needs at least a distinct visual motif, color palette, or structural variation to show the app *adapts* to each song's character.

6. **Custom Japanese web font** — Typography is a huge part of lyric apps. Load a quality Japanese display font (e.g., Zen Maru Gothic, M PLUS Rounded, Noto Sans JP) via Google Fonts or self-hosted. This alone dramatically elevates perceived quality.

7. **Intro/outro sequences** — The transition from song-select to playing is abrupt. Need a cinematic entrance (camera zoom-in, title card with song name, gentle fade) and a graceful ending (lyrics dissolve, stars fade, return to selector).

8. **Reduce scene.js complexity** — Split into smaller modules (camera.js, particles.js, starfield.js). Judges review code quality.

### P2 — Medium (differentiator for top tier)

9. **Richer interaction model** — The mouse/touch interaction feels like an afterthought. Consider: drag to rotate the view, tap a word to see its semantic meaning, swipe to scrub time.

10. **Visual variety within a song** — Verse/chorus/bridge should feel structurally different, not just "same but louder." Consider different camera angles, particle behaviors, or background elements per section.

11. **Keyboard controls** — Space to play/pause, arrows to seek. Basic but expected.

12. **Reduced-motion / accessibility** — `prefers-reduced-motion` media query to disable shockwaves, bloom, particle bursts. Shows awareness.

13. **Loading progress** — Replace the pulsing animation with actual progress (e.g., "Loading audio... Loading lyrics... Preparing visuals...") based on TextAlive callbacks.

### P3 — Low (nice-to-have polish)

14. **OG meta tags** — Social sharing preview when URL is shared.
15. **Constellation narrative** — Show accumulated constellations at song end as a "lyric map."
16. **Screenshot/share button** — Let viewer capture and share a moment.
17. **Prefers-color-scheme** — Not critical since it's always dark, but shows attention.
18. **Remove demo song** — Before submission, clean up ALL_SONGS → SONGS.

---

## WORK PLAN

### Phase 1: Critical Fixes (est. 2-4 hours)
- [ ] Add loading timeout + error recovery UI
- [ ] Add adaptive quality system (detect GPU, reduce effects on mobile)
- [ ] Register TextAlive developer token
- [ ] Monitor + update 2026 video IDs when published

### Phase 2: High-Impact Polish (est. 4-8 hours)
- [ ] Add custom Japanese web font (Google Fonts)
- [ ] Create song-specific visual profiles (unique motifs per song)
- [ ] Build intro sequence (camera zoom, title card, fade-in)
- [ ] Build outro sequence (dissolve, stats, return to selector)
- [ ] Refactor scene.js into smaller modules
- [ ] Add keyboard controls (space, arrows)

### Phase 3: Differentiators (est. 4-6 hours)
- [ ] Enhanced interaction (drag-rotate, word-tap semantics)
- [ ] Section-aware visual structure (verse vs chorus vs bridge)
- [ ] Reduced-motion / prefers-reduced-motion support
- [ ] Real loading progress indicators
- [ ] Test on actual mobile devices (iOS Safari, Android Chrome)

### Phase 4: Final Polish (est. 2-3 hours)
- [ ] OG meta tags for social sharing
- [ ] Remove demo song, clean up code
- [ ] Final performance profiling
- [ ] Create submission video/screenshots
- [ ] Push to private GitHub repo + submit form
