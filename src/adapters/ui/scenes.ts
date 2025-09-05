/** ============================================================================
 * uiScenesAdapter — scene manager for [data-scene] (games/media)
 * Default transition is 'fader' for cinematic cuts. Adds optional fullscreen CSS.
 * ============================================================================ */
import { createAdapter } from '../../usm-core';

export interface UIScenesOpts {
  selector?: string;                         // default '[data-scene]'
  attr?: string;                             // default 'data-scene'
  initial?: string | null;                   // starting scene
  useHash?: boolean;                         // sync hash (default false)
  transition?: 'fader'|'fade'|'slide'|'none';// default 'fader'
  duration?: number;                         // seconds
  ease?: string;                             // ease name
  direction?: 'left'|'right'|'up'|'down';    // for slide
  fullscreenScenes?: boolean;                // add .usm-fullscreen (default true)
  prehideId?: string;                        // remove prehide style after first reveal
  useTransitions?: boolean;                  // default true
}

export function uiScenesAdapter(opts: UIScenesOpts = {}){
  const {
    selector = '[data-scene]',
    attr = 'data-scene',
    initial = null,
    useHash = false,
    transition = 'fader',
    duration = 0.35,
    ease = 'quadInOut',
    direction = 'left',
    fullscreenScenes = true,
    prehideId = 'usm-prehide',
    useTransitions = true,
  } = opts;

  return createAdapter('ui-scenes','1.0.1',['ui','scenes'], (usm)=>{
    let scenes: HTMLElement[] = [];
    const byName = new Map<string, HTMLElement>();
    let current: string | null = null;

    const transitions = (usm.context as any).transitions as { play?: (name:string, o:any)=>Promise<void> } | undefined;
    const getTween = () => (usm.context as any).tween as | { to?: (t:any, v:Record<string,number>, o?:{ duration?: number; ease?: string; onUpdate?: ()=>void; onComplete?: ()=>void })=>any } | undefined;

    function ensureFullscreenCSS(){
      if (!fullscreenScenes) return;
      if (document.getElementById('usm-fullscreen-css')) return;
      const s = document.createElement('style'); s.id='usm-fullscreen-css';
      s.textContent = `.usm-fullscreen{position:fixed; inset:0; overflow:auto; display:block!important; z-index:1}`;
      document.head.appendChild(s);
    }

    function nameOf(el: Element){ return (el.getAttribute(attr) || '').trim(); }
    function collect(){ scenes = Array.from(document.querySelectorAll<HTMLElement>(selector)); byName.clear(); for (const p of scenes){ const n = nameOf(p); if (n) byName.set(n,p); } }
    function setActive(name: string | null){ document.documentElement.dataset.scene = name || ''; }
    function removePrehide(){ if (prehideId) document.getElementById(prehideId)?.remove(); }

    function showImmediate(name: string){
      ensureFullscreenCSS();
      for (const p of scenes){ const is = nameOf(p) === name; if (fullscreenScenes && is) p.classList.add('usm-fullscreen'); p.style.display = is ? '' : 'none'; p.style.opacity = is ? '1' : '0'; p.style.transform=''; p.style.pointerEvents = is ? '' : 'none'; }
      current = name; setActive(current); removePrehide();
      if (useHash && name) { try{ if (location.hash !== '#'+name) location.hash = '#'+name; }catch{} }
    }

    function fadeLocal(fromEl: HTMLElement | null, toEl: HTMLElement): Promise<void> {
      const tw = getTween(); toEl.style.display=''; toEl.style.pointerEvents='none';
      return new Promise<void>((resolve)=>{
        let pend=0; const done=()=>{ if(--pend<=0){ toEl.style.pointerEvents=''; resolve(); } }; const step=(fn?:()=>void)=>{ if(fn){ pend++; fn(); } };
        step(()=>{ if (tw?.to){ const s={o:0}; tw.to(s,{o:1},{duration,ease,onUpdate:()=> toEl.style.opacity=String(s.o), onComplete:()=>{ toEl.style.opacity='1'; done(); }}); } else { toEl.style.transition=`opacity ${duration}s ease`; toEl.style.opacity='0'; requestAnimationFrame(()=>{ const end=()=>{ toEl.removeEventListener('transitionend',end); toEl.style.opacity='1'; done(); }; toEl.addEventListener('transitionend',end); toEl.style.opacity='1'; }); } });
        if (fromEl) step(()=>{ if (tw?.to){ const s2={o:1}; tw.to(s2,{o:0},{duration,ease,onUpdate:()=> fromEl.style.opacity=String(s2.o), onComplete:()=>{ fromEl.style.opacity='0'; fromEl.style.display='none'; done(); }}); } else { fromEl.style.transition=`opacity ${duration}s ease`; fromEl.style.opacity='1'; requestAnimationFrame(()=>{ const end=()=>{ fromEl.removeEventListener('transitionend',end); fromEl.style.opacity='0'; fromEl.style.display='none'; done(); }; fromEl.addEventListener('transitionend',end); fromEl.style.opacity='0'; }); } });
        if (pend===0) resolve();
      });
    }

    async function goto(name: string, kind: 'fader'|'fade'|'slide'|'none' = transition){
      if (!byName.size) collect(); ensureFullscreenCSS();
      const toEl = byName.get(name);
      if (!toEl) { console.warn('[usm][ui-scenes] scene not found:', name); return; }
      if (fullscreenScenes) toEl.classList.add('usm-fullscreen');
      const fromEl = current ? byName.get(current) || null : null;
      if (current === name) return;
      toEl.style.display='';

      if (useTransitions && transitions?.play) {
        await transitions.play(kind, { from: fromEl || undefined, to: toEl, direction, duration, ease });
      } else {
        await fadeLocal(fromEl, toEl);
      }

      current = name; setActive(current); removePrehide();
      if (useHash) { try { if (location.hash !== '#'+name) location.hash = '#'+name; } catch{} }
    }

    function nameFromHash(){ return (location.hash||'').replace(/^#/, '') || null; }

    function init(){
      collect();
      const first = scenes.length ? nameOf(scenes[0]) : null;
      const start = (useHash && nameFromHash()) || initial || first;
      if (start) showImmediate(start);
    }

    (usm.context as any).scenes = { goto, get current(){ return current; }, get list(){ return Array.from(byName.keys()); } };

    return { onStart(){ init(); if (useHash) window.addEventListener('hashchange', ()=>{ const n = nameFromHash(); if (n && n!==current) goto(n); }); }, onEnter({ state }){ if (byName.has(state)) goto(state); }, onStop(){ /* noop */ } };
  });
}