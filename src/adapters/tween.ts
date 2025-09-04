/**
 * Tween adapter (micro tween engine)
 * WHAT: Animate numeric properties over time (no GSAP required).
 * WHY : Quick fades, moves, counters without pulling a big dependency.
 *
 * NEW IN 1.2.0
 * - Pause API: ctx.tween.pauseAll(), resumeAll(), killAll()
 * - Auto time-sync: if ctx.time.isPaused === true (from timeAdapter), tweens freeze
 * - Extras: delay, repeat, yoyo, onStart callbacks
 * - Big Easing set: quad/cubic/quart/quint, sine, expo, circ, back, elastic, bounce
 */

import { createAdapter } from '../usm-core';

// Easing names you'll expose on ctx.tween.EASE
export type EaseName =
  | 'linear'
  | 'quadIn' | 'quadOut' | 'quadInOut'
  | 'cubicIn'| 'cubicOut'| 'cubicInOut'
  | 'quartIn'| 'quartOut'| 'quartInOut'
  | 'quintIn'| 'quintOut'| 'quintInOut'
  | 'sineIn' | 'sineOut' | 'sineInOut'
  | 'expoIn' | 'expoOut' | 'expoInOut'
  | 'circIn' | 'circOut' | 'circInOut'
  | 'backIn' | 'backOut' | 'backInOut'
  | 'elasticIn' | 'elasticOut' | 'elasticInOut'
  | 'bounceIn' | 'bounceOut' | 'bounceInOut';

// Helpers to derive Out/InOut from In versions
const OUT = (fn:(t:number)=>number) => (t:number)=> 1 - fn(1 - t);
const INOUT = (fn:(t:number)=>number) => (t:number)=> t < 0.5 ? 0.5 * fn(t*2) : 1 - 0.5 * fn((1-t)*2);

// Core easing primitives
const quadIn   = (t:number)=> t*t;
const cubicIn  = (t:number)=> t*t*t;
const quartIn  = (t:number)=> t*t*t*t;
const quintIn  = (t:number)=> t*t*t*t*t;
const sineIn   = (t:number)=> 1 - Math.cos((t*Math.PI)/2);
const expoIn   = (t:number)=> (t===0)?0:Math.pow(2, 10*(t-1));
const circIn   = (t:number)=> 1 - Math.sqrt(1 - t*t);
const backIn   = (t:number)=> { const s=1.70158; return t*t*((s+1)*t - s); };
const elasticIn = (t:number)=> {
  if (t===0||t===1) return t;
  const c4 = (2*Math.PI)/3; // period
  return -Math.pow(2,10*t-10)*Math.sin((t*10-10.75)*c4);
};
// Robert Penner's bounce (out), then derive In/InOut
const bounceOut = (t:number)=>{
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1/d1)      return n1*t*t;
  else if (t < 2/d1) return n1*(t-=1.5/d1)*t + .75;
  else if (t < 2.5/d1) return n1*(t-=2.25/d1)*t + .9375;
  return n1*(t-=2.625/d1)*t + .984375;
};

export const EASE: Record<EaseName,(t:number)=>number> = {
  linear: t=>t,
  quadIn,            quadOut: OUT(quadIn),            quadInOut: INOUT(quadIn),
  cubicIn,           cubicOut: OUT(cubicIn),          cubicInOut: INOUT(cubicIn),
  quartIn,           quartOut: OUT(quartIn),          quartInOut: INOUT(quartIn),
  quintIn,           quintOut: OUT(quintIn),          quintInOut: INOUT(quintIn),
  sineIn,            sineOut: OUT(sineIn),            sineInOut: INOUT(sineIn),
  expoIn,            expoOut: OUT(expoIn),            expoInOut: INOUT(expoIn),
  circIn,            circOut: OUT(circIn),            circInOut: INOUT(circIn),
  backIn,            backOut: OUT(backIn),            backInOut: INOUT(backIn),
  elasticIn,         elasticOut: OUT(elasticIn),      elasticInOut: INOUT(elasticIn),
  bounceIn: (t)=> 1 - bounceOut(1-t),
  bounceOut,
  bounceInOut: (t)=> t<.5 ? (1 - bounceOut(1-2*t))/2 : (1 + bounceOut(2*t-1))/2,
};

export interface TweenOpts {
  duration?: number;                 // seconds (default 0.5)
  delay?: number;                    // seconds before starting (default 0)
  ease?: EaseName;                   // easing function
  from?: Partial<Record<string, number>>; // explicit starting values
  repeat?: number;                   // how many times to repeat after first play (default 0)
  yoyo?: boolean;                    // swap from/to on each repeat (default false)
  onStart?: () => void;              // called once when the tween really starts (after delay)
  onUpdate?: () => void;             // called every frame while playing
  onComplete?: () => void;           // called once when finished (after repeats)
}

// Internal job structure (a single tween instance)
type Job = {
  target: any;
  keys: string[];
  from: Record<string,number>;
  to:   Record<string,number>;
  from0: Record<string,number>;   // remember originals for repeats
  to0:   Record<string,number>;
  ease: (t:number)=>number;
  t0: number;                     // start time (seconds, includes delay)
  dur: number;                    // duration (seconds)
  delay: number;                  // delay seconds
  started: boolean;               // onStart fired?
  done: boolean;                  // finished completely?
  paused: boolean;
  pauseAt?: number;               // elapsed when paused
  repeat: number;                 // repeats left
  yoyo: boolean;                  // whether to swap from/to each cycle
  onStart?: ()=>void;
  onUpdate?: ()=>void;
  onComplete?: ()=>void;
  cancel: ()=>void;
};

