# Painterly Studio

Single-file WebGL1 app that repaints a photo with real, flow-following brush
strokes. Strokes are traced as streamlines through a structure-tensor flow field
so they curve along the image's contours; brushes are fully parametric with a
live designer, and output saves up to full resolution.

Live: https://snicker02.github.io/painterly/

## Version

**v1.1.0** — Realistic painting styles

### Changelog
- **v1.1.0**
  - Added 7 painting-tradition style presets aimed at a realistic-painting look:
    **Old Master, Rembrandt, Sargent, Monet, Realist Oil, Turner, Cezanne**
    (15 style presets total).
  - New **Varnish / relief light** pass: treats accumulated paint + canvas tooth
    as a height field and lights it with a raking gallery light plus a gloss
    highlight on the ridges, so the surface reads as physical oil paint.
  - Per-style **imprimatura tone**: a warm/cool underpainting tint that shows
    through thin paint and gaps (old-master presets use a warm ground).
  - Existing presets gained a modest varnish for subtle depth.
- **v1.0** — Flow-field stroke renderer, parametric brush designer + randomizer,
  resolution-independent output, mobile tab layout.

## Controls
- **Style presets** — one-click looks; each sets a brush, stroke layout, color
  grade, surface and varnish.
- **Brush** — pick or design a parametric brush (width, taper, bristles, grain,
  pressure, relief, per-stroke variation); Randomize, Save, Export/Import JSON.
- **Stroke layout** — size, length, coverage, detail, angle variation, color
  variation, flow smoothing.
- **Surface** — canvas texture, vignette, **varnish / relief light**.
- **Color** — saturation, contrast, brightness, warmth, posterize.
- **Output** — process resolution up to full res; Download PNG.

## Constraints
- Single-file, no external dependencies, WebGL1 for broad compatibility.

## Validation
Before each change: `glslangValidator` on every shader, `node --check` on the
app JS, a stroke-generator stress test, and headless Chrome at 390×844, 844×390
and 1440×900 (image upload + every preset + live controls, checking for runtime
and WebGL errors).
