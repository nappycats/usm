
/**
 * Core UI adapter (lean)
 *
 * PURPOSE
 *  - Keep DOM in sync with USM state with zero dependencies.
 *  - Provide tiny helpers for text, classes, attrs, visibility.
 *  - Expose a lightweight event wiring via data-* attributes.
 *
 * FEATURES
 *  ✓ <html data-state="..."> and <html data-prev-state="...">
 *  ✓ [data-show]  — show only in listed states
 *  ✓ [data-hide]  — hide in listed states
 *  ✓ [data-active] — toggles .is-active when state matches
 *  ✓ Hidden elements also get aria-hidden + inert (optional)
 *  ✓ [data-send] / [data-send-down] / [data-send-up] — send USM events on click/pointer
 *  ✓ [data-send-key] — send event on key press (adds tabindex/role when needed)
 *  ✓ Helpers on ctx.ui: setText, setHTML, setClass, setAttr, toggle, setVar, onState, scan
 */
import { createAdapter } from '../../usm-core';

export interface UIAdapterOpts {
  /** Root element to receive data-state. Default: <html>. */
  root?: HTMLElement;
  /** Remove this <style id> on first enter to prevent flash of content. */
  prehideId?: string; // default 'usm-prehide'
  /** When true, hidden elements also receive aria-hidden + inert. */
  inertHide?: boolean; // default true
  /** Observe DOM mutations and auto-rescan for new [data-*] senders. */
  observeMutations?: boolean; // default true
}

