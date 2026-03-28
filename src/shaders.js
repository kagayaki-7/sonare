/**
 * @module shaders
 * GLSL shaders for the Sonare 3D scene.
 * Extracted from scene.js for maintainability.
 *
 * All shaders use Three.js built-in uniforms (modelViewMatrix, projectionMatrix, normalMatrix)
 * plus custom uniforms prefixed with `u` (e.g., uTime, uBeatPulse).
 */

/**
 * Starfield vertex shader.
 * Applies twinkle animation, beat pulse scaling, mouse parallax, and memory-based color warmth.
 * @type {string}
 */
export const starVertexShader = `
  attribute float size; attribute vec3 color;
  varying vec3 vColor;
  uniform float uTime, uBeatPulse, uPixelRatio, uMemoryWarmth;
  uniform vec2 uMouseInfluence;
  void main() {
    vColor = color + vec3(uMemoryWarmth * 0.08, 0.0, -uMemoryWarmth * 0.06);
    vec3 pos = position;
    pos.xy += uMouseInfluence * pos.z * 0.002;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float twinkle = sin(uTime * 1.5 + position.x * 0.3 + position.y * 0.2) * 0.2 + 0.8;
    float beat = 1.0 + uBeatPulse * 0.15;
    gl_PointSize = size * twinkle * beat * uPixelRatio * (180.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * Starfield fragment shader. Renders soft circular point sprites with alpha falloff.
 * @type {string}
 */
export const starFragmentShader = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = 1.0 - smoothstep(0.0, 1.0, d);
    gl_FragColor = vec4(vColor, alpha * alpha * 0.9);
  }
`;

/**
 * Nebula vertex shader. Applies slow pulsing size animation and hue-shifted colors.
 * @type {string}
 */
export const nebulaVertexShader = `
  attribute float size; attribute vec3 color;
  varying vec3 vColor;
  uniform float uTime, uPixelRatio, uHueShift;
  void main() {
    vColor = color + vec3(sin(uHueShift * 6.28) * 0.08, 0.0, cos(uHueShift * 6.28) * 0.08);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float pulse = sin(uTime * 0.3 + position.x * 0.05) * 0.1 + 1.0;
    gl_PointSize = size * pulse * uPixelRatio * (100.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * Nebula fragment shader. Renders soft, low-opacity cloud-like point sprites.
 * @type {string}
 */
export const nebulaFragmentShader = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(vColor, pow(1.0 - smoothstep(0.0, 1.0, d), 3.0) * 0.1);
  }
`;

/**
 * Central orb vertex shader. Applies beat-reactive wobble displacement along normals.
 * @type {string}
 */
export const orbVertexShader = `
  varying vec3 vNormal, vPos;
  uniform float uBeatPulse, uTime;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 pos = position;
    float wobble = sin(pos.x * 3.0 + uTime * 2.0) * sin(pos.y * 3.0 + uTime * 1.5) * uBeatPulse * 0.08;
    pos += normal * wobble;
    vPos = pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/**
 * Central orb fragment shader. Renders with Fresnel edge glow, breathing animation,
 * and beat-reactive brightness. Blends between two configurable colors.
 * @type {string}
 */
export const orbFragmentShader = `
  uniform float uTime, uBeatPulse, uBreathSpeed;
  uniform vec3 uColor1, uColor2;
  varying vec3 vNormal, vPos;
  void main() {
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.8);
    float breath = sin(uTime * uBreathSpeed) * 0.08 + 0.92;
    float beat = 1.0 + uBeatPulse * 0.4;
    vec3 col = mix(uColor1, uColor2, sin(uTime * 0.3 + vPos.y * 1.5) * 0.5 + 0.5);
    gl_FragColor = vec4(col, fresnel * breath * beat * 0.5);
  }
`;

/**
 * Word particle vertex shader. Simple point sprite with per-vertex color and size.
 * @type {string}
 */
export const wpVertexShader = `
  attribute float size; attribute vec3 color; varying vec3 vColor;
  uniform float uPixelRatio;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uPixelRatio * (120.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * Word particle fragment shader. Renders soft glowing point sprites.
 * @type {string}
 */
export const wpFragmentShader = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(vColor, pow(1.0 - smoothstep(0.0, 1.0, d), 2.0) * 0.6);
  }
