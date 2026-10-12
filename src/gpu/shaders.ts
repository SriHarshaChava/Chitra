/**
 * GPU programs (GLSL). The fragment shader runs for every screen pixel and performs
 * the develop maths. It mirrors `src/develop/developMath.ts` line for line — if you
 * change one, change the other (a browser test compares them).
 */

import { BAND_CENTERS, NEUTRAL_CHROMA } from '../develop/hsl';

export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 a_unit;          // corner of a unit square (0..1)
uniform vec4 u_rect;     // area to draw, in image pixels: x, y, width, height
uniform mat3 u_toClip;   // image pixels -> clip space
uniform vec4 u_texRect;  // matching texture area: u, v, width, height
out vec2 v_uv;

void main() {
  vec2 p = u_rect.xy + a_unit * u_rect.zw;
  vec3 clip = u_toClip * vec3(p, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = u_texRect.xy + a_unit * u_texRect.zw;
}
`;

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D; // full precision for the float textures (photo, tone curve)

in vec2 v_uv;
uniform sampler2D u_tex;
uniform mat3 u_sourceToRec2020; // texture colours -> linear Rec.2020
uniform bool u_develop;         // false: show the image as it is (camera previews)
uniform mat3 u_input;           // white balance x exposure
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_blackPoint;
uniform float u_whitePoint;
uniform float u_shadows;
uniform float u_highlights;
uniform float u_contrast;
uniform float u_baseContrast;
uniform bool u_curveOn;
uniform sampler2D u_curve;      // tone curve lookup table (1 row of floats)
uniform bool u_mixerOn;
uniform float u_mixHue[8];      // colour mixer, per band
uniform float u_mixSat[8];
uniform float u_mixLum[8];
uniform bool u_gradingOn;
uniform vec2 u_gradeShadows;    // colour grading a/b shifts
uniform vec2 u_gradeMidtones;
uniform vec2 u_gradeHighlights;
uniform float u_gradePivot;
uniform float u_gradeWidth;
uniform mat3 u_toLms;           // OKLab conversions (see src/color/oklab.ts)
uniform mat3 u_lmsToLab;
uniform mat3 u_labToLms;
uniform mat3 u_fromLms;
uniform mat3 u_output;          // linear Rec.2020 -> linear display (or export) RGB
uniform bool u_encode;          // false: output linear light (used for export)
out vec4 outColor;

float encodeSrgb(float x) {
  x = clamp(x, 0.0, 1.0);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}

float decodeSrgb(float v) {
  v = clamp(v, 0.0, 1.0);
  return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4);
}

// Like the sRGB curve, but continues above 1 so over-bright values can be recovered.
float encodeExtended(float x) {
  return x <= 1.0 ? encodeSrgb(x) : 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}

float decodeExtended(float v) {
  return v <= 1.0 ? decodeSrgb(v) : pow((v + 0.055) / 1.055, 2.4);
}

float shadowWeight(float v) {
  return (v <= 0.0 || v >= 1.0) ? 0.0 : 6.75 * v * (1.0 - v) * (1.0 - v);
}

float highlightWeight(float v) {
  if (v <= 0.0) return 0.0;
  if (v >= 2.0 / 3.0) return 1.0;
  return 6.75 * v * v * (1.0 - v);
}

float sCurve(float v, float strength) {
  if (v <= 0.0 || v >= 1.0) return v;
  return v + strength * (v * v * (3.0 - 2.0 * v) - v);
}

float lookupCurve(float v) {
  int last = textureSize(u_curve, 0).x - 1;
  if (v <= 0.0) return texelFetch(u_curve, ivec2(0, 0), 0).r + v;
  if (v >= 1.0) return texelFetch(u_curve, ivec2(last, 0), 0).r + (v - 1.0);
  float position = v * float(last);
  int i = min(last - 1, int(floor(position)));
  float f = position - float(i);
  float a = texelFetch(u_curve, ivec2(i, 0), 0).r;
  float b = texelFetch(u_curve, ivec2(i + 1, 0), 0).r;
  return a + (b - a) * f;
}

float toneChannel(float v) {
  float t = (v - u_blackPoint) / (u_whitePoint - u_blackPoint);
  t += u_shadows * shadowWeight(t);
  t += u_highlights * highlightWeight(t);
  t = sCurve(t, u_contrast);
  t = sCurve(t, u_baseContrast);
  if (u_curveOn) t = lookupCurve(t);
  return t;
}

vec3 cbrtSigned(vec3 x) {
  return sign(x) * pow(abs(x), vec3(1.0 / 3.0));
}

vec3 toOklab(vec3 rgb) {
  return u_lmsToLab * cbrtSigned(u_toLms * rgb);
}

vec3 fromOklab(vec3 lab) {
  vec3 lms = u_labToLms * lab;
  return u_fromLms * (lms * lms * lms);
}

const float PI = 3.14159265358979;
const float BAND_CENTERS[8] = float[8](${BAND_CENTERS.map((c) => c.toFixed(1)).join(', ')});

vec3 mixer(vec3 rgb) {
  vec3 lab = toOklab(rgb);
  float chroma = length(lab.yz);
  if (chroma < 1e-7) return rgb;
  float angle = atan(lab.z, lab.y) * 180.0 / PI;
  float d = mod(angle - BAND_CENTERS[0], 360.0);
  int i = 0;
  for (int k = 0; k < 7; k++) {
    if (d >= BAND_CENTERS[k + 1] - BAND_CENTERS[0]) i = k + 1;
  }
  float start = BAND_CENTERS[i] - BAND_CENTERS[0];
  float end = i == 7 ? 360.0 : BAND_CENTERS[i + 1] - BAND_CENTERS[0];
  float s = sin(PI / 2.0 * (d - start) / (end - start));
  float w = s * s;
  int j = (i + 1) % 8;

  float hue = (angle + mix(u_mixHue[i], u_mixHue[j], w)) * PI / 180.0;
  float newChroma = chroma * (1.0 + mix(u_mixSat[i], u_mixSat[j], w));
  float colourfulness = min(1.0, chroma / ${NEUTRAL_CHROMA.toFixed(4)});
  float newL = lab.x * (1.0 + mix(u_mixLum[i], u_mixLum[j], w) * colourfulness);
  return max(vec3(0.0), fromOklab(vec3(newL, newChroma * cos(hue), newChroma * sin(hue))));
}

vec3 grading(vec3 rgb) {
  vec3 lab = toOklab(rgb);
  float t = smoothstep(u_gradePivot - u_gradeWidth, u_gradePivot + u_gradeWidth, lab.x);
  float fade = clamp(lab.x * 5.0, 0.0, 1.0);
  vec2 shift = ((1.0 - t) * u_gradeShadows + 4.0 * t * (1.0 - t) * u_gradeMidtones +
                t * u_gradeHighlights) * fade;
  return max(vec3(0.0), fromOklab(vec3(lab.x, lab.yz + shift)));
}

float tone(float linear) {
  return decodeExtended(max(0.0, toneChannel(encodeExtended(linear))));
}

void main() {
  vec3 c = u_sourceToRec2020 * texture(u_tex, v_uv).rgb;

  if (u_develop) {
    c = u_input * c;

    float luma = dot(c, vec3(0.2627, 0.678, 0.0593));
    float maxC = max(c.r, max(c.g, c.b));
    float minC = min(c.r, min(c.g, c.b));
    float currentSaturation = maxC > 1e-6 ? (maxC - minC) / maxC : 0.0;
    float k = 1.0 + u_saturation + u_vibrance * (1.0 - currentSaturation);
    c = max(vec3(0.0), luma + (c - luma) * k);

    if (u_mixerOn) c = mixer(c);

    c = vec3(tone(c.r), tone(c.g), tone(c.b));

    if (u_gradingOn) c = grading(c);
  }

  vec3 display = u_output * c;
  if (u_encode) {
    outColor = vec4(encodeSrgb(display.r), encodeSrgb(display.g), encodeSrgb(display.b), 1.0);
  } else {
    outColor = vec4(clamp(display, 0.0, 1.0), 1.0);
  }
}
`;