export function uiAdapter(opts: UIAdapterOpts = {}){
  const {
    root,
    prehideId = 'usm-prehide',
    inertHide = true,
    observeMutations = true,
  } = opts;

  return createAdapter('ui','1.4.0',['ui'], (usm)=>{
    const host = root || document.documentElement;
    let prehideRemoved = false;

    // Helpers ---------------------------------------------------------------
    function setText(sel: string, text: string){ document.querySelectorAll(sel).forEach(el => { (el as HTMLElement).textContent = text; }); }
    function setHTML(sel: string, html: string){ document.querySelectorAll(sel).forEach(el => { (el as HTMLElement).innerHTML = html; }); }
    function setClass(sel: string, className: string, on: boolean){ document.querySelectorAll(sel).forEach(el => (on ? el.classList.add(className) : el.classList.remove(className))); }
    function setAttr(sel: string, name: string, value: string | null){ document.querySelectorAll<HTMLElement>(sel).forEach(el => { if (value === null) el.removeAttribute(name); else el.setAttribute(name, value); }); }
    function toggle(sel: string, show: boolean){ document.querySelectorAll<HTMLElement>(sel).forEach(el => setVisible(el, show)); }
    function setVar(name: string, value: string){ (host as HTMLElement).style.setProperty(name.startsWith('--')?name:`--${name}`, value); }

    // Visibility + A11y -----------------------------------------------------
    function setVisible(el: HTMLElement, show: boolean){
      el.style.display = show ? '' : 'none';
      el.toggleAttribute('hidden', !show);
      if (inertHide){
        el.setAttribute('aria-hidden', show ? 'false' : 'true');
        try { (el as any).inert = !show; } catch { /* older browsers */ }
        if (!show) el.setAttribute('inert',''); else el.removeAttribute('inert');
      }
    }

    function applyVisibilityForState(state: string){
      document.querySelectorAll<HTMLElement>('[data-show], [data-hide], [data-active]').forEach(el=>{
        const showList = (el.getAttribute('data-show')||'').split(/\s*,\s*|\s+/).filter(Boolean);
        const hideList = (el.getAttribute('data-hide')||'').split(/\s*,\s*|\s+/).filter(Boolean);
        const activeList = (el.getAttribute('data-active')||'').split(/\s*,\s*|\s+/).filter(Boolean);
        let visible: boolean | null = null;
        if (showList.length){ visible = showList.includes(state); }
        else if (hideList.length){ visible = !hideList.includes(state); }
        if (visible !== null) setVisible(el, visible);
        if (activeList.length){ el.classList.toggle('is-active', activeList.includes(state)); }
      });
    }

    // data-send wiring ------------------------------------------------------
    type Unsub = () => void;
    const bound = new WeakMap<HTMLElement, Unsub[]>();

    function parseArg(el: HTMLElement){
      const raw = el.getAttribute('data-arg');
      if (!raw) return undefined;
      try { return JSON.parse(raw); } catch { return raw; }
    }

    function ensureFocusableButtonRole(el: HTMLElement){
      const focusable = el.matches('a,button,input,select,textarea,[tabindex]');
      if (!focusable){ el.setAttribute('tabindex','0'); el.setAttribute('role','button'); }
    }

    function bindSender(el: HTMLElement){
      if (bound.has(el)) return; // already bound
      const unsubs: Unsub[] = [];

      const send = (name: string | null) => (e: Event) => {
        if (!name) return;
        const payload = parseArg(el);
        try { (usm as any).api?.send?.(name, payload); } catch {}
      };

      const evClick = el.getAttribute('data-send');
      if (evClick){
        ensureFocusableButtonRole(el);
        const h = send(evClick); el.addEventListener('click', h); unsubs.push(()=> el.removeEventListener('click', h));
        // keyboard (space/enter)
        const hk = (e: KeyboardEvent)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h(e as any); } };
        el.addEventListener('keydown', hk); unsubs.push(()=> el.removeEventListener('keydown', hk));
      }
      const evDown = el.getAttribute('data-send-down');
      if (evDown){ const h = send(evDown); el.addEventListener('pointerdown', h); unsubs.push(()=> el.removeEventListener('pointerdown', h)); }
      const evUp = el.getAttribute('data-send-up');
      if (evUp){ const h = send(evUp); el.addEventListener('pointerup', h); unsubs.push(()=> el.removeEventListener('pointerup', h)); }

      const key = el.getAttribute('data-send-key');
      if (key){ const hk = (e: KeyboardEvent)=>{ if (e.key.toLowerCase() === key.toLowerCase()) { e.preventDefault(); send(el.getAttribute('data-send'))(e as any); } }; ensureFocusableButtonRole(el); el.addEventListener('keydown', hk); unsubs.push(()=> el.removeEventListener('keydown', hk)); }

      bound.set(el, unsubs);
    }

    function scan(rootEl: ParentNode = document){
      rootEl.querySelectorAll<HTMLElement>('[data-send], [data-send-down], [data-send-up], [data-send-key]').forEach(bindSender);
    }

    // Pub/Sub for state change ----------------------------------------------
    const stateSubs = new Set<(state:string, prev:string|null)=>void>();
    function onState(fn: (state:string, prev:string|null)=>void): Unsub { stateSubs.add(fn); return ()=> stateSubs.delete(fn); }
    function emitState(state: string, prev: string | null){ stateSubs.forEach(fn=>{ try { fn(state, prev); } catch {} }); }

    // Mutation observer (optional) ------------------------------------------
    const mo = observeMutations ? new MutationObserver(muts => {
      for (const m of muts){ if (m.type === 'childList'){ if (m.addedNodes) m.addedNodes.forEach(n=>{ if (n instanceof HTMLElement) scan(n); }); } }
    }) : null;

    function removePrehideOnce(){ if (!prehideRemoved && prehideId){ document.getElementById(prehideId)?.remove(); prehideRemoved = true; } }

    // Expose API on context
    (usm.context as any).ui = { setText, setHTML, setClass, setAttr, toggle, setVar, onState, scan };

    let prevState: string | null = null;

    return {
      onStart(){
        scan();
        if (mo) mo.observe(document.body, { childList: true, subtree: true });
      },
      onEnter({ state }){
        host.dataset.prevState = prevState || '';
        host.dataset.state = state; // <html data-state="play">
        applyVisibilityForState(state);
        removePrehideOnce();
        emitState(state, prevState);
        prevState = state;
      },
      onStop(){ delete host.dataset.state; delete host.dataset.prevState; mo?.disconnect(); }
    };
  });
}
