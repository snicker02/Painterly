// Stroke geometry builder. Seeds a grid, traces a curved streamline through the
// flow field in both directions from each seed, and emits a tapered triangle ribbon
// (pos2, uv2, color3, seed1) per stroke. Pure CPU; the caller uploads the result.

import { mulberry32, fract, clampi } from "./util.js";

export const VERT_CAP = 3000000;   // ~96 MB scratch at 8 floats/vert
export const MAX_HALF = 7;

// opts: { seedSalt, scratch } ; returns { data, vertCount, count, thinned, scratch }
export function buildStrokes(flow, params, opts){
  const w = flow.w, h = flow.h, COH = flow.COH;
  const rng = mulberry32(0x9E3779B9 ^ (opts.seedSalt*2654435761));
  const scratch = opts.scratch || new Float32Array(VERT_CAP * 8);
  const buf = scratch; let off = 0, count = 0;

  const B = params.brushSize, lenMul = params.strokeLength, dens = params.density,
        wob = params.wobble, cj = params.colorJitter, detail = params.detail;
  const resF = Math.max(w, h) / 1400;   // keep the look resolution-independent
  const Bpx = B * resF;
  const layers = [ [1.7, 1.45, 0.0], [1.05, 0.95, 0.03 * (1.0 - detail)] ];
  if(detail > 0.15) layers.push([0.62, 0.55, 0.12 - detail*0.09]);
  const col = [0,0,0], fld = [0,0,0];
  const step = Math.max(1.5, Bpx * 0.55);

  // keep coverage uniform within the vertex budget: count seeds exactly (cheap),
  // then thin uniformly if the projected load would exceed the buffer.
  const nHalfNom = Math.max(1, Math.min(MAX_HALF, Math.round(lenMul * Bpx * 0.5 / step)));
  const estVerts = Math.ceil(((2*nHalfNom)*6 + 6) * 1.15);
  let seedCount = 0;
  for(let li=0; li<layers.length; li++){
    const sp = Math.max(2.0, Bpx * layers[li][0] / dens);
    const thr = layers[li][2];
    for(let cy = sp*0.5; cy < h; cy += sp){
      for(let cx = sp*0.5; cx < w; cx += sp){
        if(li > 0 && COH[clampi(cy|0,h-1)*w + clampi(cx|0,w-1)] < thr) continue;
        seedCount++;
      }
    }
  }
  const keepProb = Math.min(1.0, (VERT_CAP*0.95) / Math.max(1, seedCount*estVerts));
  const MAXP = 2*MAX_HALF + 1, MAXVERT = (MAXP-1)*6;
  const along = new Float32Array(MAXP);
  const Lx = new Float32Array(MAXP), Ly = new Float32Array(MAXP), Rx = new Float32Array(MAXP), Ry = new Float32Array(MAXP);
  const P = [], fwd = [], bwd = [];
  const toClip = (x,y)=> [ (x/w)*2 - 1, 1 - (y/h)*2 ];

  function trace(sx, sy, dx, dy, nHalf, seed, outPts){
    let x = sx, y = sy;
    for(let i=0; i<nHalf; i++){
      flow.sample(x, y, fld);
      let tx = fld[0], ty = fld[1]; const coh = fld[2];
      if(tx*dx + ty*dy < 0){ tx = -tx; ty = -ty; }   // keep direction continuous
      const a = coh * 0.9;                             // follow field where coherent, straight where flat
      let nx = dx*(1.0-a) + tx*a, ny = dy*(1.0-a) + ty*a;
      const wn = (fract(Math.sin(x*12.9898 + y*78.233 + seed*53.17 + i*7.1) * 43758.5453) - 0.5) * wob * 0.6;
      const cs = Math.cos(wn), sn = Math.sin(wn);
      const rx2 = nx*cs - ny*sn, ry2 = nx*sn + ny*cs;
      const l = Math.hypot(rx2, ry2) || 1; dx = rx2/l; dy = ry2/l;
      x += dx*step; y += dy*step;
      if(x < 1 || y < 1 || x > w-2 || y > h-2) break;
      outPts.push(x, y);
    }
  }

  outer:
  for(let li=0; li<layers.length; li++){
    const spacing = Math.max(2.0, Bpx * layers[li][0] / dens);
    const width   = Math.max(1.2, Bpx * layers[li][1]);
    const thr     = layers[li][2];
    const layerAngle = rng() * Math.PI;
    for(let cy = spacing*0.5; cy < h; cy += spacing){
      for(let cx = spacing*0.5; cx < w; cx += spacing){
        if(off + MAXVERT*8 > buf.length) break outer;
        if(keepProb < 1.0 && rng() > keepProb) continue;
        const px = cx + (rng()-0.5)*spacing*0.7, py = cy + (rng()-0.5)*spacing*0.7;
        const ix = clampi(px|0, w-1), iy = clampi(py|0, h-1);
        const coh0 = COH[iy*w + ix];
        if(li > 0 && coh0 < thr) continue;

        let dx0, dy0;
        if(coh0 > 0.06){ flow.sample(px, py, fld); dx0 = fld[0]; dy0 = fld[1]; }
        else { dx0 = Math.cos(layerAngle); dy0 = Math.sin(layerAngle); }
        const ia = (rng()-0.5) * wob * 1.1, ics = Math.cos(ia), isn = Math.sin(ia);
        const tdx = dx0*ics - dy0*isn, tdy = dx0*isn + dy0*ics; dx0 = tdx; dy0 = tdy;

        flow.rgbAt(ix, iy, col);
        const r = Math.min(1,Math.max(0, col[0]+(rng()-0.5)*cj));
        const gg= Math.min(1,Math.max(0, col[1]+(rng()-0.5)*cj));
        const bb= Math.min(1,Math.max(0, col[2]+(rng()-0.5)*cj));
        const seed = rng();
        const sw = width * (0.72 + 0.56*rng());
        const nHalf = Math.max(1, Math.min(MAX_HALF, Math.round(lenMul * Bpx * 0.5 * (0.7 + 0.65*rng()) / step)));

        fwd.length = 0; bwd.length = 0; P.length = 0;
        trace(px, py,  dx0,  dy0, nHalf, seed,      fwd);
        trace(px, py, -dx0, -dy0, nHalf, seed+0.5,  bwd);
        for(let i=bwd.length-2; i>=0; i-=2){ P.push(bwd[i], bwd[i+1]); }
        P.push(px, py);
        for(let i=0; i<fwd.length; i+=2){ P.push(fwd[i], fwd[i+1]); }
        const M = P.length >> 1;
        if(M < 2) continue;

        const hw = sw*0.5;
        let arc = 0; along[0] = 0;
        for(let i=1;i<M;i++){ const dxp=P[i*2]-P[(i-1)*2], dyp=P[i*2+1]-P[(i-1)*2+1]; arc += Math.hypot(dxp,dyp); along[i]=arc; }
        const invArc = arc>0 ? 1/arc : 0; for(let i=0;i<M;i++) along[i]*=invArc;
        for(let i=0;i<M;i++){
          const a=Math.max(0,i-1), b=Math.min(M-1,i+1);
          let tx=P[b*2]-P[a*2], ty=P[b*2+1]-P[a*2+1]; const tl=Math.hypot(tx,ty)||1; tx/=tl; ty/=tl;
          const ox=-ty*hw, oy=tx*hw;
          Lx[i]=P[i*2]+ox; Ly[i]=P[i*2+1]+oy; Rx[i]=P[i*2]-ox; Ry[i]=P[i*2+1]-oy;
        }
        const pv=(vx,vy,aa,ac)=>{ const c=toClip(vx,vy); buf[off++]=c[0]; buf[off++]=c[1]; buf[off++]=aa; buf[off++]=ac; buf[off++]=r; buf[off++]=gg; buf[off++]=bb; buf[off++]=seed; };
        for(let i=0;i<M-1;i++){
          const a0=along[i], a1=along[i+1];
          pv(Lx[i],Ly[i],a0,-1); pv(Rx[i],Ry[i],a0,1); pv(Rx[i+1],Ry[i+1],a1,1);
          pv(Lx[i],Ly[i],a0,-1); pv(Rx[i+1],Ry[i+1],a1,1); pv(Lx[i+1],Ly[i+1],a1,-1);
        }
        count++;
      }
    }
  }
  return { data: buf.subarray(0, off), vertCount: off/8, count, thinned: keepProb < 1.0, scratch };
}
