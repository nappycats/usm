/** ============================================================================
 * UI Widgets adapter
 * WHAT:
 *   - Responsive nav toggles (left/right)
 *   - Toolbars (top/bottom)
 *   - Title setter
 *   - Dialogs (modal with backdrop, focus trap, ESC) — animated
 *   - Windows (draggable)
 *   - Debug overlay (FPS, dt, state) with configurable corner/center position
 *
 * HOW:
 *   - Uses <html data-*> flags you can style in CSS:
 *       data-nav-left="open|closed"
 *       data-nav-right="open|closed"
 *       data-toolbar-top="show|hide"
 *       data-toolbar-bottom="show|hide"
 *   - Elements to animate use these selectors (configurable):
 *       [data-nav="left"], [data-nav="right"],
 *       [data-toolbar="top"], [data-toolbar="bottom"]
 *
 * ANIMATION ORDER:
 *   1) tweenAdapter if present (pause-aware with timeAdapter)
 *   2) otherwise CSS transitions (safe fallback)
 * ============================================================================ */
import { createAdapter } from '../../usm-core';

export interface UIWidgetsOpts {
  autoStyles?: boolean;             // inject base CSS scaffold (default: true)
  dragHandle?: string;              // draggable window handle selector (default '.titlebar')
  // Elements to animate (override if your markup differs):
  navLeftSel?: string;              // default '[data-nav="left"]'
  navRightSel?: string;             // default '[data-nav="right"]'
  toolbarTopSel?: string;           // default '[data-toolbar="top"]'
  toolbarBottomSel?: string;        // default '[data-toolbar="bottom"]'
  // Animation prefs:
  animate?: boolean;                // enable JS-driven animation (default: true)
  duration?: number;                // seconds (default: 0.25)
  ease?: string;                    // tweenAdapter ease name (default: 'quadInOut')
  // Debug overlay position:
  debugPosition?: 'top-left'|'top-right'|'bottom-left'|'bottom-right'|'top-center'|'bottom-center';
}

