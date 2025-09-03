/**
 * Keyboard adapter
 * WHAT: Tracks a Set of pressed keys and dispatches mapped events.
 * TIP : Use KeyboardEvent.code (layout-agnostic: 'KeyW', 'ArrowLeft', ...).
 */
import { createAdapter } from '../usm-core';

export interface KeyboardAdapterOpts {
  /** Map keydown codes to event types (e.g., { Space:'START', KeyP:'PAUSE' }) */
  down?: Record<string, string>;
  /** Map keyup codes to event types. */
  up?: Record<string, string>;
  /** Ignore auto-repeated keydown events. */
  preventRepeat?: boolean;
  /** Optional combo detector: return an event when a key set matches. */
  combo?: (pressed: Set<string>) => string | void;
}

export function keyboardAdapter({
  down = {},
  up = {},
  preventRepeat = true,
  combo = undefined
}: KeyboardAdapterOpts = {}) {
  return createAdapter('keyboard', '1.0.0', ['keyboard'], (usm) => {
    usm.context.keyboard = { pressed: new Set<string>() };

    const keydown = (e: KeyboardEvent) => {
      if (preventRepeat && e.repeat) return;
      usm.context.keyboard.pressed.add(e.code);
      const ev = down[e.code];
      if (ev) usm.send(ev);
      if (combo) {
        const cev = combo(usm.context.keyboard.pressed);
        if (cev) usm.send(cev);
      }
    };

    const keyup = (e: KeyboardEvent) => {
      usm.context.keyboard.pressed.delete(e.code);
      const ev = up[e.code];
      if (ev) usm.send(ev);
    };

    return {
      onStart() {
        window.addEventListener('keydown', keydown, { passive: false });
        window.addEventListener('keyup', keyup);
      },
      onStop() {
        window.removeEventListener('keydown', keydown);
        window.removeEventListener('keyup', keyup);
        usm.context.keyboard.pressed.clear();
      }
    };
  });
}
