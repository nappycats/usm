/**
 * Fader adapter (a.k.a. Screen Fader)
 * WHAT: Fullscreen overlay that fades in/out for transitions (loading, cuts, scene swaps).
 * WHY : Centralized, reusable transition layer that works with/without GSAP and stays
 *       time-consistent when the time adapter is present.
 *
 * Exposes `ctx.fader`:
 *   fadeIn(d=0.5, ease='quadInOut')   → overlay → opaque
 *   fadeOut(d=0.5, ease='quadInOut')  → overlay → transparent
 *   fadeBetween(dIn, action, dOut, e) → fade to black → run action → fade back
 *   flash(d=0.2, color='#fff')        → quick flash (in then out)
 *   setColor(color)                   → change overlay color
 *   setOpacity(op)                    → immediately set overlay opacity (0..1)
 *   element                           → DOM node for custom styling
 */
import { createAdapter } from '../usm-core';

export interface FaderAdapterOpts {
  color?: string;
  zIndex?: number;
  parent?: HTMLElement;
  ease?: string;
  blockInput?: boolean;
}

export function faderAdapter({
  color = '#000',
  zIndex = 9999,
  parent,
  ease = 'quadInOut',
  blockInput = false,
}: FaderAdapterOpts = {}) {
  return createAdapter('fader', '1.2.0', ['ui','transition'], (usm) => {
    let el: HTMLDivElement | null = null;

    function ensureEl() {
      if (el) return el;
      if (typeof document === 'undefined') throw new Error('[usm][fader] document not available');
      el = document.createElement('div');
      Object.assign((el.style as any), {
        position: 'fixed',
        inset: '0',
        background: color,
        pointerEvents: blockInput ? 'auto' : 'none', // updated during animation
        opacity: '0',
        zIndex: String(zIndex),
        transition: 'opacity 0.001s ease',
      });
      (parent || document.body).appendChild(el);
      return el;
    }

    function updatePointerEvents(op: number) {
      if (!blockInput || !el) return;
      const elem = el as HTMLDivElement;
      elem.style.pointerEvents = op > 0.01 ? 'auto' : 'none';
    }

    function cssFallback(div: HTMLDivElement, targetOpacity: number, durationSec: number, done: ()=>void){
      const onEnd = () => { div.removeEventListener('transitionend', onEnd); updatePointerEvents(targetOpacity); done(); };
      div.addEventListener('transitionend', onEnd);
      updatePointerEvents(targetOpacity);
      div.style.transition = `opacity ${Math.max(0, durationSec)}s ease`;
      (div as any).offsetHeight; // force reflow
      div.style.opacity = String(targetOpacity);
      if (durationSec <= 0) Promise.resolve().then(onEnd); // immediate finish if duration=0
    }

    function toOpacity(targetOpacity: number, durationSec = 0.5, easing = ease): Promise<void> {
      const div = ensureEl();

      // Resolve tween lazily at call time (may be undefined if adapter not attached yet)
      const tw = (usm.context as any).tween as
        | { to?: (t:any, v:Record<string,number>, o?:{ duration?: number; ease?: string; onUpdate?: ()=>void; onComplete?: ()=>void })=>any }
        | undefined;

      const gsapAny = (globalThis as any).gsap as any | undefined;

      // 1) Use tweenAdapter if available
      if (tw && typeof tw.to === 'function') {
        const state = { opacity: parseFloat(div.style.opacity || '0') || 0 };
        const toFn = (tw as any).to as (t:any, v:Record<string,number>, o?:{ duration?: number; ease?: string; onUpdate?: ()=>void; onComplete?: ()=>void })=>any;
        return new Promise<void>((resolve) => {
          try {
            toFn(state, { opacity: targetOpacity }, {
              duration: Math.max(0, durationSec),
              ease: typeof easing === 'string' ? (easing || 'quadInOut') : 'quadInOut',
              onUpdate: () => {
                div.style.opacity = String(state.opacity);
                updatePointerEvents(state.opacity);
              },
              onComplete: () => {
                div.style.opacity = String(targetOpacity);
                updatePointerEvents(targetOpacity);
                resolve();
              }
            });
          } catch {
            cssFallback(div, targetOpacity, durationSec, resolve);
          }
        });
      }

      // 2) Else try GSAP
      if (gsapAny && typeof gsapAny.to === 'function') {
        return new Promise<void>((resolve) => {
          gsapAny.to(div, {
            duration: Math.max(0, durationSec),
            opacity: targetOpacity,
            ease: easing,
            onUpdate: () => updatePointerEvents(parseFloat(div.style.opacity || '0') || 0),
            onComplete: () => { updatePointerEvents(targetOpacity); resolve(); }
          });
        });
      }

      // 3) Fallback to CSS transitions
      return new Promise<void>((resolve) => cssFallback(div, targetOpacity, durationSec, resolve));
    }

    async function fadeBetweenInternal(dIn = 0.3, action?: (()=>any|Promise<any>) | string | { type?: string; data?: any }, dOut = 0.3, easing = ease) {
      await toOpacity(1, dIn, easing); // fade to black
      try {
        if (typeof action === 'function') {
          await action();
        } else if (typeof action === 'string') {
          const api = (usm as any).api || (usm as any);
          api?.send?.(action);
        } else if (action && typeof action === 'object') {
          const api = (usm as any).api || (usm as any);
          const type = (action as any).type || (action as any).event || (action as any).name;
          const data = (action as any).data;
          if (type) api?.send?.(type, data);
        }
      } finally {
        await toOpacity(0, dOut, easing); // fade back
      }
    }

    (usm.context as any).fader = {
      fadeIn:  (d = 0.5, e = ease) => toOpacity(1, d, e),
      fadeOut: (d = 0.5, e = ease) => toOpacity(0, d, e),
      fadeBetween: (dIn = 0.3, action?: any, dOut = 0.3, e = ease) => fadeBetweenInternal(dIn, action, dOut, e),
      flash:   async (d = 0.2, flashColor = '#fff') => {
        const div = ensureEl();
        const prev = div.style.background;
        div.style.background = flashColor;
        await toOpacity(1, d * 0.5, 'quadIn');
        await toOpacity(0, d * 0.5, 'quadOut');
        div.style.background = prev || color;
      },
      setColor: (c: string) => { ensureEl().style.background = c; },
      setOpacity: (op: number) => { const v = Math.max(0, Math.min(1, op)); const div = ensureEl(); div.style.opacity = String(v); updatePointerEvents(v); },
      get element(){ return ensureEl(); }
    };

    return {};
  });
}