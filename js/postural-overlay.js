// ============================================================
// postural-overlay.js — Motore overlay posturale (Policettivo)
// Vista-consapevole, opt-in. NON salva, NON disegna.
// { ok, view, lines, idealLines, angles, message }
// ============================================================

const MP_VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/vision_bundle.mjs";
const MP_WASM_URL   = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/wasm";
const MP_MODEL_URL  = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

const COL = {
  punto:      '#ff3c3c',
  piombo:     '#ffa000',
  reale:      '#ff5252',
  spine:      'rgba(255,255,255,0.95)',  // catena reale (bianca)
  spineIdeal: 'rgba(0,230,118,0.95)',    // catena ideale (verde)
  gridFine:   'rgba(160,160,160,0.45)',
  gridBold:   'rgba(140,140,140,0.70)',
  axis:       'rgba(0,230,118,0.95)',
  axisSoft:   'rgba(0,230,118,0.50)',
  txt:        '#ffffff',
};

let _landmarker = null;
async function _getLandmarker() {
  if (_landmarker) return _landmarker;
  const { PoseLandmarker, FilesetResolver } = await import(MP_VISION_URL);
  const vision = await FilesetResolver.forVisionTasks(MP_WASM_URL);
  _landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MP_MODEL_URL }, runningMode:"IMAGE", numPoses:1
  });
  return _landmarker;
}

const LM = { shoulderL:11, shoulderR:12, hipL:23, hipR:24, kneeL:25, kneeR:26, ankleL:27, ankleR:28, ear:7, eyeL:2, eyeR:5 };
const SOGLIA_ALLINEATO = 1.5;  // gradi: sotto = verde (allineato), sopra = rosso
const COL_OK = 'rgba(0,210,90,0.95)';   // verde allineato
const COL_KO = '#ff3c3c';               // rosso asimmetria
function _colByDev(dev){ return dev <= SOGLIA_ALLINEATO ? COL_OK : COL_KO; }
// angolo al vertice B nel triangolo A-B-C (gradi)
function _angle3(A,B,C){
  const a1=Math.atan2(A.y-B.y, A.x-B.x);
  const a2=Math.atan2(C.y-B.y, C.x-B.x);
  let d=Math.abs(a1-a2)*180/Math.PI;
  if(d>180) d=360-d;
  return +d.toFixed(1);
}
function classifyView(viewKey) {
  if (!viewKey) return null;
  const k = String(viewKey).toLowerCase();
  if (k.includes('podoscopio')) return 'podoscopio';
  // prima valutazione CEP: foto piano scapolare sx/dx = sagittali
  if (k.includes('prima-sx') || k.includes('prima-dx') || k.includes('prima_sx') || k.includes('prima_dx')) return 'sagittale';
  if (k.includes('sagittale') || k.includes('sag')) return 'sagittale';
  if (k.includes('frontale'))   return 'frontale';
  if (k.includes('posteriore')) return 'posteriore';
  return null;
}
function _pt(lms,i,W,H){ return { x:lms[i].x*W, y:lms[i].y*H }; }
function _mid(a,b){ return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }
function _devFromHoriz(a,b){ const d=Math.abs(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI); return +((d>90?180-d:d)).toFixed(1); }

// curva morbida (Catmull-Rom) che passa SOLO per i nodi reali, campionata in segmenti
function _spline(nodes, color, lw){
  const out=[]; const seg=14;
  const pts=nodes;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||pts[i+1];
    let prev=p1;
    for(let t=1;t<=seg;t++){
      const u=t/seg, u2=u*u, u3=u2*u;
      const x=0.5*((2*p1.x)+(-p0.x+p2.x)*u+(2*p0.x-5*p1.x+4*p2.x-p3.x)*u2+(-p0.x+3*p1.x-3*p2.x+p3.x)*u3);
      const y=0.5*((2*p1.y)+(-p0.y+p2.y)*u+(2*p0.y-5*p1.y+4*p2.y-p3.y)*u2+(-p0.y+3*p1.y-3*p2.y+p3.y)*u3);
      out.push({type:'line',x1:prev.x,y1:prev.y,x2:x,y2:y,color,lw});
      prev={x,y};
    }
  }
  return out;
}

