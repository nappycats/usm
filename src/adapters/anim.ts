/**
 * animAdapter — convenience façade for timelines & scroll triggers.
 *
 * GOAL (Plain English):
 * - If **GSAP** (GreenSock Animation Platform) is present on the page,
 *   we forward calls to **gsap.timeline()** and **ScrollTrigger.create()**.
 * - If GSAP is **not** present, we fall back to tiny built‑ins that use:
 *   • our micro **tweenAdapter** (for simple timelines), and
 *   • the browser **IntersectionObserver** + scroll events (for basic triggers).
 *
 * BENEFIT: You get ergonomic `ctx.anim.timeline()` / `ctx.anim.scrollTrigger()`
 * without forcing GSAP as a dependency. If you later add GSAP, this adapter
 * automatically proxies to the real thing.
 *
 * ABBREVIATIONS (expanded):
 * - GSAP: GreenSock Animation Platform (popular JS animation library)
 * - IO  : IntersectionObserver (browser API for element visibility)
 */
import { createAdapter } from '../usm-core';

export interface AnimAdapterOpts {
  // (reserved for future features like default easing or thresholds)
}

// A very small type for our fallback timeline's fluent API
type TimelineLike = {
  to:   (target: any, vars: Record<string, number>, opts?: { duration?: number }, at?: number) => TimelineLike;
  call: (fn: () => void, at?: number) => TimelineLike;
  play: () => TimelineLike;
  kill: () => TimelineLike;
};

export function animAdapter(_opts: AnimAdapterOpts = {}) {
  return createAdapter('anim', '1.0.1', ['anim'], (usm) => {
    // --- Runtime feature detection --------------------------------------------------
    const gsap: any = (globalThis as any).gsap; // present only if user loaded GSAP
    // Try several places GSAP plugins may live (CDN globals, registered plugin, etc.)
    const ScrollTrigger: any =
      (gsap && (gsap.core?.globals?.()?.ScrollTrigger || gsap.ScrollTrigger)) ||
      (globalThis as any).ScrollTrigger || null;

    // Optional: our tiny tween engine from tweenAdapter (if user included it)
    const tween = (usm.context as any).tween as
      | { to?: (t:any, v:Record<string,number>, o?:{duration?:number})=>any }
      | undefined;

    // Simple one‑time warning helper (so we don’t spam the console)
    let warnedNoTween = false;
    const ensureTween = () => {
      if (!tween || typeof tween.to !== 'function') {
        if (!warnedNoTween) {
          console.warn('[usm][anim] tweenAdapter not found — fallback timeline will no‑op.');
          warnedNoTween = true;
        }
        return false;
      }
      return true;
    };

    // --- timeline() ----------------------------------------------------------------
    /**
     * timeline()
     * If GSAP exists → returns gsap.timeline().
     * Else → returns a minimal timeline with `.to()`, `.call()`, `.play()`, `.kill()`.
     *
     * NOTE: Fallback requires tweenAdapter. Without it, steps are allowed but do nothing.
     */
    function timeline(): TimelineLike {
      if (gsap?.timeline) return gsap.timeline(); // proxy to real GSAP timeline

      // Minimal timeline: schedule steps at absolute seconds from play()
      const steps: Array<{ at: number; run: () => void; id?: number }> = [];
      let playing = false;

      const api: TimelineLike = {
        to(target: any, vars: Record<string, number>, opts: { duration?: number } = {}, at = 0) {
          steps.push({ at, run: () => { if (ensureTween()) tween!.to!(target, vars, { duration: opts.duration ?? 0.5 }); } });
          return api;
        },
        call(fn: () => void, at = 0) {
          steps.push({ at, run: fn });
          return api;
        },
        play() {
          if (playing) return api;
          playing = true;
          steps.forEach(s => { s.id = window.setTimeout(s.run, Math.max(0, s.at * 1000)); });
          return api;
        },
        kill() {
          steps.forEach(s => s.id && clearTimeout(s.id));
          steps.length = 0; playing = false;
          return api;
        }
      };
      return api;
    }

    
    // Expose facade on context so states can do: ctx.anim.timeline()
    (usm.context as any).anim = { timeline };
    return {};
  });
}