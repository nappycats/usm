/**
 * Three.js adapter (managed or external)
 * WHAT: Handles window/container resize, DPR clamping, camera aspect updates,
 *        and (optionally) creates and renders a Three.js scene for you.
 * WHY : Keep platform-specific boilerplate out of your states. Make it easy
 *        for newcomers (managed mode) while still supporting advanced users
 *        who pass their own THREE/scene/camera/renderer (external mode).
 */
import { createAdapter, type USM } from '../../usm-core';

export interface ThreeAdapterOpts {
  /** Three namespace. Optional in managed mode (tries window.THREE). */
  THREE?: any;
  /** Provide these to run in external mode. If omitted, managed mode creates them. */
  scene?: any;
  camera?: any;
  renderer?: any;

  /** Size mode: entire window or a specific container element. */
  mode?: 'window' | 'container';
  /** Container element (or selector/function) when mode='container' or for canvas append. */
  container?: HTMLElement | string | (() => HTMLElement | null) | null;

  /** Clamp device pixel ratio for performance on 4K/retina. */
  maxDPR?: number;

  /** When adapter creates the renderer, append its canvas to the container. */
  appendCanvas?: boolean; // default true

  /**
   * Controls whether renderer.setSize also updates canvas CSS dimensions.
   * In window mode, true keeps canvas full-bleed.
   */
  updateCanvasStyleSimple?: boolean;
  /**
   * In container mode we often set canvas width/height via CSS already,
   * so default false to avoid double layout.
   */
  updateCanvasStyleContainer?: boolean;

  /** Managed mode camera defaults */
  cameraFov?: number;      // default 60
  cameraNear?: number;     // default 0.1
  cameraFar?: number;      // default 2000

  /** Optional clear color (background). null leaves existing. */
  clearColor?: number | string | null;

  /** Auto-render each frame (via timeAdapter.onFrame if present, else RAF). */
  autoRender?: boolean; // default true
}

