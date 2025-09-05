/**
 * scrollAdapter (v1.1.0)
 * WHAT  : Centralized scroll utilities: progress, triggers, parallax, sections, helpers.
 * WHY   : Avoid duplicating scroll math across states/pages; keep it dependency‑free.
 *
 * Backward compatible with the previous light ScrollTrigger API:
 *   - options: { root, sections, progressEvent, throttle }
 *   - emits usm.send(progressEvent, {progress})
 *
 * New features:
 *   - axis X/Y, custom container, smooth behavior & optional CSS scroll-snap
 *   - ctx.scroll helpers: scrollTo/top/bottom, next/prev, rescan, recalc
 *   - addTrigger(start/end callbacks) & addParallax(speed/axis/clamp)
 */
import { createAdapter } from '../usm-core';

// Optional globals (when GSAP + ScrollTrigger are loaded via script tags)
declare const gsap: any | undefined;
declare const ScrollTrigger: any | undefined;

export interface ScrollTriggerConfig {
  trigger: string | Element;
  once?: boolean;
  threshold?: number | number[];
  start?: number; // px if trigger provided; else 0..1 container progress
  end?: number;   // px if trigger provided; else 0..1 container progress
  onEnter?: (e: IntersectionObserverEntry) => void;
  onLeave?: (e: IntersectionObserverEntry) => void;
  onUpdate?: (progress: number) => void; // 0..1 local progress
}

// -------------------------------- Types -----------------------------------
export interface ScrollSectionSpec { selector: string; enter?: string; leave?: string }
export interface ScrollSection { el: Element; enter?: string; leave?: string }

export interface ScrollAdapterOpts {
  /** Scrolling container; default = document.scrollingElement */
  root?: Element | null;
  /** Alias for root that accepts selector or element */
  container?: HTMLElement | string | null;
  /** Axis of scrolling */
  axis?: 'y' | 'x';
  /** Optional CSS scroll snapping for sections */
  snap?: 'none' | 'proximity' | 'mandatory';
  /** Section selector used by next()/prev() navigation */
  sectionSelector?: string; // default '[data-section]'
  /** Back-compat section specs for enter/leave events */
  sections?: Array<ScrollSectionSpec>;
  /** Event name to emit with {progress:0..1} */
  progressEvent?: string;   // default 'SCROLL_PROGRESS'
  /** Throttle(ms) for progress/trigger/parallax work */
  throttle?: number;        // default 50
  /** Apply CSS `scroll-behavior:smooth` on container */
  smoothBehavior?: boolean; // default true
}

export interface ScrollTriggerOpts {
  element?: Element | string; // if omitted, use absolute progress 0..1 of container
  start?: number;             // px if element provided; else 0..1 progress
  end?: number;               // same semantics as start
  onEnter?: () => void;
  onLeave?: () => void;
  onUpdate?: (t: number) => void; // 0..1 local progress while inside
  once?: boolean;                 // auto-unregister after first leave
}

export interface ParallaxOpts {
  element: Element | string;
  speed?: number;               // multiplier; 0.5 = half speed, negative = reverse
  axis?: 'x' | 'y';
  clamp?: [number, number];     // px clamp range
}

