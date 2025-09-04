/**
 * Keyboard adapter
 * WHAT: Listens to keydown/keyup and exposes a tiny input API on ctx.input
 * WHY : Keep DOM listeners out of your game logic and send USM events cleanly.
 *
 * Features:
 * - `bindings`: map KeyboardEvent.code -> event name OR handler function
 * - `ctx.input.isDown(code)` and `ctx.input.keysDown` Set
 * - Optional preventDefault per key or all keys
 * - Works on `window` or a specific element (e.g., canvas)
 *
 * NOTE on codes: prefer KeyboardEvent.code (e.g., "Space", "KeyQ", "ArrowUp")
 * because it's layout-stable compared to `event.key`.
 */

import { createAdapter, type USM } from '../usm-core';

export type KeyHandler<C = any> =
  | string // event name to send
  | ((ctx: C, e: KeyboardEvent, api: { send: (type: string, data?: unknown) => void }) => void);

export interface KeyboardAdapterOpts<C = any> {
  target?: Window | HTMLElement;         // default: window
  preventDefault?: boolean | string[];   // true=all keys; array=codes to block
  bindings?: Record<string, KeyHandler<C>>; // e.g., { Space:"START", KeyQ:"QUIT" }
  emitRepeat?: boolean;                   // fire on keydown auto-repeat? default false
}

export function keyboardAdapter<C = any>({
  target,
  preventDefault = false,
  bindings = {},
  emitRepeat = false,
}: KeyboardAdapterOpts<C> = {}) {
  return createAdapter('keyboard', '1.0.0', ['input', 'keyboard'], (usm: USM<C>) => {
    const el: Window | HTMLElement = target || window;
    const keysDown = new Set<string>();           // currently held
    const blockAll = preventDefault === true;
    const blockSome = Array.isArray(preventDefault) ? new Set(preventDefault) : null;

    // Tiny helper to decide preventDefault behavior
    const maybeBlock = (e: KeyboardEvent) => {
      if (blockAll) return e.preventDefault();
      if (blockSome && blockSome.has(e.code)) e.preventDefault();
    };

    // Expose input API on context
    (usm.context as any).input = {
      keysDown,
      isDown: (code: string) => keysDown.has(code),
      bind(code: string, handler: KeyHandler<C>) { (bindings as any)[code] = handler; },
      unbind(code: string) { delete (bindings as any)[code]; },
      clear() { keysDown.clear(); },
    };

    function onKeyDown(e: KeyboardEvent) {
      // Skip auto-repeat unless enabled
      if (e.repeat && !emitRepeat) return;
      maybeBlock(e);
      keysDown.add(e.code);

      const handler = (bindings as any)[e.code];
      if (!handler) return;

      if (typeof handler === 'string') {
        usm.send(handler);
      } else {
        handler(usm.context, e, { send: usm.send.bind(usm) });
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      maybeBlock(e);
      keysDown.delete(e.code);
      // You can optionally support keyup bindings too, e.g., "KeyW:UP"
      const handler = (bindings as any)[`UP:${e.code}`];
      if (handler) {
        if (typeof handler === 'string') usm.send(handler);
        else handler(usm.context, e, { send: usm.send.bind(usm) });
      }
    }

    return {
      onStart() {
        // Attach listeners when the machine starts
        (el as any).addEventListener('keydown', onKeyDown);
        (el as any).addEventListener('keyup', onKeyUp);
      },
      onStop() {
        // Detach and clear when the machine stops
        (el as any).removeEventListener('keydown', onKeyDown);
        (el as any).removeEventListener('keyup', onKeyUp);
        keysDown.clear();
      },
    };
  });
}