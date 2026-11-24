/* Licorice color picker — one picker for every Licorice page (grbsoftware.github.io/licorice/shared/picker.js).
   Radiance's honeycomb: hue around, strength outward, lightness on its own slider, laid out in OKLCH so each step
   looks like a step. Big targets for real fingers; drag away from a slider to slow it down for fine work.
   It never rebuilds what's under your finger while you drag, so it can't snap shut like the system picker does.

   Use:  LicoricePicker.open({value:'#f7c612', title:'Start color', anchor:buttonElement,
                              onInput:hex=>{…live while dragging…}, onChange:hex=>{…when a pick lands…}, onClose:hex=>{…}})
         LicoricePicker.close()
   Needs RadianceColor (hexToOklch, oklchToHex, maxChroma), which every Licorice page already carries. */
(function(){
  'use strict';
  if(window.LicoricePicker)return;
  // RadianceColor is a top-level const on Licorice pages (shared by name between scripts, not a window property)
  const RC=()=>window.RadianceColor||(typeof RadianceColor!=='undefined'?RadianceColor:null);
  const DEG=180/Math.PI,AX={L:{min:0,max:1,step:0.005,name:'Lightness',fmt:v=>v.toFixed(2)},C:{min:0,max:0.37,step:0.002,name:'Strength',fmt:v=>v.toFixed(3)},H:{min:0,max:360,step:1,name:'Hue',fmt:v=>Math.round(v)+'°'}};
  const RINGS=3,SIZE=24,SHAPE=[0,1,2,3,4,5].map(i=>[SIZE*Math.cos(Math.PI/3*i),SIZE*Math.sin(Math.PI/3*i)]);
  const RKEY='licorice-picker-recent';
  let el=null,opt=null,edit={L:0.7,C:0.1,H:0},combL=null,startHex=null;

  const css=`
.lp{position:fixed;z-index:1000;width:320px;max-width:calc(100vw - 16px);background:#222;color:#ddd;border:1px solid #444;border-radius:14px;
  box-shadow:0 12px 40px rgba(0,0,0,.6);padding:12px 14px 14px;font:13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;touch-action:none;user-select:none}
.lp[hidden]{display:none}
.lp-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.lp-head b{flex:1;color:#fff;font-weight:600}
.lp-now{width:40px;height:28px;border-radius:7px;border:1px solid #000;box-shadow:0 0 0 1px #555}
.lp-was{width:22px;height:28px;border-radius:7px 0 0 7px;border:1px solid #000;margin-right:-9px;cursor:pointer}
.lp button{font:inherit;color:#eee;background:#333;border:1px solid #555;border-radius:8px;min-height:36px;padding:0 12px;cursor:pointer}
.lp button:hover{background:#3d3d3d}
.lp-done{background:#e8b04a!important;border-color:#e8b04a!important;color:#1c1c1c!important;font-weight:600}
.lp-comb{display:block;width:100%;height:auto;margin:2px 0 6px;overflow:visible;touch-action:none}
.lp-comb polygon{cursor:pointer;stroke:#1c1c1c;stroke-width:1.5}
.lp-comb polygon.sel{stroke:#fff;stroke-width:3.5}
.lp-ax{margin-bottom:2px}
.lp-axh{display:flex;justify-content:space-between;color:#999;font-size:12px}
.lp-axh span:last-child{color:#ddd;font-variant-numeric:tabular-nums}
.lp-track{position:relative;height:44px;display:flex;align-items:center;cursor:pointer;touch-action:none;outline:none}
.lp-rail{width:100%;height:14px;border-radius:7px;border:1px solid #111}
.lp-handle{position:absolute;top:50%;width:26px;height:26px;margin-left:-13px;border-radius:50%;background:#fff;border:2px solid rgba(0,0,0,.4);
  box-shadow:0 1px 4px rgba(0,0,0,.5);transform:translateY(-50%);pointer-events:none}
.lp-track.grab .lp-handle,.lp-track:focus-visible .lp-handle{box-shadow:0 2px 10px rgba(0,0,0,.6),0 0 0 7px rgba(255,255,255,.16)}
.lp-row{display:flex;gap:8px;align-items:center;margin-top:8px}
.lp-hex{flex:1;min-width:0;background:#1a1a1a;border:1px solid #444;border-radius:8px;color:#fff;font:14px ui-monospace,"SF Mono",Consolas,monospace;letter-spacing:1px;padding:8px 10px;text-transform:uppercase}
.lp-recent{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.lp-recent i{width:34px;height:34px;border-radius:50%;border:2px solid #222;box-shadow:0 0 0 1px #555;cursor:pointer}
.lp-hint{color:#888;font-size:11.5px;margin:2px 0 0}
@media(max-width:560px){.lp{left:0!important;right:0;bottom:0!important;top:auto!important;width:auto;max-width:none;border-radius:16px 16px 0 0;padding-bottom:calc(14px + env(safe-area-inset-bottom,0px))}}`;

  function build(){
    const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
    el=document.createElement('div');el.className='lp';el.hidden=true;el.setAttribute('role','dialog');el.setAttribute('aria-label','Pick a color');
    el.innerHTML=`<div class="lp-head"><b class="lp-title">Color</b><span class="lp-was" title="Back to the color you started with"></span><span class="lp-now"></span><button class="lp-done">Done</button></div>
      <svg class="lp-comb" viewBox="-142 -128 284 256" aria-label="Color comb: tap or drag across it"></svg>
      ${['L','C','H'].map(k=>`<div class="lp-ax" data-ax="${k}"><div class="lp-axh"><span>${AX[k].name}</span><span class="lp-val"></span></div>
        <div class="lp-track" role="slider" tabindex="0" aria-label="${AX[k].name}"><div class="lp-rail"></div><div class="lp-handle"></div></div></div>`).join('')}
      <div class="lp-row"><input class="lp-hex" spellcheck="false" aria-label="Hex color" maxlength="7"><button class="lp-sys" title="Your computer's own color picker">System picker</button></div>
      <div class="lp-recent"></div>
      <p class="lp-hint">Drag along a slider, then slide your finger away from it to slow it down.</p>
      <input type="color" class="lp-native" tabindex="-1" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;left:0;top:0">`;
    document.body.appendChild(el);
    // comb: tap a cell, or drag across cells
    const comb=el.querySelector('.lp-comb');let combDown=false;
    const combPick=e=>{const t=document.elementFromPoint(e.clientX,e.clientY);if(!t||t.tagName!=='polygon'||!comb.contains(t))return;
      edit.C=+t.dataset.c;edit.H=+t.dataset.h;changed(true);};
    comb.addEventListener('pointerdown',e=>{combDown=true;try{comb.setPointerCapture(e.pointerId);}catch(_){}combPick(e);e.preventDefault();});
    comb.addEventListener('pointermove',e=>{if(combDown)combPick(e);});
    const combUp=()=>{if(combDown){combDown=false;landed();}};comb.addEventListener('pointerup',combUp);comb.addEventListener('pointercancel',combUp);
    el.querySelectorAll('.lp-ax').forEach(bindAxis);
    const hx=el.querySelector('.lp-hex');
    hx.addEventListener('change',()=>{let v=hx.value.trim().replace(/^#/,'');if(/^[0-9a-f]{3}$/i.test(v))v=v.split('').map(c=>c+c).join('');
      if(!/^[0-9a-f]{6}$/i.test(v)){paint();return;}setHex('#'+v.toLowerCase());changed(false);landed();});
    hx.addEventListener('keydown',e=>{if(e.key==='Enter')hx.blur();e.stopPropagation();});
    el.querySelector('.lp-done').onclick=()=>close();
    el.querySelector('.lp-was').onclick=()=>{if(startHex){setHex(startHex);changed(false);landed();}};
    el.querySelector('.lp-recent').addEventListener('click',e=>{const t=e.target.closest('[data-c]');if(t){setHex(t.dataset.c);changed(false);landed();}});
    const nat=el.querySelector('.lp-native');
    el.querySelector('.lp-sys').onclick=()=>{nat.value=hex();nat.click();};
    nat.addEventListener('input',()=>{setHex(nat.value);changed(false);});nat.addEventListener('change',()=>landed());
    // tap outside to close (keeps the color); Esc closes too
    document.addEventListener('pointerdown',e=>{if(!el.hidden&&!el.contains(e.target)&&!(opt&&opt.anchor&&opt.anchor.contains(e.target)))close();},true);
    document.addEventListener('keydown',e=>{if(!el.hidden&&e.key==='Escape'){e.stopPropagation();close();}},true);
    window.addEventListener('resize',()=>{if(!el.hidden)place();});
  }
  const hex=()=>RC().oklchToHex(edit).toLowerCase();
  function setHex(h){const c=RC().hexToOklch(h);edit={L:c.L,C:c.C,H:c.H==null?edit.H:c.H};}
  function changed(combOnly){paint(combOnly);if(opt&&opt.onInput)opt.onInput(hex());}
  function landed(){if(opt&&opt.onChange)opt.onChange(hex());}
  function grad(k){const a=AX[k],n=k==='H'?24:14,s=[];for(let i=0;i<=n;i++)s.push(RC().oklchToHex({...edit,[k]:a.min+(a.max-a.min)*i/n}));return`linear-gradient(to right,${s.join(',')})`;}
  function cells(){const out=[],maxD=SIZE*Math.sqrt(3)*RINGS;
    for(let q=-RINGS;q<=RINGS;q++)for(let r=-RINGS;r<=RINGS;r++){if(Math.abs(q+r)>RINGS)continue;
      const x=SIZE*1.5*q,y=SIZE*Math.sqrt(3)*(r+q/2),d=Math.hypot(x,y);out.push({x,y,H:((Math.atan2(-y,x)*DEG)%360+360)%360,f:Math.min(1,d/maxD)});}
    return out;}
  function buildComb(){const svg=el.querySelector('.lp-comb');
    svg.innerHTML=cells().map(c=>{const C=c.f*RC().maxChroma(edit.L,c.H),h=RC().oklchToHex({L:edit.L,C,H:c.H});
      return`<polygon points="${SHAPE.map(([px,py])=>(c.x+px).toFixed(1)+','+(c.y+py).toFixed(1)).join(' ')}" fill="${h}" data-c="${C}" data-h="${c.H}"/>`;}).join('');
    combL=edit.L;}
  function mark(){const ea=edit.C*Math.cos(edit.H/DEG),eb=edit.C*Math.sin(edit.H/DEG);let best=null;
    for(const p of el.querySelectorAll('.lp-comb polygon')){const C=+p.dataset.c,H=+p.dataset.h,d=Math.hypot(C*Math.cos(H/DEG)-ea,C*Math.sin(H/DEG)-eb);
      p.classList.remove('sel');if(!best||d<best.d)best={p,d};}
    if(best){best.p.classList.add('sel');best.p.parentNode.appendChild(best.p);}}
  function paint(){
    if(combL===null||Math.abs(combL-edit.L)>0.002)buildComb();mark();
    el.querySelectorAll('.lp-ax').forEach(a=>{const k=a.dataset.ax,A=AX[k],t=(edit[k]-A.min)/(A.max-A.min);
      a.querySelector('.lp-val').textContent=A.fmt(edit[k]);a.querySelector('.lp-rail').style.background=grad(k);
      a.querySelector('.lp-handle').style.left=Math.max(0,Math.min(1,t))*100+'%';a.querySelector('.lp-track').setAttribute('aria-valuenow',A.fmt(edit[k]));});
    const h=hex(),hx=el.querySelector('.lp-hex');if(document.activeElement!==hx)hx.value=h;
    el.querySelector('.lp-now').style.background=h;el.querySelector('.lp-was').style.background=startHex||h;}
  function bindAxis(box){const k=box.dataset.ax,A=AX[k],tr=box.querySelector('.lp-track'),cl=v=>Math.min(A.max,Math.max(A.min,v));let lastX=0;
    tr.addEventListener('pointerdown',e=>{try{tr.setPointerCapture(e.pointerId);}catch(_){}tr.classList.add('grab');tr.focus({preventScroll:true});
      const r=tr.getBoundingClientRect();lastX=e.clientX;edit[k]=cl(A.min+(e.clientX-r.left)/r.width*(A.max-A.min));changed();e.preventDefault();});
    tr.addEventListener('pointermove',e=>{if(!tr.hasPointerCapture||!tr.hasPointerCapture(e.pointerId))return;const r=tr.getBoundingClientRect();
      // slide your finger away from the track and the slider slows down, for fine work
      const away=Math.max(0,Math.abs(e.clientY-(r.top+r.height/2))-r.height/2),ratio=Math.max(0.12,1/(1+away/55)),dx=e.clientX-lastX;lastX=e.clientX;
      edit[k]=cl(edit[k]+dx/r.width*(A.max-A.min)*ratio);changed();});
    const up=e=>{tr.classList.remove('grab');try{tr.releasePointerCapture(e.pointerId);}catch(_){}landed();};
    tr.addEventListener('pointerup',up);tr.addEventListener('pointercancel',up);
    tr.addEventListener('keydown',e=>{const s=A.step*(e.shiftKey?10:1),d=e.key==='ArrowLeft'||e.key==='ArrowDown'?-s:e.key==='ArrowRight'||e.key==='ArrowUp'?s:0;
      if(!d)return;e.preventDefault();e.stopPropagation();edit[k]=cl(edit[k]+d);changed();landed();});}
  function recent(){try{const a=JSON.parse(localStorage.getItem(RKEY)||'[]');return Array.isArray(a)?a.filter(c=>/^#[0-9a-f]{6}$/.test(c)):[];}catch(e){return[];}}
  function remember(h){try{const a=[h,...recent().filter(c=>c!==h)].slice(0,8);localStorage.setItem(RKEY,JSON.stringify(a));}catch(e){}}
  function place(){if(window.innerWidth<=560){el.style.left='0';el.style.top='';return;}
    const w=el.offsetWidth,h=el.offsetHeight,a=opt&&opt.anchor&&opt.anchor.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight;
    let x=a?a.left+a.width/2-w/2:(vw-w)/2,y=a?(a.top-h-10>8?a.top-h-10:a.bottom+10):(vh-h)/2;
    x=Math.max(8,Math.min(vw-w-8,x));y=Math.max(8,Math.min(vh-h-8,y));el.style.left=x+'px';el.style.top=y+'px';}
  function open(o){
    if(!RC()||!RC().oklchToHex){console.warn('LicoricePicker needs RadianceColor');return;}
    if(!el)build();
    if(!el.hidden&&opt&&opt!==o)close();
    opt=o||{};startHex=(opt.value||'#888888').toLowerCase();setHex(startHex);combL=null;
    el.querySelector('.lp-title').textContent=opt.title||'Color';
    el.querySelector('.lp-recent').innerHTML=recent().map(c=>`<i data-c="${c}" style="background:${c}" title="${c}"></i>`).join('');
    el.hidden=false;paint();place();
  }
  function close(){if(!el||el.hidden)return;el.hidden=true;const h=hex(),o=opt;opt=null;if(h!==startHex)remember(h);if(o&&o.onClose)o.onClose(h);}
  window.LicoricePicker={open,close,get isOpen(){return!!el&&!el.hidden;}};
})();
