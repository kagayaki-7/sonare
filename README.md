# Sonare — 湖のソナーレ
### Magical Mirai 2026 Programming Contest Entry

> Each lyric is a drop in the lake — ripples of sound painting a living reflection of the song.

[Screenshot placeholder]

## Concept

Sonare transforms the TextAlive lyric experience into a living lake. Inspired by the Magical Mirai 2026 theme "Sonare of the Lake" (湖のソナーレ) and Hamamatsu — the city of music where VOCALOID was born — this app reimagines lyrics as ripples on water.

Every word that appears sends a ripple across the lake surface. Semantic words (words with emotional meaning like 愛, 空, 夢) create lasting reflections — glowing lights that persist on the water, building a unique "reflection map" as the song plays. By the end, the lake is filled with the song's emotional footprint.

### Key Features

- **Water Surface**: Real-time procedural water shader with music-reactive waves
- **Lyric Ripples**: Each beat sends concentric ripples across the lake, synchronized to the music
- **Reflection Map**: Meaningful words plant lasting lights on the water — each song creates a unique reflection pattern
- **Mood-Responsive Water**: Valence/Arousal analysis drives water state from glass-still to stormy
- **Semantic Understanding**: 300+ Japanese words recognized and categorized (emotion, nature, water, sound, etc.)
- **Cinematic Camera**: Live camera that drifts, pulses with beats, zooms with energy, sweeps during chorus
- **Bilingual UI**: JA/EN language toggle with English subtitles for international audiences
- **Rhythm Interaction**: Tap in time with the beat to create your own ripples on the lake (combo 39 = Miku Easter egg!)
- **Seed System**: Each viewer gets a unique lake — shareable via URL with visual fingerprint
- **6 Contest Songs**: Each song has a unique water character (still lake, stormy ocean, cave lake, etc.)
- **Miku Love**: #39C5BB soul color, "feat. 初音ミク", twintail orbit echoes, voice-fills-the-lake narrative

### Technical Highlights

- Three.js custom GLSL water surface shader
- TextAlive API: char-level sync, vocal amplitude, chord detection, beat hierarchy, inter-phrase timing
- 4-tier adaptive quality (ultra/high/medium/low) with frame budget auto-tuning
- Full accessibility: WCAG AA contrast, screen reader announcements, keyboard navigation, reduced-motion support
- Zero-allocation render loop, pooled effect objects, CSS containment
- i18n system with poetic English lyric translations
- Responsive design with clamp() scaling for all viewports

## Build & Run

```bash
npm install
npm run dev
```

Requires a TextAlive API token in `.env`:
```
VITE_TEXTALIVE_TOKEN=your_token_here
```

## Target Environment

- **Primary**: PC (Chrome/Firefox/Safari)
- **Also tested**: Tablet, Smartphone (responsive with 4-tier quality)

## Technology

- [TextAlive App API](https://developer.textalive.jp/) — Lyric synchronization
- [Three.js](https://threejs.org/) — 3D rendering
- [Vite](https://vitejs.dev/) — Build tooling

## Credits

Built with [TextAlive App API](https://developer.textalive.jp/) by AIST.
