/**
 * Debug overlay adapter
 * WHAT: shows FPS (Frames Per Second), current USM state, and last event.
 * WHY : quick visibility while prototyping; zero dependencies.
 *
 * NEW (v1.1.0): configurable placement
 *   position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' |
 *             'top-center' | 'bottom-center'
 *   margin: gap (px) from the chosen edge(s)
 */
import { createAdapter, type USMEvent } from '../usm-core';

export interface DebugAdapterOpts {
  parent?: HTMLElement;     // where to attach (default: document.body)
  zIndex?: number;          // overlay order
  showLastEvent?: boolean;  // toggle last-event display
  precision?: number;       // fps rounding (decimals)
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
  margin?: number;          // px gap from edges (default 8)
}

export function debugAdapter({
  parent,
  zIndex = 99999,
  showLastEvent = true,
  precision = 0,
  position = 'top-left',
  margin = 8,
}: DebugAdapterOpts = {}) {
  return createAdapter('debug', '1.1.0', ['ui','debug'], (usm) => {
    let el: HTMLDivElement | null = null;
    let lastEvt: USMEvent | null = null;

    // Fallback FPS smoother if ctx.time.fps is not available
    let fps = 0, emaFps = 60;
    const alpha = 0.1;

    function applyPosition(node: HTMLElement){
      // reset positional props first
      node.style.left = node.style.right = node.style.top = node.style.bottom = '';
      node.style.transform = '';
      switch (position) {
        case 'top-left':
          node.style.left = margin + 'px';
          node.style.top = margin + 'px';
          break;
        case 'top-right':
          node.style.right = margin + 'px';
          node.style.top = margin + 'px';
          break;
        case 'bottom-left':
          node.style.left = margin + 'px';
          node.style.bottom = margin + 'px';
          break;
        case 'bottom-right':
          node.style.right = margin + 'px';
          node.style.bottom = margin + 'px';
          break;
        case 'top-center':
          node.style.top = margin + 'px';
          node.style.left = '50%';
          node.style.transform = 'translateX(-50%)';
          break;
        case 'bottom-center':
          node.style.bottom = margin + 'px';
          node.style.left = '50%';
          node.style.transform = 'translateX(-50%)';
          break;
        default:
          node.style.left = margin + 'px';
          node.style.top = margin + 'px';
      }
    }

    function ensure() {
      if (el) return el;
      el = document.createElement('div');
      el.style.cssText = `
        position:fixed; z-index:${zIndex};
        background:rgba(0,0,0,.6); color:#0f0;
        font:12px/1.2 monospace; padding:8px 10px; border-radius:8px;
        pointer-events:none; white-space:pre;`;
      (parent || document.body).appendChild(el);
      applyPosition(el);
      return el;
    }

    function render(dt?: number) {
      const box = ensure();
      // Prefer timeAdapter’s smoothed fps if present
      const t = (usm.context as any).time;
      if (t && typeof t.fps === 'number') {
        fps = t.fps;
      } else if (typeof dt === 'number' && dt > 0) {
        const inst = 1 / dt;
        emaFps = (1 - alpha) * (emaFps || inst) + alpha * inst;
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
      onTransition() { render(); },
      onTick({ dt }) { render(dt); },
      onStart()    { render(); },
      onStop()     { if (el && el.parentNode) el.parentNode.removeChild(el); el = null; },
      // track last event that entered this state (for quick visibility)
      onEnter: ({ evt }) => { lastEvt = evt; render(); }
    };
  });
}