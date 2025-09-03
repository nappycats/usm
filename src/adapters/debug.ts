/**
 * Debug adapter
 * WHAT: Exposes the USM instance on globalThis so you can poke it from DevTools.
 * WHY : Great for QA demos, quick testing, and live tweaking.
 *
 * Usage in console: __usm.send('START'); __usm.state; __usm.ctx.score = 10;
 */
import { createAdapter, type USM } from '../usm-core';

export interface DebugAdapterOpts {
  /** global variable name to attach (console: window[globalName]) */
  globalName?: string;
  /** how many recent transitions to keep */
  history?: number;
  /** log transitions to console */
  logTransitions?: boolean;
}

export function debugAdapter(
  { globalName = '__usm', history = 50, logTransitions = false }: DebugAdapterOpts = {}
) {
  return createAdapter('debug', '1.0.0', ['debug'], (usm: USM<any>) => {
    const hist: Array<{ time: number; from: string | null; to: string; evt: any }> = [];

    // Attach a tiny helper object to the global scope
    (globalThis as any)[globalName] = {
      machine: usm,
      send: usm.send.bind(usm),
      go: usm.go.bind(usm),
      get state() { return usm.state; },
      get ctx()   { return usm.context; },
      set ctx(p: any) { Object.assign(usm.context as any, p); },
      history: hist
    };

    return {
      onTransition({ from, to, evt }) {
        if (hist.length >= history) hist.shift();
        hist.push({ time: Date.now(), from, to, evt });
        if (logTransitions) console.log('[USM/DEBUG]', from, '→', to, 'on', evt.type);
      }
    };
  });
}