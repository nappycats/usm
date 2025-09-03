/**
 * Fader adapter
 * WHAT: Fullscreen overlay that can fade in/out for scene transitions.
 * WHY : Nice loading masks, level transitions, or cinematic cuts.
 *
 * Exposes ctx.fader: { fadeIn, fadeOut, flash }
 *  - fadeIn(d=0.5)  : overlay → opaque (to black) over d seconds
 *  - fadeOut(d=0.5) : overlay → transparent over d seconds
 *  - flash(d=0.2)   : quick white flash (hit / pickup effect)
 */
import { createAdapter } from '../usm-core';

export interface FaderAdapterOpts {
  color?: string;          // overlay color (default black)
  zIndex?: number;         // sits above canvas/UI
  parent?: HTMLElement;    // where to append (default: document.body)
  easing?: string;         // GSAP ease name; CSS fallback uses 'ease'
}

export function faderAdapter({
  color = '#000',
  zIndex = 9999,
  parent,
  easing = 'power2.out'
}: FaderAdapterOpts = {}) {
  return createAdapter('fader', '1.0.0', ['ui','transition'], (usm) => {
    let el: HTMLDivElement | null = null;

    function ensureEl() {
      if (el) return el;
      el = document.createElement('div');
      Object.assign(el.style, {
        position: 'fixed',
        inset: '0',
        background: color,
        pointerEvents: 'none',
        opacity: '0',
        zIndex: String(zIndex),
        transition: 'opacity 0.001s ease' // tiny; GSAP will override; CSS fallback uses JS
      });
      (parent || document.body).appendChild(el);
      return el;
    }

    // GSAP (if present) or CSS fallback
    function toOpacity(opacity: number, durationSec = 0.5) {
      const div = ensureEl();
      const g = (globalThis as any).gsap;
      if (g) {
        return g.to(div, { duration: durationSec, opacity, ease: easing });
      } else {
        return new Promise<void>((res) => {
          div.style.transition = `opacity ${durationSec}s ease`;
          div.style.opacity = String(opacity);
          const onEnd = () => { div?.removeEventListener('transitionend', onEnd); res(); };
          div.addEventListener('transitionend', onEnd);
        });
      }
    }

    // Expose helpers on context for easy use in states
    (usm.context as any).fader = {
      fadeIn:  (d = 0.5) => toOpacity(1, d),
      fadeOut: (d = 0.5) => toOpacity(0, d),
      flash:   async (d = 0.2) => {
        const prevColor = ensureEl().style.background;
        ensureEl().style.background = '#fff';
        await toOpacity(1, d);
        await toOpacity(0, d);
        ensureEl().style.background = prevColor;
      }
    };

    return {};
  });
}