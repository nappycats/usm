/**
 * Debug overlay adapter
 * WHAT: shows FPS (Frames Per Second), current USM state, and last event.
 * WHY : quick visibility while prototyping; zero dependencies.
 */
import { createAdapter, type USMEvent } from '../usm-core';

export interface DebugAdapterOpts {
  parent?: HTMLElement;     // where to attach (default: document.body)
  zIndex?: number;          // overlay order
  showLastEvent?: boolean;  // toggle last-event display
  precision?: number;       // fps rounding (decimals)
}

export function debugAdapter({
  parent,
  zIndex = 99999,
  showLastEvent = true,
  precision = 0,
}: DebugAdapterOpts = {}) {
  return createAdapter('debug', '1.0.0', ['ui','debug'], (usm) => {
    let el: HTMLDivElement | null = null;
    let lastEvt: USMEvent | null = null;

    // Fallback FPS smoother if ctx.time.fps is not available
    let fps = 0, emaFps = 60, lastT = 0;
    const alpha = 0.1;

    function ensure() {
      if (el) return el;
      el = document.createElement('div');
      el.style.cssText = `
        position:fixed; left:8px; top:8px; z-index:${zIndex};
        background:rgba(0,0,0,.6); color:#0f0;
        font:12px/1.2 monospace; padding:8px 10px; border-radius:8px;
        pointer-events:none; white-space:pre;`;
      (parent || document.body).appendChild(el);
      return el;
    }

    function render(dt?: number) {
      const box = ensure();
      // Prefer timeAdapter’s smoothed fps if present
      const t = (usm.context as any).time;
      if (t && typeof t.fps === 'number') fps = t.fps;
      else if (typeof dt === 'number' && dt > 0) {
        const inst = 1 / dt;
        emaFps = (1 - alpha) * emaFps + alpha * inst;
        fps = emaFps;
      }

      const lines = [
        `State: ${usm.state ?? '(none)'}`,
        `FPS:   ${fps.toFixed(precision)}`,
      ];
      if (showLastEvent && lastEvt) lines.push(`Evt:   ${lastEvt.type}`);
      box.textContent = lines.join('\n');
    }

    return {
      // onEnter()    { render(); },
      onTransition() { render(); },
      onTick({ dt }) { render(dt); },
      onStart()    { render(); },
      onStop()     { if (el && el.parentNode) el.parentNode.removeChild(el); el = null; },
      // Expose a setter any state can call to log the last event
      onEnter: ({ evt }) => { lastEvt = evt; render(); }
    };
  });
}