export function tweenAdapter() {
  return createAdapter('tween', '1.2.0', ['tween'], (usm) => {
    const jobs = new Set<Job>();
    let pausedAll = false;            // global paused flag (pauseAll/resumeAll)
    const time = (usm.context as any).time;  // optional time adapter
    let timeOff: any = null;          // unsubscribe from time.onFrame
    let rafId = 0;                    // fallback RAF id

    const nowSec = () => (typeof performance!=='undefined'?performance.now():Date.now())/1000;

    function startRAFLoop(){
      if (rafId) return;
      const loop = () => { rafId = requestAnimationFrame(loop); tick(); };
      rafId = requestAnimationFrame(loop);
    }
    function stopRAFLoop(){ if (rafId) cancelAnimationFrame(rafId); rafId = 0; }

    function beginCycle(j: Job, base: number){
      // Set the start time including delay from 'base' (usually now)
      j.t0 = base + j.delay;
      j.started = false; // we'll fire onStart when crossing t0
    }

    function completeOrRepeat(j: Job, now: number){
      if (j.repeat > 0){
        j.repeat -= 1;
        if (j.yoyo){
          // swap from/to for the next cycle
          const tmp = j.from; j.from = j.to; j.to = tmp;
        } else {
          // reset to original bounds
          j.from = { ...j.from0 }; j.to = { ...j.to0 };
        }
        beginCycle(j, now); // schedule next cycle after delay
        return false;       // not done yet
      }
      j.done = true;
      j.onComplete?.();
      return true;
    }

    function tick(){
      const timePaused = !!(time && (time.isPaused === true));
      const globallyPaused = pausedAll || timePaused;
      const now = nowSec();

      for (const j of Array.from(jobs)) {
        if (j.done) { jobs.delete(j); continue; }
        if (globallyPaused || j.paused) continue; // frozen

        // not yet started? (respect delay)
        if (now < j.t0) continue;
        if (!j.started){ j.started = true; j.onStart?.(); }

        // progress 0..1
        const t = Math.min(1, (now - j.t0) / j.dur);
        const e = j.ease(t);
        for (const k of j.keys) {
          j.target[k] = j.from[k] + (j.to[k] - j.from[k]) * e;
        }
        j.onUpdate?.();

        if (t >= 1) {
          if (completeOrRepeat(j, now)) jobs.delete(j);
        }
      }
    }

    // Public API: animate numeric props on a target
    function to(target: any, props: Record<string, number>, opts: TweenOpts = {}) {
      const dur   = Math.max(0.0001, opts.duration ?? 0.5);
      const easeF = EASE[opts.ease ?? 'quadInOut'];
      const delay = Math.max(0, opts.delay ?? 0);
      const rep   = Math.max(0, opts.repeat ?? 0);
      const yoyo  = !!opts.yoyo;

      const keys = Object.keys(props);
      const from: Record<string, number> = {};
      const toVals: Record<string, number> = {};
      for (const k of keys) {
        const start = (opts.from && typeof opts.from[k]==='number') ? Number(opts.from[k]) : Number(target[k] ?? 0);
        from[k]   = start;
        toVals[k] = Number(props[k]);
      }

      const job: Job = {
        target,
        keys,
        from,
        to: toVals,
        from0: { ...from },
        to0:   { ...toVals },
        ease: easeF,
        t0: 0,
        dur: dur,
        delay: delay,
        started: false,
        done: false,
        paused: false,
        repeat: rep,
        yoyo: yoyo,
        onStart: opts.onStart,
        onUpdate: opts.onUpdate,
        onComplete: opts.onComplete,
        cancel: ()=>{ job.done = true; jobs.delete(job); }
      };

      beginCycle(job, nowSec());
      jobs.add(job);

      // Handle: returns controls for this tween
      return {
        cancel: job.cancel,
        pause:  () => { if (!job.paused){ job.paused = true; job.pauseAt = (nowSec() - job.t0); } },
        resume: () => { if (job.paused){ job.paused = false; const elapsed = job.pauseAt ?? 0; job.t0 = nowSec() - elapsed; job.pauseAt = undefined; } },
      };
    }

    // Global controls (affects all current tweens)
    function pauseAll(){ pausedAll = true; }
    function resumeAll(){
      const now = nowSec();
      for (const j of jobs) {
        if (!j.done && !j.paused) {
          const prog = Math.min(1, Math.max(0, (now - j.t0) / j.dur));
          j.pauseAt = prog * j.dur;
          j.t0 = now - (j.pauseAt ?? 0);
          j.pauseAt = undefined;
        }
      }
      pausedAll = false;
    }
    function killAll(){ for (const j of Array.from(jobs)) { j.done = true; jobs.delete(j); } }

    // Expose API on context for states: ctx.tween.to(...), ctx.tween.pauseAll(), etc.
    (usm.context as any).tween = {
      to,
      EASE,
      pauseAll,
      resumeAll,
      killAll,
      setPaused: (p:boolean)=> p ? pauseAll() : resumeAll(),
    };

    return {
      onStart(){
        // Prefer timeAdapter if present; otherwise RAF
        if (time?.onFrame && typeof time.onFrame === 'function') {
          timeOff = time.onFrame((_dt:number)=> tick());
        } else {
          startRAFLoop();
        }
      },
      onStop(){
        timeOff?.(); timeOff = null;
        stopRAFLoop();
        killAll();
      }
    };
  });
}