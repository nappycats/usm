/**
 * Time/Loop adapter (enhanced)
 * Adds: pauseOnHidden, sleepFPS, maxCatchUpSteps, fps smoothing (EMA),
 *       nextFrame(), onFrame(), unscaled vs scaled time, provider injection.
 *
 * Abbreviations:
 * - RAF  = requestAnimationFrame (browser frame callback)
 * - EMA  = Exponential Moving Average (simple smoothing filter)
 * - FPS  = Frames Per Second
 */
import { createAdapter } from '../usm-core';

export interface TimeAdapterOpts {
  autoStart?: boolean;          // start loop on USM start
  fixedStep?: number | null;    // e.g. 1/60 for fixed sim; null = variable
  maxDelta?: number;            // clamp dt (sec) (default 0.1)
  speed?: number;               // time scale multiplier
  pauseOnHidden?: boolean;      // auto pause when tab hidden (default true)
  sleepFPS?: number;            // if paused-on-hidden=false, run at low FPS when hidden (e.g., 5)
  maxCatchUpSteps?: number;     // cap fixed-step catch-up per frame (e.g., 5)
  // Providers for non-DOM environments / tests
  nowSeconds?: () => number;    // default: performance.now()/1000
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
  setTimeoutMs?: (cb: () => void, ms: number) => any;
  clearTimeoutId?: (id: any) => void;
}

export function timeAdapter({
  autoStart = true,
  fixedStep = null,
  maxDelta = 0.1,
  speed = 1,
  pauseOnHidden = true,
  sleepFPS = 5,
  maxCatchUpSteps = 5,
  nowSeconds = () =>
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000,
  raf = (cb) => requestAnimationFrame(cb),
  caf = (id) => cancelAnimationFrame(id),
  setTimeoutMs = (cb, ms) => setTimeout(cb, ms),
  clearTimeoutId = (id) => clearTimeout(id),
}: TimeAdapterOpts = {}) {
  return createAdapter('time', '1.1.0', ['loop', 'time'], (usm) => {
    let running = false;
    let last = 0;            // last frame timestamp (sec)
    let acc = 0;             // accumulator for fixedStep
    let rafId = 0;           // RAF handle
    let sleepId: any = null; // setTimeout handle when “sleeping”
    let hidden = false;

    // Observability
    let delta = 0;           // last dt (scaled)
    let unscaledDelta = 0;   // last dt before scaling
    let elapsed = 0;         // accumulated time (scaled)
    let fpsEMA = 60;         // smoothed FPS
    const alpha = 0.1;       // EMA smoothing factor
    const frameListeners = new Set<(dt: number) => void>();
    let framePromiseResolve: (() => void) | null = null;

    function scheduleNext() {
      // If using “sleep FPS” while hidden, emulate frames with setTimeout
      if (hidden && !pauseOnHidden && sleepFPS > 0) {
        const ms = Math.max(1, 1000 / sleepFPS);
        sleepId = setTimeoutMs(() => frame(nowSeconds()), ms);
      } else {
        rafId = raf((tMs) => frame(tMs / 1000));
      }
    }

    function clearScheduled() {
      if (sleepId != null) { clearTimeoutId(sleepId); sleepId = null; }
      if (rafId) { caf(rafId); rafId = 0; }
    }

    function frame(nowSec: number) {
      if (!running) return;
      scheduleNext();

      if (!last) { last = nowSec; return; }

      // Compute dt, clamp, capture unscaled
      let raw = Math.max(0, nowSec - last);
      if (raw > maxDelta) raw = maxDelta;
      last = nowSec;

      unscaledDelta = raw;
      delta = raw * speed;
      elapsed += delta;

      // FPS smoothing uses unscaled dt (closer to “real” frame pacing)
      const instantFps = raw > 0 ? 1 / raw : 0;
      fpsEMA = (1 - alpha) * fpsEMA + alpha * instantFps;

      // Fixed or variable stepping
      if (fixedStep && fixedStep > 0) {
        acc += delta;
        let steps = 0;
        while (acc >= fixedStep && steps < maxCatchUpSteps) {
          usm.tick(fixedStep);
          for (const fn of frameListeners) fn(fixedStep);
          steps++;
          acc -= fixedStep;
        }
        // If we exceeded the cap, drop the remainder to avoid “spiral of death”
        if (steps >= maxCatchUpSteps) acc = 0;
      } else {
        usm.tick(delta);
        for (const fn of frameListeners) fn(delta);
      }

      // Resolve nextFrame() if someone awaited it
      framePromiseResolve?.(); framePromiseResolve = null;
    }

    function start() {
      if (running) return;
      running = true;
      last = 0;
      scheduleNext();
    }
    function stop() {
      running = false;
      clearScheduled();
      (usm.context as any).time.clear(); // clear timers (defined below)
    }
    function pause() { running = false; clearScheduled(); }
    function resume() { if (!running) { running = true; scheduleNext(); } }

    // Token-safe timers (auto-ignored after state transition)
    const timers = new Set<() => void>();
    function after(ms: number, cbOrEvt: string | ((api: { send: (t: string, d?: any) => void }) => void)) {
      const token = usm.token;
      const id = setTimeoutMs(() => {
        timers.delete(cancel);
        if (!usm.isCurrent(token)) return;
        if (typeof cbOrEvt === 'string') usm.send(cbOrEvt);
        else cbOrEvt({ send: usm.send.bind(usm) });
      }, ms);
      const cancel = () => clearTimeoutId(id);
      timers.add(cancel);
      return cancel;
    }
    function every(ms: number, cbOrEvt: string | ((api: { send: (t: string, d?: any) => void }) => void)) {
      const token = usm.token;
      const id = setInterval(() => {
        if (!usm.isCurrent(token)) return;
        if (typeof cbOrEvt === 'string') usm.send(cbOrEvt);
        else cbOrEvt({ send: usm.send.bind(usm) });
      }, ms);
      const cancel = () => clearInterval(id);
      timers.add(cancel);
      return cancel;
    }
    function clearAllTimers() { for (const c of timers) c(); timers.clear(); }

    // Expose API on ctx.time
    (usm.context as any).time = {
      start, stop, pause, resume,
      isRunning: () => running,
      setSpeed: (s: number) => { speed = Math.max(0, s); },
      get speed() { return speed; },
      setFixedStep: (s: number | null) => { fixedStep = s; acc = 0; },
      get fixedStep() { return fixedStep; },
      now: nowSeconds,
      // Observability
      get delta() { return delta; },
      get unscaledDelta() { return unscaledDelta; },
      get elapsed() { return elapsed; },
      get fps() { return fpsEMA; },
      // Timers
      after, every, clear: clearAllTimers,
      // Frame subscriptions/promises
      onFrame(fn: (dt: number) => void) { frameListeners.add(fn); return () => frameListeners.delete(fn); },
      nextFrame(): Promise<void> { return new Promise(res => { framePromiseResolve = res; }); },
    };

    function visChange() {
      hidden = typeof document !== 'undefined' && document.hidden;
      if (pauseOnHidden) {
        if (hidden) pause(); else resume();
      }
    }

    return {
      onStart() {
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', visChange);
          hidden = document.hidden;
        }
        if (autoStart) start();
      },
      onStop() {
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', visChange);
        }
        stop();
      },
      // When entering a new state, tokens change, and stale timers auto-ignore.
      // If you want hard cleanup on each state switch, uncomment below:
      // onEnter(){ clearAllTimers(); }
    };
  });
}