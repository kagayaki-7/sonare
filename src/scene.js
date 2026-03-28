import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SeededRandom, deriveSeedFingerprint } from "./prng.js";
import {
  starVertexShader, starFragmentShader,
  nebulaVertexShader, nebulaFragmentShader,
  orbVertexShader, orbFragmentShader,
  wpVertexShader, wpFragmentShader,
  trailVertexShader, trailFragmentShader,
  waterVertexShader, waterFragmentShader,
} from "./shaders.js";

/**
 * Mood-driven visualization pipeline.
 *
 * Instead of throwing every effect at once, the scene adapts its entire
 * visual personality based on a running read of valence/arousal:
 *
 *   "still"    — low arousal, any valence → glass-still lake, minimal motion, clear reflections
 *   "gentle"   — low arousal, high valence → soft ripples, warm underwater glow
 *   "flowing"  — high arousal, low valence → stronger currents, visible waves, brighter caustics
 *   "stormy"   — high arousal, high valence → turbulent water, maximum ripple intensity, foam-like bloom
 *
 * Transitions between moods are always smooth (lerp over ~2s).
 * No effect ever flashes or shakes hard enough to be uncomfortable.
 */

// ─── Mood presets (water states) ───
const MOOD_PRESETS = {
  still: {
    bloomStrength: 0.4,     // glass-still lake: subtle surface luminance
    bloomRadius: 0.7,       // wide, soft glow — light diffusing on calm water
    fogDensity: 0.007,      // high water clarity — deep, still, transparent
    cameraZ: 55,
    starSpeed: 0.003,       // barely perceptible drift — almost frozen
    beatScale: 0.08,        // minimal beat response — undisturbed surface
    shockwaveOpacity: 0.02, // near-invisible ripples — glassy calm
    shockwaveScale: 10,     // tight, small ripples when they do appear
    particleRate: 0.2,      // sparse — only occasional motes in still water
    exposure: 0.85,         // slightly dim — quiet, contemplative
  },
  gentle: {
    bloomStrength: 0.6,     // warm underwater glow — soft bioluminescence
    bloomRadius: 0.55,      // moderate diffusion — light through gentle ripples
    fogDensity: 0.005,      // good clarity with slight warmth in the water
    cameraZ: 42,
    starSpeed: 0.006,       // soft drift — lazy currents
    beatScale: 0.18,        // responsive but soft beats
    shockwaveOpacity: 0.06, // soft ripples — visible but delicate
    shockwaveScale: 14,     // medium ripple spread
    particleRate: 0.5,      // moderate — suspended particles catching light
    exposure: 1.0,          // natural, warm exposure
  },
  flowing: {
    bloomStrength: 0.7,     // brighter caustics dancing on the surface
    bloomRadius: 0.4,       // tighter bloom — sharper light refraction
    fogDensity: 0.004,      // clearer water, stronger currents push clarity
    cameraZ: 48,
    starSpeed: 0.014,       // visible current flow — water in motion
    beatScale: 0.25,        // strong beat response — waves cresting
    shockwaveOpacity: 0.12, // prominent ripples — active water surface
    shockwaveScale: 20,     // wider wave spread
    particleRate: 0.65,     // active — debris and light carried by current
    exposure: 1.05,         // bright, energized surface
  },
  stormy: {
    bloomStrength: 0.9,     // foam-like bloom — white water crests
    bloomRadius: 0.5,       // wide turbulent glow — churning luminescence
    fogDensity: 0.003,      // spray and mist reduce deep visibility
    cameraZ: 40,
    starSpeed: 0.018,       // rapid current — turbulent rotation
    beatScale: 0.35,        // maximum beat impact — waves crashing
    shockwaveOpacity: 0.18, // intense ripples — storm on the lake
    shockwaveScale: 25,     // massive wave spread
    particleRate: 0.9,      // dense — spray, foam, churning particles
    exposure: 1.15,         // bright peaks — lightning-on-water intensity
  },
};

// Chorus amplifies current mood slightly
const CHORUS_BOOST = {
  bloomStrength: 0.15,
  beatScale: 0.08,
  shockwaveOpacity: 0.03,
  cameraZ: -5,
  exposure: 0.08,
};

// ─── Category anchor positions for reflected lights on the lake surface ───
const CATEGORY_ANCHORS = {
  nature:   new THREE.Vector3(0, -3, -20),
  emotion:  new THREE.Vector3(-18, -4, -15),
  light:    new THREE.Vector3(14, -2, -25),
  dark:     new THREE.Vector3(-12, -6, -22),
  movement: new THREE.Vector3(20, -3.5, -18),
  voice:    new THREE.Vector3(-8, -2.5, -24),
  time:     new THREE.Vector3(16, -5, -20),
  bond:     new THREE.Vector3(-16, -4, -17),
};

/**
 * Critically-damped smooth interpolation (exponential decay toward target).
 * @param {number} current - Current value.
 * @param {number} target - Target value.
 * @param {number} speed - Convergence speed (higher = faster).
 * @param {number} delta - Time delta in seconds.
 * @returns {number} The interpolated value.
 */
function smoothDamp(current, target, speed, delta) {
  return current + (target - current) * (1 - Math.exp(-speed * delta));
}

/**
 * Cubic ease-out function.
 * @param {number} t - Progress value in [0, 1].
 * @returns {number} Eased value in [0, 1].
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * The main Three.js scene for Sonare.
 *
 * Manages the entire 3D visualization pipeline including starfield, underwater luminescence,
 * moonlight reflection (water pearl), current rings, word particles, lake reflection map, water surface,
 * and post-processing bloom. Driven by mood (valence/arousal), beat intensity,
 * chord changes, and semantic lyric analysis from the TextAlive API.
 */
export class SonareScene {
  /**
   * Create a new SonareScene.
   * @param {HTMLElement} container - The DOM element to attach the WebGL canvas to.
   * @param {number} [seed=42] - Seed for the procedural random number generator.
   */
  constructor(container, seed = 42) {
    this.container = container;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    this.timer = new THREE.Timer();
    this.elapsed = 0;

    // Seeded PRNG
    this.rng = new SeededRandom(seed);

    // Seed-derived fingerprint for procedural variation
    this.seedFingerprint = deriveSeedFingerprint(seed);

    // Seed-jittered category anchor positions
    this._jitteredAnchors = {};
    for (const [cat, base] of Object.entries(CATEGORY_ANCHORS)) {
      const j = this.seedFingerprint.anchorJitters[cat];
      this._jitteredAnchors[cat] = new THREE.Vector3(
        base.x + j.x, base.y + j.y, base.z + j.z
      );
    }

    // ─── Mood pipeline state ───
    this.currentMood = "still";
    this.moodParams = { ...MOOD_PRESETS.still };
    this.targetMoodParams = { ...MOOD_PRESETS.still };
    this.valence = 0.5;
    this.arousal = 0.2;

    // ─── Core state ───
    this.beatIntensity = 0;
    this.chorusActive = false;
    this.songProgress = 0;
    this.isPlaying = false;

    // Per-song theme
    this.songHue = 0.48;
    this.songAccent = new THREE.Color(0x39c5bb);
    this.songAccentSecondary = new THREE.Color(0xe991cf);
    this._songOrbScale = 1.0;
    this._songBreathSpeed = 1.5;
    this._songBloomBase = 0.5;

    // Semantic scene-level effects (decay over time)
    this._sceneFxExposure = 0;
    this._sceneFxBloom = 0;
    this._sceneFxFog = 0;
    this._sceneFxWarm = 0;

    // Reflection bloom pulse (brief brightening when a new reflection is planted)
    this._reflectionBloomPulse = 0;

    // Song progression gradient — hue journey across the song
    this._progressionHueStart = 0.48; // teal
    this._progressionHueEnd = 0.85;   // violet/magenta
    this._progressionHueCurrent = 0.48;

    // Emotional climax detection (valence AND arousal both > 0.7)
    this._climaxActive = false;
    this._climaxIntensity = 0; // smoothed 0-1
    this._climaxBloomSurge = 0;
    this._climaxParticleBoost = 0;

    // Lyric density visualization
    this._lyricDensity = 0;       // current words-per-second (smoothed)
    this._lyricDensityTarget = 0; // raw target

    // Section-aware modifiers
    this._currentSection = "verse";
    this._sectionCameraOffset = 0;
    this._sectionFogMod = 0;
    this._sectionStarSpeed = 0;

    // Mouse interaction (gentle)
    this.mouse = new THREE.Vector2(0, 0);
    this.mouseSmooth = new THREE.Vector2(0, 0);
    this.mouseActive = false;
    this.mouseDown = false;
    this.mouseDownTime = 0;

    // Intro/outro animation
    this._introProgress = 0;   // 0 = far away, 1 = arrived
    this._introActive = false;
    this._outroProgress = 0;   // 0 = normal, 1 = fully dissolved
    this._outroActive = false;

    // Beat-synced elements — pre-allocated water ripple pool (eliminates GC pressure)
    this.shockwaves = [];
    this._shockwavePool = [];
    this._SHOCKWAVE_POOL_SIZE = 16; // doubled for concentric ripple pairs

    // Quality tier
    this._qualityTier = "high";

    // Frame budget monitoring
    this._frameTimes = [];
    this._frameDropCount = 0;
    this._frameBoostCount = 0;

    // Vocal amplitude
    this._vocalAmplitude = 0;

    // Per-song style defaults
    this._particleStyle = "drift";
    this._introStyle = "emerge";
    this._constellationDensity = 1.0;

    // Memory state
    this.memoryState = { warmth: 0, melancholy: 0, energy: 0, wonder: 0 };

    // Semantic effect transients
    this.semanticColor = null;
    this.semanticDecay = 0;

    // Word particles
    this.wpCount = 0;

    // Constellation system (legacy)
    this.constellationPositions = [];

    // ─── Lake reflection map (lights reflected on water) ───
    this.lyricStarMap = [];       // {position: Vector3, color: Color, category: string, time: number, index: number, birthTime: number}
    this.starMapPoints = null;    // Points mesh for star map stars
    this.starMapLines = null;     // LineSegments for constellation connections
    this.starMapMaxStars = 200;
    this.starMapMaxLines = 500;
    this._starMapStarCount = 0;
    this._starMapLineCount = 0;
    this._starMapReveal = false;
    this._starMapRevealProgress = 0;

    // Light trail
    this.trailPositions = [];
    this.trailMaxPoints = 150;

    // Chord-reactive state
    this._chordTarget = { hueOffset: 0, warmth: 0, tension: 0, ringSpeed: 0.2 };
    this._chordCurrent = { hueOffset: 0, warmth: 0, tension: 0, ringSpeed: 0.2 };
    this._chordFlash = 0;
    this._chordFlashColor = new THREE.Color(0xffffff);
    this._rainbowComboEnd = 0;
    this._harmonicMode = 0; // -1 = minor dominant, +1 = major dominant (smoothed)
    this._harmonicModeTarget = 0;
    this._breathingSpace = false;
    this._intenseMode = false;
    this._starMapRevealActive = false;

    // ─── Effect priority cap (Tufte: max 3 simultaneous effects) ───
    // Priority order (highest to lowest):
    //   climax > chordResolution > ripple > semantic > bloomSurge > familiarTerritory > densephrase
    this._effectPriority = [
      "climax", "chordResolution", "ripple", "semantic",
      "bloomSurge", "familiarTerritory", "densephrase",
    ];
    this._MAX_SIMULTANEOUS_EFFECTS = 3;

    // ─── Lyric-active dimming (B2: lyric-first visual hierarchy) ───
    this._lyricActive = false;
    this._lyricActiveMix = 0; // 0 = no lyrics, 1 = lyrics showing

    // ─── Cinematic camera state ───
    this._cinematicOrbitAngle = 0;    // radians, slow revolution
    this._cinematicBobPhase = 0;      // vertical bob phase
    this._beatNudge = 0;              // forward nudge on beat (springs back)
    this._energyZoom = 0;             // energy-based zoom offset (smoothed)
    this._chorusSweep = 0;            // lateral sweep during chorus (smoothed)
    this._chorusSweepTarget = 0;      // target sweep value
    this._chorusSweepPhase = 0;       // progress through chorus sweep
    this._climaxTilt = 0;             // downward tilt during climax (smoothed)
    this._climaxTiltTarget = 0;

    // Drag orbit
    this._dragOrbit = { x: 0, y: 0 };
    this._dragOrbitAccum = { x: 0, y: 0 };
    this._dragStart = null;

    // Pre-allocated reusable objects (avoids GC pressure in hot paths)
    this._tmpColor = new THREE.Color();
    this._tmpColor2 = new THREE.Color();
    this._tmpVec3 = new THREE.Vector3();
    this._tmpWarmTint = new THREE.Color(1.0, 0.95, 0.8);
    this._tmpCoolTint = new THREE.Color(0.8, 0.88, 1.0);
    this._tmpWarmBg = new THREE.Color(0x0a1220);
    this._tmpCoolBg = new THREE.Color(0x050d18);

    this._init();
  }

