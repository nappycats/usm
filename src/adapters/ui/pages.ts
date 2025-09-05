/** ============================================================================
 * uiPagesAdapter — page manager for [data-page]
 * Uses transitionsAdapter if present; falls back to local fade/slide.
 * Also removes the prehide style tag on first reveal to avoid first-paint flash.
 * ============================================================================ */
import { createAdapter } from '../../usm-core';

export interface UIPagesOpts {
  selector?: string;                         // default '[data-page]'
  attr?: string;                             // default 'data-page'
  initial?: string | null;                   // starting page; fallback: hash → first
  useHash?: boolean;                         // sync location.hash (default true)
  transition?: 'fade' | 'slide' | 'none';    // default transition
  duration?: number;                         // seconds (default 0.35)
  ease?: string;                             // tween ease name (default 'quadInOut')
  direction?: 'left'|'right'|'up'|'down';    // for slide (default 'left')
  prehideId?: string;                        // remove prehide style after first show
  useTransitions?: boolean;                  // route through transitionsAdapter (default true)
}

export function uiPagesAdapter(opts: UIPagesOpts = {}){
  const {
    selector = '[data-page]',
    attr = 'data-page',
    initial = null,
    useHash = true,
    transition = 'fade',
    duration = 0.35,
    ease = 'quadInOut',
    direction = 'left',
    prehideId = 'usm-prehide',
    useTransitions = true,
  } = opts;

  return createAdapter('ui-pages','1.2.1',['ui','pages'], (usm)=>{
    let pages: HTMLElement[] = [];
    const byName = new Map<string, HTMLElement>();
    let current: string | null = null;

    const transitions = (usm.context as any).transitions as { play?: (name:string, o:any)=>Promise<void> } | undefined;
    const getTween = () => (usm.context as any).tween as | { to?: (t:any, v:Record<string,number>, o?:{ duration?: number; ease?: string; onUpdate?: ()=>void; onComplete?: ()=>void })=>any } | undefined;

    function pageName(el: Element){ return (el.getAttribute(attr) || '').trim(); }
    function collect(){ pages = Array.from(document.querySelectorAll<HTMLElement>(selector)); byName.clear(); for (const p of pages){ const n = pageName(p); if (n) byName.set(n,p); } }
    function setActive(name: string | null){ document.documentElement.dataset.page = name || ''; }
    function removePrehide(){ if (prehideId) document.getElementById(prehideId)?.remove(); }

    function showImmediate(name: string){
      for (const p of pages){ const is = pageName(p) === name; p.style.display = is ? '' : 'none'; p.style.opacity = is ? '1' : '0'; p.style.transform = ''; p.style.pointerEvents = is ? '' : 'none'; }
      current = name; setActive(current); removePrehide();
      if (useHash && name) { try{ if (location.hash !== '#'+name) location.hash = '#'+name; }catch{} }
    }

    // Local fallbacks --------------------------------------------------------
    function fadeLocal(fromEl: HTMLElement | null, toEl: HTMLElement): Promise<void> {
      const tw = getTween(); toEl.style.display=''; toEl.style.pointerEvents='none';
      return new Promise<void>((resolve)=>{
        let pend = 0; const done = ()=>{ if(--pend<=0){ toEl.style.pointerEvents=''; resolve(); } }; const step = (fn?:()=>void)=>{ if (fn){ pend++; fn(); } };
        step(()=>{ if (tw?.to){ const s={o:0}; tw.to(s,{o:1},{duration,ease,onUpdate:()=> toEl.style.opacity=String(s.o), onComplete:()=>{ toEl.style.opacity='1'; done(); }}); } else { toEl.style.transition=`opacity ${duration}s ease`; toEl.style.opacity='0'; requestAnimationFrame(()=>{ const end=()=>{ toEl.removeEventListener('transitionend',end); toEl.style.opacity='1'; done(); }; toEl.addEventListener('transitionend',end); toEl.style.opacity='1'; }); } });
        if (fromEl) step(()=>{ if (tw?.to){ const s2={o:1}; tw.to(s2,{o:0},{duration,ease,onUpdate:()=> fromEl.style.opacity=String(s2.o), onComplete:()=>{ fromEl.style.opacity='0'; fromEl.style.display='none'; done(); }}); } else { fromEl.style.transition=`opacity ${duration}s ease`; fromEl.style.opacity='1'; requestAnimationFrame(()=>{ const end=()=>{ fromEl.removeEventListener('transitionend',end); fromEl.style.opacity='0'; fromEl.style.display='none'; done(); }; fromEl.addEventListener('transitionend',end); fromEl.style.opacity='0'; }); } });
        if (pend===0) resolve();
      });
    }

    function slideLocal(fromEl: HTMLElement | null, toEl: HTMLElement): Promise<void> {
      const tw = getTween(); const axis=(direction==='left'||direction==='right')?'X':'Y'; const inSign=(direction==='left'||direction==='up')?1:-1; const outSign=(direction==='left'||direction==='up')?-1:1; const off=100;
      toEl.style.display=''; toEl.style.opacity='1'; toEl.style.pointerEvents='none'; toEl.style.transform=axis==='X'?`translateX(${inSign*off}%)`:`translateY(${inSign*off}%)`;
      return new Promise<void>((resolve)=>{
        let pend=0; const done=()=>{ if(--pend<=0){ toEl.style.pointerEvents=''; resolve(); } }; const step=(fn?:()=>void)=>{ if(fn){ pend++; fn(); } };
        step(()=>{ if (tw?.to){ const s={t:inSign*off}; tw.to(s,{t:0},{duration,ease,onUpdate:()=> toEl.style.transform=axis==='X'?`translateX(${s.t}%)`:`translateY(${s.t}%)`, onComplete:()=>{ toEl.style.transform=''; done(); }}); } else { toEl.style.transition=`transform ${duration}s ease`; requestAnimationFrame(()=>{ const end=()=>{ toEl.removeEventListener('transitionend',end); toEl.style.transform=''; done(); }; toEl.addEventListener('transitionend',end); toEl.style.transform=axis==='X'?`translateX(0%)`:`translateY(0%)`; }); } });
        if (fromEl) step(()=>{ if (tw?.to){ const s2={t:0}; tw.to(s2,{t:outSign*off},{duration,ease,onUpdate:()=> fromEl.style.transform=axis==='X'?`translateX(${s2.t}%)`:`translateY(${s2.t}%)`, onComplete:()=>{ fromEl.style.transform=''; fromEl.style.display='none'; done(); }}); } else { fromEl.style.transition=`transform ${duration}s ease`; requestAnimationFrame(()=>{ const end=()=>{ fromEl.removeEventListener('transitionend',end); fromEl.style.transform=''; fromEl.style.display='none'; done(); }; fromEl.addEventListener('transitionend',end); fromEl.style.transform=axis==='X'?`translateX(${outSign*off}%)`:`translateY(${outSign*off}%)`; }); } });
        if (pend===0) resolve();
      });
    }

    async function goto(name: string, kind: 'fade'|'slide'|'none' = transition){
      if (!byName.size) collect();
      const toEl = byName.get(name);
      if (!toEl) { console.warn('[usm][ui-pages] page not found:', name); return; }
      const fromEl = current ? byName.get(current) || null : null;
      if (current === name) return;
      toEl.style.display='';

      if (useTransitions && transitions?.play) {
        await transitions.play(kind, { from: fromEl || undefined, to: toEl, direction, duration, ease });
      } else {
        if (kind === 'fade')      await fadeLocal(fromEl, toEl);
        else if (kind === 'slide')await slideLocal(fromEl, toEl);
        else { if (fromEl) { fromEl.style.display='none'; fromEl.style.opacity='0'; fromEl.style.transform=''; } toEl.style.opacity='1'; toEl.style.transform=''; }
      }

      current = name; setActive(current); removePrehide();
      if (useHash) { try { if (location.hash !== '#'+name) location.hash = '#'+name; } catch{} }
    }

    function nameFromHash(){ return (location.hash||'').replace(/^#/, '') || null; }

    function init(){
      collect();
      const first = pages.length ? pageName(pages[0]) : null;
      const start = (useHash && nameFromHash()) || initial || first;
      if (start) showImmediate(start);
    }

    (usm.context as any).pages = { goto, get current(){ return current; }, get list(){ return Array.from(byName.keys()); } };

    return { onStart(){ init(); if (useHash) window.addEventListener('hashchange', ()=>{ const n = nameFromHash(); if (n && n!==current) goto(n); }); }, onEnter({ state }){ if (byName.has(state)) goto(state); }, onStop(){ /* noop */ } };
  });
}