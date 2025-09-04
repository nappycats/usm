/**
 * Scroll adapter (light ScrollTrigger)
 * WHAT: Emit events when sections enter/leave viewport and report page progress.
 * WHY : Animate on scroll without a heavy dependency.
 */
import { createAdapter } from '../usm-core';

export interface ScrollSection {
  el: Element;
  enter?: string;   // event to send when entering
  leave?: string;   // event to send when leaving
}

export interface ScrollAdapterOpts {
  root?: Element | null;      // scrolling container (default viewport)
  sections?: Array<{ selector: string, enter?: string, leave?: string }>;
  progressEvent?: string;     // event name to emit with {progress:0..1}
  throttle?: number;          // ms throttle for progress (default 50)
}

export function scrollAdapter({
  root = null,
  sections = [],
  progressEvent = 'SCROLL_PROGRESS',
  throttle = 50
}: ScrollAdapterOpts = {} ) {
  return createAdapter('scroll','1.0.0',['scroll'], (usm)=>{
    const observed: ScrollSection[] = [];
    let lastSent = 0;

    function sendProgress(){
      const doc = document.documentElement;
      const max = (doc.scrollHeight - doc.clientHeight) || 1;
      const progress = Math.min(1, Math.max(0, window.scrollY / max));
      usm.send({ type: progressEvent!, data: { progress } });
    }

    let io: IntersectionObserver | null = null;

    return {
      onStart(){
        // Sections enter/leave
        if (sections.length) {
          io = new IntersectionObserver((entries)=>{
            for (const e of entries) {
              const s = observed.find(o => o.el === e.target);
              if (!s) continue;
              if (e.isIntersecting && s.enter) usm.send(s.enter);
              else if (!e.isIntersecting && s.leave) usm.send(s.leave);
            }
          }, { root: root as any, threshold: 0.1 });

          for (const spec of sections) {
            document.querySelectorAll(spec.selector).forEach((el)=>{
              const sec = { el, enter: spec.enter, leave: spec.leave };
              observed.push(sec);
              io!.observe(el);
            });
          }
        }

        // Progress
        const onScroll = ()=>{
          const now = performance.now();
          if (now - lastSent > throttle) { lastSent = now; sendProgress(); }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        (usm.context as any).scroll = { sendProgress };
        sendProgress();
      },
      onStop(){
        io?.disconnect(); io = null;
        observed.length = 0;
        (usm.context as any).scroll = undefined;
      }
    };
  });
}