// ------------------------------- Adapter ----------------------------------
export function scrollAdapter(opts: ScrollAdapterOpts = {} ) {
  const {
    root = null,
    container = null,
    axis = 'y',
    snap = 'none',
    sectionSelector = '[data-section]',
    sections = [],
    progressEvent = 'SCROLL_PROGRESS',
    throttle = 50,
    smoothBehavior = true,
  } = opts;

  return createAdapter('scroll','1.1.0',['scroll','ui'], (usm)=>{
    // ---------- Resolve container & axis ----------
    const el = resolveContainer(root, container);
    const horizontal = axis === 'x';
    if (smoothBehavior) try { (el as HTMLElement).style.scrollBehavior = 'smooth'; } catch {}
    if (snap && snap !== 'none') try { (el as HTMLElement).style.scrollSnapType = (horizontal?'x':'y') + ' ' + snap; } catch {}

    // ---------- Internal state ----------
    const observed: ScrollSection[] = [];
    const triggers: Required<ScrollTriggerOpts & { el?: Element; active?: boolean }>[] = [] as any;
    const parallaxes: Required<ParallaxOpts & { el: Element }>[] = [] as any;
    let lastSent = 0;

    // Metrics for progress calculations
    const metrics = { pos: 0, size: 0, extent: 0, max: 1, progress: 0 };

    // ---------- Helpers ----------
    function recalc(){
      metrics.pos = horizontal ? (el as HTMLElement).scrollLeft : (el as HTMLElement).scrollTop;
      metrics.size = horizontal ? (el as HTMLElement).clientWidth : (el as HTMLElement).clientHeight;
      metrics.extent = horizontal ? (el as HTMLElement).scrollWidth : (el as HTMLElement).scrollHeight;
      metrics.max = Math.max(1, metrics.extent - metrics.size);
      metrics.progress = clamp01(metrics.pos / metrics.max);
    }

    function sendProgress(){
      recalc();
      usm.send({ type: progressEvent, data: { progress: metrics.progress } });
    }

    function onScroll(){
      const now = performance.now();
      if (now - lastSent > throttle) { lastSent = now; tick(); }
    }

    function tick(){
      recalc();
      // section enter/leave via IntersectionObserver handled separately
      fireTriggers();
      applyParallax();
      // emit progress event for back-compat
      usm.send({ type: progressEvent, data: { progress: metrics.progress } });
    }

    function addIOSections(){
      if (!sections.length) return;
      const io = new IntersectionObserver((entries)=>{
        for (const e of entries) {
          const s = observed.find(o => o.el === e.target);
          if (!s) continue;
          if (e.isIntersecting && s.enter) usm.send(s.enter);
          else if (!e.isIntersecting && s.leave) usm.send(s.leave);
        }
      }, { root: el === document.documentElement ? null : (el as Element), threshold: 0.1 });

      for (const spec of sections) {
        document.querySelectorAll(spec.selector).forEach((node)=>{
          const sec = { el: node, enter: spec.enter, leave: spec.leave };
          observed.push(sec);
          io.observe(node);
        });
      }
    }

    function addTrigger(t: ScrollTriggerOpts){
      const norm = normalizeTrigger(el as HTMLElement, t, horizontal);
      triggers.push(norm as any);
      return () => removeFrom(triggers, norm as any);
    }

    function addParallax(p: ParallaxOpts){
      const norm = normalizeParallax(p, horizontal);
      parallaxes.push(norm);
      return () => removeFrom(parallaxes, norm);
    }

    function scrollTriggerShim(config: ScrollTriggerConfig){
      // If GSAP ScrollTrigger exists, proxy directly
      const w: any = (globalThis as any);
      const ST = (typeof ScrollTrigger !== 'undefined' ? ScrollTrigger : w?.ScrollTrigger);
      const GS = (typeof gsap !== 'undefined' ? gsap : w?.gsap);
      if (ST && GS && typeof ST.create === 'function') {
        return ST.create(config as any);
      }

      // Fallback: IO for enter/leave + adapter trigger for onUpdate
      const targetEl = typeof config.trigger === 'string' ? document.querySelector(config.trigger) : config.trigger;
      if (!targetEl) {
        console.warn('[usm][scroll] scrollTrigger: trigger element not found', config.trigger);
        return { kill(){} } as { kill(): void };
      }

      const io = new IntersectionObserver((entries)=>{
        const e = entries.find(x => x.target === targetEl);
        if (!e) return;
        if (e.isIntersecting) {
          config.onEnter?.(e);
          if (config.once) io.disconnect();
        } else {
          config.onLeave?.(e);
        }
      }, { root: (el === document.documentElement ? null : (el as Element)), threshold: config.threshold ?? 0.1 });
      io.observe(targetEl);

      // onUpdate via our scroll triggers
      let offUpdate: (() => void) | null = null;
      if (config.onUpdate) {
        if (config.start != null || config.end != null || targetEl) {
          // Compute a reasonable default end range if none provided (viewport size)
          const defaultEnd = horizontal ? (el as HTMLElement).clientWidth : (el as HTMLElement).clientHeight;
          offUpdate = addTrigger({
            element: targetEl,
            start: config.start ?? 0,
            end:   (config.end ?? defaultEnd),
            onUpdate: (t:number) => config.onUpdate!(t),
          });
        } else {
          // No element / no bounds: map whole container progress 0..1
          offUpdate = addTrigger({ start: 0, end: 1, onUpdate: (t:number)=> config.onUpdate!(t) });
        }
      }

      return {
        kill(){
          try { io.disconnect(); } catch {}
          try { offUpdate?.(); } catch {}
        }
      } as { kill(): void };
    }

    function fireTriggers(){
      for (const tr of triggers.slice()){
        let startPx:number, endPx:number;
        if (tr.el){
          const rootRect = (el as HTMLElement).getBoundingClientRect();
          const rect = (tr.el as Element).getBoundingClientRect();
          const elStart = horizontal
            ? (rect.left - rootRect.left + (el as HTMLElement).scrollLeft)
            : (rect.top  - rootRect.top  + (el as HTMLElement).scrollTop);
          startPx = elStart + (tr.start || 0);
          endPx   = elStart + (tr.end   || 0);
        } else {
          startPx = (tr.start || 0) * metrics.max;
          endPx   = (tr.end   || 0) * metrics.max;
        }
        if (endPx < startPx) [startPx, endPx] = [endPx, startPx];
        const inside = metrics.pos >= startPx && metrics.pos <= endPx;
        if (inside){
          const local = (metrics.pos - startPx) / Math.max(1, (endPx - startPx));
          tr.onUpdate(local);
          if (!tr.active){ tr.active = true; tr.onEnter(); }
        } else if (tr.active){
          tr.active = false; tr.onLeave(); if (tr.once){ removeFrom(triggers, tr); }
        }
      }
    }

    function applyParallax(){
      if (!parallaxes.length) return;
      for (const p of parallaxes){
        const delta = metrics.pos * p.speed;
        const val = Math.max(p.clamp[0], Math.min(p.clamp[1], delta));
        (p.el as HTMLElement).style.transform = p.axis === 'x' ? `translateX(${val}px)` : `translateY(${val}px)`;
      }
    }

    // Section list for next()/prev()
    let sectionEls: HTMLElement[] = [];
    function rescanSections(){ sectionEls = Array.from((el as HTMLElement).querySelectorAll<HTMLElement>(sectionSelector)); }
    function currentSectionIndex(){
      if (!sectionEls.length) return -1;
      const pos = metrics.pos;
      let best = 0, bestDist = Infinity;
      for (let i=0;i<sectionEls.length;i++){
        const s = sectionEls[i];
        const start = positionOf(el as HTMLElement, s, horizontal);
        const d = Math.abs(pos - start); if (d < bestDist){ bestDist = d; best = i; }
      }
      return best;
    }

    // Public API on ctx
    (usm.context as any).scroll = {
      get axis(){ return horizontal ? 'x' : 'y'; },
      get progress(){ return metrics.progress; },
      get position(){ return metrics.pos; },
      // Back-compat: expose progress sender
      sendProgress,
      // Programmatic movement
      scrollTo: (target: number | string | Element, behavior: ScrollBehavior = 'smooth') =>
        scrollToTarget(el as HTMLElement, target, horizontal, behavior),
      scrollTop: (behavior: ScrollBehavior = 'smooth') => scrollToTarget(el as HTMLElement, 0, horizontal, behavior),
      scrollBottom: (behavior: ScrollBehavior = 'smooth') => scrollToTarget(el as HTMLElement, maxScroll(el as HTMLElement, horizontal), horizontal, behavior),
      // Sections
      rescan: () => { rescanSections(); },
      next: (behavior: ScrollBehavior = 'smooth') => {
        if (!sectionEls.length) return; const i = Math.min(sectionEls.length-1, Math.max(0, currentSectionIndex()+1));
        scrollToTarget(el as HTMLElement, sectionEls[i], horizontal, behavior);
      },
      prev: (behavior: ScrollBehavior = 'smooth') => {
        if (!sectionEls.length) return; const i = Math.max(0, currentSectionIndex()-1);
        scrollToTarget(el as HTMLElement, sectionEls[i], horizontal, behavior);
      },
      // Triggers & Parallax
      addTrigger,
      addParallax,
      scrollTrigger: scrollTriggerShim,
      // Force recompute
      recalc: () => { recalc(); },
    };

    // Also expose as anim.scrollTrigger if an anim context exists
    const animCtx: any = (usm.context as any).anim || ((usm.context as any).anim = {});
    if (!animCtx.scrollTrigger) animCtx.scrollTrigger = scrollTriggerShim;

    // ------------- Wire listeners & init -------------
    const scrollTarget: any = (el === document.documentElement) ? window : el;
    const onScrollBound = onScroll.bind(null);
    scrollTarget.addEventListener('scroll', onScrollBound, { passive: true });
    window.addEventListener('resize', tick, { passive: true });

    addIOSections();
    rescanSections();
    tick(); // initial

    // Cleanup
    return { onStop(){
      scrollTarget.removeEventListener('scroll', onScrollBound as any);
      window.removeEventListener('resize', tick as any);
      triggers.length = 0; parallaxes.length = 0; observed.length = 0; sectionEls.length = 0;
      (usm.context as any).scroll = undefined;
    }};
  });
}

