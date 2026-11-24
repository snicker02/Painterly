// Structure-tensor flow field: the contour-tangent direction + coherence at every
// pixel, used to steer strokes so they curve along the image's forms. The field is
// computed once per image (and per flow-smoothing change), independent of brush.

import { clampi } from "./util.js";

function boxBlur(a, w, h, r){
  if(r < 1) return;
  const tmp = new Float32Array(a.length), inv = 1.0/(2*r+1);
  for(let y=0; y<h; y++){
    const row = y*w; let sum = 0;
    for(let i=-r; i<=r; i++) sum += a[row + clampi(i, w-1)];
    for(let x=0; x<w; x++){ tmp[row+x] = sum*inv; sum += a[row + clampi(x+r+1, w-1)] - a[row + clampi(x-r, w-1)]; }
  }
  for(let x=0; x<w; x++){
    let sum = 0;
    for(let i=-r; i<=r; i++) sum += tmp[clampi(i, h-1)*w + x];
    for(let y=0; y<h; y++){ a[y*w+x] = sum*inv; sum += tmp[clampi(y+r+1, h-1)*w + x] - tmp[clampi(y-r, h-1)*w + x]; }
  }
}

export class Flow {
  constructor(IMG, LUM, w, h){
    this.IMG = IMG; this.LUM = LUM; this.w = w; this.h = h;
    this.TX = null; this.TY = null; this.COH = null;
  }
  lumAt(x, y){ const w=this.w, h=this.h; return this.LUM[clampi(y,h-1)*w + clampi(x,w-1)]; }
  rgbAt(x, y, out){ const w=this.w, h=this.h; const p=(clampi(y,h-1)*w + clampi(x,w-1))*3; out[0]=this.IMG[p]; out[1]=this.IMG[p+1]; out[2]=this.IMG[p+2]; }
  cohAt(x, y){ const w=this.w, h=this.h; return this.COH[clampi(y,h-1)*w + clampi(x,w-1)]; }

  compute(flowSmooth){
    const w=this.w, h=this.h, N=w*h, LUM=this.LUM;
    const E = new Float32Array(N), F = new Float32Array(N), G = new Float32Array(N);
    const lumAt = (x,y)=> LUM[clampi(y,h-1)*w + clampi(x,w-1)];
    for(let y=0; y<h; y++) for(let x=0; x<w; x++){
      const gx = lumAt(x+1,y) - lumAt(x-1,y);
      const gy = lumAt(x,y+1) - lumAt(x,y-1);
      const k = y*w+x; E[k] = gx*gx; F[k] = gx*gy; G[k] = gy*gy;
    }
    const resF = Math.max(w, h) / 1400;
    const r = Math.max(1, Math.round((1 + flowSmooth*6) * resF));
    boxBlur(E,w,h,r); boxBlur(F,w,h,r); boxBlur(G,w,h,r);
    boxBlur(E,w,h,r); boxBlur(F,w,h,r); boxBlur(G,w,h,r);   // two boxes ~ gaussian
    const TX = new Float32Array(N), TY = new Float32Array(N), COH = new Float32Array(N);
    for(let k=0; k<N; k++){
      const e=E[k], f=F[k], g=G[k];
      const disc = Math.sqrt(Math.max(0, (e-g)*(e-g) + 4*f*f));
      const l1 = 0.5*(e+g+disc), l2 = 0.5*(e+g-disc);
      // contour tangent = eigenvector of the smaller eigenvalue (least intensity change)
      let vx = f, vy = l2 - e;
      const vx2 = l2 - g, vy2 = f;
      if(vx2*vx2 + vy2*vy2 > vx*vx + vy*vy){ vx = vx2; vy = vy2; }
      let len = Math.hypot(vx, vy);
      if(len < 1e-6){ vx = 1; vy = 0; len = 1; }
      if(vx < 0){ vx = -vx; vy = -vy; }
      TX[k] = vx/len; TY[k] = vy/len;
      COH[k] = (l1+l2) > 1e-7 ? (l1-l2)/(l1+l2) : 0.0;
    }
    this.TX = TX; this.TY = TY; this.COH = COH;
  }

  // bilinear sample of the tangent field with sign-fixing; out=[tx,ty,coherence]
  sample(x, y, out){
    const w=this.w, h=this.h, TX=this.TX, TY=this.TY, COH=this.COH;
    const fx = x - 0.5, fy = y - 0.5;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const ax = fx - x0, ay = fy - y0;
    x0 = clampi(x0, w-1); y0 = clampi(y0, h-1);
    const x1 = clampi(x0+1, w-1), y1 = clampi(y0+1, h-1);
    const i00=y0*w+x0, i10=y0*w+x1, i01=y1*w+x0, i11=y1*w+x1;
    const rx = TX[i00], ry = TY[i00];
    const s10 = (TX[i10]*rx + TY[i10]*ry) < 0 ? -1 : 1;
    const s01 = (TX[i01]*rx + TY[i01]*ry) < 0 ? -1 : 1;
    const s11 = (TX[i11]*rx + TY[i11]*ry) < 0 ? -1 : 1;
    const w00=(1-ax)*(1-ay), w10=ax*(1-ay), w01=(1-ax)*ay, w11=ax*ay;
    const tx = TX[i00]*w00 + TX[i10]*s10*w10 + TX[i01]*s01*w01 + TX[i11]*s11*w11;
    const ty = TY[i00]*w00 + TY[i10]*s10*w10 + TY[i01]*s01*w01 + TY[i11]*s11*w11;
    const l = Math.hypot(tx,ty) || 1;
    out[0] = tx/l; out[1] = ty/l;
    out[2] = COH[i00]*w00 + COH[i10]*w10 + COH[i01]*w01 + COH[i11]*w11;
  }
}