export function threeAdapter(opts: ThreeAdapterOpts = {}) {
  const {
    THREE,
    scene: extScene,
    camera: extCamera,
    renderer: extRenderer,

    mode = 'container',
    container = null,
    maxDPR = 2,
    appendCanvas = true,

    updateCanvasStyleSimple = true,
    updateCanvasStyleContainer = false,

    cameraFov = 60,
    cameraNear = 0.1,
    cameraFar = 2000,

    clearColor = null,
    autoRender = true,
  } = opts;

  return createAdapter('three', '1.4.1', ['three', 'camera', 'resize'], (usm: USM<any>) => {
    // Resolve THREE namespace --------------------------------------------------
    let THREE_NS: any = THREE || (typeof window !== 'undefined' && (window as any).THREE) || null;
    if (!THREE_NS && (!extScene || !extCamera || !extRenderer)) {
      console.warn('[usm][three] THREE namespace missing; provide opts.THREE or set window.THREE.');
    }

    // Managed vs external ------------------------------------------------------
    let scene = extScene || (THREE_NS ? new THREE_NS.Scene() : null);
    let camera = extCamera || (THREE_NS ? new THREE_NS.PerspectiveCamera(cameraFov, 1, cameraNear, cameraFar) : null);
    let renderer = extRenderer || (THREE_NS ? new THREE_NS.WebGLRenderer({ antialias: true, alpha: true }) : null);

    function resolveContainer(): HTMLElement {
      if (typeof container === 'function') { const el = container(); if (el) return el; }
      if (typeof container === 'string') {
        const el = document.querySelector<HTMLElement>(container);
        if (el) return el;
      }
      // Prefer parent of canvas if already created, else body
      return (renderer?.domElement?.parentElement as HTMLElement) || document.body;
    }

    let ro: ResizeObserver | null = null;
    let offFrame: (() => void) | null = null;
    let rafId = 0;

    const isDocBody = (el: HTMLElement | null | undefined) => !!el && (el === document.body || el === (document.documentElement as unknown as HTMLElement));

    const currentDPR = () => Math.min(window.devicePixelRatio || 1, maxDPR);

    function measureWindow() {
      return { w: window.innerWidth, h: window.innerHeight, dpr: currentDPR() };
    }
    function measureContainer() {
      const el = resolveContainer();
      const w = Math.max(1, el?.clientWidth  || 1);
      const h = Math.max(1, el?.clientHeight || 1);
      return { w, h, dpr: currentDPR() };
    }

    function applySize() {
      if (!renderer || !camera) return;
      const el = resolveContainer();
      const treatAsWindow = (mode !== 'container') || isDocBody(el);
      const { w, h, dpr } = treatAsWindow ? measureWindow() : measureContainer();
      if ((renderer as any).getPixelRatio && (renderer as any).getPixelRatio() !== dpr) {
        renderer.setPixelRatio(dpr);
      }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // If we are effectively full-window or appended to <body>, always update CSS size
      // to avoid the classic small-canvas bug. Otherwise use the container setting.
      const updateStyle = treatAsWindow ? true : updateCanvasStyleContainer;
      renderer.setSize(w, h, updateStyle);
    }

    function startSimple() {
      applySize();
      window.addEventListener('resize', applySize);
      window.addEventListener('orientationchange', applySize);
    }
    function stopSimple() {
      window.removeEventListener('resize', applySize);
      window.removeEventListener('orientationchange', applySize);
    }

    function startContainer() {
      applySize();
      const el = resolveContainer();
      if (typeof ResizeObserver !== 'undefined' && !isDocBody(el)) {
        ro = new ResizeObserver(() => applySize());
        ro.observe(el);
      } else {
        window.addEventListener('resize', applySize);
        window.addEventListener('orientationchange', applySize);
      }
    }
    function stopContainer() {
      if (ro) { ro.disconnect(); ro = null; }
      window.removeEventListener('resize', applySize);
      window.removeEventListener('orientationchange', applySize);
    }

    function startRender() {
      if (!autoRender || !renderer || !scene || !camera) return;
      const time = (usm.context as any).time;
      if (time?.onFrame) {
        offFrame = time.onFrame(() => renderer!.render(scene!, camera!));
      } else {
        const loop = () => { rafId = requestAnimationFrame(loop); renderer!.render(scene!, camera!); };
        rafId = requestAnimationFrame(loop);
      }
    }
    function stopRender() {
      if (offFrame) { try { offFrame(); } catch{} offFrame = null; }
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }

    // Expose helpers on context -----------------------------------------------
    (usm.context as any).three = {
      THREE: THREE_NS, scene, camera, renderer,
      canvas: renderer?.domElement || null,
      forceResize: applySize,
      render: () => { if (renderer && scene && camera) renderer.render(scene, camera); },
      cameraTo: (pos: {x:number;y:number;z:number}, lookAt?: {x:number;y:number;z:number}, duration = 1) => {
        const G = (typeof window !== 'undefined' && (window as any).gsap) ? (window as any).gsap : null;
        if (!G || !camera) { camera?.position.set(pos.x, pos.y, pos.z); if (lookAt) camera?.lookAt(lookAt.x, lookAt.y, lookAt.z); return { play(){}, kill(){} }; }
        const start = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        return G.timeline({ paused: true })
          .to(start, { x: pos.x, y: pos.y, z: pos.z, duration, onUpdate: () => camera!.position.set(start.x, start.y, start.z) })
          .call(() => { if (lookAt) camera!.lookAt(lookAt.x, lookAt.y, lookAt.z); });
      }
    };

    // Lifecycle ----------------------------------------------------------------
    return {
      onStart() {
        // In managed mode, append canvas & set clear color once we actually start
        if (!extRenderer && renderer) {
          const el = resolveContainer();
          if (appendCanvas && renderer.domElement.parentElement !== el) {
            el.appendChild(renderer.domElement);
          }
          if (clearColor != null && (renderer as any).setClearColor) {
            (renderer as any).setClearColor(clearColor as any, 1);
          }
        }
        (mode === 'container') ? startContainer() : startSimple();
        startRender();
      },
      onStop()  {
        stopRender();
        (mode === 'container') ? stopContainer()  : stopSimple();
      }
    };
  });
}
