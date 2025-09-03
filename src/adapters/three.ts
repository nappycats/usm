/**
 * Three.js adapter
 * WHAT: Window/container resize + DPR clamping + camera aspect updates.
 * WHY : Keeps platform-specific boilerplate out of your states.
 */
import { createAdapter, type USM } from '../usm-core';

export interface ThreeAdapterOpts {
  THREE: any;
  scene: any;
  camera: any;
  renderer: any;
  /** Size mode: entire window or a specific container element. */
  mode?: 'window' | 'container';
  /** Container element when mode='container'. */
  container?: HTMLElement | null;
  /** Clamp device pixel ratio for performance on 4K/retina. */
  maxDPR?: number;
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
}

export function threeAdapter({
  THREE, scene, camera, renderer,
  mode = 'container',
  container = null,
  maxDPR = 2,
  updateCanvasStyleSimple = true,
  updateCanvasStyleContainer = false
}: ThreeAdapterOpts) {
  return createAdapter('three', '1.3.0', ['camera', 'resize'], (usm: USM<any>) => {

    let ro: ResizeObserver | null = null;

    const currentDPR = () => Math.min(window.devicePixelRatio || 1, maxDPR);

    function measureWindow() {
      return { w: window.innerWidth, h: window.innerHeight, dpr: currentDPR() };
    }
    function measureContainer() {
      const el = container || renderer.domElement.parentElement || renderer.domElement;
      const w = Math.max(1, el?.clientWidth  || 1);
      const h = Math.max(1, el?.clientHeight || 1);
      return { w, h, dpr: currentDPR() };
    }

    function applySize() {
      const { w, h, dpr } = (mode === 'container') ? measureContainer() : measureWindow();
      if (renderer.getPixelRatio && renderer.getPixelRatio() !== dpr) {
        renderer.setPixelRatio(dpr); // set internal pixel density (not CSS size)
      }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const updateStyle = (mode === 'container') ? updateCanvasStyleContainer : updateCanvasStyleSimple;
      renderer.setSize(w, h, updateStyle); // if false, keep CSS size unchanged
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
      if (typeof ResizeObserver !== 'undefined') {
        const el = container || renderer.domElement.parentElement || renderer.domElement;
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

    // Expose some helpers on context for convenience
    usm.context.three = {
      THREE, scene, camera, renderer,
      forceResize: applySize,
      cameraTo: (pos: {x:number;y:number;z:number}, lookAt?: {x:number;y:number;z:number}, duration = 1) => {
        const G = (typeof window !== 'undefined' && (window as any).gsap) ? (window as any).gsap : null;
        if (!G) { camera.position.set(pos.x, pos.y, pos.z); if (lookAt) camera.lookAt(lookAt.x, lookAt.y, lookAt.z); return { play(){}, kill(){} }; }
        const start = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        return G.timeline({ paused: true })
          .to(start, { x: pos.x, y: pos.y, z: pos.z, duration, onUpdate: () => camera.position.set(start.x, start.y, start.z) })
          .call(() => { if (lookAt) camera.lookAt(lookAt.x, lookAt.y, lookAt.z); });
      }
    };

    return {
      onStart() { (mode === 'container') ? startContainer() : startSimple(); },
      onStop()  { (mode === 'container') ? stopContainer()  : stopSimple(); }
    };
  });
}