export function uiWidgetsAdapter(opts: UIWidgetsOpts = {}) {
  const {
    autoStyles    = true,
    dragHandle    = '.titlebar',
    navLeftSel    = '[data-nav="left"]',
    navRightSel   = '[data-nav="right"]',
    toolbarTopSel = '[data-toolbar="top"]',
    toolbarBottomSel = '[data-toolbar="bottom"]',
    animate       = true,
    duration      = 0.25,
    ease          = 'quadInOut',
    debugPosition = 'bottom-right',
  } = opts;

  return createAdapter('ui-widgets', '1.2.0', ['ui','widgets'], (usm) => {
    const host = document.documentElement;

    // ---------- Utils
    const q = (sel: string) => document.querySelector<HTMLElement>(sel);
    const getTween = () => (usm.context as any).tween as
      | { to?: (t:any, v:Record<string,number>, o?:{ duration?: number; ease?: string; onUpdate?: ()=>void; onComplete?: ()=>void })=>any }
      | undefined;

    // ---------- Base CSS (scaffold)
    function injectBaseCSS(){
      if (!autoStyles) return;
      const id = 'usm-ui-widgets-base';
      if (document.getElementById(id)) return;
      const css = document.createElement('style');
      css.id = id;
      css.textContent = `
      /* NAVS ------------------------------------------------------------------ */
      [data-nav="left"], [data-nav="right"]{
        position: fixed; top: 0; bottom: 0; width: var(--nav-w, 280px);
        background: var(--nav-bg, #11151a); color: var(--nav-fg, #eaf2ff);
        box-shadow: 0 10px 40px rgba(0,0,0,.45);
        z-index: 8000; will-change: transform; transition: transform .25s ease;
      }
      [data-nav="left"]  { left: 0;  transform: translateX(-100%); }
      [data-nav="right"] { right: 0; transform: translateX(100%); }
      html[data-nav-left="open"]  [data-nav="left"]  { transform: translateX(0%); }
      html[data-nav-right="open"] [data-nav="right"] { transform: translateX(0%); }

      /* TOOLBARS --------------------------------------------------------------- */
      [data-toolbar="top"], [data-toolbar="bottom"]{
        position: fixed; left: 0; right: 0; height: var(--tb-h, 56px);
        background: var(--tb-bg, #0d1015); color: var(--tb-fg, #e5ecff);
        box-shadow: 0 6px 30px rgba(0,0,0,.35);
        z-index: 7000; will-change: transform; transition: transform .25s ease;
      }
      [data-toolbar="top"]    { top: 0;    transform: translateY(-100%); }
      [data-toolbar="bottom"] { bottom: 0; transform: translateY(100%);  }
      html[data-toolbar-top="show"]    [data-toolbar="top"]    { transform: translateY(0%); }
      html[data-toolbar-bottom="show"] [data-toolbar="bottom"] { transform: translateY(0%); }

      /* DIALOG/BACKDROP baseline --------------------------------------------- */
      .usm-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.4);
        backdrop-filter:blur(2px); opacity:0; pointer-events:none;
        transition:opacity .18s ease; z-index:10000; }
      .usm-backdrop.show{ opacity:1; pointer-events:auto; }
      .usm-dialog{ position:fixed; max-width:min(600px, 90vw); max-height:80vh; top:50%; left:50%;
        transform:translate(-50%,-50%) scale(.96); background:#14161b; color:#eef1f6;
        border:1px solid rgba(255,255,255,.12); border-radius:12px; box-shadow:0 10px 50px rgba(0,0,0,.5);
        opacity:0; transition:opacity .18s ease, transform .18s ease; z-index:10001; }
      .usm-window{ position:fixed; background:#14161b; color:#eef1f6; border:1px solid rgba(255,255,255,.12);
        border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.4); z-index:9999; }
      .usm-dialog .titlebar, .usm-window .titlebar{ cursor:grab; user-select:none;
        padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:600; }

      /* Debug overlay box (position set inline, not here) */
      #usm-debug{ position:fixed; min-width:180px; background:rgba(0,0,0,.6);
        color:#cfe0ff; font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        padding:8px 10px; border:1px solid rgba(255,255,255,.15); border-radius:8px; z-index:10002; pointer-events:none; }
      `;
      document.head.appendChild(css);
    }

    // ---------- Title
    function setTitle(text: string){
      const t = document.querySelector('[data-title], title');
      if (!t) return;
      if (t instanceof HTMLTitleElement) t.textContent = text;
      else (t as HTMLElement).textContent = text;
    }

    // ---------- Animation helpers (tween → CSS fallback)
    function slideEl(el: HTMLElement, axis: 'X'|'Y', fromPct: number, toPct: number, done:()=>void){
      const tw = getTween();
      if (tw?.to) {
        const s = { v: fromPct };
        tw.to(s, { v: toPct }, {
          duration, ease,
          onUpdate: () => { el.style.transform = axis==='X' ? `translateX(${s.v}%)` : `translateY(${s.v}%)`; },
          onComplete: () => { el.style.transform = axis==='X' ? `translateX(${toPct}%)` : `translateY(${toPct}%)`; done(); }
        });
      } else {
        el.style.transition = `transform ${duration}s ease`;
        requestAnimationFrame(()=>{
          const end = ()=>{ el.removeEventListener('transitionend', end); el.style.transform = axis==='X' ? `translateX(${toPct}%)` : `translateY(${toPct}%)`; done(); };
          el.addEventListener('transitionend', end);
          el.style.transform = axis==='X' ? `translateX(${toPct}%)` : `translateY(${toPct}%)`;
        });
      }
    }

    function fadeScale(el: HTMLElement, show: boolean, done: ()=>void){
      const tw = getTween();
      if (tw?.to) {
        const s = { o: show ? 0 : 1, k: show ? 0.96 : 1 };
        tw.to(s, { o: show ? 1 : 0, k: show ? 1 : 0.96 }, {
          duration: 0.18, ease: 'quadInOut',
          onUpdate: () => {
            el.style.opacity = String(s.o);
            el.style.transform = `translate(-50%,-50%) scale(${s.k})`;
          },
          onComplete: () => { done(); }
        });
      } else {
        el.style.transition = `opacity .18s ease, transform .18s ease`;
        requestAnimationFrame(()=>{
          const end = ()=>{ el.removeEventListener('transitionend', end); done(); };
          el.addEventListener('transitionend', end);
          el.style.opacity = show ? '1' : '0';
          el.style.transform = `translate(-50%,-50%) scale(${show ? 1 : 0.96})`;
        });
      }
    }

    function fade(el: HTMLElement, show: boolean, done: ()=>void){
      const tw = getTween();
      if (tw?.to) {
        const s = { o: show ? 0 : 1 };
        tw.to(s, { o: show ? 1 : 0 }, {
          duration: 0.18, ease: 'quadInOut',
          onUpdate: () => { el.style.opacity = String(s.o); },
          onComplete: () => { done(); }
        });
      } else {
        el.style.transition = `opacity .18s ease`;
        requestAnimationFrame(()=>{
          const end = ()=>{ el.removeEventListener('transitionend', end); done(); };
          el.addEventListener('transitionend', end);
          el.style.opacity = show ? '1' : '0';
        });
      }
    }

    // ---------- Nav & toolbars (animated)
    function toggleNav(side: 'left'|'right', force?: boolean){
      const key = side === 'left' ? 'navLeft' : 'navRight';
      const el  = q(side === 'left' ? navLeftSel : navRightSel);
      const openNow = host.dataset[key as 'navLeft'|'navRight'] === 'open';
      const shouldOpen = (force === undefined) ? !openNow : !!force;

      host.dataset[key as 'navLeft'|'navRight'] = shouldOpen ? 'open' : 'closed';

      if (!animate || !el) return;
      // Compute slide direction
      if (side === 'left') {
        // from -100% (closed) to 0% (open)
        slideEl(el, 'X', shouldOpen ? -100 : 0, shouldOpen ? 0 : -100, ()=>{ /* done */ });
      } else {
        // right: from +100% to 0
        slideEl(el, 'X', shouldOpen ? 100 : 0, shouldOpen ? 0 : 100, ()=>{ /* done */ });
      }
    }

    function showToolbar(pos: 'top'|'bottom', force?: boolean){
      const key = pos === 'top' ? 'toolbarTop' : 'toolbarBottom';
      const el  = q(pos === 'top' ? toolbarTopSel : toolbarBottomSel);
      const showing = host.dataset[key as 'toolbarTop'|'toolbarBottom'] === 'show';
      const shouldShow = (force === undefined) ? !showing : !!force;

      host.dataset[key as 'toolbarTop'|'toolbarBottom'] = shouldShow ? 'show' : 'hide';

      if (!animate || !el) return;
      if (pos === 'top')   slideEl(el, 'Y', shouldShow ? -100 : 0, shouldShow ? 0 : -100, ()=>{});
      else                 slideEl(el, 'Y', shouldShow ?  100 : 0, shouldShow ? 0 :  100, ()=>{});
    }

    // ---------- Dialogs (modal) with backdrop + focus trap + ESC — animated
    let backdrop: HTMLDivElement | null = null;
    let activeDialog: HTMLElement | null = null;
    let lastFocus: Element | null = null;

    function ensureBackdrop(){
      if (backdrop) return backdrop;
      backdrop = document.createElement('div');
      backdrop.className = 'usm-backdrop';
      backdrop.addEventListener('click', ()=> closeDialog());
      document.body.appendChild(backdrop);
      return backdrop;
    }

    function trapFocus(e: KeyboardEvent){
      if (!activeDialog || e.key !== 'Tab') return;
      const focusable = activeDialog.querySelectorAll<HTMLElement>(
        "a[href], button, textarea, input, select, [tabindex]:not([tabindex='-1'])"
      );
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length-1];
      const a = document.activeElement as HTMLElement | null;
      if (e.shiftKey && a === first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last){ e.preventDefault(); first.focus(); }
    }

    function openDialog(selector: string){
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) { console.warn('[usm][ui-widgets] dialog not found', selector); return; }

      ensureBackdrop();
      activeDialog = el; lastFocus = document.activeElement;

      // prep states
      el.classList.add('usm-dialog');
      el.setAttribute('aria-modal','true');
      el.setAttribute('role','dialog');
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,-50%) scale(.96)';

      // animate in
      backdrop!.style.opacity = '0';
      backdrop!.classList.add('show');
      fade(backdrop!, true, ()=>{ /* keep shown */ });
      fadeScale(el, true, ()=>{ /* shown */ });

      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keydown', trapFocus);
      setTimeout(()=> el.querySelector<HTMLElement>('[autofocus], button, [tabindex]:not([tabindex="-1"])')?.focus(), 0);
    }

    function closeDialog(){
      if (!activeDialog) return;
      const el = activeDialog;
      fade(backdrop!, false, ()=>{ backdrop!.classList.remove('show'); });
      fadeScale(el, false, ()=>{
        el.removeAttribute('aria-modal'); el.removeAttribute('role');
      });

      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keydown', trapFocus);
      (lastFocus as HTMLElement | null)?.focus?.();
      activeDialog = null;
    }

    function onKeyDown(e: KeyboardEvent){ if (e.key === 'Escape') closeDialog(); }

    // ---------- Windows (draggable)
    function makeDraggable(target: HTMLElement | string, handleSel = dragHandle){
      const el = (typeof target === 'string') ? document.querySelector<HTMLElement>(target) : target;
      if (!el) { console.warn('[usm][ui-widgets] draggable target not found', target); return; }

      // Capture into locals so TypeScript keeps the narrowed types inside closures
      const node = el as HTMLElement;
      const grip = (node.querySelector<HTMLElement>(handleSel) || node) as HTMLElement;

      node.classList.add('usm-window');
      if (getComputedStyle(node).position === 'static') node.style.position = 'fixed';
      grip.style.cursor = 'grab';

      let startX = 0, startY = 0, baseX = 0, baseY = 0;

      function onDown(ev: PointerEvent){
        ev.preventDefault();
        try { (grip as any).setPointerCapture?.(ev.pointerId); } catch {}
        const rect = node.getBoundingClientRect();
        baseX = rect.left; baseY = rect.top;
        startX = ev.clientX; startY = ev.clientY;
        (grip.style as any).cursor = 'grabbing';
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
      }

      function onMove(ev: PointerEvent){
        const dx = ev.clientX - startX; const dy = ev.clientY - startY;
        node.style.left = Math.round(baseX + dx) + 'px';
        node.style.top  = Math.round(baseY + dy) + 'px';
      }

      function onUp(ev: PointerEvent){
        try { (grip as any).releasePointerCapture?.(ev.pointerId); } catch {}
        (grip.style as any).cursor = 'grab';
        window.removeEventListener('pointermove', onMove);
      }

      grip.addEventListener('pointerdown', onDown);
      grip.addEventListener('dragstart', (e)=> e.preventDefault()); // no text drag
    }

    // ---------- Debug overlay
    let dbgEl: HTMLDivElement | null = null;
    let dbgRAF = 0; let dbgOff: any = null; let last = 0, fps = 0;

    function ensureDebug(){
      if (dbgEl) return dbgEl;
      dbgEl = document.createElement('div');
      dbgEl.id='usm-debug';
      applyDebugPosition(debugPosition);
      document.body.appendChild(dbgEl);
      return dbgEl;
    }

    function applyDebugPosition(pos: UIWidgetsOpts['debugPosition']){
      if (!dbgEl) return;
      const s = dbgEl.style;
      s.top = s.right = s.bottom = s.left = '';
      s.transform = '';
      switch(pos){
        case 'top-left':     s.top = '8px'; s.left = '8px'; break;
        case 'top-right':    s.top = '8px'; s.right = '8px'; break;
        case 'bottom-left':  s.bottom = '8px'; s.left = '8px'; break;
        case 'top-center':   s.top = '8px'; s.left = '50%'; s.transform = 'translateX(-50%)'; break;
        case 'bottom-center':s.bottom = '8px'; s.left = '50%'; s.transform = 'translateX(-50%)'; break;
        case 'bottom-right': default: s.bottom = '8px'; s.right = '8px'; break;
      }
    }

    function debugShow(){
      const el = ensureDebug();
      const time = (usm.context as any).time;
      const tick = (dt:number)=>{
        if (!last) last = performance.now();
        const now = performance.now(), sec = (now-last)/1000; last = now; fps = Math.round(1/Math.max(0.0001,sec));
        el.innerHTML = `<div><b>USM</b> state: <code>${(usm as any).state}</code></div><div>FPS: ${fps}</div><div>dt: ${dt.toFixed ? dt.toFixed(3) : dt}</div>`;
      };
      if (time?.onFrame) { dbgOff = time.onFrame((dt:number)=>tick(dt)); }
      else { const loop = ()=>{ dbgRAF = requestAnimationFrame(loop); tick(1/60); }; dbgRAF = requestAnimationFrame(loop); }
    }
    function debugHide(){ if (dbgOff){ try{ dbgOff(); }catch{} dbgOff=null; } if (dbgRAF) cancelAnimationFrame(dbgRAF); dbgRAF=0; dbgEl?.remove(); dbgEl=null; }
    function debugLog(msg: string){ ensureDebug().insertAdjacentHTML('beforeend', `<div>${msg}</div>`); }

    // ---------- Expose API
    (usm.context as any).ui = (usm.context as any).ui || {};
    (usm.context as any).ui.widgets = {
      setTitle,
      toggleNav,
      showToolbar,
      openDialog,
      closeDialog,
      makeDraggable,
      debug: { show: debugShow, hide: debugHide, log: debugLog, setPosition: (p: UIWidgetsOpts['debugPosition'])=>{ applyDebugPosition(p); } }
    };

    return { onStart(){ injectBaseCSS(); }, onStop(){ debugHide(); } };
  });
}