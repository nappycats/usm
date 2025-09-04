/**
 * Text adapter
 * WHAT: Typewriter effect and numeric counters for HUD/labels.
 * NOTE: If timeAdapter is present, we drive updates from it (so pause/resume works);
 *       otherwise we fall back to requestAnimationFrame. No hard dependency on time.ts.
 */
import { createAdapter } from '../usm-core';

export interface TypeOpts { speed?: number; cursor?: string; }
export interface CountOpts { duration?: number; decimals?: number; }

export function textAdapter(){
  return createAdapter('text','1.1.0',['text'], (usm)=>{
    const running = new Set<() => void>();

    // Small scheduler that prefers the time adapter if available
    function schedule(loop: (dt:number)=>void){
      const time = (usm.context as any).time;
      if (time?.onFrame) {
        // timeAdapter exposes onFrame(cb) and returns an unsubscribe
        const off = time.onFrame((dt:number)=>loop(dt));
        const stop = ()=>{ try{ off?.(); }catch{} };
        running.add(stop); return stop;
      }
      // Fallback: RAF
      let alive = true; let last = (typeof performance!=='undefined'?performance.now():Date.now())/1000; let id = 0;
      const tick = ()=>{
        if (!alive) return; id = requestAnimationFrame(tick);
        const now = (typeof performance!=='undefined'?performance.now():Date.now())/1000;
        const dt = Math.min(0.1, Math.max(0, now-last)); last = now;
        loop(dt);
      };
      id = requestAnimationFrame(tick);
      const stop = ()=>{ alive=false; cancelAnimationFrame(id); };
      running.add(stop); return stop;
    }

    /**
     * Typewriter: writes `text` into all nodes matching `sel`.
     * speed = characters per second (default 40).
     */
    function type(sel: string, text: string, { speed=40, cursor='▌' }: TypeOpts = {}){
      const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
      els.forEach(el => el.textContent = '');
      let i = 0; let acc = 0; // accumulated characters
      const stop = schedule((dt)=>{
        acc += dt * Math.max(1, speed);
        const next = Math.min(text.length, Math.floor(acc));
        if (next !== i) {
          i = next;
          const done = i >= text.length;
          const out = done ? text : (text.slice(0,i) + cursor);
          els.forEach(el => el.textContent = out);
          if (done) { stop(); running.delete(stop); }
        }
      });
      return stop; // allow manual cancel
    }

    /**
     * Count: animates a number from 0 to `to` over `duration` seconds.
     */
    function count(sel: string, to: number, { duration=0.7, decimals=0 }: CountOpts = {}){
      const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
      let t = 0; const d = Math.max(0.0001, duration);
      const ease = (x:number)=> x<.5? 2*x*x : 1 - Math.pow(-2*x+2,2)/2; // quadInOut
      const stop = schedule((dt)=>{
        t = Math.min(1, t + dt/d);
        const v = to * ease(t);
        const s = v.toFixed(decimals);
        els.forEach(el => el.textContent = s);
        if (t >= 1) { stop(); running.delete(stop); }
      });
      return stop;
    }

    (usm.context as any).text = { type, count };

    return { onStop(){ running.forEach(fn=>fn()); running.clear(); } };
  });
}