/**
 * Loader adapter
 * WHAT: A tiny asset loader with progress callbacks and pluggable file-type handlers.
 * WHY : Keep fetching/parsing (platform glue) out of your states.
 *
 * Supports by default:
 *  - image (png/jpg/jpeg/webp/gif/svg)
 *  - json, text
 *  - audio (mp3/ogg/wav) via HTMLAudioElement
 *  - arrayBuffer (bin)
 *  - glb/gltf if you provide THREE + GLTFLoader in options
 *
 * Acronyms:
 * - GLTF/GLB: GL Transmission Format (3D model formats; .gltf (JSON), .glb (binary))
 */
import { createAdapter } from '../usm-core';

export type LoaderItem =
  | { name: string; url: string; type?: string }
  | [name: string, url: string];

export interface LoaderAdapterOpts {
  /** Prefix all URLs (e.g., '/assets/') */
  baseUrl?: string;
  /** How many files to load in parallel */
  concurrency?: number;
  /** Optional Three.js loaders for GLTF */
  three?: {
    THREE?: any;
    GLTFLoader?: new () => {
      load: (u: string, ok: (g: any) => void, p?: any, err?: (e: any) => void) => void;
      setDRACOLoader?: (draco: any) => void;
    };
    DRACOLoader?: new () => { setDecoderPath: (path: string) => void };
    dracoDecoderPath?: string;
  };
}

export function loaderAdapter({
  baseUrl = '',
  concurrency = 4,
  three
}: LoaderAdapterOpts = {}) {
  return createAdapter('loader', '1.0.0', ['loader', 'assets'], (usm) => {
    type LoaderFn = (url: string) => Promise<any>;
    const registry = new Map<string, LoaderFn>();
    const assets = new Map<string, any>();
    let onProgress: ((done: number, total: number, current?: string) => void) | undefined;
    let onError: ((name: string, error: any) => void) | undefined;

    // --- helpers -------------------------------------------------------------
    const withBase = (u: string) => (baseUrl ? new URL(u, baseUrl).toString() : u);
    const ext = (u: string) => (u.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();

    // --- built-in loaders ----------------------------------------------------
    const loadImage: LoaderFn = (url) => new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });

    const loadAudio: LoaderFn = (url) => new Promise((res, rej) => {
      const a = new Audio();
      a.addEventListener('canplaythrough', () => res(a), { once: true });
      a.addEventListener('error', rej, { once: true });
      a.src = url;
      a.load();
    });

    const loadJSON: LoaderFn = (url) => fetch(url).then(r => r.json());
    const loadText: LoaderFn = (url) => fetch(url).then(r => r.text());
    const loadArrayBuffer: LoaderFn = (url) => fetch(url).then(r => r.arrayBuffer());

    // Optional GLTF via THREE if provided (capture constructors to satisfy TS)
    let loadGLTF: LoaderFn | null = null;
    if (three?.GLTFLoader) {
      const GLTFLoaderCtor = three.GLTFLoader;
      const DRACOLoaderCtor = three.DRACOLoader;
      const dracoPath = three.dracoDecoderPath;
      loadGLTF = (url) => new Promise((res, rej) => {
        const loader = new GLTFLoaderCtor();
        if (DRACOLoaderCtor && dracoPath) {
          const draco = new DRACOLoaderCtor();
          draco.setDecoderPath(dracoPath);
          loader.setDRACOLoader?.(draco as any);
        }
        loader.load(url, res, undefined, rej);
      });
    }

    // Register default handlers by extension
    const register = (extension: string, fn: LoaderFn) =>
      registry.set(extension.toLowerCase(), fn);

    ['png','jpg','jpeg','webp','gif','svg'].forEach(e => register(e, loadImage));
    ['mp3','ogg','wav'].forEach(e => register(e, loadAudio));
    register('json', loadJSON);
    register('txt',  loadText);
    register('bin',  loadArrayBuffer);
    if (loadGLTF) { register('glb', loadGLTF); register('gltf', loadGLTF); }

    // --- core load logic -----------------------------------------------------
    async function loadItem(name: string, url: string, type?: string) {
      const full = withBase(url);
      const key = (type || ext(url)).toLowerCase();
      const fn = registry.get(key);
      if (!fn) throw new Error(`No loader registered for type/extension "${key}" (${url})`);
      const data = await fn(full);
      assets.set(name, data);
      return data;
    }

    // simple concurrency pool
    async function load(manifest: LoaderItem[] | Record<string, string>) {
      const list: { name: string; url: string; type?: string }[] = Array.isArray(manifest)
        ? manifest.map(i => Array.isArray(i) ? ({ name: i[0], url: i[1] }) : i)
        : Object.entries(manifest).map(([name, url]) => ({ name, url }));

      let done = 0;
      const total = list.length;
      const q = list.slice();

      async function worker() {
        while (q.length) {
          const it = q.shift()!;
          try {
            await loadItem(it.name, it.url, it.type);
          } catch (e) {
            onError?.(it.name, e);
            throw e;
          } finally {
            done++;
            onProgress?.(done, total, it.name);
          }
        }
      }

      const workers = new Array(Math.min(concurrency, total)).fill(0).map(worker);
      await Promise.all(workers);
      return assets;
    }

    // --- expose API on context ----------------------------------------------
    (usm.context as any).loader = {
      /** start loading a manifest; resolves when all are done */
      load,
      /** register a custom loader for an extension/type */
      register,
      /** get a loaded asset by name */
      get: (name: string) => assets.get(name),
      /** check presence */
      has: (name: string) => assets.has(name),
      /** clear cache (keeps registered handlers) */
      reset: () => assets.clear(),
      /** progress callback: (done, total, lastName?) */
      onProgress: (cb: (done: number, total: number, current?: string) => void) => { onProgress = cb; },
      /** error callback: (name, error) */
      onError: (cb: (name: string, error: any) => void) => { onError = cb; }
    };

    return {};
  });
}
