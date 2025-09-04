/**
 * Picking adapter (Three.js raycaster + optional DOM picking)
 * WHAT: converts pointer clicks/taps to 3D intersections and/or DOM hits.
 * WHY : quickly attach “click to select” (3D or HTML) without wiring code in states.
 *
 * ABBREVIATIONS:
 * - NDC: Normalized Device Coordinates (-1..1) used by WebGL/Three.js
 */
import { createAdapter } from '../usm-core';

export interface PickingAdapterOpts {
  THREE: any;                    // three module or global
  camera: any;                   // THREE.Camera
  scene: any;                    // THREE.Scene or Object3D root
  dom: HTMLElement;              // element to compute NDC from (usually the canvas)
  recursive?: boolean;           // traverse children (default true)
  eventName?: string;            // USM event for 3D picks (default 'PICK')
  filter?: (obj: any) => boolean;// filter three objects
  // DOM picking options (optional)
  domPick?: boolean | string | ((el: Element) => boolean); // false=off, true=any element, selector string, or predicate
  domRoot?: HTMLElement | Document;  // root to search/limit closest() (default: document)
  domEventName?: string;        // USM event for DOM picks (default 'DOM_PICK')
  includeDomIn3DEvent?: boolean;// also embed DOM info inside the 3D event payload (default true)
}

export function pickingAdapter({
  THREE,
  camera,
  scene,
  dom,
  recursive = true,
  eventName = 'PICK',
  filter,
  domPick = false,
  domRoot,
  domEventName = 'DOM_PICK',
  includeDomIn3DEvent = true,
}: PickingAdapterOpts) {
  return createAdapter('picking', '1.1.0', ['raycast', 'picking', 'dom'], (usm) => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function toNDC(e: MouseEvent) {
      const r = dom.getBoundingClientRect();
      const x = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      const y = -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1; // flip Y for WebGL
      ndc.set(x, y);
      return ndc;
    }

    function buildDomInfo(e: MouseEvent) {
      if (!domPick) return null;
      const root: Document | HTMLElement = (domRoot as any) || document;
      const target = (e.target as Element) || null;
      if (!target) return null;

      // Determine matched element based on domPick option
      let matched: Element | null = null;
      if (domPick === true) {
        matched = target as Element;
      } else if (typeof domPick === 'string') {
        matched = (target.closest ? target.closest(domPick) : null) as Element | null;
      } else if (typeof domPick === 'function') {
        // climb up to root and find first element passing predicate
        let el: Element | null = target;
        while (el && el !== root) {
          if ((domPick as (el: Element) => boolean)(el)) { matched = el; break; }
          el = (el.parentElement || (el.getRootNode && (el.getRootNode() as any).host) || null) as Element | null;
        }
      }
      if (!matched) return { target, matched: null };

      // Basic geometry at time of click
      const r = matched.getBoundingClientRect();
      const localX = e.clientX - r.left;
      const localY = e.clientY - r.top;

      return {
        target,
        matched,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        client: { x: e.clientX, y: e.clientY },
        local: { x: localX, y: localY },
        // helpful id/class summary for logs
        meta: {
          tag: matched.tagName,
          id: matched.id || null,
          class: matched.className || null,
          dataset: (matched as HTMLElement).dataset || {},
        },
      };
    }

    function onClick(e: MouseEvent) {
      // 1) Compute NDC and perform Three.js raycast
      toNDC(e);
      raycaster.setFromCamera(ndc, camera);

      let roots: any[] = [];
      if (scene?.isObject3D) roots = [scene];
      else if (Array.isArray(scene)) roots = scene; else roots = [scene];

      let hits = raycaster.intersectObjects(roots, recursive);
      if (filter) hits = hits.filter((h: any) => filter(h.object));

      // 2) Optionally collect DOM pick info
      const domInfo = buildDomInfo(e);

      // 3) Dispatch USM events
      const threePayload: any = { ndc: { x: ndc.x, y: ndc.y }, hits };
      if (includeDomIn3DEvent && domInfo) threePayload.dom = domInfo;
      usm.send({ type: eventName, data: threePayload });

      if (domInfo && domInfo.matched && domEventName && domEventName !== eventName) {
        usm.send({ type: domEventName, data: domInfo });
      }
    }

    return {
      onStart() { dom.addEventListener('click', onClick); },
      onStop()  { dom.removeEventListener('click', onClick); },
    };
  });
}
