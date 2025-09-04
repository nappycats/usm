/**
 * Pointer adapter (mouse/touch/pen unified via Pointer Events)
 * WHAT: TAP, DRAG_START/DRAG/DRAG_END, swipe events, wheel events.
 * CONTEXT: updates ctx.pointer with a rich, normalized "last" sample so
 *          states can reliably read coordinates (no more undefined).
 */
import { createAdapter } from '../usm-core';

export type PointerSample = {
  id: number;
  type: string;           // 'mouse' | 'touch' | 'pen'
  isPrimary: boolean;
  buttons: number;        // pointer buttons bitfield
  time: number;           // seconds
  // global coords
  clientX: number; clientY: number; pageX: number; pageY: number;
  // local coords relative to capture element (if present) or viewport
  localX: number; localY: number;     // pixels within element (0..w, 0..h)
  normX: number; normY: number;       // 0..1 within element/viewport
  ndcX: number; ndcY: number;         // -1..1 (WebGL NDC)
  dx?: number; dy?: number; dz?: number; // deltas for move/wheel
  raw?: PointerEvent | MouseEvent | WheelEvent;       // original event
};

export interface PointerAdapterOpts {
  target?: HTMLElement | Window;      // event target (default: window)
  /**
   * Back-compat event bindings (legacy):
   * DRAG_START, DRAG, DRAG_END, TAP, SWIPE_LEFT/RIGHT/UP/DOWN, WHEEL_UP/DOWN
   * Optional extras supported now: DOWN, UP
   */
  bind?: Record<string, string>;
  /** Modern alias for bind with friendlier keys. */
  map?: Partial<{
    down: string; up: string; click: string;
    dragStart: string; drag: string; dragEnd: string;
    swipeLeft: string; swipeRight: string; swipeUp: string; swipeDown: string;
    wheelUp: string; wheelDown: string;
  }>;
  /** If true/array, preventDefault on the specified phases. */
  preventDefault?: boolean | Array<'pointerdown'|'pointermove'|'pointerup'|'wheel'|'contextmenu'>;
  /** Element to compute local/norm/NDC coords and (optionally) capture pointer */
  capture?: HTMLElement | null;
  /** Auto-apply touchAction/userSelect/tabIndex on capture element (default true) */
  autoStyle?: boolean;
  onDrag?: (sample: PointerSample) => void;
  onTap?: (sample: PointerSample) => void;
  onWheel?: (sample: PointerSample) => void;
  thresholds?: { swipe: number; tap: number };
}

