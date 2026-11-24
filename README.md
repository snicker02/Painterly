# Painterly Studio

Browser app that repaints a photo with real, flow-following brush strokes. Strokes
are traced as streamlines through a structure-tensor flow field so they curve along
the image's contours; brushes are fully parametric with a live designer; output
saves up to full resolution.

Live: https://snicker02.github.io/painterly/

## Structure (v1.2.0+)

ES-module build — no bundler, no dependencies, WebGL1.

```
index.html        markup + CSS + <script type="module" src="./main.js">
main.js           orchestrator: GL state, render passes, UI, phone tabs, confirm-mode, boot
engine/
  shaders.js      all GLSL (ES 1.00) as exported strings
  glutil.js       context, program compile/link, render targets, hexRGB
  brushes.js      brush model (16 params), 14 built-in brushes, randomizer
  styles.js       15 style presets + param lists
  flow.js         structure-tensor flow field (Flow class)
  strokes.js      streamline stroke-geometry builder
  util.js         shared math helpers
```

Served statically (GitHub Pages). Open locally with any static server, e.g.
`python3 -m http.server`, then visit `index.html` — ES modules don't load over `file://`.

## Version

**v1.2.0** — Brush realism + module split

### Changelog
- **v1.2.0**
  - Split the single-file app into `index.html` + `main.js` + `engine/` ES modules.
  - Rebuilt the brush shader for real paint behaviour, fixing the "fake" look:
    - **Stochastic bristles** — irregular longitudinal channels that skip along the
      stroke, instead of a perfectly periodic sine comb.
    - **Pigment loading** — paint sits heavy at the loaded start and runs out toward
      the end, with a per-stroke dry point.
    - **Canvas tooth** — fine granular deposition that breaks up flat colour.
  - Two new brush params (**Pigment loading**, **Canvas tooth**); 16 total.
  - **14 built-in brushes** (was 6): Round, Filbert, Flat, Bright, Bristle, Fan,
    Dry brush, Rigger, Tapered, Chisel, Palette knife, Stipple, Scumble, Sponge.
  - Older saved/imported brushes auto-fill the new params from defaults.
- **v1.1.0** — 7 realistic-painting style presets (15 total); varnish/relief-light
  pass; per-style imprimatura tone.
- **v1.0** — Flow-field stroke renderer, parametric brush designer, resolution-
  independent output, mobile tab layout, confirm-before-apply.

## Controls
- **Style presets** — one-click looks; each sets a brush, stroke layout, colour
  grade, surface and varnish.
- **Brush** — pick or design a parametric brush; Randomize, Save, Export/Import JSON.
- **Stroke layout** — size, length, coverage, detail, angle variation, colour
  variation, flow smoothing.
- **Surface** — canvas texture, vignette, varnish / relief light.
- **Color** — saturation, contrast, brightness, warmth, posterize.
- **Output** — process resolution up to full res; Download PNG.

## Validation
Each change: `glslangValidator` on every shader, `node --check` on every module,
a CPU flow/stroke integration test, and headless Chrome at 390×844, 844×390 and
1440×900 (image upload + every preset + every brush + live sliders, checking for
runtime and WebGL errors).
