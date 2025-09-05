/**
 * transitionsAdapter
 * A tiny registry + runner for page/scene transition effects.
 * It prefers tweenAdapter (pause-aware), falls back to CSS transitions,
 * and can optionally use the fader adapter for blackout cuts.
 */

import { createAdapter } from '../usm-core';

// ------------------------- Types -------------------------
export type TransitionName = 'none' | 'fade' | 'slide' | 'fader' | (string & {});

export interface TransitionOptions {
  from?: HTMLElement | null;           // outgoing element (may be null on first show)
  to: HTMLElement;                      // incoming element (must exist)
  direction?: 'left'|'right'|'up'|'down';
  duration?: number;                    // seconds
  ease?: string;                        // tween/CSS ease name
  overlayColor?: string;                // for 'fader' effect
}

export type TransitionEffect = (ctx: any, opts: TransitionOptions) => Promise<void> | void;

export interface TransitionsOpts {
  default?: string;        // 'fade' | 'slide' | 'none' | 'fader' | 'flip' | ...
  duration?: number;       // seconds
  ease?: string;           // tween ease name
  reducedMotion?: 'respect' | 'ignore'; // obey prefers-reduced-motion
}

export function transitionsAdapter(opts: TransitionsOpts = {}) {
  const DEFAULT = opts.default ?? 'fade';
  const D = opts.duration ?? 0.35;
  const E = opts.ease ?? 'quadInOut';
  const RM = opts.reducedMotion ?? 'respect';

  return createAdapter('transitions','1.0.1',['ui','transitions'], (usm) => {
    // Simple registry
    const registry = new Map<string, (o: TransitionOptions) => Promise<void>>();

    // Helpers ---------------------------------------------------------------
    const prefersReduced = () =>
      RM === 'respect' && typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const tween = () => (usm.context as any).tween as
      | { to?: (t:any, v:Record<string,number>, o?:{ duration?: number; ease?: string; onUpdate?: ()=>void; onComplete?: ()=>void })=>any }
      | undefined;

    function cssAnimate(el: HTMLElement, prop: 'opacity'|'transform', endValue: string, seconds: number, ease = 'ease') {
      return new Promise<void>((resolve) => {
        const done = () => { el.removeEventListener('transitionend', done); resolve(); };
        el.style.transition = `${prop} ${Math.max(0, seconds)}s ${ease}`;
        // ensure a start frame
        (el as any).offsetHeight; // force reflow
        requestAnimationFrame(() => {
          el.addEventListener('transitionend', done);
          (el.style as any)[prop] = endValue;
          if (seconds <= 0) Promise.resolve().then(done);
        });
      });
    }

    // Built-in: none --------------------------------------------------------
    registry.set('none', async ({ from, to }) => {
      if (from) { from.style.display = 'none'; from.style.opacity = '0'; from.style.transform = ''; }
      to.style.display = ''; to.style.opacity = '1'; to.style.transform = '';
    });

    // Built-in: fade --------------------------------------------------------
    registry.set('fade', async ({ from, to, duration = D, ease = E }) => {
      if (!to) return; // nothing to show
      // Reduced motion → instant
      if (prefersReduced()) return registry.get('none')!({ from, to });

      const tw = tween();
      to.style.display = ''; to.style.pointerEvents = 'none';

      if (tw?.to) {
        // tween path
        const inS = { o: 0 }, outS = { o: 1 };
        const jobs: Promise<void>[] = [];
        jobs.push(new Promise<void>(res => tw.to!(inS, { o: 1 }, {
          duration, ease,
          onUpdate: () => { to.style.opacity = String(inS.o); },
          onComplete: () => { to.style.opacity = '1'; res(); }
        })));
        if (from) jobs.push(new Promise<void>(res => tw.to!(outS, { o: 0 }, {
          duration, ease,
          onUpdate: () => { from.style.opacity = String(outS.o); },
          onComplete: () => { from.style.opacity = '0'; from.style.display = 'none'; res(); }
        })));
        await Promise.all(jobs);
      } else {
        // CSS fallback
        to.style.opacity = '0';
        await Promise.all([
          cssAnimate(to, 'opacity', '1', duration, ease),
          from ? (from.style.opacity='1', cssAnimate(from, 'opacity','0', duration, ease).then(()=>{ from.style.display='none'; })) : Promise.resolve()
        ]);
      }

      to.style.pointerEvents = '';
    });

    // Built-in: slide -------------------------------------------------------
    registry.set('slide', async ({ from, to, direction = 'left', duration = D, ease = E }) => {
      if (!to) return;
      if (prefersReduced()) return registry.get('none')!({ from, to });
      const axis = (direction === 'left' || direction === 'right') ? 'X' : 'Y';
      const signIn  = (direction === 'left' || direction === 'up') ? 1 : -1;
      const signOut = (direction === 'left' || direction === 'up') ? -1 : 1;
      const off = 100;

      const tw = tween();
      to.style.display = ''; to.style.opacity='1'; to.style.pointerEvents='none';
      to.style.transform = axis==='X' ? `translateX(${signIn*off}%)` : `translateY(${signIn*off}%)`;

      if (tw?.to) {
        const inS = { t: signIn*off }; const outS = { t: 0 };
        const jobs: Promise<void>[] = [];
        jobs.push(new Promise<void>(res => tw.to!(inS, { t: 0 }, {
          duration, ease,
          onUpdate: () => { to.style.transform = axis==='X' ? `translateX(${inS.t}%)` : `translateY(${inS.t}%)`; },
          onComplete: () => { to.style.transform = ''; res(); }
        })));
        if (from) jobs.push(new Promise<void>(res => tw.to!(outS, { t: signOut*off }, {
          duration, ease,
          onUpdate: () => { from.style.transform = axis==='X' ? `translateX(${outS.t}%)` : `translateY(${outS.t}%)`; },
          onComplete: () => { from.style.transform=''; from.style.display='none'; res(); }
        })));
        await Promise.all(jobs);
      } else {
        await Promise.all([
          cssAnimate(to, 'transform', axis==='X' ? 'translateX(0%)' : 'translateY(0%)', duration, ease),
          from ? cssAnimate(from, 'transform', axis==='X' ? `translateX(${signOut*off}%)` : `translateY(${signOut*off}%)`, duration, ease)
                .then(()=>{ from.style.transform=''; from.style.display='none'; }) : Promise.resolve()
        ]);
      }

      to.style.pointerEvents = '';
    });

    // Built-in: fader (black cut using ctx.fader) ----------------------------
    registry.set('fader', async ({ from, to, duration = D, ease = E, overlayColor = '#000' }) => {
      if (!to) return;
      const fader = (usm.context as any).fader;
      if (!fader?.fadeBetween) {
        // fallback to normal fade if no fader installed
        return registry.get('fade')!({ from, to, duration, ease });
      }
      try { fader.setColor?.(overlayColor); } catch {}
      await fader.fadeBetween(duration, () => {
        if (from) { from.style.display='none'; from.style.opacity='0'; from.style.transform=''; }
        to.style.display=''; to.style.opacity='1'; to.style.transform='';
      }, duration, ease);
    });

    // Public API -------------------------------------------------------------
    (usm.context as any).transitions = {
      /** run a transition by name */
      play: async (name: TransitionName, o: TransitionOptions) => {
        const fx = registry.get(name) || registry.get(DEFAULT) || registry.get('none')!;
        return fx(o);
      },
      /** add/override a transition by name */
      register: (name: TransitionName, fx: TransitionEffect) => { registry.set(name, (o)=>Promise.resolve(fx(usm.context, o)) as Promise<void>); },
      /** list available transitions */
      list: () => Array.from(registry.keys()),
      /** defaults */
      defaults: { name: DEFAULT, duration: D, ease: E }
    };

    return {};
  });
}
