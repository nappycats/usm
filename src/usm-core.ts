/**
 * USM (Universal State Machine) – Core (TypeScript)
 * License: MIT
 *
 * GOAL (plain English):
 * A tiny, predictable finite-state machine (FSM) you can use for games,
 * 3D sites, and apps. It focuses on *clarity* and *adaptability*.
 *
 * ABBREVIATIONS (full meanings):
 * - FSM  : Finite-State Machine (a system that is always in exactly one state)
 * - API  : Application Programming Interface (the public functions you call)
 * - ESM  : ECMAScript Modules (modern import/export JavaScript modules)
 * - CJS  : CommonJS (Node.js-style require modules)
 * - UMD  : Universal Module Definition (IIFE that exposes a browser global)
 * - DPR  : Device Pixel Ratio (ratio between physical and CSS pixels; higher DPR = sharper)
 */

// ───────────────────────────────────────────────────────────────────────────────
// Types (generic over C = your Context object)
// Your Context "C" is anything you want to share across states (scene, score, etc.)
// ───────────────────────────────────────────────────────────────────────────────

/** A USM event always has a "type" string and may carry data. */
export type USMEvent<D = unknown> = { type: string; data?: D };

/** An action is a side-effect performed during transitions or lifecycle hooks. */
export type USMAction<C> = (ctx: C, evt: USMEvent, api: USMApi<C>) => void;

/** A guard decides if a transition is allowed to happen. Return true to allow. */
export type USMGuard<C> = (ctx: C, evt: USMEvent, api: USMApi<C>) => boolean;

/** A transition can be a string (target state) or an object with target/action/guard. */
export type USMTransition<C> =
  | string
  | { target: string; action?: USMAction<C>; guard?: USMGuard<C> };

/** State node definition: optional enter/exit/tick hooks + event map. */
export type USMStateNode<C> = {
  /** Called once when the state is entered. Use for setup/animations. */
  enter?: USMAction<C>;
  /** Called once when the state is exited. Use for cleanup. */
  exit?: USMAction<C>;
  /** Called on each tick (e.g., per frame). Use for gameplay loops. */
  tick?: (dt: number, ctx: C, api: USMApi<C>) => void;
  /**
   * Event handlers:
   * - Key = event type string (e.g., 'START', 'PAUSE')
   * - Value = transition (string target or object) OR a function returning a transition
   */
  on?: Record<string, USMTransition<C> | ((ctx: C, evt: USMEvent, api: USMApi<C>) => USMTransition<C>)>;
};

/** The API we hand to your actions/guards to safely interact with the machine. */
export interface USMApi<C> {
  /** Send an event by type string (e.g., api.send('PAUSE')). */
  send: (type: string, data?: unknown) => void;
  /** Jump directly to a target state (discouraged for most cases; prefer events). */
  go: (target: string, evt?: USMEvent) => void;
  /** Merge a partial object into context (immutable-ish convenience). */
  setContext: (partial: Partial<C>) => void;
  /** Current state name. */
  readonly state: string;
  /**
   * Token is incremented on each state enter. Used to avoid async races:
   * if (!api.isCurrent(token)) abort your async work.
   */
  token: number;
  /** Check if a saved token still refers to the current state. */
  isCurrent: (token: number) => boolean;
}

/** Adapter hooks (lifecycle). Adapters add platform glue (resize, input...). */
export type USMAdapterHooks = {
  onStart?(): void;
  onStop?(): void;
  onEnter?(args: { state: string; evt: USMEvent; token: number }): void;
  onExit?(args: { state: string; evt: USMEvent }): void;
  onTransition?(args: { from: string | null; to: string; evt: USMEvent }): void;
  onTick?(args: { dt: number }): void;
  /** Debug metadata for logging/diagnostics */
  __name?: string;
  __version?: string;
  __capabilities?: string[];
};

/** Adapter factory. We accept a factory so adapters can see the USM instance. */
export type USMAdapterFactory<C = any> = (usm: USM<C>) => USMAdapterHooks;

/** USM constructor options. */
export interface USMConfig<C> {
  /** Debugging name for logs. */
  id?: string;
  /** State to begin in when you call start(). */
  initial: string;
  /** All state nodes in your machine. */
  states: Record<string, USMStateNode<C>>;
  /** Shared data bag available to all states and adapters. */
  context?: C;
  /** Platform glue added at construction (resize, input, ui...). */
  adapters?: Array<(usm: USM<C>) => USMAdapterHooks>;
  /** If true, logs transitions to the console. */
  log?: boolean;
  /** Optional user hook on every transition. */
  onTransition?(info: { from: string | null; to: string; evt: USMEvent; ctx: C }): void;
}

// ───────────────────────────────────────────────────────────────────────────────
// Helper: createAdapter
// WHY: standardize adapter metadata and lifecycle without forcing a base class.
// ───────────────────────────────────────────────────────────────────────────────