function _chain(nodes, n, color, r){
  const out=[];
  for(let s=0;s<nodes.length-1;s++){
    const a=nodes[s], b=nodes[s+1];
    for(let t=0;t<n;t++){ const f=t/n; out.push({type:'point', x:a.x+(b.x-a.x)*f, y:a.y+(b.y-a.y)*f, color, r}); }
  }
  const last=nodes[nodes.length-1];
  out.push({type:'point', x:last.x, y:last.y, color, r});
  return out;
}

function _grid(W,H,footX){
  const out=[];
  const cell=W/24; let c=0;
  for(let x=cell;x<W;x+=cell){ out.push({type:'line',x1:x,y1:0,x2:x,y2:H,color:(c%4===0?COL.gridBold:COL.gridFine),lw:1}); c++; }
  c=0;
  for(let y=cell;y<H;y+=cell){ out.push({type:'line',x1:0,y1:y,x2:W,y2:y,color:(c%4===0?COL.gridBold:COL.gridFine),lw:1}); c++; }
  out.push({type:'line',x1:footX-W*0.18,y1:0,x2:footX-W*0.18,y2:H,color:COL.axisSoft,lw:1.5});
  out.push({type:'line',x1:footX+W*0.18,y1:0,x2:footX+W*0.18,y2:H,color:COL.axisSoft,lw:1.5});
  out.push({type:'line',x1:footX,y1:0,x2:footX,y2:H,color:COL.axis,lw:3});
  return out;
}

function _buildFrontal(lms,W,H){
  const sL=_pt(lms,LM.shoulderL,W,H),sR=_pt(lms,LM.shoulderR,W,H);
  const hL=_pt(lms,LM.hipL,W,H),hR=_pt(lms,LM.hipR,W,H);
  const kL=_pt(lms,LM.kneeL,W,H),kR=_pt(lms,LM.kneeR,W,H);
  const aL=_pt(lms,LM.ankleL,W,H),aR=_pt(lms,LM.ankleR,W,H);
  const eL=_pt(lms,LM.eyeL,W,H),eR=_pt(lms,LM.eyeR,W,H);
  const footX=(aL.x+aR.x)/2;
  const sMid=_mid(sL,sR), hMid=_mid(hL,hR);
  const devSpalle=_devFromHoriz(sL,sR);
  const devBacino=_devFromHoriz(hL,hR);
  const devCapo=_devFromHoriz(eL,eR);
  // valgo/varo: angolo anca-ginocchio-caviglia per lato (180 = gamba dritta)
  const angGinSx=_angle3(hL,kL,aL);
  const angGinDx=_angle3(hR,kR,aR);
  const txt=Math.max(13, W*0.018);

  // ---- REALE ----
  const lines=[];
  lines.push({type:'line',x1:footX,y1:0,x2:footX,y2:H,color:COL.piombo,lw:2.5});
  _chain([sMid,hMid], 8, COL.spine, 3).forEach(p=>lines.push(p));
  [LM.shoulderL,LM.shoulderR,LM.hipL,LM.hipR,LM.kneeL,LM.kneeR,LM.ankleL,LM.ankleR]
    .forEach(i=>{const p=_pt(lms,i,W,H);lines.push({type:'point',x:p.x,y:p.y,color:COL.punto,r:5});});

  // linea capo (occhi) + gradi
  lines.push({type:'line',x1:eL.x,y1:eL.y,x2:eR.x,y2:eR.y,color:_colByDev(devCapo),lw:3});
  lines.push({type:'text',x:Math.max(eL.x,eR.x)+12,y:_mid(eL,eR).y,color:COL.txt,text:'Capo '+devCapo+'°',size:txt,align:'left'});

  // linea spalle + gradi
  lines.push({type:'line',x1:sL.x,y1:sL.y,x2:sR.x,y2:sR.y,color:_colByDev(devSpalle),lw:3.5});
  lines.push({type:'text',x:Math.max(sL.x,sR.x)+12,y:_mid(sL,sR).y,color:COL.txt,text:'Spalle '+devSpalle+'°',size:txt,align:'left'});

  // linea bacino + gradi
  lines.push({type:'line',x1:hL.x,y1:hL.y,x2:hR.x,y2:hR.y,color:_colByDev(devBacino),lw:3.5});
  lines.push({type:'text',x:Math.max(hL.x,hR.x)+12,y:_mid(hL,hR).y,color:COL.txt,text:'Bacino '+devBacino+'°',size:txt,align:'left'});

  // valgo/varo ginocchia (scostamento da 180°)
  const devGinSx=+(Math.abs(180-angGinSx)).toFixed(1);
  const devGinDx=+(Math.abs(180-angGinDx)).toFixed(1);
  lines.push({type:'text',x:kL.x-14,y:kL.y,color:COL.txt,text:devGinSx+'°',size:txt*0.85,align:'right'});
  lines.push({type:'text',x:kR.x+14,y:kR.y,color:COL.txt,text:devGinDx+'°',size:txt*0.85,align:'left'});

  // ---- IDEALE ----
  const ideal=_grid(W,H,footX);
  ideal.push({type:'line',x1:0,y1:sMid.y,x2:W,y2:sMid.y,color:COL.axis,lw:2.5});
  ideal.push({type:'line',x1:0,y1:hMid.y,x2:W,y2:hMid.y,color:COL.axis,lw:2.5});
  _chain([{x:footX,y:sMid.y},{x:footX,y:hMid.y}], 8, COL.spineIdeal, 3).forEach(p=>ideal.push(p));

  return { lines, idealLines:ideal, angles:{ spalle:devSpalle, bacino:devBacino, capo:devCapo, ginocchioSx:devGinSx, ginocchioDx:devGinDx } };
}

