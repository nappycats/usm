/**
 * Pointer adapter (mouse/touch/pen unified via Pointer Events)
 * WHAT: TAP, DRAG_START/DRAG/DRAG_END, swipe events, wheel events.
 * CONTEXT: updates ctx.pointer { x, y, dx, dy, isDown, type }.
 */
import { createAdapter } from '../usm-core';

export interface PointerAdapterOpts {
  target?: HTMLElement | Window;
  bind?: Record<string, string>;
  onDrag?: (dx: number, dy: number) => void;
  onTap?: () => void;
  onWheel?: (deltaY: number) => void;
  thresholds?: { swipe: number; tap: number };
}

export function pointerAdapter({
  target = window,
  bind = {},
  onDrag,
  onTap,
  onWheel,
  thresholds = { swipe: 40, tap: 6 }
}: PointerAdapterOpts = {}) {
  return createAdapter('pointer', '1.0.0', ['pointer', 'drag', 'swipe', 'wheel'], (usm) => {
    let el: any;
    let down = false, sx = 0, sy = 0, lx = 0, ly = 0, moved = false, lastType = 'mouse';

    usm.context.pointer = { x: 0, y: 0, dx: 0, dy: 0, isDown: false, type: 'mouse' };

    const upd = (x: number, y: number, dx: number, dy: number, isDown: boolean, type?: string) => {
      const p = usm.context.pointer;
      p.x = x; p.y = y; p.dx = dx; p.dy = dy; p.isDown = isDown; p.type = type || lastType;
    };

    const downH = (e: PointerEvent) => {
      down = true; moved = false;
      lastType = (e as any).pointerType || lastType;
      sx = lx = e.clientX; sy = ly = e.clientY;
      upd(e.clientX, e.clientY, 0, 0, true, lastType);
      (e.target as any).setPointerCapture?.(e.pointerId);
      if ((e as any).pointerType === 'touch') e.preventDefault();
      bind.DRAG_START && usm.send(bind.DRAG_START);
    };

    const moveH = (e: PointerEvent) => {
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      upd(e.clientX, e.clientY, dx, dy, down, (e as any).pointerType || lastType);
      if (down) {
        if (Math.abs(lx - sx) > 4 || Math.abs(ly - sy) > 4) moved = true;
        onDrag?.(dx, dy);
        bind.DRAG && usm.send(bind.DRAG, { dx, dy });
        e.preventDefault();
      }
    };

    const upH = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      upd(e.clientX, e.clientY, 0, 0, false, (e as any).pointerType || lastType);

      const totalDX = e.clientX - sx;
      const totalDY = e.clientY - sy;
      const dist = Math.hypot(totalDX, totalDY);

      if (!moved && dist < thresholds.tap) {
        onTap?.();
        bind.TAP && usm.send(bind.TAP);
      } else {
        const absX = Math.abs(totalDX), absY = Math.abs(totalDY);
        if (absX > absY && absX > thresholds.swipe) {
          const ev = totalDX > 0 ? bind.SWIPE_RIGHT : bind.SWIPE_LEFT;
          ev && usm.send(ev);
        } else if (absY > thresholds.swipe) {
          const ev = totalDY > 0 ? bind.SWIPE_DOWN : bind.SWIPE_UP;
          ev && usm.send(ev);
        }
      }
      bind.DRAG_END && usm.send(bind.DRAG_END);
    };

    const wheelH = (e: WheelEvent) => {
      onWheel?.(e.deltaY);
      if (e.deltaY < 0 && bind.WHEEL_UP)   usm.send(bind.WHEEL_UP);
      if (e.deltaY > 0 && bind.WHEEL_DOWN) usm.send(bind.WHEEL_DOWN);
    };

    return {
      onStart() {
        el = (target || window) as any;
        el.addEventListener('pointerdown',   downH, { passive: false });
        el.addEventListener('pointermove',   moveH, { passive: false });
        el.addEventListener('pointerup',     upH,   { passive: false });
        el.addEventListener('pointercancel', upH,   { passive: false });
        el.addEventListener('wheel',         wheelH,{ passive: true  });
      },
      onStop() {
        el.removeEventListener('pointerdown',   downH);
        el.removeEventListener('pointermove',   moveH);
        el.removeEventListener('pointerup',     upH);
        el.removeEventListener('pointercancel', upH);
        el.removeEventListener('wheel',         wheelH);
      }
    };
  });
}
