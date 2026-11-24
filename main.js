// Painterly Studio — orchestrator. Owns GL state, the render passes, the UI wiring,
// the phone tab layout and confirm-mode, and boots the app. Pure algorithms and data
// live in ./engine/*. Loaded as a deferred ES module, so the DOM is ready on run.

import { VS_QUAD, FS_TEX, VS_STROKE, FS_STROKE, FS_EDGE, FS_COMP } from "./engine/shaders.js";
import { getContext, program, makeTarget, hexRGB } from "./engine/glutil.js";
import { BRUSH_SLIDERS, BRUSH_PRESETS, cloneBrush, randomBrush } from "./engine/brushes.js";
import { PRESETS, NUMERIC, STROKE_KEYS, DEFAULT_PRESET } from "./engine/styles.js";
import { Flow } from "./engine/flow.js";
import { buildStrokes, VERT_CAP } from "./engine/strokes.js";

// ---------------------------------------------------------------- state
let customBrushes = [];
let currentBrush = cloneBrush(BRUSH_PRESETS["Bristle"]);
let currentBrushName = "Bristle";
let params = {}, curPreset = DEFAULT_PRESET;
Object.assign(params, PRESETS[DEFAULT_PRESET]);

// ---------------------------------------------------------------- GL
const canvas = document.getElementById("glcanvas");
const gl = getContext(canvas);
if(!gl){ alert("WebGL is not available in this browser."); throw new Error("no webgl"); }
let PROG;
try{
  PROG = {
    tex:    program(gl, VS_QUAD,   FS_TEX,    ["aPos"]),
    stroke: program(gl, VS_STROKE, FS_STROKE, ["aPos","aUV","aColor","aSeed"]),
    edge:   program(gl, VS_QUAD,   FS_EDGE,   ["aPos"]),
    comp:   program(gl, VS_QUAD,   FS_COMP,   ["aPos"])
  };
}catch(e){ alert("Shader error:\n"+e.message); console.error(e); throw e; }

const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
const strokeBuf = gl.createBuffer();
const previewBuf = gl.createBuffer();

let srcTex = null, T = {}, procW = 0, procH = 0;
function allocTargets(w,h){
  Object.values(T).forEach(t=>{ if(t){ gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } });
  T = { paint:makeTarget(gl,w,h), edge:makeTarget(gl,w,h) };
  procW = w; procH = h;
}
const PREV_W = 264, PREV_H = 104;
const previewTarget = makeTarget(gl, PREV_W, PREV_H);

function setQuadAttribs(){
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
}
const STRIDE = 8 * 4;
function setStrokeAttribs(buffer){
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, STRIDE, 16);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 28);
}
function bindTex(unit, tex){ gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D, tex); }
function setBrushUniforms(u){
  gl.uniform1f(u.uBodyW, currentBrush.bodyW);
  gl.uniform1f(u.uEdgeHard, currentBrush.edgeHard);
  gl.uniform1f(u.uFlat, currentBrush.flat);
  gl.uniform1f(u.uTipFront, currentBrush.tipFront);
  gl.uniform1f(u.uTipBack, currentBrush.tipBack);
  gl.uniform1f(u.uBelly, currentBrush.belly);
  gl.uniform1f(u.uPressure, currentBrush.pressure);
  gl.uniform1f(u.uBristleN, currentBrush.bristleN);
  gl.uniform1f(u.uBristleD, currentBrush.bristleD);
  gl.uniform1f(u.uGrain, currentBrush.grain);
  gl.uniform1f(u.uGrainScale, currentBrush.grainScale);
  gl.uniform1f(u.uEdgeNoise, currentBrush.edgeNoise);
  gl.uniform1f(u.uRelief, currentBrush.relief);
  gl.uniform1f(u.uVary, currentBrush.vary);
  gl.uniform1f(u.uLoad, currentBrush.load);
  gl.uniform1f(u.uTooth, currentBrush.tooth);
}

// ---------------------------------------------------------------- image + flow
let originalBitmap = null, flow = null;
let strokeScratch = null, strokeVertCount = 0, strokesDirty = true, seedSalt = 1, flowSmooth = 0.5;

