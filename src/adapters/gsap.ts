/**
 * GSAP adapter
 * WHAT: Exposes GSAP helpers on context and optionally pauses/resumes on start/stop.
 * WHY : Central place to use timelines/tweens from any state without importing GSAP everywhere.
 *
 * Acronyms:
 * - GSAP: GreenSock Animation Platform (animation library)
 * - API : Application Programming Interface (functions you call)
 */
import { createAdapter, type USM } from '../usm-core';

export interface GsapAdapterOpts {
  /** Attach helpers to ctx.gsap? (true = expose) */
  expose?: boolean;
  /** Pause GSAP's global timeline on usm.stop() and resume on .start()? */
  pauseOnStop?: boolean;
}

export function gsapAdapter({ expose = true, pauseOnStop = false }: GsapAdapterOpts = {}) {
  return createAdapter('gsap', '1.0.0', ['animation'], (usm: USM<any>) => {
    const gsap = (globalThis as any).gsap;
    if (!gsap) {
      console.warn(`[${usm.id}] gsapAdapter: GSAP not found on window.gsap. Include it before USM.`);
      return {};
    }

    // Expose a small, typed surface so states can animate without re-importing GSAP
    if (expose) {
      (usm.context as any).gsap = {
        gsap,
        timeline: (...args: any[]) => gsap.timeline(...args),
        to: gsap.to.bind(gsap),
        from: gsap.from.bind(gsap),
        fromTo: gsap.fromTo.bind(gsap),
        set: gsap.set.bind(gsap),
        killTweensOf: gsap.killTweensOf.bind(gsap),
        ticker: gsap.ticker
      };
    }

    return {
      onStart() {
         if (pauseOnStop) gsap.globalTimeline.play();
      },
      onStop()  { 
        if (pauseOnStop) gsap.globalTimeline.pause(); 
      }
    };
  });
}