// ------------------------------ Utilities ---------------------------------
function resolveContainer(root: Element | null | undefined, container: HTMLElement | string | null | undefined): HTMLElement {
  if (container){
    if (typeof container === 'string'){
      const el = document.querySelector<HTMLElement>(container); if (!el) throw new Error(`[usm][scroll] container not found: ${container}`); return el;
    }
    return container as HTMLElement;
  }
  if (root) return root as HTMLElement;
  return (document.scrollingElement || document.documentElement) as HTMLElement;
}

function positionOf(root: HTMLElement, target: string | Element, horizontal: boolean){
  const el = (typeof target === 'string') ? document.querySelector(target) : target;
  if (!el) return 0 as any;
  const rect = (el as Element).getBoundingClientRect();
  const base = root.getBoundingClientRect();
  return horizontal ? (rect.left - base.left + root.scrollLeft) : (rect.top - base.top + root.scrollTop);
}

function scrollToTarget(root: HTMLElement, target: number | string | Element, horizontal: boolean, behavior: ScrollBehavior){
  const pos = typeof target === 'number' ? target : positionOf(root, target as any, horizontal);
  const max = maxScroll(root, horizontal);
  const clamped = Math.max(0, Math.min(max, pos));
  if (horizontal) root.scrollTo({ left: clamped, behavior });
  else            root.scrollTo({ top:  clamped, behavior });
}