`;

/**
 * Light trail vertex shader. Computes per-vertex alpha based on vertex index for fade effect.
 * @type {string}
 */
export const trailVertexShader = `
  uniform float uPointCount; varying float vAlpha;
  void main() {
    vAlpha = (float(gl_VertexID) / max(uPointCount, 1.0)) * 0.25;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Light trail fragment shader. Renders with uniform color and per-vertex alpha.
 * @type {string}
 */
export const trailFragmentShader = `
  uniform vec3 uColor; varying float vAlpha;
  void main() { gl_FragColor = vec4(uColor, vAlpha); }
`;

// ─── Water surface shaders ───

/**
 * Water surface vertex shader.
 * Uses Gerstner waves (3 octaves) for realistic peaked crests and broad troughs.
 * Computes analytical displaced normals from wave derivatives.
 * @type {string}
 */
export const waterVertexShader = `
  uniform float uTime;
  uniform float uRippleIntensity;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vWaveHeight;

  // Gerstner wave: returns displacement (vec3) and adds to tangent/bitangent
  // dir = normalized wave direction, steepness Q, amplitude A, frequency w, phase speed phi
  vec3 gerstner(vec2 pos, vec2 dir, float Q, float A, float w, float phi,
                inout vec3 tangent, inout vec3 bitangent) {
    float d = dot(dir, pos);
    float s = sin(w * d + phi);
    float c = cos(w * d + phi);
    // Accumulate tangent and bitangent contributions
    tangent += vec3(
      -dir.x * dir.x * Q * A * s,
       dir.x * A * c,
      -dir.x * dir.y * Q * A * s
    );
    bitangent += vec3(
      -dir.x * dir.y * Q * A * s,
       dir.y * A * c,
      -dir.y * dir.y * Q * A * s
    );
    return vec3(
      Q * A * dir.x * c,
      A * s,
      Q * A * dir.y * c
    );
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    float rippleBoost = 1.0 + uRippleIntensity * 1.5;

    // Initialize tangent/bitangent for normal computation
    vec3 T = vec3(1.0, 0.0, 0.0);
    vec3 B = vec3(0.0, 0.0, 1.0);

    // Wave 1: broad swell
    vec2 d1 = normalize(vec2(0.6, 0.8));
    float A1 = 0.35 * rippleBoost;
    float w1 = 0.18;
    float phi1 = uTime * 0.4;
    pos += gerstner(pos.xz, d1, 0.45, A1, w1, phi1, T, B);

    // Wave 2: medium chop, different direction
    vec2 d2 = normalize(vec2(-0.4, 0.7));
    float A2 = 0.18 * rippleBoost;
    float w2 = 0.35;
    float phi2 = uTime * 0.7 + 1.3;
    pos += gerstner(pos.xz, d2, 0.35, A2, w2, phi2, T, B);

    // Wave 3: fine ripples
    vec2 d3 = normalize(vec2(0.9, -0.3));
    float A3 = 0.08 * rippleBoost;
    float w3 = 0.7;
    float phi3 = uTime * 1.1 + 3.7;
    pos += gerstner(pos.xz, d3, 0.25, A3, w3, phi3, T, B);

    // Wave 4: micro-ripples (fine surface texture, very subtle)
    vec2 d4 = normalize(vec2(-0.7, -0.5));
    float A4 = 0.03 * rippleBoost;
    float w4 = 1.5;
    float phi4 = uTime * 1.8 + 5.2;
    pos += gerstner(pos.xz, d4, 0.15, A4, w4, phi4, T, B);

    // Compute displaced normal from tangent cross bitangent
    vec3 displNormal = normalize(cross(B, T));
    vNormal = normalize(normalMatrix * displNormal);

    vWaveHeight = pos.y - position.y; // how much this vertex rose
    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/**
 * Water surface fragment shader.
 * Moonlit dark lake: Fresnel reflection, Blinn-Phong moonlight specular,
 * subsurface scatter approximation, procedural caustics, distance fog, edge foam.
 * @type {string}
 */
export const waterFragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;          // deep water base color
  uniform float uRippleIntensity;
  uniform vec3 uCameraPos;
  uniform vec3 uMoonDir;        // normalized moon light direction
  uniform vec3 uSkyColor;       // dark blue-gray for fresnel reflection
  uniform vec3 uFogColor;       // horizon mist color
  uniform float uFogDensity;    // fog falloff

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vWaveHeight;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);

    // ── 1. Fresnel reflection ──
    float fresnel = pow(1.0 - max(dot(V, N), 0.0), 3.0);
    fresnel = clamp(fresnel, 0.0, 1.0);

    // Deep water color — darken with distance from camera
    float camDist = length(uCameraPos - vWorldPos);
    vec3 deepColor = uColor * (1.0 - smoothstep(20.0, 120.0, camDist) * 0.5);

    // Blend between deep water (looking down) and sky reflection (grazing angle)
    vec3 waterCol = mix(deepColor, uSkyColor, fresnel * 0.85);

    // ── 2. Specular moonlight (Blinn-Phong) ──
    vec3 H = normalize(V + uMoonDir);
    float NdotH = max(dot(N, H), 0.0);
    float spec = pow(NdotH, 128.0);
    // Moonlight is cool white-blue, shimmers with wave distortion
    vec3 moonSpec = vec3(0.85, 0.9, 1.0) * spec * 1.2;
    // Boost specular slightly when music is active for sparkle
    moonSpec *= (1.0 + uRippleIntensity * 0.5);
    waterCol += moonSpec;

    // ── 2b. Sparkles — sharp specular highlights dancing across the surface ──
    // High-frequency normal perturbation creates glittering moonlight points
    vec3 sparkleN = N;
    sparkleN.x += sin(vWorldPos.x * 8.0 + uTime * 2.1) * cos(vWorldPos.z * 6.0 - uTime * 1.7) * 0.15;
    sparkleN.z += cos(vWorldPos.x * 7.0 - uTime * 1.3) * sin(vWorldPos.z * 9.0 + uTime * 2.4) * 0.15;
    sparkleN = normalize(sparkleN);
    vec3 sparkleH = normalize(V + uMoonDir);
    float sparkleSpec = pow(max(dot(sparkleN, sparkleH), 0.0), 512.0);
    // Sparkles are bright white dots, stronger when music is active
    float sparkleIntensity = sparkleSpec * (1.5 + uRippleIntensity * 2.0);
    // Fade sparkles with distance for natural falloff
    sparkleIntensity *= (1.0 - smoothstep(25.0, 80.0, camDist));
    waterCol += vec3(0.95, 0.97, 1.0) * sparkleIntensity;

    // ── 3. Subsurface scatter approximation ──
    // Near crests (positive waveHeight), light passes through thin water
    float sss = max(vWaveHeight, 0.0) * 0.3;
    waterCol += vec3(0.05, 0.15, 0.2) * sss;

    // ── 4. Voronoi caustic pattern (organic, high-quality) ──
    // Hash function for pseudo-random cell positions
    vec2 causticUV = vWorldPos.xz * 0.12;
    float caustic = 0.0;

    // Two octaves of Voronoi for organic look
    for (int oct = 0; oct < 2; oct++) {
      float scale = (oct == 0) ? 1.0 : 2.2;
      float speed = (oct == 0) ? 0.3 : 0.45;
      float weight = (oct == 0) ? 0.65 : 0.35;
      vec2 uv = causticUV * scale + uTime * speed * vec2(0.13, -0.09) * (1.0 + float(oct) * 0.5);
      vec2 ip = floor(uv);
      vec2 fp = fract(uv);

      float d1 = 8.0; // nearest distance
      float d2 = 8.0; // second nearest
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 neighbor = vec2(float(x), float(y));
          // Animated cell centers
          vec2 cellId = ip + neighbor;
          vec2 cellRand = fract(sin(vec2(
            dot(cellId, vec2(127.1, 311.7)),
            dot(cellId, vec2(269.5, 183.3))
          )) * 43758.5453);
          // Gentle drift so caustics swim
          vec2 cellPos = neighbor + cellRand + 0.3 * sin(uTime * 0.4 + 6.2831 * cellRand) - fp;
          float d = dot(cellPos, cellPos);
          if (d < d1) { d2 = d1; d1 = d; }
          else if (d < d2) { d2 = d; }
        }
      }
      // F2 - F1 gives bright caustic lines between cells
      float voronoi = d2 - d1;
      caustic += pow(voronoi, 1.5) * weight;
    }

    caustic = pow(caustic, 2.0) * 3.0;
    caustic = clamp(caustic, 0.0, 1.0);
    // Caustics fade with distance — visible mainly near/mid range
    float causticFade = 1.0 - smoothstep(15.0, 70.0, camDist);
    float causticStrength = caustic * 0.2 * causticFade * (0.5 + uRippleIntensity * 0.8);
    waterCol += vec3(0.3, 0.6, 0.7) * causticStrength;

    // ── 5. Edge foam ──
    // Only the tallest wave crests get a subtle foam line
    float foam = smoothstep(0.4, 0.65, vWaveHeight) * causticFade;
    waterCol = mix(waterCol, vec3(0.55, 0.65, 0.72), foam * 0.08);

    // ── 6. Distance fog / horizon mist ──
    float fogFactor = 1.0 - exp(-uFogDensity * camDist * camDist);
    fogFactor = clamp(fogFactor, 0.0, 1.0);
    waterCol = mix(waterCol, uFogColor, fogFactor);

    // Alpha: mostly opaque, soften at far edges of plane
    float distFromCenter = length(vWorldPos.xz) / 100.0;
    float edgeFade = 1.0 - smoothstep(0.85, 1.0, distFromCenter);
    float alpha = (0.85 + fresnel * 0.1 + spec * 0.05) * edgeFade;

    gl_FragColor = vec4(waterCol, alpha);
  }
`;