function loadImage(img){
  originalBitmap = img; rebuildSource();
  canvas.style.display = "block";
  document.getElementById("empty").style.display = "none";
  document.getElementById("dlBtn").disabled = false;
  document.getElementById("dlBtn2").disabled = false;
  strokesDirty = true; requestRender();
}
function rebuildSource(){
  if(!originalBitmap) return;
  const ow = originalBitmap.width, oh = originalBitmap.height;
  const cap = parseInt(document.getElementById("procSize").value, 10);
  const gpuMax = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const maxAllowed = cap === 0 ? gpuMax : Math.min(cap, gpuMax);
  let w = ow, h = oh, m = Math.max(w, h);
  if(m > maxAllowed){ const s = maxAllowed / m; w = Math.round(w*s); h = Math.round(h*s); }
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const cx = c.getContext("2d", { willReadFrequently:true });
  cx.drawImage(originalBitmap, 0, 0, w, h);
  if(!srcTex) srcTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const data = cx.getImageData(0,0,w,h).data;
  const IMG = new Float32Array(w*h*3), LUM = new Float32Array(w*h);
  for(let i=0, j=0, k=0; i<data.length; i+=4, j+=3, k++){
    const r=data[i]/255, g=data[i+1]/255, b=data[i+2]/255;
    IMG[j]=r; IMG[j+1]=g; IMG[j+2]=b; LUM[k]=0.299*r+0.587*g+0.114*b;
  }
  flow = new Flow(IMG, LUM, w, h);
  flow.compute(flowSmooth);
  canvas.width = w; canvas.height = h; allocTargets(w, h); strokesDirty = true;
  const badge = document.getElementById("badge");
  badge.style.display = "block"; badge.textContent = ow+"×"+oh + (w!==ow ? "  →  "+w+"×"+h : "");
  const rh = document.getElementById("resHint");
  if(rh) rh.textContent = "saves at " + w + "×" + h + " (" + (w*h/1e6).toFixed(1) + " MP)";
}
function rebuildStrokes(){
  if(!flow || !flow.TX) return;
  const res = buildStrokes(flow, params, { seedSalt, scratch: strokeScratch });
  strokeScratch = res.scratch;
  strokeVertCount = res.vertCount;
  gl.bindBuffer(gl.ARRAY_BUFFER, strokeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, res.data, gl.DYNAMIC_DRAW);
  strokesDirty = false;
  document.getElementById("hint").textContent = res.count.toLocaleString() + " strokes" + (res.thinned ? " (thinned to fit)" : "");
}