  _init() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x050d18);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.container.appendChild(this.renderer.domElement);

    // ── WebGL context loss handling ──
    this._contextLost = false;
    this.renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this._contextLost = true;
      console.warn("[Sonare] WebGL context lost. Waiting for restoration...");
      this._showContextLostMessage();
    });
    this.renderer.domElement.addEventListener("webglcontextrestored", () => {
      this._contextLost = false;
      console.warn("[Sonare] WebGL context restored.");
      this._hideContextLostMessage();
    });

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050d18, 0.006);

    // Camera
    this.camera = new THREE.PerspectiveCamera(55, this.width / this.height, 0.1, 1000);
    this.camera.position.set(0, 0, 55);

    // Post-processing — subtle bloom only
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.5, 0.6, 0.5
    );
    this.composer.addPass(this.bloomPass);

    // Build scene elements
    this._createStarfield();
    this._createNebula();
    this._createCentralOrb();
    this._createOrbitRings();
    this._createWordParticleSystem();
    this._createConstellationSystem();
    this._createStarMapSystem();
    this._createTrailSystem();
    this._createWaterSurface();

    // Water ripple pool — pre-allocate ring meshes on the water plane
    this.ringGeometry = new THREE.RingGeometry(0.8, 1, 64);
    for (let i = 0; i < this._SHOCKWAVE_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x4abcb6, transparent: true, opacity: 0,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.ringGeometry, mat);
      mesh.visible = false;
      mesh.position.y = -7.5; // slightly above water surface at -8
      mesh.rotation.x = -Math.PI / 2; // horizontal on water plane
      mesh.userData = { life: 0, maxLife: 3.5, maxScale: 15, active: false, isTrailing: false };
      this._shockwavePool.push(mesh);
      this.scene.add(mesh);
    }

    // Event listeners
    this._onResize = this._onResize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    window.addEventListener("resize", this._onResize);
    this.container.addEventListener("mousemove", this._onMouseMove);
    this.container.addEventListener("touchmove", this._onTouchMove, { passive: true });
    this.container.addEventListener("pointerdown", this._onPointerDown);
    this.container.addEventListener("pointerup", this._onPointerUp);
    this.container.addEventListener("pointermove", this._onPointerMove);
  }

  // ─── Mouse/touch ───
  _onMouseMove(e) {
    this.mouse.x = (e.clientX / this.width) * 2 - 1;
    this.mouse.y = -(e.clientY / this.height) * 2 + 1;
    this.mouseActive = true;
  }
  _onTouchMove(e) {
    if (e.touches.length > 0) {
      this.mouse.x = (e.touches[0].clientX / this.width) * 2 - 1;
      this.mouse.y = -(e.touches[0].clientY / this.height) * 2 + 1;
      this.mouseActive = true;
    }
  }
  _onPointerDown(e) {
    this.mouseDown = true;
    this.mouseDownTime = this.elapsed;
    this._dragStart = { x: e.clientX ?? e.touches?.[0]?.clientX ?? 0, y: e.clientY ?? e.touches?.[0]?.clientY ?? 0 };
    this._dragOrbitAccum = { x: 0, y: 0 };
  }
  _onPointerUp() {
    const held = this.elapsed - this.mouseDownTime;
    this.mouseDown = false;
    if (this.isPlaying && held < 0.3) this._spawnReactionBurst();
  }
  _onPointerMove(e) {
    if (!this.mouseDown || !this._dragStart) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    this._dragOrbitAccum.x += (x - this._dragStart.x) * 0.003;
    this._dragOrbitAccum.y += (y - this._dragStart.y) * 0.002;
    this._dragStart.x = x;
    this._dragStart.y = y;
  }

  // ─── Splash — water droplets arcing outward and falling with gravity ───
  _spawnReactionBurst() {
    this._tmpVec3.set(
      this.mouseSmooth.x * 12, this.mouseSmooth.y * 8, this.camera.position.z - 18
    );
    this._emitSplashParticles(this._tmpVec3, 8);
  }

  // ─── Starfield ───
  _createStarfield() {
    const count = 2500;
    const rng = this.rng;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const radius = 60 + rng.random() * 250;
      const theta = rng.random() * Math.PI * 2;
      const phi = Math.acos(2 * rng.random() - 1);
      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);
      sizes[i] = 0.3 + rng.random() * 1.5;
      const c = new THREE.Color().setHSL(0.5 + rng.random() * 0.2, 0.2 + rng.random() * 0.2, 0.5 + rng.random() * 0.4);
      colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    this.stars = new THREE.Points(geom, new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uBeatPulse: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uMemoryWarmth: { value: 0 }, uMouseInfluence: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.stars);
  }

  // ─── Underwater luminescence (deep water glow beneath the lake surface) ───
  _createNebula() {
    const fp = this.seedFingerprint;
    const count = Math.round(400 * fp.nebulaDensityScale); const rng = this.rng;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const radius = 20 + fp.nebulaRadiusOffset + rng.random() * 80;
      const theta = rng.random() * Math.PI * 2;
      // Spread horizontally under the water plane, biased below y=-8
      positions[i3] = radius * Math.cos(theta);
      positions[i3 + 1] = -10 - rng.random() * 30; // y range: -10 to -40 (all below water at -8)
      positions[i3 + 2] = radius * Math.sin(theta);
      // Bioluminescent colors: deep teal, soft cyan, dim aquamarine
      const c = new THREE.Color().setHSL(0.48 + fp.nebulaHueOffset + rng.random() * 0.12, 0.3 + rng.random() * 0.25, 0.06 + rng.random() * 0.05);
      colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
      sizes[i] = 8 + rng.random() * 18; // slightly smaller for subtlety
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    this.nebula = new THREE.Points(geom, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uHueShift: { value: 0 } },
      vertexShader: nebulaVertexShader,
      fragmentShader: nebulaFragmentShader,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.nebula);
  }

  // ─── Moonlight reflection (water pearl sitting on/in the lake surface) ───
  _createCentralOrb() {
    this.orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 24, 24), // small — moon reflection pearl beneath water
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uBeatPulse: { value: 0 },
          uBreathSpeed: { value: 1.0 },
          uColor1: { value: new THREE.Color(0xc8e0f0) }, // pale moonlit blue
          uColor2: { value: new THREE.Color(0xe0eef8) }, // soft silver-white
        },
        vertexShader: orbVertexShader,
        fragmentShader: orbFragmentShader,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
      })
    );
    this.orb.position.y = -9; // submerged just beneath water surface (water at y=-8)
    this.scene.add(this.orb);
  }

  // ─── Current rings (water currents visualized as subtle circular flows on the lake) ───
  // Two rings are asymmetrically tilted (subliminal twintail echo), the third stays as a horizontal "crown."
  _createOrbitRings() {
    this.orbitRings = [];
    const fp = this.seedFingerprint;
    // Twintail tilt: ring 0 tilts slightly left, ring 1 tilts slightly right, ring 2 stays horizontal (crown)
    const twintailTilts = [
      { x: -Math.PI / 2 + 0.18, z: -0.25 },  // left twintail echo — tilted forward-left
      { x: -Math.PI / 2 - 0.15, z: 0.30 },   // right twintail echo — tilted forward-right
      { x: -Math.PI / 2, z: 0 },              // crown ring — horizontal, centered
    ];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x3aaa9e, transparent: true, opacity: 0, // muted water-teal
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const radiusJitter = fp.ringRadiusJitter[i] || 0;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6 + i * 2.5 + radiusJitter, 0.015, 8, 128), mat);
      ring.rotation.x = twintailTilts[i].x;
      ring.rotation.z = twintailTilts[i].z + i * 0.7;
      ring.position.y = -7.8; // barely above water surface at -8
      this.scene.add(ring);
      this.orbitRings.push(ring);
    }
  }

  // ─── Word particles ───
  _createWordParticleSystem() {
    const max = 120; this.wpMax = max;
    const positions = new Float32Array(max * 3);
    const colors = new Float32Array(max * 3);
    const sizes = new Float32Array(max);
    this.wpVelocities = []; this.wpLifetimes = [];
    for (let i = 0; i < max; i++) {
      positions[i * 3 + 2] = -9999; sizes[i] = 0;
      this.wpVelocities.push(new THREE.Vector3());
      this.wpLifetimes.push({ life: 0, maxLife: 0 });
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    this.wpPoints = new THREE.Points(geom, new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: wpVertexShader,
      fragmentShader: wpFragmentShader,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.wpPoints);
  }

  // ─── Constellation lines ───
  _createConstellationSystem() {
    const positions = new Float32Array(80 * 3);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setDrawRange(0, 0);
    this.constellationLines = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({
      color: 0x39c5bb, transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.constellationLines);
  }

  // ─── Reflected Lights on the Lake ───
  _createStarMapSystem() {
    const maxStars = this.starMapMaxStars;
    const maxLineVerts = this.starMapMaxLines * 2; // 2 verts per line segment

    // Reflection light points — pre-allocated buffers
    const lightPositions = new Float32Array(maxStars * 3);
    const lightColors = new Float32Array(maxStars * 3);
    const lightSizes = new Float32Array(maxStars);
    const lightOpacities = new Float32Array(maxStars);
    // Initialize off-screen
    for (let i = 0; i < maxStars; i++) {
      lightPositions[i * 3 + 2] = -9999;
      lightSizes[i] = 0;
      lightOpacities[i] = 0;
    }

    const lightGeom = new THREE.BufferGeometry();
    lightGeom.setAttribute("position", new THREE.BufferAttribute(lightPositions, 3));
    lightGeom.setAttribute("color", new THREE.BufferAttribute(lightColors, 3));
    lightGeom.setAttribute("size", new THREE.BufferAttribute(lightSizes, 1));
    lightGeom.setAttribute("opacity", new THREE.BufferAttribute(lightOpacities, 1));

    this.starMapPoints = new THREE.Points(lightGeom, new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute float opacity;
        varying vec3 vColor;
        varying float vOpacity;
        uniform float uTime;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vOpacity = opacity;
          // Gentle horizontal shimmer — lights reflected on water drift side to side
          vec3 pos = position;
          float shimmer = sin(uTime * 0.8 + pos.x * 0.5 + pos.z * 0.3) * 0.15;
          pos.x += shimmer;
          pos.y += sin(uTime * 0.5 + pos.z * 0.4) * 0.08;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * uPixelRatio * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vOpacity;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          // Multi-layer glow for reflected-light-on-water feel
          float outerGlow = 1.0 - smoothstep(0.0, 0.5, d);
          outerGlow = pow(outerGlow, 1.3);
          float innerGlow = 1.0 - smoothstep(0.0, 0.3, d);
          float core = 1.0 - smoothstep(0.0, 0.12, d);
          // Outer halo uses the category color, inner core adds white warmth
          vec3 col = vColor * outerGlow * 0.8
                   + vColor * innerGlow * 0.4
                   + vec3(0.85, 0.97, 1.0) * core * 0.35;
          float alpha = vOpacity * outerGlow * 0.9;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    }));
    this.scene.add(this.starMapPoints);

    // Light path line geometry — subtle connections on water surface
    const linePositions = new Float32Array(maxLineVerts * 3);
    const lineColors = new Float32Array(maxLineVerts * 3);
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    lineGeom.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
    lineGeom.setDrawRange(0, 0);

    this.starMapLines = new THREE.LineSegments(lineGeom, new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.06, // more transparent — light paths on water
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    }));
    this.scene.add(this.starMapLines);
  }

  /**
   * Plant a reflected light on the lake surface.
   * Each semantic word becomes a light positioned near its category anchor on the water.
   * @param {string} category - The semantic category (e.g., "nature", "emotion").
   * @param {[number, number, number]} color - RGB color in 0-1 range.
   * @param {number} intensity - The semantic intensity (0-1), affects light size.
   */
  plantStar(category, color, intensity) {
    if (this._starMapStarCount >= this.starMapMaxStars) return;

    const anchor = this._jitteredAnchors[category] || this._jitteredAnchors.emotion;
    const rng = this.rng;

    // Position: anchor + seeded random offset, spread horizontally on the water plane
    const position = new THREE.Vector3(
      anchor.x + (rng.random() - 0.5) * 12,
      anchor.y + (rng.random() - 0.5) * 2, // tighter vertical spread near water
      anchor.z + (rng.random() - 0.5) * 12
    );

    const starColor = new THREE.Color(color[0], color[1], color[2]);
    const idx = this._starMapStarCount;
    const star = {
      position,
      color: starColor,
      category,
      time: this.elapsed,
      index: idx,
      birthTime: this.elapsed,
      intensity,
    };
    this.lyricStarMap.push(star);
    this._starMapStarCount++;

    // Update Points geometry
    const posAttr = this.starMapPoints.geometry.getAttribute("position");
    const colAttr = this.starMapPoints.geometry.getAttribute("color");
    const sizeAttr = this.starMapPoints.geometry.getAttribute("size");
    const opacAttr = this.starMapPoints.geometry.getAttribute("opacity");

    posAttr.setXYZ(idx, position.x, position.y, position.z);
    colAttr.setXYZ(idx, starColor.r, starColor.g, starColor.b);
    sizeAttr.setX(idx, (2.0 + intensity * 2.0) * 2.5); // Birth pulse: start 2.5x size
    opacAttr.setX(idx, 1.0); // Start at full brightness (flash)

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    opacAttr.needsUpdate = true;

    // Bloom acknowledgement pulse: brief brightening when a new reflection is planted
    this._reflectionBloomPulse = 0.18 + intensity * 0.12;

    // Find nearby reflections for light path connections
    this._connectStarMapLines(star);
  }

  _connectStarMapLines(newLight) {
    const lights = this.lyricStarMap;
    const linePos = this.starMapLines.geometry.getAttribute("position");
    const lineCol = this.starMapLines.geometry.getAttribute("color");
    let lineIdx = this._starMapLineCount;

    for (let i = 0; i < lights.length - 1; i++) {
      if (lineIdx >= this.starMapMaxLines) break;

      const other = lights[i];
      // Connect if same category OR temporally close (within last 5 reflections)
      const sameCategory = other.category === newLight.category;
      const temporallyClose = (newLight.index - other.index) <= 5;

      if (!sameCategory && !temporallyClose) continue;

      // Distance check
      const dx = newLight.position.x - other.position.x;
      const dy = newLight.position.y - other.position.y;
      const dz = newLight.position.z - other.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const connectDist = 15 * (this._constellationDensity ?? 1.0);
      if (dist < connectDist) {
        const vi = lineIdx * 2;
        // Mix colors for the light path — slightly dimmed for water feel
        const mixR = (newLight.color.r + other.color.r) * 0.45;
        const mixG = (newLight.color.g + other.color.g) * 0.45;
        const mixB = (newLight.color.b + other.color.b) * 0.45;

        linePos.setXYZ(vi, other.position.x, other.position.y, other.position.z);
        linePos.setXYZ(vi + 1, newLight.position.x, newLight.position.y, newLight.position.z);
        lineCol.setXYZ(vi, mixR, mixG, mixB);
        lineCol.setXYZ(vi + 1, mixR, mixG, mixB);

        lineIdx++;
      }
    }

    this._starMapLineCount = lineIdx;
    linePos.needsUpdate = true;
    lineCol.needsUpdate = true;
    this.starMapLines.geometry.setDrawRange(0, lineIdx * 2);
  }

  /** Reveal the full lake reflection map during the outro sequence. */
  revealStarMap() {
    this._starMapReveal = true;
    this._starMapRevealActive = true;
    this._starMapRevealProgress = 0;
    this._starMapRevealStartZ = this.camera.position.z;
    this._starMapRevealElapsed = 0;
  }

  // ─── Light trail ───
  _createTrailSystem() {
    const positions = new Float32Array(this.trailMaxPoints * 3);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setDrawRange(0, 0);
    this.trailLine = new THREE.Line(geom, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x39c5bb) }, uPointCount: { value: 0 } },
      vertexShader: trailVertexShader,
      fragmentShader: trailFragmentShader,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.trailLine);
  }

  // ─── Water surface ───
  _createWaterSurface() {
    const segments = (this._qualityTier === "ultra" || this._qualityTier === "high") ? 128 : 64;
    const geom = new THREE.PlaneGeometry(200, 200, segments, segments);
    geom.rotateX(-Math.PI / 2); // make horizontal

    this._moonDir = new THREE.Vector3(0.3, 1.0, 0.2).normalize();

    this.waterSurface = new THREE.Mesh(geom, new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0.02, 0.07, 0.11) },       // deep dark teal (Miku undertone)
        uRippleIntensity: { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
        uMoonDir: { value: this._moonDir.clone() },
        uSkyColor: { value: new THREE.Color(0.07, 0.11, 0.16) },     // teal-warm sky (Miku warmth)
        uFogColor: { value: new THREE.Color(0.04, 0.07, 0.11) },    // teal-warm horizon mist
        uFogDensity: { value: 0.0004 },
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    this.waterSurface.position.y = -8;
    this.scene.add(this.waterSurface);
  }

  // ─────────────────────────────────────────────
  //  MOOD PIPELINE
  // ─────────────────────────────────────────────

  _classifyMood(valence, arousal) {
    if (arousal < 0.35) return valence > 0.5 ? "gentle" : "still";
    return valence > 0.45 ? "stormy" : "flowing";
  }

  _updateMoodPipeline(delta) {
    const mood = this._classifyMood(this.valence, this.arousal);
    if (mood !== this.currentMood) {
      this.currentMood = mood;
      this.targetMoodParams = { ...MOOD_PRESETS[mood] };
      if (this.chorusActive) this._applyChorusBoost();
    }
    const speed = 2.0;
    for (const key of Object.keys(this.moodParams)) {
      this.moodParams[key] = smoothDamp(this.moodParams[key], this.targetMoodParams[key], speed, delta);
    }
  }

  _applyChorusBoost() {
    this.targetMoodParams.bloomStrength += CHORUS_BOOST.bloomStrength;
    this.targetMoodParams.beatScale += CHORUS_BOOST.beatScale;
    this.targetMoodParams.shockwaveOpacity += CHORUS_BOOST.shockwaveOpacity;
    this.targetMoodParams.cameraZ += CHORUS_BOOST.cameraZ;
    this.targetMoodParams.exposure += CHORUS_BOOST.exposure;
  }

  // ─────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────

  /** @param {boolean} p - Whether the player is currently playing. */
  setPlaying(p) { this.isPlaying = p; }

  /** @param {number} p - Song progress from 0 (start) to 1 (end). */
  setSongProgress(p) { this.songProgress = p; }

  /** @param {import('./lyricSemantics.js').MemoryState} s - Current lyric memory state. */
  setMemoryState(s) { this.memoryState = s; }

  /**
   * Set the current emotional energy from TextAlive valence/arousal.
   * @param {number} v - Valence (0-1, negative to positive emotion).
   * @param {number} a - Arousal (0-1, calm to excited).
   */
  setEnergy(v, a) {
    this.valence = v; this.arousal = a;
    // Emotional climax detection: both valence AND arousal above 0.7
    this._climaxActive = (v > 0.7 && a > 0.7);
  }

  /**
   * Set the current lyric density (words per second) for particle/orbit modulation.
   * @param {number} wps - Running average of words per second.
   */
  setLyricDensity(wps) { this._lyricDensityTarget = wps; }

  /**
   * Set the current vocal amplitude for orb breathing and lyric glow.
   * @param {number} amp - Vocal amplitude value from TextAlive (typically 0-1).
   */
  setVocalAmplitude(amp) {
    this._vocalAmplitude = amp;
  }

  /**
   * Set the current song section type for camera and fog adjustments.
   * @param {"verse"|"chorus"|"bridge"} type - The section type.
    if (type === this._currentSection) return;
    this._currentSection = type;

    // Bridge/interlude: pull camera back, reduce fog, let the lake breathe
    if (type === "bridge") {
      this._sectionCameraOffset = 15;
      this._sectionFogMod = -0.002;
      this._sectionStarSpeed = 0.008;
    }
    // Chorus: push camera in, denser atmosphere
    else if (type === "chorus") {
      this._sectionCameraOffset = -3;
      this._sectionFogMod = 0.001;
      this._sectionStarSpeed = 0;
    }
    // Verse: neutral
    else {
      this._sectionCameraOffset = 0;
      this._sectionFogMod = 0;
      this._sectionStarSpeed = 0;
    }
  }

  /** Begin the cinematic intro camera animation (zoom in from far away). */
  startIntro() {
    this._introActive = true;
    this._introProgress = 0;
    this._outroActive = false;
    this._outroProgress = 0;
  }

  /** Begin the outro fade-out animation. */
  startOutro() {
    this._outroActive = true;
    this._outroProgress = 0;
  }

  /**
   * Enable or disable reduced-motion mode for accessibility.
   * Disables bloom, particles, and shockwaves.
   * @param {boolean} enabled - Whether reduced motion is preferred.
   */
  setReducedMotion(enabled) {
    if (enabled) {
      // Disable bloom for performance + photosensitivity
      this.bloomPass.strength = 0;
      this.bloomPass.enabled = false;
      // Reduce particle counts
      this.moodParams.particleRate = 0;
      // Kill shockwaves
      this.moodParams.shockwaveOpacity = 0;
    }
  }

  /** Detect GPU capability and set quality tier (4-tier system) */
  detectQuality() {
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "";
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const isLowEnd = /SwiftShader|llvmpipe|Mali-4|Adreno 3/i.test(gpu);
    const isMidRange = isMobile && !isLowEnd;

    let tier;
    if (isLowEnd) {
      tier = "low";
    } else if (isMidRange) {
      tier = "medium";
    } else if (isMobile || maxTex <= 4096) {
      tier = "high";
    } else {
      tier = "ultra";
    }

    this._qualityTier = tier;

    switch (tier) {
      case "low":
        this.renderer.setPixelRatio(1);
        this.bloomPass.enabled = false;
        this.scene.fog.density = 0.003;
        break;
      case "medium":
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.bloomPass.strength *= 0.6;
        break;
      case "high":
        // Default settings are fine for high tier
        break;
      case "ultra":
        // Could enable extra effects in the future
        break;
    }

    // Quality tier determined: tier based on GPU capabilities
    return tier;
  }

  _downgradeQuality() {
    const tiers = ["ultra", "high", "medium", "low"];
    const currentIdx = tiers.indexOf(this._qualityTier);
    if (currentIdx < tiers.length - 1) {
      const newTier = tiers[currentIdx + 1];
      console.warn(`[Sonare] Auto-downgrade: ${this._qualityTier} → ${newTier}`);
      this._qualityTier = newTier;
      if (newTier === "low") {
        this.bloomPass.enabled = false;
        this.renderer.setPixelRatio(1);
      } else if (newTier === "medium") {
        this.bloomPass.strength *= 0.6;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      }
    }
  }

  /**
   * React to a chord change by shifting harmonic ring rotation and orb colors.
   * Parses chord quality (minor, major7, dim, aug, sus) for visual mapping.
   * @param {string} chordName - The chord name string (e.g., "Am", "Cmaj7", "F#dim").
   */
  triggerChordChange(chordName) {
    if (!chordName) return;
    // Parse chord quality for visual mapping
    const isMinor = chordName.includes("m") && !chordName.includes("maj");
    const isMaj7 = chordName.includes("maj7") || chordName.includes("M7");
    const isDim = chordName.includes("dim");
    const isAug = chordName.includes("aug") || chordName.includes("+");
    const isSus = chordName.includes("sus");

    // Map chord root to a hue rotation (C=0, C#=1/12, D=2/12, ...)
    const roots = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const rootStr = chordName.replace(/[^A-G#b]/g, "").replace("b", "#"); // normalize flats
    const rootIdx = roots.indexOf(rootStr);
    const hueOffset = rootIdx >= 0 ? rootIdx / 12 : 0;

    // Store chord state for the update loop to smoothly transition to
    this._chordTarget = {
      hueOffset,
      warmth: isMinor ? -0.15 : (isMaj7 ? 0.2 : 0),
      tension: isDim ? 0.3 : (isAug ? 0.2 : (isSus ? 0.1 : 0)),
      ringSpeed: isMinor ? 0.15 : 0.25,
    };

    this._chordFlash = 1.0;
    this._chordFlashColor.setHSL(hueOffset, 0.7, 0.55);
  }

  /** Trigger a visual chord resolution effect (bloom surge + constellation line brightening). */
  triggerChordResolution() {
    // Brief brightening of all constellation lines + bloom surge
    this._sceneFxBloom = 0.15;
    this._sceneFxExposure = 0.1;
    // Flash all star map constellation lines brighter
    if (this.starMapLines) {
      this.starMapLines.material.opacity = Math.min(0.25, this.starMapLines.material.opacity + 0.1);
    }
  }

  /**
   * Set the harmonic mode direction for color temperature shifts.
   * @param {number} direction - +1 for major-dominant (warmer), -1 for minor-dominant (cooler).
   */
  setHarmonicMode(direction) {
    // Smooth accumulation: +1 for major, -1 for minor
    this._harmonicModeTarget = this._harmonicModeTarget * 0.85 + direction * 0.15;
  }

  /** @param {boolean} active - Whether the scene is in an instrumental breathing space. */
  setBreathingSpace(active) {
    this._breathingSpace = active;
  }

  /**
   * Set whether lyrics are currently being displayed.
   * When active, reduces scene brightness so lyrics remain the primary content.
   * @param {boolean} active - Whether lyrics are visible.
   */
  setLyricActive(active) {
    this._lyricActive = active;
  }

  /**
   * Enforce the max-3-simultaneous-effects cap.
   * Surveys which effects are currently active, and if more than 3 are on,
   * zeros out the lowest-priority ones' intensities.
   */
  _enforceEffectCap() {
    // Collect currently active effects with their priority index
    const active = [];
    if (this._climaxIntensity > 0.05)
      active.push({ name: "climax", priority: 0 });
    if (this._chordFlash > 0.05)
      active.push({ name: "chordResolution", priority: 1 });
    if (this.shockwaves.length > 0)
      active.push({ name: "ripple", priority: 2 });
    if (this.semanticDecay > 0.05)
      active.push({ name: "semantic", priority: 3 });
    if (this._sceneFxBloom > 0.02)
      active.push({ name: "bloomSurge", priority: 4 });
    if (this._familiarTerritory)
      active.push({ name: "familiarTerritory", priority: 5 });
    if (this._lyricDensity > 2.0)
      active.push({ name: "densephrase", priority: 6 });

    // Allow up to 5 simultaneous effects (was 3 — too aggressive, caused sudden deaths)
    if (active.length <= 5) return;

    // Sort by priority (highest priority = lowest number), keep top 5
    active.sort((a, b) => a.priority - b.priority);
    const toSuppress = active.slice(5);

    // Soft suppress: accelerate decay rather than hard-kill.
    // This prevents the jarring "effects just die" feeling.
    for (const fx of toSuppress) {
      switch (fx.name) {
        case "climax":
          this._climaxIntensity *= 0.85;
          break;
        case "chordResolution":
          this._chordFlash *= 0.7;
          break;
        case "ripple":
          for (const ring of this.shockwaves) {
            ring.material.opacity *= 0.7;
          }
          break;
        case "semantic":
          this.semanticDecay *= 0.8;
          break;
        case "bloomSurge":
          this._sceneFxBloom *= 0.8;
          break;
        case "familiarTerritory":
          this._familiarBloomTarget = null;
          break;
        case "densephrase":
          break;
      }
    }
  }

  /** @param {boolean} active - Whether rapid-fire lyrics are being delivered (tightens camera). */
  setIntenseMode(active) {
    this._intenseMode = active;
  }

  /**
   * Apply a per-song visual theme. Updates colors for background, fog, nebula,
   * stars, orb, rings, constellations, and bloom.
   * @param {import('./songs.js').SongTheme} theme - The song's theme configuration.
   */
  setSongTheme(theme) {
    const hueShift = this.seedFingerprint.accentHueShift;
    this.songHue = theme.hue + hueShift;
    this.songAccent.set(theme.accent);
    this.songAccent.offsetHSL(hueShift, 0, 0);
    this.songAccentSecondary.copy(this.songAccent).offsetHSL(0.25, 0, 0);
    if (this.trailLine) this.trailLine.material.uniforms.uColor.value.copy(this.songAccent);

    // ── Background & fog ──
    const bg = theme.bgColor ?? 0x050d18;
    const fog = theme.fogColor ?? bg;
    this.renderer.setClearColor(bg);
    this.scene.fog.color.set(fog);

    // ── Nebula color palette ──
    if (this.nebula && theme.nebulaHue != null) {
      const colors = this.nebula.geometry.getAttribute("color");
      for (let i = 0; i < colors.count; i++) {
        const c = new THREE.Color().setHSL(
          theme.nebulaHue + hueShift + this.seedFingerprint.nebulaHueOffset + (Math.random() - 0.5) * 0.12,
          (theme.nebulaSat ?? 0.3) + Math.random() * 0.2,
          (theme.nebulaLum ?? 0.10) + Math.random() * 0.06
        );
        colors.setXYZ(i, c.r, c.g, c.b);
      }
      colors.needsUpdate = true;
    }

    // ── Star color tint ──
    if (this.stars && theme.starHueBase != null) {
      const colors = this.stars.geometry.getAttribute("color");
      for (let i = 0; i < colors.count; i++) {
        const c = new THREE.Color().setHSL(
          theme.starHueBase + hueShift + Math.random() * (theme.starHueRange ?? 0.2),
          (theme.starSatBase ?? 0.2) + Math.random() * 0.2,
          0.5 + Math.random() * 0.4
        );
        colors.setXYZ(i, c.r, c.g, c.b);
      }
      colors.needsUpdate = true;
    }

    // ── Orb scale & breath ──
    if (theme.orbScale != null) this._songOrbScale = theme.orbScale;
    if (theme.orbBreathSpeed != null) this._songBreathSpeed = theme.orbBreathSpeed;

    // ── Orb colors ──
    if (this.orb) {
      this.orb.material.uniforms.uColor1.value.copy(this.songAccent);
      this.orb.material.uniforms.uColor2.value.copy(this.songAccentSecondary);
    }

    // ── Current ring colors (water-muted blend of song accent) ──
    const currentBlue = this._tmpColor.set(0x3aaa9e);
    for (const ring of this.orbitRings) {
      ring.material.color.copy(this.songAccent).lerp(currentBlue, 0.6); // 60% water-blue
    }

    // ── Constellation & shockwave colors ──
    if (this.constellationLines) this.constellationLines.material.color.copy(this.songAccent);
    // Ripple color: song accent blended with water-blue
    const waterBlue = this._tmpColor2.set(0x4abcb6);
    for (const ring of this._shockwavePool) ring.material.color.copy(this.songAccent).lerp(waterBlue, 0.5);

    // ── Bloom baseline ──
    if (theme.bloomBase != null) this._songBloomBase = theme.bloomBase;

    // ── Per-song particle style & constellation density ──
    this._particleStyle = theme.particleStyle || "drift";
    this._introStyle = theme.introStyle || "emerge";
    this._constellationDensity = theme.constellationDensity ?? 1.0;

    // Reset constellation positions for fresh start
    this.constellationPositions = [];
    if (this.constellationLines) this.constellationLines.geometry.setDrawRange(0, 0);

    // Reset Living Constellation star map for fresh song
    this.lyricStarMap = [];
    this._starMapStarCount = 0;
    this._starMapLineCount = 0;
    this._starMapReveal = false;
    this._starMapRevealProgress = 0;
    this._starMapRevealActive = false;
    this._starMapRevealElapsed = 0;
    this._reflectionBloomPulse = 0;

    // Reset camera FOV to default (may have been widened during outro reveal)
    this.camera.fov = 55;
    this.camera.position.y = 0;
    this.camera.rotation.x = 0;
    this.camera.updateProjectionMatrix();
    if (this.starMapPoints) {
      const posAttr = this.starMapPoints.geometry.getAttribute("position");
      const sizeAttr = this.starMapPoints.geometry.getAttribute("size");
      const opacAttr = this.starMapPoints.geometry.getAttribute("opacity");
      for (let i = 0; i < this.starMapMaxStars; i++) {
        posAttr.setXYZ(i, 0, 0, -9999);
        sizeAttr.setX(i, 0);
        opacAttr.setX(i, 0);
      }
      posAttr.needsUpdate = sizeAttr.needsUpdate = opacAttr.needsUpdate = true;
    }
    if (this.starMapLines) this.starMapLines.geometry.setDrawRange(0, 0);
  }

  /**
   * Set whether the song is currently in a chorus section.
   * Boosts bloom, beat scale, and shockwave opacity during chorus.
   * @param {boolean} active - Whether a chorus is active.
   */
  setChorus(active) {
    this.chorusActive = active;
    this.targetMoodParams = { ...MOOD_PRESETS[this.currentMood] };
    if (active) this._applyChorusBoost();
  }

  /**
   * Set the current song section type (verse/chorus/bridge).
   * Adjusts visual density and atmosphere accordingly.
   * @param {string} section - "verse", "chorus", or "bridge".
   */
  setSection(section) {
    this._currentSection = section;
  }

  /**
   * Trigger "familiar territory" visuals when a repeated chorus is detected.
   * Light paths glow brighter as if the lake recognizes the melody.
   * @param {boolean} active - Whether we're in a repeated section.
   */
  triggerFamiliarTerritory(active) {
    this._familiarTerritory = active;
    if (active) {
      // Boost constellation line brightness and bloom
      this._familiarBloomTarget = 1.8;
      // Intensify the beat and accent glow
      this.beatIntensity = Math.min(this.beatIntensity + 0.3, 1.0);
      if (this.constellationLines) {
        this.constellationLines.traverse(child => {
          if (child.material) {
            child.material._origOpacity = child.material._origOpacity ?? child.material.opacity;
            child.material.opacity = Math.min(1.0, (child.material._origOpacity || 0.3) * 2.5);
          }
        });
      }
    } else {
      this._familiarBloomTarget = null;
      if (this.constellationLines) {
        this.constellationLines.traverse(child => {
          if (child.material && child.material._origOpacity !== undefined) {
            child.material.opacity = child.material._origOpacity;
          }
        });
      }
    }
  }

  /**
   * Trigger a beat pulse. Intensities above 0.7 spawn water ripple rings on the lake surface.
   * Spawns a primary ripple and a trailing concentric ring ~100ms behind.
   * During breathing space (calm moments), ripples are very gentle and slow.
   * @param {number} [intensity=1] - Beat strength (typically 0-1.2).
   * @param {{x: number, z: number}} [tapPos=null] - Optional tap position on water plane (from user interaction).
   */
  triggerBeat(intensity = 1, tapPos = null) {
    this.beatIntensity = Math.min(this.beatIntensity + intensity * this.moodParams.beatScale, 1.0);
    // Only downbeats get visible ripples — grab from pre-allocated pool
    if (intensity > 0.7 && this.moodParams.shockwaveOpacity > 0.02) {
      // Water ripple color: blend song accent toward water-blue tint
      const rippleColor = this._tmpColor.copy(this.songAccent).lerp(this._tmpColor2.set(0x4abcb6), 0.5);
      const isBreathing = this._breathingSpace;
      const lifeMultiplier = isBreathing ? 1.6 : 1.0;
      const opacityMultiplier = isBreathing ? 0.5 : 1.0;
      const scaleMultiplier = isBreathing ? 0.6 : 1.0;

      // Ripple position: use tap position if provided, otherwise random offset
      const rx = tapPos ? tapPos.x : (Math.random() - 0.5) * 6;
      const rz = tapPos ? tapPos.z : (Math.random() - 0.5) * 6;

      // Primary ripple
      const ring = this._shockwavePool.find(r => !r.userData.active);
      if (!ring) return;
      ring.material.color.copy(rippleColor);
      ring.material.opacity = this.moodParams.shockwaveOpacity * opacityMultiplier;
      ring.position.set(rx, -7.5, rz);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.set(1, 1, 1);
      ring.userData.life = 0;
      ring.userData.maxLife = 3.5 * lifeMultiplier;
      ring.userData.maxScale = this.moodParams.shockwaveScale * scaleMultiplier;
      ring.userData.active = true;
      ring.userData.isTrailing = false;
      ring.visible = true;
      this.shockwaves.push(ring);

      // Trailing concentric ring — starts 100ms behind for multi-ring ripple effect
      const trail = this._shockwavePool.find(r => !r.userData.active);
      if (trail) {
        trail.material.color.copy(rippleColor).multiplyScalar(0.85);
        trail.material.opacity = this.moodParams.shockwaveOpacity * opacityMultiplier * 0.7;
        trail.position.set(rx, -7.5, rz);
        trail.rotation.x = -Math.PI / 2;
        trail.scale.set(1, 1, 1);
        trail.userData.life = -0.1;
        trail.userData.maxLife = 3.5 * lifeMultiplier;
        trail.userData.maxScale = this.moodParams.shockwaveScale * scaleMultiplier * 0.85;
        trail.userData.active = true;
        trail.userData.isTrailing = true;
        trail.visible = true;
        this.shockwaves.push(trail);
      }
    }
  }

  /**
   * Convert screen coordinates (NDC) to a position on the water plane.
   * @param {number} ndcX - Normalized device coordinate X (-1 to 1).
   * @param {number} ndcY - Normalized device coordinate Y (-1 to 1).
   * @returns {{x: number, z: number}} Position on the water plane.
   */
  screenToWaterPlane(ndcX, ndcY) {
    // Project from screen through camera onto the water plane at y=-7.5
    const worldX = ndcX * 15; // approximate horizontal spread
    const worldZ = ndcY * -10; // depth mapping
    return { x: worldX, z: worldZ };
  }

  /**
   * Trigger visual feedback for a rhythm tap interaction.
   * Perfect taps create clear, bright ripples. Good taps create diffused ripples.
   * @param {"perfect"|"good"} quality - The tap quality rating.
   * @param {number} combo - The current consecutive tap combo count.
   * @param {{x: number, z: number}} [tapPos=null] - Tap position on water plane.
   */
  triggerRhythmReward(quality, combo, tapPos = null) {
    // Spawn a quality-dependent ripple at the tap position
    const rx = tapPos ? tapPos.x : 0;
    const rz = tapPos ? tapPos.z : 0;
    const ring = this._shockwavePool.find(r => !r.userData.active);
    if (ring) {
      if (quality === "perfect") {
        // Clear, bright ripple — crisp touch on still water
        ring.material.color.setHSL(0.52, 0.5, 0.8);
        ring.material.opacity = 0.18;
        ring.userData.maxScale = 16;
        ring.userData.maxLife = 3.0;
      } else {
        // Diffused, softer ripple — gentle disturbance
        ring.material.color.setHSL(0.50, 0.3, 0.6);
        ring.material.opacity = 0.08;
        ring.userData.maxScale = 12;
        ring.userData.maxLife = 2.5;
      }
      ring.position.set(rx, -7.5, rz);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.set(1, 1, 1);
      ring.userData.life = 0;
      ring.userData.active = true;
      ring.userData.isTrailing = false;
      ring.visible = true;
      this.shockwaves.push(ring);
    }

    if (quality === "perfect") {
      // Bright moonlight flash on water pearl
      this._chordFlash = 0.4 + Math.min(combo * 0.05, 0.3);
      this._chordFlashColor.setHSL(0.55, 0.4, 0.85); // pale aqua-white flash
      // At 4+ combo, "water aurora" — concentric color ripples across the lake for 3 seconds
      if (combo >= 4) {
        this._rainbowComboEnd = this.elapsed + 3.0;
        // Spawn multiple concentric aurora ripples on the water surface
        this._spawnWaterAuroraRipples(combo);
      }
    } else if (quality === "good") {
      // Softer flash for good taps
      this._chordFlash = 0.15 + Math.min(combo * 0.02, 0.1);
      this._chordFlashColor.setHSL(0.52, 0.3, 0.7); // muted water-blue
    }
  }

  /** Spawn concentric water aurora ripples — colorful rings spreading across the lake. */
  _spawnWaterAuroraRipples(combo) {
    const auroraHues = [0.48, 0.52, 0.58, 0.45, 0.62]; // teal, cyan, aquamarine, deep blue, soft violet
    const ringCount = Math.min(combo, 6);
    for (let i = 0; i < ringCount; i++) {
      const ring = this._shockwavePool.find(r => !r.userData.active);
      if (!ring) break;
      const hue = auroraHues[i % auroraHues.length];
      ring.material.color.setHSL(hue, 0.6, 0.65);
      ring.material.opacity = 0.12;
      ring.position.set(0, -7.5, 0); // center of lake
      ring.rotation.x = -Math.PI / 2;
      ring.scale.set(1, 1, 1);
      ring.userData.life = -i * 0.15; // stagger each ring outward
      ring.userData.maxLife = 4.0;
      ring.userData.maxScale = 20 + i * 5; // each ring spreads wider
      ring.userData.active = true;
      ring.userData.isTrailing = false;
      ring.visible = true;
      this.shockwaves.push(ring);
    }
  }

  /**
   * "39" (mi-ku) Easter egg celebration — triggered when rhythm combo reaches exactly 39.
   * Floods the entire water surface with a warm Miku-teal flash, like a grateful acknowledgment.
   */
  triggerMiku39Celebration() {
    // Spawn a burst of Miku-teal ripples across the entire lake
    const mikuHue = 0.48; // #39C5BB in HSL is roughly hue 0.48
    for (let i = 0; i < 8; i++) {
      const ring = this._shockwavePool.find(r => !r.userData.active);
      if (!ring) break;
      ring.material.color.setHSL(mikuHue, 0.65, 0.7);
      ring.material.opacity = 0.2;
      ring.position.set(0, -7.5, 0);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.set(1, 1, 1);
      ring.userData.life = -i * 0.12;
      ring.userData.maxLife = 5.0;
      ring.userData.maxScale = 30 + i * 4;
      ring.userData.active = true;
      ring.userData.isTrailing = false;
      ring.visible = true;
      this.shockwaves.push(ring);
    }
    // Bright Miku-teal flash on the orb
    this._chordFlash = 0.8;
    this._chordFlashColor.setHSL(mikuHue, 0.6, 0.85);
    // Extended rainbow combo glow
    this._rainbowComboEnd = this.elapsed + 5.0;
  }

  /**
   * Trigger a semantic visual effect when a recognized lyric word is encountered.
   * Emits colored particles, plants a star in the constellation map, and
   * applies scene-level effects (brightness, fog, warmth shifts).
   * @param {import('./lyricSemantics.js').SemanticDescriptor} descriptor - The semantic descriptor for the word.
   */
  triggerSemanticEffect(descriptor) {
    if (!descriptor) return;
    // Lyric density and climax boost particle emission rate
    const effectiveRate = Math.min(1.0, this.moodParams.particleRate + this._lyricDensity * 0.1 + this._climaxParticleBoost);
    if (Math.random() > effectiveRate) return;
    if (!this.semanticColor) this.semanticColor = new THREE.Color();
    this.semanticColor.setRGB(descriptor.color[0], descriptor.color[1], descriptor.color[2]);
    this.semanticDecay = 1.0;
    this._tmpVec3.set(
      (this.rng.random() - 0.5) * 5, (this.rng.random() - 0.5) * 3, this.camera.position.z - 18
    );
    this._emitSemanticParticles(this._tmpVec3, Math.round(3 + descriptor.intensity * 4), descriptor);
    this.constellationPositions.push({ x: this._tmpVec3.x, y: this._tmpVec3.y, z: this._tmpVec3.z, color: this.semanticColor.clone() });
    if (this.constellationPositions.length > 30) this.constellationPositions.shift();
    this._updateConstellations();

    // Plant a permanent star in the Living Constellation star map
    this.plantStar(descriptor.category, descriptor.color, descriptor.intensity);

    // Scene-level effects — the world reacts to the meaning of the lyrics
    const strength = descriptor.intensity * 0.6;
    switch (descriptor.scene) {
      case "brighten":
        this._sceneFxExposure = 0.15 * strength;
        this._sceneFxBloom = 0.12 * strength;
        break;
      case "darken":
        this._sceneFxExposure = -0.1 * strength;
        this._sceneFxFog = 0.002 * strength;
        break;
      case "warmShift":
        this._sceneFxWarm = 0.08 * strength;
        break;
      case "coolShift":
        this._sceneFxWarm = -0.06 * strength;
        break;
      case "fogDeep":
        this._sceneFxFog = 0.003 * strength;
        break;
      case "fogClear":
        this._sceneFxFog = -0.002 * strength;
        break;
      case "bloomSurge":
        this._sceneFxBloom = 0.2 * strength;
        break;
    }
  }

  /**
   * Called the moment a semantic word becomes the actively-sung syllable.
   * Spawns a category-colored ripple on the water and nudges exposure briefly,
   * creating a subtle "the world noticed this word" moment.
   * @param {string} category - The semantic category (e.g., "emotion", "nature").
   * @param {string} cssColor - The CSS rgb() color string for the word.
   */
  onSemanticWordActive(category, cssColor) {
    // Parse CSS color to THREE.Color
    const m = cssColor && cssColor.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    const rippleColor = this._tmpColor.set(0x39c5bb);
    if (m) rippleColor.setRGB(+m[1] / 255, +m[2] / 255, +m[3] / 255);

    // Spawn a category-colored water ripple
    const ring = this._shockwavePool.find(r => !r.userData.active);
    if (ring) {
      ring.material.color.copy(rippleColor);
      ring.material.opacity = 0.14;
      const rx = (this.rng.random() - 0.5) * 4;
      const rz = (this.rng.random() - 0.5) * 4;
      ring.position.set(rx, -7.5, rz);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.set(1, 1, 1);
      ring.userData.life = 0;
      ring.userData.maxLife = 4.0;
      ring.userData.maxScale = 12;
      ring.userData.active = true;
      ring.userData.isTrailing = false;
      ring.visible = true;
      this.shockwaves.push(ring);
    }

    // Brief exposure micro-nudge — the scene "brightens" for this word
    this._sceneFxExposure = Math.max(this._sceneFxExposure || 0, 0.06);
    this._sceneFxBloom = Math.max(this._sceneFxBloom || 0, 0.05);
  }

  /**
   * Trigger a basic particle burst for non-semantic words.
   * Has a random 80% chance of being skipped to avoid visual noise.
   * @param {string} type - Effect type (currently only "burst" used).
   * @param {string} text - The word text (for potential future use).
   */
  triggerWordEffect(type, text) {
    if (Math.random() > 0.2) return;
    const posAttr = this.wpPoints.geometry.getAttribute("position");
    const colAttr = this.wpPoints.geometry.getAttribute("color");
    const sizeAttr = this.wpPoints.geometry.getAttribute("size");
    const idx = this.wpCount % this.wpMax; this.wpCount++;
    const angle = Math.random() * Math.PI * 2;
    posAttr.setXYZ(idx, 0, 0, this.camera.position.z - 18);
    this.wpVelocities[idx].set(Math.cos(angle) * 2, Math.sin(angle) * 2 + 1, 0);
    colAttr.setXYZ(idx, this.songAccent.r, this.songAccent.g, this.songAccent.b);
    sizeAttr.setX(idx, 1.0 + Math.random());
    this.wpLifetimes[idx] = { life: 0, maxLife: 1.5 + Math.random() };
    posAttr.needsUpdate = colAttr.needsUpdate = sizeAttr.needsUpdate = true;
  }


  // ─── Particle helpers ───

  _emitParticlesAt(pos, count) {
    const posAttr = this.wpPoints.geometry.getAttribute("position");
    const colAttr = this.wpPoints.geometry.getAttribute("color");
    const sizeAttr = this.wpPoints.geometry.getAttribute("size");
    for (let i = 0; i < count; i++) {
      const idx = this.wpCount % this.wpMax; this.wpCount++;
      const angle = Math.random() * Math.PI * 2; const speed = 1 + Math.random() * 3;
      posAttr.setXYZ(idx, pos.x, pos.y, pos.z);
      this.wpVelocities[idx].set(Math.cos(angle) * speed, Math.sin(angle) * speed, (Math.random() - 0.5));
      colAttr.setXYZ(idx, this.songAccent.r, this.songAccent.g, this.songAccent.b);
      sizeAttr.setX(idx, 1 + Math.random() * 1.5);
      this.wpLifetimes[idx] = { life: 0, maxLife: 1.0 + Math.random() * 1.5 };
    }
    posAttr.needsUpdate = colAttr.needsUpdate = sizeAttr.needsUpdate = true;
  }

  /** Splash particles — arc outward and fall with gravity like water droplets. */
  _emitSplashParticles(pos, count) {
    const posAttr = this.wpPoints.geometry.getAttribute("position");
    const colAttr = this.wpPoints.geometry.getAttribute("color");
    const sizeAttr = this.wpPoints.geometry.getAttribute("size");
    // Water-blue tint for splash droplets
    const splashR = 0.35, splashG = 0.72, splashB = 0.83;
    for (let i = 0; i < count; i++) {
      const idx = this.wpCount % this.wpMax; this.wpCount++;
      const angle = Math.random() * Math.PI * 2;
      const outSpeed = 1.5 + Math.random() * 2.5; // outward burst
      const upSpeed = 2.0 + Math.random() * 3.0;  // upward arc
      posAttr.setXYZ(idx, pos.x, pos.y, pos.z);
      // Outward + upward, gravity handled in _updateWordParticles via splash flag
      this.wpVelocities[idx].set(Math.cos(angle) * outSpeed, upSpeed, Math.sin(angle) * outSpeed * 0.3);
      colAttr.setXYZ(idx, splashR, splashG, splashB);
      sizeAttr.setX(idx, 0.6 + Math.random() * 1.0); // smaller droplets
      this.wpLifetimes[idx] = { life: 0, maxLife: 1.2 + Math.random() * 0.8, splash: true };
    }
    posAttr.needsUpdate = colAttr.needsUpdate = sizeAttr.needsUpdate = true;
  }

  _emitSemanticParticles(center, count, descriptor) {
    const posAttr = this.wpPoints.geometry.getAttribute("position");
    const colAttr = this.wpPoints.geometry.getAttribute("color");
    const sizeAttr = this.wpPoints.geometry.getAttribute("size");
    const [cr, cg, cb] = descriptor.color;
    const type = descriptor.particle;
    for (let i = 0; i < count; i++) {
      const idx = this.wpCount % this.wpMax; this.wpCount++;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2.5;
      let vx, vy, vz;
      switch (type) {
        case "floatUp": vx = (Math.random() - 0.5) * 1.5; vy = 1.5 + Math.random() * 2; vz = 0; break;
        case "rainDown": vx = (Math.random() - 0.5) * 2; vy = -(1 + Math.random() * 2); vz = 0; break;
        case "spiral": vx = Math.cos(angle + i * 0.8) * speed; vy = Math.sin(angle + i * 0.8) * speed; vz = 0.5; break;
        case "shimmer": vx = (Math.random() - 0.5) * 0.8; vy = (Math.random() - 0.5) * 0.8; vz = 0; break;
        case "scatter": vx = (Math.random() - 0.5) * 3; vy = (Math.random() - 0.5) * 2; vz = (Math.random() - 0.5); break;
        default: vx = Math.cos(angle) * speed; vy = Math.sin(angle) * speed; vz = 0;
      }
      posAttr.setXYZ(idx, center.x, center.y, center.z);
      this.wpVelocities[idx].set(vx, vy, vz);
      colAttr.setXYZ(idx, cr, cg, cb);
      sizeAttr.setX(idx, 1.2 + descriptor.intensity * 0.8);
      this.wpLifetimes[idx] = { life: 0, maxLife: 1.5 + Math.random() * 1.5 };
    }
    posAttr.needsUpdate = colAttr.needsUpdate = sizeAttr.needsUpdate = true;
  }

  _updateConstellations() {
    const pts = this.constellationPositions;
    if (pts.length < 2) return;
    const posAttr = this.constellationLines.geometry.getAttribute("position");
    let lineIdx = 0;
    for (let i = 0; i < pts.length && lineIdx < 78; i++) {
      for (let j = i + 1; j < pts.length && lineIdx < 78; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, dz = pts[i].z - pts[j].z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 20) {
          posAttr.setXYZ(lineIdx, pts[i].x, pts[i].y, pts[i].z);
          posAttr.setXYZ(lineIdx + 1, pts[j].x, pts[j].y, pts[j].z);
          lineIdx += 2;
        }
      }
    }
    posAttr.needsUpdate = true;
    this.constellationLines.geometry.setDrawRange(0, lineIdx);
    if (pts.length > 0) this.constellationLines.material.color.lerp(pts[pts.length - 1].color, 0.05);
  }

  // ─────────────────────────────────────────────
  //  MAIN UPDATE LOOP
  // ─────────────────────────────────────────────

  /**
   * Main per-frame update. Advances all animations, applies mood transitions,
   * updates shaders, and renders the scene. Called from requestAnimationFrame.
   */
  update() {
    // Skip rendering if the WebGL context is lost
    if (this._contextLost) return;

    const frameStart = performance.now();
    this.timer.update();
    const delta = this.timer.getDelta();
    this.elapsed += delta;
    const t = this.elapsed;

    this.mouseSmooth.lerp(this.mouse, 0.04);

    // ── Mood pipeline ──
    this._updateMoodPipeline(delta);
    const mp = this.moodParams;

    // ── Effect priority cap (max 3 simultaneous effects) ──
    this._enforceEffectCap();

    // ── Lyric-active dimming (smooth 0.5s transition) ──
    const lyricActiveTarget = this._lyricActive ? 1.0 : 0.0;
    this._lyricActiveMix = smoothDamp(this._lyricActiveMix, lyricActiveTarget, 4.0, delta);

    // ── Chord blend ──
    const cc = this._chordCurrent;
    const ct = this._chordTarget;
    cc.hueOffset = smoothDamp(cc.hueOffset, ct.hueOffset, 3.0, delta);
    cc.warmth = smoothDamp(cc.warmth, ct.warmth, 2.0, delta);
    cc.tension = smoothDamp(cc.tension, ct.tension, 2.0, delta);
    cc.ringSpeed = smoothDamp(cc.ringSpeed, ct.ringSpeed, 2.0, delta);
    // Chord flash decay
    this._chordFlash = smoothDamp(this._chordFlash, 0, 4.0, delta);

    // Beat: snappy rise, smooth decay
    this.beatIntensity = smoothDamp(this.beatIntensity, 0, 2.5, delta);

    // Decay semantic scene effects smoothly
    // Effects decay slowly — they should linger and overlap, not vanish instantly
    this._sceneFxExposure = smoothDamp(this._sceneFxExposure, 0, 0.8, delta);
    this._sceneFxBloom = smoothDamp(this._sceneFxBloom, 0, 0.9, delta);
    this._sceneFxFog = smoothDamp(this._sceneFxFog, 0, 0.8, delta);
    this._sceneFxWarm = smoothDamp(this._sceneFxWarm, 0, 0.5, delta);
    this._harmonicMode = smoothDamp(this._harmonicMode, this._harmonicModeTarget, 1.5, delta);

    // Apply mood to renderer (with semantic scene effects layered on)
    // B2: When lyrics are active, dim the scene so lyrics are primary
    const lyricDim = this._lyricActiveMix;
    const exposureDim = 1.0 - lyricDim * 0.12; // exposure drops to 0.88 when lyrics active (subtle)
    const bloomDim = 1.0 - lyricDim * 0.15;    // bloom drops 15% (keep the lake alive)
    this.renderer.toneMappingExposure = smoothDamp(this.renderer.toneMappingExposure, (mp.exposure + this._sceneFxExposure) * exposureDim, 2.0, delta);
    this.scene.fog.density = smoothDamp(this.scene.fog.density, mp.fogDensity + this._sceneFxFog, 2.0, delta);
    this.bloomPass.strength = smoothDamp(this.bloomPass.strength, (mp.bloomStrength * (this._songBloomBase / 0.5) + this.beatIntensity * 0.1 + this._chordFlash * 0.08 + this._sceneFxBloom) * bloomDim, 3.0, delta);
    this.bloomPass.radius = smoothDamp(this.bloomPass.radius, mp.bloomRadius, 2.0, delta);

    // Memory fog reduction + section modifier (clamped to prevent runaway)
    const fogMod = (-this.memoryState.wonder * 0.001 + this._sectionFogMod) * delta;
    this.scene.fog.density = Math.max(0.002, Math.min(0.012, this.scene.fog.density + fogMod));
    if (this._breathingSpace) {
      // B3: During breathing space, gently reduce bloom — don't kill it
      this.bloomPass.strength = smoothDamp(this.bloomPass.strength, 0.25, 1.0, delta);
    }

    // ── Harmonic mode temperature shift ──
    const hm = this._harmonicMode;
    const hmWarm = Math.max(0, hm);
    const hmCool = Math.max(0, -hm);

    // ── Stars ──
    if (this.stars) {
      const su = this.stars.material.uniforms;
      su.uTime.value = t; su.uBeatPulse.value = this.beatIntensity;
      su.uMemoryWarmth.value = this.memoryState.warmth - this.memoryState.melancholy;
      su.uMouseInfluence.value.copy(this.mouseSmooth);
      // Climax accelerates star rotation; lyric density adds subtle motion
      this.stars.rotation.y = t * (mp.starSpeed + this._sectionStarSpeed + this._climaxIntensity * 0.008 + this._lyricDensity * 0.002);
      this.stars.rotation.x = Math.sin(t * 0.003) * 0.05;

      // Harmonic tinting handled via uniform — no per-frame star color mutation
    }

    // ── Song progression gradient — smoothly shift nebula hue across song duration ──
    this._progressionHueCurrent = smoothDamp(
      this._progressionHueCurrent,
      this._progressionHueStart + (this._progressionHueEnd - this._progressionHueStart) * this.songProgress,
      1.5, delta
    );

    // ── Emotional climax — bloom surge, particle acceleration, brighter stars ──
    const climaxTarget = this._climaxActive ? 1.0 : 0.0;
    this._climaxIntensity = smoothDamp(this._climaxIntensity, climaxTarget, 2.5, delta);
    this._climaxBloomSurge = this._climaxIntensity * 0.4;
    this._climaxParticleBoost = this._climaxIntensity * 0.5;
    // Climax star brightness handled via bloom surge — no per-frame size mutation

    // ── Lyric density — smooth toward target, affect particle rate and orbit speed ──
    this._lyricDensity = smoothDamp(this._lyricDensity, this._lyricDensityTarget, 2.0, delta);

    // ── Nebula ──
    if (this.nebula) {
      this.nebula.material.uniforms.uTime.value = t;
      // Combine progression gradient with existing harmonic/semantic shifts
      const progressionHueOffset = (this._progressionHueCurrent - this._progressionHueStart) * 0.3;
      this.nebula.material.uniforms.uHueShift.value = this.songHue + progressionHueOffset + cc.hueOffset * 0.15 + (this.memoryState.warmth - this.memoryState.melancholy) * 0.1 + this._sceneFxWarm + hm * 0.08;
      this.nebula.rotation.y = t * 0.005;
    }

    // ── Water surface ──
    if (this.waterSurface) {
      const wu = this.waterSurface.material.uniforms;
      wu.uTime.value = t;
      // B3: During breathing space, water becomes nearly glass-still
      const breathingRippleTarget = this._breathingSpace ? 0.05 : (this.beatIntensity * 0.6 + this.arousal * 0.4);
      wu.uRippleIntensity.value = smoothDamp(
        wu.uRippleIntensity.value,
        breathingRippleTarget,
        3.0, delta
      );
      wu.uCameraPos.value.copy(this.camera.position);

      // Gently drift the moon direction for slow specular shimmer
      const moonAngle = t * 0.02;
      this._moonDir.set(
        0.3 * Math.cos(moonAngle) + 0.1 * Math.sin(moonAngle * 0.7),
        1.0,
        0.2 * Math.sin(moonAngle) + 0.1 * Math.cos(moonAngle * 0.5)
      ).normalize();
      wu.uMoonDir.value.copy(this._moonDir);

      // B2: Slightly soften water when lyrics active (keep it visually alive)
      this.waterSurface.material.opacity = smoothDamp(
        this.waterSurface.material.opacity ?? 1.0,
        this._lyricActive ? 0.85 : 1.0,
        2.0, delta
      );
    }

    // Reflection plant bloom pulse — decays quickly
    if (this._reflectionBloomPulse > 0.001) {
      this._reflectionBloomPulse *= Math.exp(-6.0 * delta); // fast exponential decay
    } else {
      this._reflectionBloomPulse = 0;
    }

    this.bloomPass.strength += hmWarm * 0.06 - hmCool * 0.03 + this._climaxBloomSurge + this._reflectionBloomPulse;
    this.scene.fog.density += hmCool * 0.0008;

    // ── Harmonic mode: background color temperature ──
    if (hmWarm > 0.01 || hmCool > 0.01) {
      const baseBg = this.renderer.getClearColor(this._tmpColor);
      if (hmWarm > 0.01) {
        baseBg.lerp(this._tmpWarmBg, hmWarm * 0.15);
      } else {
        baseBg.lerp(this._tmpCoolBg, hmCool * 0.15);
      }
      this.renderer.setClearColor(baseBg);
      this.scene.fog.color.lerp(baseBg, 0.05);
    }

    // ── Moonlight reflection (water pearl) ──
    if (this.orb) {
      const ou = this.orb.material.uniforms;
      ou.uTime.value = t; ou.uBeatPulse.value = this.beatIntensity; ou.uBreathSpeed.value = this._songBreathSpeed;
      const baseOrb = this._songOrbScale * 0.5; // smaller — submerged moon reflection
      const targetScale = baseOrb + this.beatIntensity * mp.beatScale * 0.8 + this._vocalAmplitude * 0.2;
      this.orb.scale.setScalar(smoothDamp(this.orb.scale.x, targetScale, 4.0, delta));
      if (this.mouseActive) {
        this.orb.position.x = smoothDamp(this.orb.position.x, this.mouseSmooth.x * 0.8, 2.0, delta);
        this.orb.position.y = smoothDamp(this.orb.position.y, -9 + this.mouseSmooth.y * 0.2, 2.0, delta);
      }
      if (this.chorusActive) {
        ou.uColor1.value.setHSL((t * 0.05) % 1, 0.6, 0.55);
        ou.uColor2.value.setHSL((t * 0.05 + 0.2) % 1, 0.6, 0.55);
      } else {
        ou.uColor1.value.lerp(this.songAccent, 0.015);
        ou.uColor2.value.lerp(this.songAccentSecondary, 0.015);
      }
      if (this.semanticDecay > 0) {
        this.semanticDecay = smoothDamp(this.semanticDecay, 0, 1.5, delta);
        if (this.semanticColor) ou.uColor1.value.lerp(this.semanticColor, this.semanticDecay * 0.15);
      }
      // Chord flash — brief color pulse toward chord root
      if (this._chordFlash > 0.05) {
        ou.uColor1.value.lerp(this._chordFlashColor, this._chordFlash * 0.3);
        ou.uColor2.value.lerp(this._chordFlashColor, this._chordFlash * 0.15);
      }
      // Water aurora combo from rhythm tap — concentric color ripples on the lake
      if (this._rainbowComboEnd > t) {
        // Cycle through water-aurora hues: deep teal -> aquamarine -> moonlight silver -> pale violet
        const auroraHue = (0.48 + (t * 0.15) % 0.25); // stays in water-blue/teal/violet range
        ou.uColor1.value.setHSL(auroraHue, 0.5, 0.7); // softer, more luminous
        ou.uColor2.value.setHSL((auroraHue + 0.12) % 1, 0.4, 0.75); // pale complement
      }
    }

    // ── Current rings — water currents on the lake, density accelerates flow ──
    const densitySpeedBoost = this._lyricDensity * 0.15; // dense lyrics = faster currents
    const climaxOpacityBoost = this._climaxIntensity * 0.06;
    for (let i = 0; i < this.orbitRings.length; i++) {
      const ring = this.orbitRings[i];
      // Current rings are subtle — visible during chorus and climax, faint otherwise
      ring.material.opacity = smoothDamp(ring.material.opacity, (this.chorusActive ? 0.08 + this.beatIntensity * 0.04 : 0.02) + climaxOpacityBoost, 3.0, delta);
      ring.material.color.lerp(this._tmpColor2.set(0x3aaa9e), 0.01); // drift toward water-blue
      // Rotate only around Y (horizontal spin on water plane) — like visible current flow
      ring.rotation.z += delta * (this.chorusActive ? 0.25 + i * 0.08 + cc.ringSpeed * 0.5 + densitySpeedBoost : 0.03 + cc.ringSpeed * 0.2 + densitySpeedBoost * 0.3);
      // Keep nearly flat on water — only tiny x wobble from current disturbance
      ring.position.y = -7.2 + Math.sin(t * 0.3 + i) * 0.1; // gentle vertical bob
    }

    // ── Intro/Outro animation ──
    if (this._introActive) {
      const introSpeed = this._introStyle === "splash" ? 0.7 : this._introStyle === "whirlpool" ? 0.3 : 0.35;
      this._introProgress = Math.min(1, this._introProgress + delta * introSpeed);
      if (this._introProgress >= 1) this._introActive = false;
    }
    if (this._outroActive) {
      this._outroProgress = Math.min(1, this._outroProgress + delta * 0.5);
    }

    // ── Camera — cinematic, music-reactive, smooth ──

    // Intro zoom
    let introZoomOut = 0;
    if (this._introActive) {
      const ip = this._introProgress;
      const style = this._introStyle || "emerge";
      if (style === "splash") {
        const eased = easeOutCubic(ip);
        introZoomOut = (1 - eased) * 60 - (eased > 0.8 ? (eased - 0.8) * 25 : 0);
      } else if (style === "whirlpool") {
        introZoomOut = (1 - easeOutCubic(ip)) * 90;
        this.camera.position.x += Math.sin(ip * Math.PI * 3) * (1 - ip) * 0.35;
        this.camera.position.y += Math.cos(ip * Math.PI * 3) * (1 - ip) * 0.25;
      } else {
        const eased = easeOutCubic(ip);
        introZoomOut = (1 - eased) * 70;
        this.camera.position.y += (1 - eased) * -3;
      }
    }

    // ── Cinematic idle drift (one revolution per ~60s, subtle vertical bob) ──
    const orbitSpeed = 2 * Math.PI / 60; // ~60 seconds per revolution
    this._cinematicOrbitAngle += orbitSpeed * delta;
    this._cinematicBobPhase += delta * 0.4; // slow bob
    const idleOrbitRadius = 3.5; // gentle circular orbit radius
    const idleDriftX = Math.sin(this._cinematicOrbitAngle) * idleOrbitRadius;
    const idleDriftY = Math.cos(this._cinematicBobPhase) * 0.8; // subtle vertical bob

    // ── Beat pulse: forward nudge on each beat, springs back ──
    // beatIntensity spikes on beat then decays; use it for a brief forward nudge
    this._beatNudge = smoothDamp(this._beatNudge, -this.beatIntensity * 0.2, 8.0, delta);

    // ── Energy zoom: higher arousal = closer to water, calm = wider vista ──
    const energyZoomTarget = -(this.arousal * 6); // up to -6 units closer at max energy
    this._energyZoom = smoothDamp(this._energyZoom, energyZoomTarget, 0.8, delta);

    // ── Chorus sweep: slow lateral drift during chorus ──
    if (this.chorusActive) {
      this._chorusSweepPhase += delta * 0.15; // slow sweep across chorus
      this._chorusSweepTarget = Math.sin(this._chorusSweepPhase) * 5.0; // +-5 units lateral
    } else {
      this._chorusSweepTarget = 0;
      this._chorusSweepPhase = 0;
    }
    this._chorusSweep = smoothDamp(this._chorusSweep, this._chorusSweepTarget, 1.2, delta);

    // ── Climax tilt: when valence + arousal > 0.7, tilt down toward water ──
    this._climaxTiltTarget = (this.valence + this.arousal > 0.7) ? -0.12 : 0; // radians
    this._climaxTilt = smoothDamp(this._climaxTilt, this._climaxTiltTarget, 1.5, delta);

    // ── Compose final camera position ──
    const sectionZoom = this._sectionCameraOffset;
    const breathMod = this._breathingSpace ? 15 : 0;
    const intenseMod = this._intenseMode ? -8 : 0;
    const targetZ = mp.cameraZ + introZoomOut + sectionZoom + breathMod + intenseMod + this._energyZoom + this._beatNudge;
    this.camera.position.z = smoothDamp(this.camera.position.z, targetZ, 1.5, delta);

    // Drag orbit — smoothly accumulate and spring back
    this._dragOrbit.x = smoothDamp(this._dragOrbit.x, this._dragOrbitAccum.x, 3.0, delta);
    this._dragOrbit.y = smoothDamp(this._dragOrbit.y, this._dragOrbitAccum.y, 3.0, delta);
    if (!this.mouseDown) {
      this._dragOrbitAccum.x *= 0.97;
      this._dragOrbitAccum.y *= 0.97;
    }

    // Mouse parallax (additive on top of cinematic)
    const mx = this.mouseActive ? this.mouseSmooth.x * 2 : 0;
    const my = this.mouseActive ? this.mouseSmooth.y * 1 : 0;

    // Final X/Y: cinematic drift + chorus sweep + mouse parallax + drag orbit
    const orbitX = idleDriftX + this._chorusSweep + mx + this._dragOrbit.x * 8;
    const orbitY = idleDriftY + my + this._dragOrbit.y * 6;
    this.camera.position.x = smoothDamp(this.camera.position.x, orbitX, 2.0, delta);
    this.camera.position.y = smoothDamp(this.camera.position.y, orbitY, 2.0, delta);

    // Look at center, then apply climax tilt (downward toward water reflections)
    this.camera.lookAt(0, 0, 0);
    this.camera.rotation.x += this._climaxTilt;

    // ── Water ripples — graceful expansion on lake surface (pooled) ──
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const ring = this.shockwaves[i];
      ring.userData.life += delta;
      // Trailing rings have negative start life (delayed onset)
      if (ring.userData.life < 0) continue;
      const p = ring.userData.life / ring.userData.maxLife;
      if (p >= 1) {
        // Return to pool instead of disposing
        ring.visible = false;
        ring.userData.active = false;
        this.shockwaves.splice(i, 1);
        continue;
      }
      // Smooth sinusoidal ease for graceful water ripple expansion
      const eased = Math.sin(p * Math.PI * 0.5);
      const s = 1 + eased * ring.userData.maxScale;
      ring.scale.set(s, s, 1);
      // Opacity fades smoothly with gentle tail
      ring.material.opacity = (1 - p * p) * mp.shockwaveOpacity * (ring.userData.isTrailing ? 0.7 : 1.0);
      // Keep horizontal on water plane (no lookAt camera)
      ring.rotation.x = -Math.PI / 2;
    }

    // ── Word particles ──
    this._updateWordParticles(delta);

    // ── Light trail ──
    if (this.isPlaying && this.mouseDown && this.mouseActive) {
      this.trailPositions.push(this.mouseSmooth.x * 15, this.mouseSmooth.y * 10, this.camera.position.z - 20);
      if (this.trailPositions.length > this.trailMaxPoints * 3) this.trailPositions.splice(0, 3);
      this._updateTrailGeometry();
    }
    if (this.trailLine) this.trailLine.material.uniforms.uColor.value.lerp(this.songAccent, 0.01);

    // Constellation opacity (legacy)
    if (this.constellationLines) {
      this.constellationLines.material.opacity = smoothDamp(
        this.constellationLines.material.opacity, Math.min(0.12, this.constellationPositions.length * 0.005), 1.0, delta
      );
    }

    // ── Lake reflection map update ──
    this._updateStarMap(t, delta);

    // ── Outro fade ──
    if (this._outroActive) {
      const fade = easeOutCubic(this._outroProgress);
      this.renderer.toneMappingExposure *= (1 - fade * 0.8);
      this.bloomPass.strength *= (1 - fade * 0.5);

      // Lake reflection reveal camera tilt is now handled in _updateStarMap
    }

    // Frame budget auto-tuning
    const frameTime = performance.now() - frameStart;
    this._frameTimes.push(frameTime);
    if (this._frameTimes.length > 30) this._frameTimes.shift();
    if (this._frameTimes.length >= 10) {
      const avg = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
      if (avg > 18 && this._qualityTier !== "low") {
        this._frameDropCount++;
        if (this._frameDropCount > 60) { // sustained poor performance
          this._downgradeQuality();
          this._frameDropCount = 0;
        }
      } else {
        this._frameDropCount = Math.max(0, this._frameDropCount - 1);
      }
    }

    this.composer.render();
  }

  _updateStarMap(t, delta) {
    if (!this.starMapPoints || this._starMapStarCount === 0) return;

    const sizeAttr = this.starMapPoints.geometry.getAttribute("size");
    const opacAttr = this.starMapPoints.geometry.getAttribute("opacity");
    const count = this._starMapStarCount;

    // Reveal mode ramp
    if (this._starMapReveal) {
      this._starMapRevealProgress = Math.min(1, this._starMapRevealProgress + delta * 0.5);
      this._starMapRevealElapsed = (this._starMapRevealElapsed || 0) + delta;
    }
    const revealMix = this._starMapReveal ? easeOutCubic(this._starMapRevealProgress) : 0;

    // ── Reveal: cinematic camera sweep to show the full emotional lake ──
    // Two-phase animation: (1) gentle rise + pullback, (2) sweeping tilt down to reveal the water
    if (this._starMapRevealActive && this._starMapRevealElapsed != null) {
      const elapsed = this._starMapRevealElapsed;
      const duration = 4.0; // total reveal duration
      const revealT = Math.min(elapsed / duration, 1.0);

      // Phase 1 (0-40%): rise and pull back
      // Phase 2 (30-100%): tilt down toward the lake (overlapping for smooth blend)
      const riseT = easeOutCubic(Math.min(revealT / 0.4, 1.0));
      const tiltT = easeOutCubic(Math.max(0, (revealT - 0.3) / 0.7));

      const startZ = this._starMapRevealStartZ || this.camera.position.z;
      this.camera.position.z = startZ + riseT * 35;        // pull back further for grandeur
      this.camera.position.y = riseT * 15;                  // rise higher above the water
      this.camera.rotation.x = -tiltT * 0.55;               // deeper tilt to see full lake surface

      // Widen FOV slightly during reveal for an expansive feeling
      this.camera.fov = 55 + tiltT * 8; // 55 -> 63
      this.camera.updateProjectionMatrix();
    }

    // ── Reveal: bloom surge — ramp up then hold (the lake glows) ──
    if (this._starMapRevealActive && revealMix > 0) {
      this.bloomPass.strength += revealMix * 0.4;
      this.bloomPass.radius = smoothDamp(this.bloomPass.radius, this.bloomPass.radius + revealMix * 0.25, 2.0, delta);
    }

    // Size multiplier: during reveal, scale reflection sizes up to 2.5x for dramatic visibility
    const revealSizeMultiplier = 1.0 + revealMix * 1.5; // 1x -> 2.5x

    let dirty = false;
    for (let i = 0; i < count; i++) {
      const reflection = this.lyricStarMap[i];
      const age = t - reflection.birthTime;

      // ── Water shimmer: multi-frequency oscillation like moonlight on ripples ──
      // Each reflection gets a unique phase offset derived from its index and position
      const phase1 = i * 2.3 + reflection.position.x * 0.2;
      const phase2 = i * 0.9 + reflection.position.z * 0.15;
      const phase3 = i * 1.7;
      // Primary sway (slow, broad), secondary ripple (medium), tertiary sparkle (fast, subtle)
      const shimmer = 0.85
        + 0.08 * Math.sin(t * 0.8 + phase1)    // slow breathing
        + 0.05 * Math.sin(t * 1.9 + phase2)    // ripple frequency
        + 0.02 * Math.sin(t * 4.3 + phase3);   // sparkle glint

      const baseSize = 2.0 + reflection.intensity * 2.0;

      // Birth pulse: exponential decay from 2.5x to 1x over ~0.8s
      let birthScale = 1.0;
      if (age < 0.8) {
        birthScale = 1.0 + 1.5 * Math.exp(-age * 5.0); // 2.5x -> ~1x
      }

      sizeAttr.setX(i, baseSize * shimmer * birthScale * revealSizeMultiplier);

      // ── Opacity: bright birth flash, settle to gentle glow, shimmer opacity too ──
      let targetOpacity;
      if (age < 0.15) {
        // Bright flash on birth (first 150ms)
        targetOpacity = 1.0;
      } else if (age < 0.8) {
        // Decay to resting opacity
        targetOpacity = 0.55 + 0.45 * Math.exp(-(age - 0.15) * 4.0);
      } else {
        // Resting: gentle opacity shimmer (like water reflections fading in and out)
        targetOpacity = 0.45 + 0.1 * Math.sin(t * 0.6 + phase1) + 0.05 * Math.sin(t * 1.4 + phase2);
      }

      // Reveal mode: push all reflections to full brightness
      if (revealMix > 0) {
        targetOpacity = targetOpacity + (1.0 - targetOpacity) * revealMix;
      }

      opacAttr.setX(i, targetOpacity);
      dirty = true;
    }

    if (dirty) {
      sizeAttr.needsUpdate = true;
      opacAttr.needsUpdate = true;
    }

    // Update reflection map shader time
    this.starMapPoints.material.uniforms.uTime.value = t;

    // Light path opacity — during reveal, paths glow brighter on the water
    if (this.starMapLines) {
      const baseLineOpacity = 0.05 + Math.min(0.03, this._starMapStarCount * 0.0004);
      const targetLineOpacity = this._starMapReveal
        ? baseLineOpacity + (0.3 - baseLineOpacity) * revealMix
        : baseLineOpacity;
      this.starMapLines.material.opacity = smoothDamp(
        this.starMapLines.material.opacity, targetLineOpacity, 2.0, delta
      );
    }
  }

  _updateWordParticles(delta) {
    const posAttr = this.wpPoints.geometry.getAttribute("position");
    const sizeAttr = this.wpPoints.geometry.getAttribute("size");
    const style = this._particleStyle || "drift";
    const t = this.elapsed;
    // B3: During breathing space, reduce particle motion by 80%
    const motionScale = this._breathingSpace ? 0.2 : 1.0;
    let dirty = false;
    for (let i = 0; i < this.wpMax; i++) {
      const lt = this.wpLifetimes[i];
      if (lt.maxLife <= 0) continue;
      lt.life += delta;
      if (lt.life >= lt.maxLife) { posAttr.setZ(i, -9999); sizeAttr.setX(i, 0); lt.maxLife = 0; dirty = true; continue; }
      const p = lt.life / lt.maxLife;
      const vel = this.wpVelocities[i];
      let x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
      const dt = delta * motionScale; // B3: scaled delta for breathing space

      // Per-particle splash override — water droplets arcing with gravity
      if (lt.splash) {
        const gravity = -8.0; // strong downward pull
        x += vel.x * dt;
        vel.y += gravity * dt; // apply gravity to vertical velocity
        y += vel.y * dt;
        z += vel.z * dt;
        // Slight drag on horizontal movement
        vel.x *= 0.98;
        vel.z *= 0.98;
        posAttr.setXYZ(i, x, y, z);
        sizeAttr.setX(i, sizeAttr.getX(i) * (0.99 - p * 0.02)); // shrink as droplet falls
        dirty = true;
        continue;
      }

      if (style === "whirlpool") {
        // Slow spiral, like water draining — tightening orbit
        const angle = dt * 1.2;
        const vx = vel.x * Math.cos(angle) - vel.z * Math.sin(angle);
        const vz = vel.x * Math.sin(angle) + vel.z * Math.cos(angle);
        const drag = 1 - p * 0.5;
        const pull = 1 - p * 0.3; // gradually pulled inward
        x += vx * dt * drag * pull; y += vel.y * dt * drag * 0.3; z += vz * dt * drag * pull;
        vel.x = vx; vel.z = vz;
      } else if (style === "tide") {
        // Rhythmic in-out like tidal breathing
        const tidePhase = Math.sin(t * 2.0 + i * 0.2) * 0.6 * (1 - p);
        const drag = (1 - p * 0.4) * (1 + tidePhase);
        x += vel.x * dt * drag; y += vel.y * dt * drag * 0.5; z += vel.z * dt * drag;
      } else if (style === "splash") {
        // Explosive water splash outward — fast start, rapid deceleration
        const drag = Math.pow(1 - p, 3);
        x += vel.x * dt * drag * 2.2; y += (vel.y * drag * 2.2 - 2.0 * lt.life) * dt; z += vel.z * dt * drag * 2.2;
      } else if (style === "current") {
        // Flowing stream-like paths — gentle lateral drift with current
        const streamAngle = t * 0.3 + i * 0.05;
        const currentX = Math.sin(streamAngle) * 0.8;
        const currentZ = Math.cos(streamAngle * 0.7) * 0.5;
        const drag = 1 - p * 0.4;
        x += (vel.x * 0.4 + currentX) * dt * drag;
        y += vel.y * dt * drag * 0.2;
        z += (vel.z * 0.4 + currentZ) * dt * drag;
      } else if (style === "rain") {
        // Drops falling onto water surface — gravity with slight drift
        const drag = 1 - p * 0.2;
        x += vel.x * dt * drag * 0.3;
        y += (vel.y - 4.0 * lt.life) * dt * drag;
        z += vel.z * dt * drag * 0.3;
      } else {
        // "drift" — gentle surface drift, like leaves on water
        const driftX = Math.sin(t * 0.5 + i * 0.7) * 0.15;
        const driftZ = Math.cos(t * 0.4 + i * 0.5) * 0.12;
        const drag = 1 - p * 0.5;
        x += (vel.x * 0.5 + driftX) * dt * drag;
        y += vel.y * dt * drag * 0.3;
        z += (vel.z * 0.5 + driftZ) * dt * drag;
      }

      posAttr.setXYZ(i, x, y, z);
      sizeAttr.setX(i, sizeAttr.getX(i) * (0.995 + Math.pow(1 - p, 2) * 0.005));
      dirty = true;
    }
    if (dirty) { posAttr.needsUpdate = true; sizeAttr.needsUpdate = true; }
  }

  _updateTrailGeometry() {
    const posAttr = this.trailLine.geometry.getAttribute("position");
    const count = this.trailPositions.length / 3;
    for (let i = 0; i < count; i++) posAttr.setXYZ(i, this.trailPositions[i * 3], this.trailPositions[i * 3 + 1], this.trailPositions[i * 3 + 2]);
    posAttr.needsUpdate = true;
    this.trailLine.geometry.setDrawRange(0, count);
    this.trailLine.material.uniforms.uPointCount.value = count;
  }

  _onResize() {
    this.width = this.container.clientWidth; this.height = this.container.clientHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.composer.setSize(this.width, this.height);
  }

  /**
   * Show a user-friendly overlay when the WebGL context is lost.
   * @private
   */
  _showContextLostMessage() {
    if (this._contextLostOverlay) return;
    const overlay = document.createElement("div");
    overlay.id = "webgl-context-lost";
    overlay.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,13,24,0.92);z-index:1000;color:#aaa;font-family:sans-serif;text-align:center;padding:2rem;";
    overlay.innerHTML = `<div><p style="font-size:1.2rem;margin-bottom:0.5rem;">WebGL context was lost.</p><p style="font-size:0.9rem;opacity:0.7;">The browser will attempt to restore it automatically.<br>If this persists, try reloading the page.</p></div>`;
    this.container.style.position = this.container.style.position || "relative";
    this.container.appendChild(overlay);
    this._contextLostOverlay = overlay;
  }

  /**
   * Remove the WebGL context lost overlay after restoration.
   * @private
   */
  _hideContextLostMessage() {
    if (this._contextLostOverlay) {
      this._contextLostOverlay.remove();
      this._contextLostOverlay = null;
    }
  }

  /**
   * Clean up all Three.js resources and event listeners.
   * Call this when the scene is no longer needed to prevent memory leaks.
   */
  dispose() {
    window.removeEventListener("resize", this._onResize);
    this.container.removeEventListener("mousemove", this._onMouseMove);
    this.container.removeEventListener("touchmove", this._onTouchMove);
    this.container.removeEventListener("pointerdown", this._onPointerDown);
    this.container.removeEventListener("pointerup", this._onPointerUp);
    this.container.removeEventListener("pointermove", this._onPointerMove);

    // Dispose all geometries and materials
    if (this.stars) { this.stars.geometry.dispose(); this.stars.material.dispose(); }
    if (this.nebula) { this.nebula.geometry.dispose(); this.nebula.material.dispose(); }
    if (this.orb) { this.orb.geometry.dispose(); this.orb.material.dispose(); }
    for (const ring of this.orbitRings) { ring.geometry.dispose(); ring.material.dispose(); }
    if (this.wpPoints) { this.wpPoints.geometry.dispose(); this.wpPoints.material.dispose(); }
    if (this.constellationLines) { this.constellationLines.geometry.dispose(); this.constellationLines.material.dispose(); }
    if (this.starMapPoints) { this.starMapPoints.geometry.dispose(); this.starMapPoints.material.dispose(); }
    if (this.starMapLines) { this.starMapLines.geometry.dispose(); this.starMapLines.material.dispose(); }
    if (this.trailLine) { this.trailLine.geometry.dispose(); this.trailLine.material.dispose(); }
    if (this.waterSurface) { this.waterSurface.geometry.dispose(); this.waterSurface.material.dispose(); }
    if (this.ringGeometry) this.ringGeometry.dispose();
    for (const ring of this._shockwavePool) { ring.material.dispose(); }

    this.composer.dispose();
    this.renderer.dispose();
    this._hideContextLostMessage();
  }
}
