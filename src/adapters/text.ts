/**
 * Text adapter
 * WHAT: Typewriter, numeric counters, and "scramble" (hacker text) effects for DOM labels/HUD.
 * WHY : Common UI text animations without pulling a large dependency — pause-aware if timeAdapter exists.
 *
 * ABBREVIATIONS (expanded):
 * - HUD  : Heads-Up Display (onscreen info overlay)
 * - RAF  : requestAnimationFrame (browser per-frame callback)
 * - dt   : delta-time (seconds elapsed between frames)
 */
import { createAdapter } from '../usm-core';

// OPTIONS ---------------------------------------------------------------------
export interface TypeOpts {
  /** characters per second (default 40) */
  speed?: number;
  /** cursor glyph displayed while typing (default ▌). Set to '' for none. */
  cursor?: string;
  /** keep cursor visible after completion (default false). */
  keepCursor?: boolean;
  /** delay before typing starts, in seconds (default 0). */
  startDelay?: number;
  /** callback fired for each committed character */
  onChar?: (ch: string, index: number) => void;
}

export interface CountOpts {
  /** animation duration in seconds (default 0.7) */
  duration?: number;
  /** fractional digits to display (default 0) */
  decimals?: number;
  /** start value (default 0) */
  from?: number;
  /** optional prefix (e.g., '$') */
  prefix?: string;
  /** optional suffix (e.g., ' pts') */
  suffix?: string;
  /** custom formatter; if provided, `decimals/prefix/suffix` are ignored */
  format?: (value: number) => string;
}

export interface ScrambleOpts {
  /** characters per second to reveal (default 30) */
  speed?: number;
  /** pool of characters used while scrambling */
  charset?: string;
  /** delay before scrambling starts (s) */
  startDelay?: number;
}

// DEFAULTS --------------------------------------------------------------------
const DEFAULT_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';

export function textAdapter(){
  return createAdapter('text','1.2.1',['text'], (usm)=>{
    // A set of active cancellers so we can stop everything on adapter stop
    const running = new Set<() => void>();

    // Small scheduler that prefers the time adapter if available so pause/resume works
    function schedule(loop: (dt:number)=>void){
      const time = (usm.context as any).time; // optional time adapter
      if (time?.onFrame) {
        const off = time.onFrame((dt:number)=>loop(dt));
        const stop = ()=>{ try{ off?.(); }catch{} };
        running.add(stop); return stop;
      }
      // Fallback to RAF if no time adapter
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

    // UTIL helpers -------------------------------------------------------------
    const qAll = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));

    // TYPEWRITER ---------------------------------------------------------------
    /**
     * Typewriter: writes `text` into all nodes matching `sel` at `speed` chars/sec.
     * Returns a cancel function you can call to stop early.
     */
    function type(sel: string, text: string, opts: TypeOpts = {}){
      const { speed=40, cursor='▌', keepCursor=false, startDelay=0, onChar } = opts;
      const els = qAll(sel);
      els.forEach(el => el.textContent = '');

      let i = 0;           // number of committed characters
      let acc = 0;         // accumulated chars (float; we commit floor(acc))
      let delay = Math.max(0, startDelay);

      const stop = schedule((dt)=>{
        // wait out the initial delay first
        if (delay > 0) { delay = Math.max(0, delay - dt); return; }

        acc += dt * Math.max(1, speed);
        const next = Math.min(text.length, Math.floor(acc));

        if (next !== i) {
          const slice = text.slice(i, next);
          // per-char callback
          if (onChar) {
            for (let k=0; k<slice.length; k++) onChar(slice[k], i + k);
          }
          i = next;
          const done = i >= text.length;
          const out  = done ? text + (keepCursor && cursor ? cursor : '')
                            : text.slice(0,i) + (cursor || '');
          els.forEach(el => el.textContent = out);
          if (done) { stop(); running.delete(stop); }
        }
      });
      return stop; // allow manual cancel
    }

    // COUNTER ------------------------------------------------------------------
    /**
     * Count: animates a number from `from` to `to` over `duration` seconds
     * using a pleasant quadratic in/out ease.
     */
    function count(sel: string, to: number, opts: CountOpts = {}){
      const { duration=0.7, decimals=0, from=0, prefix='', suffix='', format } = opts;
      const els = qAll(sel);
      let t = 0; const d = Math.max(0.0001, duration);
      const ease = (x:number)=> x<.5? 2*x*x : 1 - Math.pow(-2*x+2,2)/2; // quadInOut

      const stop = schedule((dt)=>{
        t = Math.min(1, t + dt/d);
        const v = from + (to - from) * ease(t);
        const str = format ? format(v) : `${prefix}${v.toFixed(decimals)}${suffix}`;
        els.forEach(el => el.textContent = str);
        if (t >= 1) { stop(); running.delete(stop); }
      });
      return stop;
    }

    // SCRAMBLE -----------------------------------------------------------------
    /**
     * Scramble: progressively reveals final `text` while uncommitted letters
     * flicker with random characters from `charset`.
     */
    function scramble(sel: string, text: string, opts: ScrambleOpts = {}){
      const { speed=30, charset=DEFAULT_CHARSET, startDelay=0 } = opts;
      const els = qAll(sel);

      // Guard: no targets found — warn once and no-op with a cancel function
      if (!els.length) {
        console.warn('[usm][text.scramble] No elements match selector:', sel);
        return () => {};
      }

      // If charset is empty, fall back to a safe default so we always show something
      const pool = (charset && charset.length) ? charset : DEFAULT_CHARSET;

      // Show an immediate initial scrambled string (so users see something right away)
      let initial = '';
      for (let k=0; k<text.length; k++) initial += pool.charAt(Math.floor(Math.random()*pool.length)) || '';
      els.forEach(el => el.textContent = initial);

      let reveal = 0;              // number of final characters revealed
      let acc = 0;                 // fractional progress towards next reveal
      let delay = Math.max(0, startDelay);

      const randCh = () => pool.charAt(Math.floor(Math.random()*pool.length)) || '';

      const stop = schedule((dt)=>{
        // Respect initial delay before starting the reveal
        if (delay > 0) { delay = Math.max(0, delay - dt); return; }

        // Advance reveal count by speed (chars/sec)
        acc += dt * Math.max(1, speed);
        const next = Math.min(text.length, Math.floor(acc));
        if (next !== reveal) reveal = next;

        const committed = text.slice(0, reveal);
        const remaining = text.length - reveal;

        // Build a scrambled tail of the same length as the remaining characters
        // We regenerate the tail every frame for a lively flicker effect.
        let tail = '';
        for (let k=0; k<remaining; k++) tail += randCh();

        const out = committed + tail;
        els.forEach(el => el.textContent = out);

        // When fully revealed, set the exact final text once and stop
        if (reveal >= text.length) {
          els.forEach(el => el.textContent = text);
          stop(); running.delete(stop);
        }
      });

      return stop; // allow manual cancel
    }

    // Simple helpers -----------------------------------------------------------
    function set(sel: string, text: string){ qAll(sel).forEach(el => el.textContent = text); }
    function clear(sel: string){ qAll(sel).forEach(el => el.textContent = ''); }

    // Expose API on context
    (usm.context as any).text = { type, count, scramble, set, clear };

    // Cleanup: stop all active jobs when adapter stops
    return { onStop(){ running.forEach(fn=>fn()); running.clear(); } };
  });
}