// ---------------------------------------------------------------- render + confirm
let needsRender = false;
function requestRender(){ if(srcTex) needsRender = true; if(held) setHeld(false); }
let confirmMode = true, held = false, flowHeld = false;
try { const v = localStorage.getItem("painterly.confirm"); if(v !== null) confirmMode = v === "1"; } catch(e){}
function setHeld(on){ held = on; const b = document.getElementById("applyBtn"); if(b) b.hidden = !on; }
function requestRenderQ(){ if(confirmMode && srcTex) setHeld(true); else requestRender(); }
function applyHeld(){
  if(flowHeld && flow){ flow.compute(flowSmooth); strokesDirty = true; }
  flowHeld = false; requestRender();
}
function tick(){ if(needsRender){ needsRender = false; render(); } requestAnimationFrame(tick); }
function render(){
  if(!srcTex) return;
  if(strokesDirty) rebuildStrokes();
  const texel = [1/procW, 1/procH];
  // underpainting
  gl.disable(gl.BLEND);
  let pr = PROG.tex; gl.useProgram(pr.p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.paint.fbo); gl.viewport(0,0,procW,procH);
  bindTex(0, srcTex); gl.uniform1i(pr.u.uTex, 0); gl.uniform1f(pr.u.uMul, 0.88); gl.uniform3fv(pr.u.uTone, hexRGB(params.tone || "#ffffff"));
  setQuadAttribs(); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // strokes
  pr = PROG.stroke; gl.useProgram(pr.p);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform1f(pr.u.uImpasto, params.impasto); setBrushUniforms(pr.u);
  setStrokeAttribs(strokeBuf);
  if(strokeVertCount > 0) gl.drawArrays(gl.TRIANGLES, 0, strokeVertCount);
  gl.disable(gl.BLEND);
  // edges
  pr = PROG.edge; gl.useProgram(pr.p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.edge.fbo); gl.viewport(0,0,procW,procH);
  bindTex(0, srcTex); gl.uniform1i(pr.u.uSrc, 0);
  gl.uniform2fv(pr.u.uTexel, texel); gl.uniform1f(pr.u.uSigma, params.edgeSigma);
  setQuadAttribs(); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // composite
  pr = PROG.comp; gl.useProgram(pr.p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0,0,canvas.width,canvas.height);
  bindTex(0, T.paint.tex); gl.uniform1i(pr.u.uPaint, 0);
  bindTex(1, T.edge.tex);  gl.uniform1i(pr.u.uEdge, 1);
  gl.uniform2f(pr.u.uRes, procW, procH);
  gl.uniform1f(pr.u.uPosterize, params.posterize);
  gl.uniform1f(pr.u.uSat, params.sat); gl.uniform1f(pr.u.uContrast, params.contrast);
  gl.uniform1f(pr.u.uBright, params.bright); gl.uniform1f(pr.u.uWarmth, params.warmth);
  gl.uniform1f(pr.u.uPaper, params.paper); gl.uniform1f(pr.u.uPaperMode, params.paperMode);
  gl.uniform1f(pr.u.uEdgeOn, params.edgeOn ? 1.0 : 0.0);
  gl.uniform1f(pr.u.uEdgeStrength, params.edgeStrength);
  gl.uniform3fv(pr.u.uEdgeColor, hexRGB(params.edgeColor));
  gl.uniform1f(pr.u.uVignette, params.vignette);
  gl.uniform1f(pr.u.uVarnish, params.varnish === undefined ? 0.0 : params.varnish);
  setQuadAttribs(); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ---------------------------------------------------------------- brush preview
const prev2d = document.getElementById("brushPreview");
prev2d.width = PREV_W; prev2d.height = PREV_H;
const prevCtx = prev2d.getContext("2d");
const prevPixels = new Uint8Array(PREV_W * PREV_H * 4);
const prevImageData = prevCtx.createImageData(PREV_W, PREV_H);
function buildPreviewStrokes(){
  const strokes = [
    { cy: 0.45, seed:0.20, col:[0.28,0.45,0.72] },
    { cy: 0.00, seed:0.57, col:[0.80,0.40,0.28] },
    { cy:-0.45, seed:0.86, col:[0.42,0.55,0.32] }
  ];
  const arr = [];
  const x0=-0.86, x1=0.86, hw=0.30;
  strokes.forEach(s=>{
    const P=[[x0,s.cy],[0,s.cy],[x1,s.cy]];
    const L=P.map(p=>[p[0], p[1]+hw]), R=P.map(p=>[p[0], p[1]-hw]);
    const al=[0,0.5,1];
    const push=(v,aa,ac)=>{ arr.push(v[0],v[1],aa,ac, s.col[0],s.col[1],s.col[2], s.seed); };
    push(L[0],al[0],-1); push(R[0],al[0],1); push(R[1],al[1],1);
    push(L[0],al[0],-1); push(R[1],al[1],1); push(L[1],al[1],-1);
    push(L[1],al[1],-1); push(R[1],al[1],1); push(R[2],al[2],1);
    push(L[1],al[1],-1); push(R[2],al[2],1); push(L[2],al[2],-1);
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, previewBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
}
function renderBrushPreview(){
  gl.bindFramebuffer(gl.FRAMEBUFFER, previewTarget.fbo);
  gl.viewport(0,0,PREV_W,PREV_H);
  gl.disable(gl.BLEND);
  gl.clearColor(0.925, 0.915, 0.885, 1.0); gl.clear(gl.COLOR_BUFFER_BIT);
  const pr = PROG.stroke; gl.useProgram(pr.p);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform1f(pr.u.uImpasto, Math.max(0.4, params.impasto)); setBrushUniforms(pr.u);
  setStrokeAttribs(previewBuf);
  gl.drawArrays(gl.TRIANGLES, 0, 36);
  gl.disable(gl.BLEND);
  gl.readPixels(0,0,PREV_W,PREV_H, gl.RGBA, gl.UNSIGNED_BYTE, prevPixels);
  const d = prevImageData.data, rowBytes = PREV_W*4;
  for(let y=0;y<PREV_H;y++){
    const sYoff = (PREV_H-1-y)*rowBytes, dYoff = y*rowBytes;
    for(let x=0;x<rowBytes;x++) d[dYoff+x] = prevPixels[sYoff+x];
  }
  prevCtx.putImageData(prevImageData, 0, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// ---------------------------------------------------------------- brush UI
const brushSel = document.getElementById("brushSel");
const brushSlidersEl = document.getElementById("brushSliders");
const brushRowEls = {};
BRUSH_SLIDERS.forEach(([key,label,min,max,step])=>{
  const row = document.createElement("div"); row.className = "row";
  row.innerHTML = '<div class="lbl"><span>'+label+'</span><span class="val"></span></div>'
    + '<input type="range" min="'+min+'" max="'+max+'" step="'+step+'">';
  const input = row.querySelector("input"), val = row.querySelector(".val");
  brushRowEls[key] = { input, val };
  input.addEventListener("input", ()=>{
    currentBrush[key] = parseFloat(input.value);
    val.textContent = fmtNum(currentBrush[key]);
    currentBrushName = "Custom"; rebuildBrushSelect(); brushSel.value = "custom";
    renderBrushPreview(); requestRenderQ();
  });
  brushSlidersEl.appendChild(row);
});
function fmtNum(v){ return (Math.abs(v)>=10||v===Math.round(v)) ? String(v) : (+v).toFixed(2); }
function syncBrushSliders(){ BRUSH_SLIDERS.forEach(([key])=>{ const e=brushRowEls[key]; e.input.value=currentBrush[key]; e.val.textContent=fmtNum(currentBrush[key]); }); }
function rebuildBrushSelect(){
  let html = "";
  html += '<optgroup label="Built-in">';
  Object.keys(BRUSH_PRESETS).forEach(n=> html += '<option value="b:'+n+'">'+n+'</option>');
  html += '</optgroup>';
  if(customBrushes.length){
    html += '<optgroup label="Custom">';
    customBrushes.forEach((c,i)=> html += '<option value="c:'+i+'">'+c.name+'</option>');
    html += '</optgroup>';
  }
  if(currentBrushName==="Custom") html += '<option value="custom">Custom (unsaved)</option>';
  brushSel.innerHTML = html;
  if(currentBrushName==="Custom") brushSel.value = "custom";
  else if(currentBrushName.indexOf("__c")===0) brushSel.value = "c:"+currentBrushName.slice(3);
  else brushSel.value = "b:"+currentBrushName;
}
function loadBrush(obj, name){ currentBrush = cloneBrush(obj); currentBrushName = name; syncBrushSliders(); rebuildBrushSelect(); renderBrushPreview(); requestRender(); }
brushSel.addEventListener("change", ()=>{
  const v = brushSel.value;
  if(v==="custom") return;
  if(v.charAt(0)==="b"){ const n=v.slice(2); loadBrush(BRUSH_PRESETS[n], n); }
  else if(v.charAt(0)==="c"){ const i=parseInt(v.slice(2),10); loadBrush(customBrushes[i].params, "__c"+i); brushSel.value="c:"+i; }
  markCustom();
});
document.getElementById("btnRandom").addEventListener("click", ()=>{
  currentBrush = cloneBrush(randomBrush()); currentBrushName = "Custom";
  syncBrushSliders(); rebuildBrushSelect(); brushSel.value="custom"; renderBrushPreview(); requestRender();
});
document.getElementById("btnSaveBrush").addEventListener("click", ()=>{
  const name = (prompt("Name this brush:", "My Brush "+(customBrushes.length+1)) || "").trim();
  if(!name) return;
  customBrushes.push({ name, params: cloneBrush(currentBrush) });
  currentBrushName = "__c"+(customBrushes.length-1);
  rebuildBrushSelect(); brushSel.value = "c:"+(customBrushes.length-1);
});
document.getElementById("btnDelBrush").addEventListener("click", ()=>{
  const v = brushSel.value;
  if(v.charAt(0)!=="c"){ alert("Select a custom brush to delete."); return; }
  const i = parseInt(v.slice(2),10);
  customBrushes.splice(i,1);
  loadBrush(BRUSH_PRESETS["Bristle"], "Bristle");
});
document.getElementById("btnEditBrush").addEventListener("click", ()=>{
  document.getElementById("designer").classList.toggle("hidden");
});
document.getElementById("btnExport").addEventListener("click", ()=>{
  document.getElementById("brushIO").value = JSON.stringify(customBrushes);
});
document.getElementById("btnImport").addEventListener("click", ()=>{
  try{
    const arr = JSON.parse(document.getElementById("brushIO").value);
    if(!Array.isArray(arr)) throw 0;
    arr.forEach(x=>{ if(x && x.name && x.params) customBrushes.push({ name:String(x.name), params:cloneBrush(x.params) }); });
    rebuildBrushSelect();
    alert("Imported. Total custom brushes: "+customBrushes.length);
  }catch(e){ alert("Could not parse brush JSON."); }
});

// ---------------------------------------------------------------- main param UI
const rowEls = {};
document.querySelectorAll(".row[data-r]").forEach(row=>{
  const key = row.getAttribute("data-r");
  const input = row.querySelector("input[type=range]"), val = row.querySelector(".val");
  rowEls[key] = { input, val };
  input.addEventListener("input", ()=>{
    params[key] = parseFloat(input.value); updateVal(key); markCustom();
    if(STROKE_KEYS[key]) strokesDirty = true; requestRenderQ();
  });
});
function fmt(key,v){ if(key==="posterize") return v<1 ? "off" : String(v); if(key==="brushSize") return String(v); return (+v).toFixed(2); }
function updateVal(key){ if(rowEls[key]){ rowEls[key].input.value = params[key]; rowEls[key].val.textContent = fmt(key, params[key]); } }

const paperSeg = document.getElementById("paperMode");
paperSeg.querySelectorAll("button").forEach(b=> b.addEventListener("click", ()=>{ params.paperMode = parseInt(b.getAttribute("data-v"),10); syncPaperSeg(); markCustom(); requestRenderQ(); }));
function syncPaperSeg(){ paperSeg.querySelectorAll("button").forEach(b=> b.classList.toggle("on", parseInt(b.getAttribute("data-v"),10)===params.paperMode)); }

const edgeSwitch = document.getElementById("edgeSwitch");
edgeSwitch.addEventListener("click", ()=>{ params.edgeOn = params.edgeOn?0:1; edgeSwitch.classList.toggle("on", !!params.edgeOn); markCustom(); requestRenderQ(); });
document.getElementById("edgeColor").addEventListener("input", e=>{ params.edgeColor = e.target.value; markCustom(); requestRenderQ(); });

const presetWrap = document.getElementById("presets");
Object.keys(PRESETS).forEach(name=>{ const b = document.createElement("button"); b.textContent = name; b.addEventListener("click", ()=> applyPreset(name)); presetWrap.appendChild(b); });
function applyPreset(name){
  curPreset = name; const P = PRESETS[name];
  params = {}; Object.keys(P).forEach(k=>{ if(k!=="brush") params[k]=P[k]; });
  loadBrush(BRUSH_PRESETS[P.brush], P.brush);
  strokesDirty = true; syncAllUI(); requestRender();
}
function markCustom(){ curPreset = null; presetWrap.querySelectorAll("button").forEach(b=> b.classList.remove("active")); }
function syncAllUI(){
  NUMERIC.forEach(updateVal); syncPaperSeg();
  edgeSwitch.classList.toggle("on", !!params.edgeOn);
  document.getElementById("edgeColor").value = params.edgeColor;
  presetWrap.querySelectorAll("button").forEach(b=> b.classList.toggle("active", b.textContent===curPreset));
}

document.getElementById("reshuffle").addEventListener("click", ()=>{ seedSalt++; strokesDirty = true; requestRender(); });
document.getElementById("procSize").addEventListener("change", ()=>{ rebuildSource(); requestRender(); });
const flowSlider = document.getElementById("flowSlider");
flowSlider.value = flowSmooth; document.getElementById("flowVal").textContent = flowSmooth.toFixed(2);
flowSlider.addEventListener("input", ()=>{
  flowSmooth = parseFloat(flowSlider.value);
  document.getElementById("flowVal").textContent = flowSmooth.toFixed(2);
  if(flow){ if(confirmMode){ flowHeld = true; } else { flow.compute(flowSmooth); strokesDirty = true; } }
  markCustom(); requestRenderQ();
});
document.getElementById("fileIn").addEventListener("change", e=> fileToImage(e.target.files[0]));
document.getElementById("dropZone").addEventListener("click", ()=> document.getElementById("fileIn").click());
function fileToImage(file){
  if(!file || !/^image\//.test(file.type)) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = ()=>{ loadImage(img); URL.revokeObjectURL(url); };
  img.onerror = ()=>{ alert("Could not load that image."); URL.revokeObjectURL(url); };
  img.src = url;
}
const stage = document.getElementById("stage");
["dragenter","dragover"].forEach(ev=> stage.addEventListener(ev, e=>{ e.preventDefault(); stage.classList.add("drag"); }));
stage.addEventListener("dragleave", e=>{ if(!stage.contains(e.relatedTarget)) stage.classList.remove("drag"); });
stage.addEventListener("drop", e=>{ e.preventDefault(); stage.classList.remove("drag"); if(e.dataTransfer.files[0]) fileToImage(e.dataTransfer.files[0]); });
window.addEventListener("paste", e=>{ const items = e.clipboardData && e.clipboardData.items; if(!items) return; for(const it of items){ if(it.type.indexOf("image")===0){ fileToImage(it.getAsFile()); break; } } });

function download(){
  if(!srcTex) return; render();
  canvas.toBlob(blob=>{
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "painterly-" + (curPreset ? curPreset.toLowerCase().replace(/[^a-z]+/g,"-") : "custom") + ".png";
    a.click(); setTimeout(()=> URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}
document.getElementById("dlBtn").addEventListener("click", download);
document.getElementById("dlBtn2").addEventListener("click", download);

// confirm mode wiring
document.getElementById("applyBtn").addEventListener("click", applyHeld);
{
  const c = document.getElementById("confirmMode");
  c.checked = confirmMode;
  c.addEventListener("change", ()=>{
    confirmMode = c.checked;
    try { localStorage.setItem("painterly.confirm", confirmMode ? "1" : "0"); } catch(e){}
    if(!confirmMode && held) applyHeld();
  });
}
window.addEventListener("keydown", e=>{
  if(e.key !== "Enter" || !held || e.repeat) return;
  const t = e.target;
  if(t && (t.tagName === "BUTTON" || t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && t.type === "text"))) return;
  e.preventDefault(); applyHeld();
});

// phone tabs: Styles + each panel group become tabs under the docked painting
(function phoneTabs(){
  const mq = matchMedia("(max-width:760px), (max-height:500px) and (orientation:landscape)");
  const aside = document.querySelector("aside"), main = document.querySelector("main");
  const secs = [document.getElementById("presetsWrap"), ...aside.querySelectorAll(":scope > .group")];
  const bar = document.createElement("nav"); bar.id = "tabbar"; bar.setAttribute("role", "tablist");
  main.insertBefore(bar, aside);
  const btns = secs.map((sec, i)=>{
    const b = document.createElement("button"); b.type = "button"; b.className = "tab"; b.setAttribute("role", "tab");
    const h = sec.querySelector(":scope > h3"); b.textContent = h ? h.textContent.trim() : "Styles";
    b.addEventListener("click", ()=> select(i, true)); bar.appendChild(b); return b;
  });
  let cur = 0;
  try { const v = +localStorage.getItem("painterly.tab"); if(v >= 0 && v < secs.length) cur = v; } catch(e){}
  function select(i, scroll){
    cur = i;
    secs.forEach((sec, j)=>{ sec.classList.toggle("tabon", j === i); btns[j].classList.toggle("sel", j === i); btns[j].setAttribute("aria-selected", j === i ? "true" : "false"); });
    aside.scrollTop = 0;
    if(scroll) btns[i].scrollIntoView({ block:"nearest", inline:"center", behavior:"smooth" });
    try { localStorage.setItem("painterly.tab", String(i)); } catch(e){}
  }
  const apply = ()=>{ document.body.classList.toggle("tabbed", mq.matches); select(cur, false); };
  if(mq.addEventListener) mq.addEventListener("change", apply); else mq.addListener(apply);
  apply();
})();

// boot
buildPreviewStrokes();
curPreset = DEFAULT_PRESET;
syncAllUI();
loadBrush(BRUSH_PRESETS["Bristle"], "Bristle");
tick();
