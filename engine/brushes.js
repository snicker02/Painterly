// Brush model: 16 numeric params. Built-in brushes and custom brushes share it.
// load (pigment run-out) and tooth (canvas grain) were added in v1.2.0; older
// saved brushes that lack them fall back to BRUSH_DEFAULTS on clone/import.

export const BRUSH_FIELDS = [
  "bodyW","edgeHard","flat","tipFront","tipBack","belly","pressure",
  "bristleN","bristleD","grain","grainScale","edgeNoise","relief","vary","load","tooth"
];

export const BRUSH_DEFAULTS = {
  bodyW:0.85, edgeHard:0.4, flat:0.3, tipFront:0.3, tipBack:0.3, belly:0.2, pressure:0.0,
  bristleN:0, bristleD:0.0, grain:0.0, grainScale:18, edgeNoise:0.1, relief:0.7, vary:0.3, load:0.4, tooth:0.3
};

export const BRUSH_SLIDERS = [
  ["bodyW","Width",0.2,1,0.02],
  ["edgeHard","Edge hardness",0,1,0.02],
  ["flat","Flatness",0,1,0.02],
  ["tipFront","Front taper",0.02,0.6,0.01],
  ["tipBack","Back taper",0.02,0.6,0.01],
  ["belly","Belly (pointed)",0,1,0.02],
  ["pressure","Pressure skew",-0.6,0.6,0.02],
  ["bristleN","Bristle density",0,14,1],
  ["bristleD","Bristle depth",0,1,0.02],
  ["load","Pigment loading",0,1,0.02],
  ["tooth","Canvas tooth",0,1,0.02],
  ["grain","Dry gaps",0,1,0.02],
  ["grainScale","Grain scale",6,40,1],
  ["edgeNoise","Ragged edge",0,1,0.02],
  ["relief","Impasto relief",0,1.5,0.02],
  ["vary","Per-stroke variation",0,1,0.02]
];

// bristleN now drives stochastic channel density (not a periodic comb).
export const BRUSH_PRESETS = {
  "Round":        { bodyW:0.85, edgeHard:0.22, flat:0.10, tipFront:0.50, tipBack:0.50, belly:0.20, pressure:0.0,  bristleN:3,  bristleD:0.25, grain:0.0,  grainScale:18, edgeNoise:0.08, relief:0.7, vary:0.30, load:0.45, tooth:0.35 },
  "Filbert":      { bodyW:0.90, edgeHard:0.45, flat:0.40, tipFront:0.35, tipBack:0.30, belly:0.50, pressure:0.05, bristleN:7,  bristleD:0.40, grain:0.0,  grainScale:20, edgeNoise:0.12, relief:0.8, vary:0.30, load:0.50, tooth:0.40 },
  "Flat":         { bodyW:0.95, edgeHard:0.80, flat:0.80, tipFront:0.06, tipBack:0.06, belly:0.0,  pressure:0.0,  bristleN:6,  bristleD:0.35, grain:0.0,  grainScale:18, edgeNoise:0.08, relief:0.6, vary:0.22, load:0.40, tooth:0.40 },
  "Bright":       { bodyW:0.90, edgeHard:0.80, flat:0.75, tipFront:0.05, tipBack:0.05, belly:0.0,  pressure:0.10, bristleN:8,  bristleD:0.45, grain:0.0,  grainScale:18, edgeNoise:0.10, relief:0.7, vary:0.25, load:0.55, tooth:0.45 },
  "Bristle":      { bodyW:0.90, edgeHard:0.35, flat:0.30, tipFront:0.18, tipBack:0.18, belly:0.10, pressure:0.0,  bristleN:11, bristleD:0.70, grain:0.08, grainScale:22, edgeNoise:0.20, relief:1.0, vary:0.35, load:0.50, tooth:0.50 },
  "Fan":          { bodyW:1.00, edgeHard:0.30, flat:0.50, tipFront:0.20, tipBack:0.20, belly:0.0,  pressure:0.0,  bristleN:13, bristleD:0.85, grain:0.15, grainScale:26, edgeNoise:0.35, relief:0.9, vary:0.40, load:0.45, tooth:0.55 },
  "Dry brush":    { bodyW:0.90, edgeHard:0.40, flat:0.35, tipFront:0.12, tipBack:0.12, belly:0.10, pressure:0.0,  bristleN:6,  bristleD:0.50, grain:0.80, grainScale:26, edgeNoise:0.40, relief:0.9, vary:0.40, load:0.60, tooth:0.60 },
  "Rigger":       { bodyW:0.40, edgeHard:0.50, flat:0.15, tipFront:0.45, tipBack:0.45, belly:0.70, pressure:0.0,  bristleN:2,  bristleD:0.30, grain:0.0,  grainScale:18, edgeNoise:0.10, relief:0.7, vary:0.30, load:0.55, tooth:0.30 },
  "Tapered":      { bodyW:0.80, edgeHard:0.50, flat:0.20, tipFront:0.50, tipBack:0.50, belly:1.00, pressure:0.0,  bristleN:0,  bristleD:0.0,  grain:0.0,  grainScale:18, edgeNoise:0.06, relief:0.8, vary:0.28, load:0.50, tooth:0.30 },
  "Chisel":       { bodyW:0.95, edgeHard:0.85, flat:0.60, tipFront:0.04, tipBack:0.10, belly:0.0,  pressure:0.50, bristleN:0,  bristleD:0.0,  grain:0.0,  grainScale:18, edgeNoise:0.08, relief:0.8, vary:0.20, load:0.35, tooth:0.35 },
  "Palette knife":{ bodyW:1.00, edgeHard:0.95, flat:0.90, tipFront:0.03, tipBack:0.06, belly:0.0,  pressure:0.15, bristleN:0,  bristleD:0.0,  grain:0.0,  grainScale:16, edgeNoise:0.05, relief:1.3, vary:0.18, load:0.25, tooth:0.25 },
  "Stipple":      { bodyW:0.80, edgeHard:0.35, flat:0.10, tipFront:0.50, tipBack:0.50, belly:0.40, pressure:0.0,  bristleN:0,  bristleD:0.0,  grain:0.20, grainScale:30, edgeNoise:0.15, relief:0.7, vary:0.40, load:0.40, tooth:0.70 },
  "Scumble":      { bodyW:0.85, edgeHard:0.30, flat:0.30, tipFront:0.20, tipBack:0.20, belly:0.10, pressure:0.0,  bristleN:7,  bristleD:0.50, grain:0.50, grainScale:28, edgeNoise:0.30, relief:0.8, vary:0.45, load:0.50, tooth:0.70 },
  "Sponge":       { bodyW:0.90, edgeHard:0.25, flat:0.20, tipFront:0.40, tipBack:0.40, belly:0.30, pressure:0.0,  bristleN:0,  bristleD:0.0,  grain:0.70, grainScale:34, edgeNoise:0.30, relief:0.7, vary:0.50, load:0.40, tooth:0.80 }
};