export function createAdapter<C = any>(
  name: string,
  version = '1.0.0',
  capabilities: string[] = [],
  factory: USMAdapterFactory<C> = () => ({})
) {
  return (usm: USM<C>): USMAdapterHooks => {
    const hooks = factory(usm) || {};
    hooks.__name = name;
    hooks.__version = version;
    hooks.__capabilities = capabilities;
    return hooks;
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Class: USM
// Implements a minimal, robust FSM with enter/exit/tick and event routing.
// ───────────────────────────────────────────────────────────────────────────────

export class USM<C = any> {
  public id: string;
  public initial: string;
  public states: Record<string, USMStateNode<C>>;
  public context: C;
  public adapters: USMAdapterHooks[];
  public log: boolean;
  public onTransition?: (info: { from: string | null; to: string; evt: USMEvent; ctx: C }) => void;

  private _state: string | null = null;
  private _run = false;
  private _token = 0;

  constructor(config: USMConfig<C>) {
    this.id       = config.id || 'usm';
    this.initial  = config.initial;
    this.states   = config.states;
    if (!this.states[this.initial]) throw new Error(`[${this.id}] initial state "${this.initial}" not found`);
    this.context      = (config.context || {}) as C;
    this.onTransition = config.onTransition;
    this.log          = !!config.log;
    this.adapters     = (config.adapters || []).map(f => f(this));
  }

  /** Current state name (or null before start). */
  get state(): string | null { return this._state; }
  /** Whether the machine has been started. */
  get started(): boolean { return this._run; }

  /** Public read-only token that increments on every state ENTER. */
  get token(): number { return this._token; }

  /**
   * Check if a previously captured token still matches the current state-entry token.
   * Use this to ignore late async work (fetches, timers) after a state change.
   */
  isCurrent(token: number): boolean { return token === this._token; }

  /** Begin the machine: calls onStart hooks and enters the initial state. */
  start(evt: USMEvent = { type: '@START' }): void {
    if (this._run) return;
    this._run = true;
    this._call('onStart', evt);
    this._enter(this.initial, evt);
  }

  /** Stop the machine: calls onStop hooks and exits the current state. */
  stop(evt: USMEvent = { type: '@STOP' }): void {
    if (!this._run) return;
    this._call('onStop', evt);
    this._exit(this._state, evt);
    this._run = false;
  }

  /**
   * Send an event into the current state.
   * - We look up an event handler in the state's `on` table.
   * - The handler resolves to a target (and optional guard/action).
   * - If guard passes, we run the action, then transition to target.
   */
  send(event: USMEvent | string, data?: unknown): void {
    const evt: USMEvent = typeof event === 'string' ? { type: event, data } : (event || { type: '?' });
    const def = this.states[this._state as string];
    const rule = def?.on?.[evt.type];
    if (!rule) return;

    const resolved: USMTransition<C> =
      typeof rule === 'function'
        ? rule(this.context, evt, this._api())
        : (typeof rule === 'string' ? { target: rule } : rule);

    if (!resolved || typeof (resolved as any).target !== 'string') return;
    const obj = resolved as Exclude<USMTransition<C>, string>;

    if (obj.guard && !obj.guard(this.context, evt, this._api())) return;
    obj.action?.(this.context, evt, this._api());
    this._transition(obj.target, evt);
  }

  /** Call on each frame/tick; forwards to current state's `tick`. */
  tick(dt: number): void {
    this.states[this._state as string]?.tick?.(dt, this.context, this._api());
    this._call('onTick', { dt });
  }

  /** Imperatively jump to a target state (rarely needed; events are better). */
  go(target: string, evt: USMEvent = { type: '@GO' }): void {
    this._transition(target, evt);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────────────────────

  private _transition(target: string, evt: USMEvent): void {
    if (!this.states[target]) return console.warn(`[${this.id}] Unknown state "${target}"`);
    const from = this._state;
    if (from === target) return; // no-op

    this._exit(from, evt);
    this._enter(target, evt);

    this.onTransition?.({ from, to: target, evt, ctx: this.context });
    this._call('onTransition', { from, to: target, evt });
    if (this.log) console.log(`[${this.id}] ${from} → ${target} on ${evt.type}`);
  }

  private _enter(stateName: string, evt: USMEvent): void {
    this._state = stateName;
    this._token++;
    this._call('onEnter', { state: stateName, evt, token: this._token });
    this.states[stateName]?.enter?.(this.context, evt, this._api(this._token));
  }

  private _exit(stateName: string | null, evt: USMEvent): void {
    if (!stateName) return;
    this._call('onExit', { state: stateName, evt });
    this.states[stateName]?.exit?.(this.context, evt, this._api());
  }

  private _call(hook: keyof USMAdapterHooks, arg: any): void {
    for (const a of this.adapters) (a as any)[hook]?.(arg);
  }

  /** Build the API object we pass to actions/guards. */
  private _api(validToken?: number): USMApi<C> {
    const self = this;
    return {
      send: (t, d) => self.send(t, d),
      go:   (t, e) => self.go(t, e),
      setContext(partial) { Object.assign(self.context as any, partial); },
      get state() { return self._state as string; },
      token: validToken ?? self._token,
      isCurrent(token) { return token === self._token; }
    };
  }
}