export function pointerAdapter({
  target = window,
  bind = {},
  map = {},
  preventDefault = false,
  capture = null,
  autoStyle = true,
  onDrag,
  onTap,
  onWheel,
  thresholds = { swipe: 40, tap: 6 },
}: PointerAdapterOpts = {}) {
  return createAdapter('pointer', '1.1.0', ['pointer', 'drag', 'swipe', 'wheel'], (usm) => {
    let el: any;
    let down = false, sx = 0, sy = 0, lx = 0, ly = 0, moved = false;
    let lastType = 'mouse';
    let restoreStyles: (() => void) | null = null;

    // Initialize context structure with a rich "last" sample
    const initSample: PointerSample = {
      id: 0, type: 'mouse', isPrimary: true, buttons: 0, time: 0,
      clientX: 0, clientY: 0, pageX: 0, pageY: 0,
      localX: 0, localY: 0, normX: 0, normY: 0, ndcX: 0, ndcY: 0,
    };
    (usm.context as any).pointer = {
      last: initSample,
      isDown: false,
      element: capture || (target instanceof HTMLElement ? target : null),
    } as { last: PointerSample; isDown: boolean; element: HTMLElement | null };

    const shouldBlock = (name: string) => {
      if (preventDefault === true) return true;
      if (Array.isArray(preventDefault)) return (preventDefault as string[]).includes(name);
      return false;
    };

    function buildSample(e: PointerEvent | MouseEvent | WheelEvent, includeDelta = false): PointerSample {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      const pe = e as PointerEvent;
      const id = (pe as any).pointerId ?? 0;
      const type = (pe as any).pointerType || lastType || 'mouse';
      const isPrimary = !!(pe as any).isPrimary || true;
      const buttons = (pe as any).buttons ?? (e instanceof MouseEvent ? e.buttons : 0);
      const clientX = (pe as any).clientX ?? 0;
      const clientY = (pe as any).clientY ?? 0;
      const pageX = (pe as any).pageX ?? 0;
      const pageY = (pe as any).pageY ?? 0;

      // Local coordinates relative to capture element or viewport
      let localX = clientX, localY = clientY, normX = 0, normY = 0, ndcX = 0, ndcY = 0;
      const cap = ((usm.context as any).pointer.element) as HTMLElement | null;
      if (cap) {
        const r = cap.getBoundingClientRect();
        const w = Math.max(1, r.width);
        const h = Math.max(1, r.height);
        localX = clientX - r.left;
        localY = clientY - r.top;
        // clamp
        const lxClamped = Math.max(0, Math.min(w, localX));
        const lyClamped = Math.max(0, Math.min(h, localY));
        normX = lxClamped / w; normY = lyClamped / h;
        ndcX = normX * 2 - 1; ndcY = 1 - normY * 2; // WebGL flips Y
        localX = lxClamped; localY = lyClamped;
      } else {
        const vw = Math.max(1, (typeof window !== 'undefined' ? window.innerWidth : 1));
        const vh = Math.max(1, (typeof window !== 'undefined' ? window.innerHeight : 1));
        normX = clientX / vw; normY = clientY / vh;
        ndcX = normX * 2 - 1; ndcY = 1 - normY * 2;
      }

      const sample: PointerSample = {
        id, type, isPrimary, buttons, time: now,
        clientX, clientY, pageX, pageY,
        localX, localY, normX, normY, ndcX, ndcY,
        raw: e,
      };
      if (includeDelta) { sample.dx = clientX - lx; sample.dy = clientY - ly; }
      return sample;
    }

    const updateCtx = (s: PointerSample, isDownNow: boolean) => {
      const p = (usm.context as any).pointer as { last: PointerSample; isDown: boolean };
      p.last = s; p.isDown = isDownNow;
    };

    const downH = (e: PointerEvent) => {
      down = true; moved = false;
      lastType = (e as any).pointerType || lastType;
      sx = lx = e.clientX; sy = ly = e.clientY;
      const s = buildSample(e, false);
      updateCtx(s, true);
      // Prefer explicit capture element if provided, else the event target
      const capEl: any = ((usm.context as any).pointer.element) || (e.target as any);
      capEl?.setPointerCapture?.(e.pointerId);
      // DO NOT block pointerdown by default so browsers still synthesize click
      if (shouldBlock('pointerdown')) e.preventDefault();
      // Back-compat + new map support (send payload)
      if ((bind as any).DRAG_START) usm.send((bind as any).DRAG_START, s);
      if ((bind as any).DOWN)       usm.send((bind as any).DOWN, s);
      if (map.down)                 usm.send(map.down, s);
    };

    const moveH = (e: PointerEvent) => {
      const s = buildSample(e, true);
      lx = e.clientX; ly = e.clientY;
      updateCtx(s, down);
      if (down) {
        if (Math.abs(lx - sx) > 4 || Math.abs(ly - sy) > 4) moved = true;
        onDrag?.(s);
        if ((bind as any).DRAG) usm.send((bind as any).DRAG, s);
        if (map.drag)           usm.send(map.drag, s);
        if (shouldBlock('pointermove')) e.preventDefault();
      }
    };

    const upH = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      const s = buildSample(e, false);
      updateCtx(s, false);

      const totalDX = e.clientX - sx;
      const totalDY = e.clientY - sy;
      const dist = Math.hypot(totalDX, totalDY);

      if (!moved && dist < thresholds.tap) {
        onTap?.(s);
        if ((bind as any).TAP) usm.send((bind as any).TAP, s);
        if (map.click)         usm.send(map.click, s);
      } else {
        const absX = Math.abs(totalDX), absY = Math.abs(totalDY);
        if (absX > absY && absX > thresholds.swipe) {
          const ev = totalDX > 0 ? (map.swipeRight || (bind as any).SWIPE_RIGHT) : (map.swipeLeft || (bind as any).SWIPE_LEFT);
          ev && usm.send(ev, s);
        } else if (absY > thresholds.swipe) {
          const ev = totalDY > 0 ? (map.swipeDown || (bind as any).SWIPE_DOWN) : (map.swipeUp || (bind as any).SWIPE_UP);
          ev && usm.send(ev, s);
        }
      }
      if ((bind as any).DRAG_END) usm.send((bind as any).DRAG_END, s);
      if (map.dragEnd)           usm.send(map.dragEnd, s);
      if ((bind as any).UP)      usm.send((bind as any).UP, s);
      if (map.up)                usm.send(map.up, s);
      if (shouldBlock('pointerup')) e.preventDefault();
    };

    const wheelH = (e: WheelEvent) => {
      const s = buildSample(e, false);
      s.dz = (e as any).deltaZ || 0; s.dy = (e as any).deltaY || 0; s.dx = (e as any).deltaX || 0;
      onWheel?.(s);
      if ((bind as any).WHEEL_UP && e.deltaY < 0)    usm.send((bind as any).WHEEL_UP, s);
      if ((bind as any).WHEEL_DOWN && e.deltaY > 0)  usm.send((bind as any).WHEEL_DOWN, s);
      if (map.wheelUp   && e.deltaY < 0)             usm.send(map.wheelUp, s);
      if (map.wheelDown && e.deltaY > 0)             usm.send(map.wheelDown, s);
    };

    function applyAutoStyle() {
      const cap = ((usm.context as any).pointer.element) as HTMLElement | null;
      if (!autoStyle || !cap) return;
      const prevTouch = cap.style.touchAction;
      const prevSelect = cap.style.userSelect;
      const hadTab = cap.hasAttribute('tabindex');
      const prevTab = cap.getAttribute('tabindex');
      cap.style.touchAction = 'none';     // prevent page gestures from hijacking touches
      cap.style.userSelect = 'none';      // avoid text selection drags
      if (!hadTab) cap.setAttribute('tabindex', '0');
      restoreStyles = () => {
        cap.style.touchAction = prevTouch;
        cap.style.userSelect = prevSelect;
        if (!hadTab) cap.removeAttribute('tabindex');
        else if (prevTab != null) cap.setAttribute('tabindex', String(prevTab));
      };
    }

    return {
      onStart() {
        el = (target || window) as any;
        applyAutoStyle();
        el.addEventListener('pointerdown',   downH, { passive: false });
        el.addEventListener('pointermove',   moveH, { passive: false });
        el.addEventListener('pointerup',     upH,   { passive: false });
        el.addEventListener('pointercancel', upH,   { passive: false });
        // Wheel is passive for performance; use preventDefault array if you must block it
        el.addEventListener('wheel',         wheelH, { passive: true });
      },
      onStop() {
        el.removeEventListener('pointerdown',   downH);
        el.removeEventListener('pointermove',   moveH);
        el.removeEventListener('pointerup',     upH);
        el.removeEventListener('pointercancel', upH);
        el.removeEventListener('wheel',         wheelH);
        if (restoreStyles) { restoreStyles(); restoreStyles = null; }
        const p = (usm.context as any).pointer as { last: PointerSample; isDown: boolean };
        p.isDown = false;
      }
    };
  });
}