function _buildSagittal(lms,W,H){
  const ear=_pt(lms,LM.ear,W,H), sh=_pt(lms,LM.shoulderL,W,H);
  const hip=_pt(lms,LM.hipL,W,H), knee=_pt(lms,LM.kneeL,W,H), ankle=_pt(lms,LM.ankleL,W,H);
  const txt=Math.max(13, W*0.018);
  // angolo di anteposizione rispetto alla verticale (caviglia = filo a piombo)
  // _devFromHoriz misura rispetto all'orizzontale -> per la verticale: 90 - dev
  const _devFromVert = (a,b) => +(90 - _devFromHoriz(a,b)).toFixed(1);
  const antCapo  = _devFromVert(ankle, ear);   // caviglia->orecchio vs verticale
  const antSpalla= _devFromVert(ankle, sh);    // caviglia->spalla vs verticale

  const lines=[];
  lines.push({type:'line',x1:ankle.x,y1:0,x2:ankle.x,y2:H,color:COL.piombo,lw:2.5});
  _chain([ear,sh,hip,knee,ankle], 6, COL.spine, 3).forEach(p=>lines.push(p));
  [ear,sh,hip,knee,ankle].forEach(p=>lines.push({type:'point',x:p.x,y:p.y,color:COL.punto,r:5}));

  // anteposizione capo: scritta accanto all'orecchio
  lines.push({type:'text',x:ear.x+14,y:ear.y,color:COL.txt,text:'Capo '+antCapo+'°',size:txt,align:'left'});
  // anteposizione spalla: scritta accanto alla spalla
  lines.push({type:'text',x:sh.x+14,y:sh.y,color:COL.txt,text:'Spalla '+antSpalla+'°',size:txt,align:'left'});

  const ideal=_grid(W,H,ankle.x);
  return { lines, idealLines:ideal, angles:{ anteposizioneCapo:antCapo, anteposizioneSpalla:antSpalla } };
}

export async function generateOverlay(imgEl, viewKey){
  const view=classifyView(viewKey);
  if(view==='podoscopio') return {ok:false,view,lines:[],idealLines:[],angles:{},message:'Overlay non applicabile alle viste podoscopio (piedi).'};
  if(!view)               return {ok:false,view:null,lines:[],idealLines:[],angles:{},message:'Vista non riconosciuta dalla chiave foto.'};
  if(!imgEl||!imgEl.complete||!imgEl.naturalWidth) return {ok:false,view,lines:[],idealLines:[],angles:{},message:'Immagine non pronta.'};

  let landmarker;
  try{ landmarker=await _getLandmarker(); }
  catch(e){ return {ok:false,view,lines:[],idealLines:[],angles:{},message:'Errore caricamento modello: '+e.message}; }

  const res=landmarker.detect(imgEl);
  if(!res.landmarks||!res.landmarks.length) return {ok:false,view,lines:[],idealLines:[],angles:{},message:'Nessuna persona rilevata nella foto.'};

  const lms=res.landmarks[0], W=imgEl.naturalWidth, H=imgEl.naturalHeight;
  const built=(view==='sagittale')?_buildSagittal(lms,W,H):_buildFrontal(lms,W,H);
  return {ok:true,view,lines:built.lines,idealLines:built.idealLines,angles:built.angles,message:'Rilevati '+lms.length+' punti.'};
}
