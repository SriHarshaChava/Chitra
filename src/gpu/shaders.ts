/**
 * GPU programs (GLSL). The fragment shader runs for every screen pixel and performs
 * the develop maths. It mirrors `src/develop/developMath.ts` line for line — if you
 * change one, change the other (a browser test compares them).
 */

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

float toneChannel(float v) {
  float t = (v - u_blackPoint) / (u_whitePoint - u_blackPoint);
  t += u_shadows * shadowWeight(t);
  t += u_highlights * highlightWeight(t);
  t = sCurve(t, u_contrast);
  t = sCurve(t, u_baseContrast);
  return t;
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

    c = vec3(tone(c.r), tone(c.g), tone(c.b));
  }

  vec3 display = u_output * c;
  if (u_encode) {
    outColor = vec4(encodeSrgb(display.r), encodeSrgb(display.g), encodeSrgb(display.b), 1.0);
  } else {
    outColor = vec4(clamp(display, 0.0, 1.0), 1.0);
  }
}
`;
