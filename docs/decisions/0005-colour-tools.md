# 0005 — Colour tools: tone curve, colour mixer and colour grading

- **Status:** Accepted
- **Date:** 2026-10-12

## Context

Phase 4a adds the finishing colour tools that wildlife and portrait photographers use most: a tone curve, a colour mixer (HSL) and colour grading. They must look natural, stay fast on an iPad, and stay verifiable: the GPU shader must match the TypeScript reference maths (a browser test checks this).

## Decision

1. **The colour mixer and grading work in OKLab / OKLCh.**
   - OKLab is a modern, free perceptual colour space (Björn Ottosson, 2020). It separates lightness from colour better than the classic HSL or CIELAB.
   - Result: turning up the saturation of blue makes the sky more blue without making it noticeably darker or lighter, and shifting a hue doesn't drift into a neighbouring colour.
   - It is computed directly from Chitra's linear Rec.2020 working space (two 3×3 matrices and a cube root), so it is cheap on the GPU.

2. **Eight overlapping colour bands with smooth weights.** Each colour belongs to its two nearest bands (red, orange, yellow, green, aqua, blue, purple, magenta), weighted by a cosine curve that always adds up to 1. There are no hard edges between bands, so gradients like a sunset stay smooth.
   - Greys aren't affected, and luminance changes fade out for nearly grey colours, so changing "Orange" doesn't brighten a grey wall.

3. **The tone curve is a monotone cubic (Fritsch–Carlson) through up to 16 points.**
   - Between points it is smooth but never overshoots, so an S-curve can't create halos or flip tones.
   - It is applied per channel on the perceptual scale, after the Basic tone sliders and the default RAW contrast, like Lightroom's point curve.
   - It is sampled into a 1024-value table that the GPU reads as a small float texture. The reference maths reads the same table in the same way, so the two match exactly.

4. **Colour grading shifts OKLab a/b by brightness.** Shadows, midtones and highlights each get a hue and strength; Balance moves the split, Blending its softness. The shift fades out towards pure black, so black stays black.

5. **The order of operations** is white balance and exposure → vibrance and saturation → colour mixer → Basic tone → tone curve → colour grading → output. This follows Lightroom, so habits carry over.

6. **Recipe version 3.** The new settings are plain numbers (for example `saturationBlue`, `gradeShadowsHue`) plus a `toneCurve` point list. Older recipes are upgraded when the library opens; the new settings start at "no change".

## Consequences

- All three tools update live while dragging, like the Basic sliders.
- Copy/paste and presets include the new sections, as separate choices.
- Not included yet: separate red/green/blue curves, and a luminance control per grading wheel. Both can be added later without changing existing recipes.