function maxScroll(root: HTMLElement, horizontal: boolean){
  const size = horizontal ? root.clientWidth  : root.clientHeight;
  const extent = horizontal ? root.scrollWidth : root.scrollHeight;
  return Math.max(0, extent - size);
}

function normalizeTrigger(root: HTMLElement, t: ScrollTriggerOpts, horizontal: boolean){
  const out: Required<ScrollTriggerOpts & { el?: Element; active: boolean }> = {
    element: t.element,
    start: t.start ?? (t.element ? 0 : 0),
    end:   t.end   ?? (t.element ? 0 : 0),
    onEnter: t.onEnter ?? (()=>{}),
    onLeave: t.onLeave ?? (()=>{}),
    onUpdate: t.onUpdate ?? (()=>{}),
    once: !!t.once,
    active: false,
  } as any;
  const maybeEl = typeof t.element === 'string' ? document.querySelector(t.element) : t.element;
  if (maybeEl && (maybeEl as Element).nodeType === 1) {
    (out as any).el = maybeEl as Element;
  } else {
    (out as any).el = undefined;
  }
  return out;
}

function normalizeParallax(p: ParallaxOpts, horizontalDefault: boolean){
  const el = (typeof p.element === 'string') ? document.querySelector(p.element) : p.element;
  if (!el) throw new Error('[usm][scroll] parallax element not found');
  return {
    el,
    speed: p.speed ?? 0.5,
    axis: p.axis ?? (horizontalDefault ? 'x' : 'y'),
    clamp: p.clamp ?? [-Infinity, Infinity]
  } as Required<ParallaxOpts & { el: Element }>;
}

function clamp01(x: number){ return Math.max(0, Math.min(1, x)); }
function removeFrom<T>(arr: T[], item: T){ const i = arr.indexOf(item); if (i>=0) arr.splice(i,1); }