export function cloneBrush(o){
  const b = {};
  for(const k of BRUSH_FIELDS){ b[k] = (o && o[k] !== undefined && o[k] !== null) ? o[k] : BRUSH_DEFAULTS[k]; }
  return b;
}

const rr = (a,b)=> a + Math.random()*(b-a);
export function randomBrush(){
  const fam = Math.floor(Math.random()*5);
  const b = {
    bodyW:rr(0.6,1.0), edgeHard:rr(0.1,0.9), flat:rr(0,1), tipFront:rr(0.05,0.55), tipBack:rr(0.05,0.55),
    belly:0, pressure:rr(-0.5,0.5), bristleN:0, bristleD:0, grain:0, grainScale:Math.round(rr(10,32)),
    edgeNoise:rr(0,0.25), relief:rr(0.4,1.2), vary:rr(0.2,0.55), load:rr(0.3,0.7), tooth:rr(0.2,0.6)
  };
  if(fam===0){ b.bristleN=Math.round(rr(6,14)); b.bristleD=rr(0.4,0.9); b.edgeHard=rr(0.3,0.6); b.tooth=rr(0.4,0.7); }        // bristle
  else if(fam===1){ b.grain=rr(0.5,1.0); b.edgeNoise=rr(0.3,0.7); b.bristleN=Math.round(rr(0,6)); b.bristleD=rr(0.2,0.6); b.load=rr(0.5,0.8); } // dry
  else if(fam===2){ b.belly=rr(0.6,1.0); b.tipFront=rr(0.3,0.6); b.tipBack=rr(0.3,0.6); b.edgeHard=rr(0.4,0.8); }            // pointed
  else if(fam===3){ b.edgeHard=rr(0.6,0.95); b.flat=rr(0.5,1.0); b.pressure=rr(-0.6,0.6); b.tipFront=rr(0.03,0.2); b.tipBack=rr(0.03,0.2); b.load=rr(0.25,0.5); } // flat/knife
  else { b.tooth=rr(0.6,0.85); b.grain=rr(0.2,0.6); b.grainScale=Math.round(rr(24,38)); b.bristleN=Math.round(rr(0,8)); b.bristleD=rr(0.3,0.6); } // scumble/sponge
  return b;
}
