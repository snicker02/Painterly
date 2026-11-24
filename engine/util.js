// Small math utilities shared across engine modules. No DOM, no WebGL.

export function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function fract(v){ return v - Math.floor(v); }
export function clampi(v, hi){ return v < 0 ? 0 : (v > hi ? hi : v); }
export function clamp01(v){ return v < 0 ? 0 : (v > 1 ? 1 : v); }
