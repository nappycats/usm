const THREE = window.THREE;
const { USM: Machine, adapters } = window.USM; // grab the constructor as Machine to avoid name clash

// --- basic three.js scene ---
const app = document.getElementById('app');

if (!window.THREE) {
  const el = document.querySelector('.hint');
  if (el) el.textContent = 'Error: Three.js not loaded';
  console.error('Three.js is not available. Ensure the CDN script is reachable.');
  throw new ReferenceError('THREE is not defined');
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f1a);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 1.2, 3);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(1, 2, 2);
scene.add(dir);

const geo = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshStandardMaterial({ color: 0x44aaff, roughness: 0.4, metalness: 0.1 });
const cube = new THREE.Mesh(geo, mat);

const setHint = (t) => { const el = document.querySelector('.hint'); if (el) el.textContent = t; };

// Fallback 1x1 white PNG in case local asset is missing
const DATA_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

const m = new Machine({
  id: 'demo',
  initial: 'loading',
  context: { t: 0 },
  adapters: [
    adapters.timeAdapter({ fixedStep: 1/60, maxDelta: 0.08, speed: 1 }),
    adapters.threeAdapter({ THREE, scene, camera, renderer, mode: 'window' }),
    adapters.pickingAdapter({ THREE, camera, scene, dom: renderer.domElement }),
    adapters.pickingAdapter({
      THREE, camera, scene, dom: renderer.domElement,

      // Enable DOM picking for UI elements
      domPick: '[data-pick], .ui-button',    // or true, or (el) => el.hasAttribute('data-pick')
      domEventName: 'DOM_PICK',
      includeDomIn3DEvent: true,             // so PICK also contains .dom info

      // Optional: only pick certain meshes
      // filter: (obj) => !!obj.userData.pickable,
    }),
    adapters.gsapAdapter(),
    adapters.faderAdapter(),
    adapters.loaderAdapter(), // no baseUrl needed
    adapters.audioAdapter(),
    adapters.pointerAdapter({
      target: renderer.domElement,
      capture: renderer.domElement,
      // Do not block pointerdown so the browser still synthesizes a click
      preventDefault: ['contextmenu','wheel'],
      map: {
        down:  'POINTER_DOWN',
        click: 'POINTER_CLICK'
      }
    }),
    adapters.keyboardAdapter({
      bindings: { Space: 'START', KeyQ: 'QUIT' },
      preventDefault: ['Space']
    }),
  ],

  states: {
    loading: {
      async enter(ctx, evt, api) {
        setHint('Loading...');
        await ctx.fader.fadeIn(1.9);

        ctx.loader.onProgress((d, t) => setHint(`Loading ${d}/${t} (${Math.round((d/t)*100)}%)`));

        // Load assets; tolerate missing audio in dev
        try {
          await ctx.loader.load([
            { name: 'pixel', url: './assets/pixel.png' },
            { name: 'beep',  url: './assets/beep.wav' }
          ]);
        } catch (e) {
          console.warn('Asset missing, using fallbacks where possible:', e);
          // Ensure we always have a pixel
          await ctx.loader.load([{ name: 'pixel', url: DATA_PIXEL, type: 'png' }]);
        }
        await ctx.fader.fadeOut(1.0);
        api.send('READY');
      },
      on: {
        READY: 'menu'
     }
    },
    menu: {
      enter(ctx) {
        setHint('Click / Space to PLAY');
      },
      on: {
        START: 'play',
        POINTER_DOWN: 'play',
        POINTER_CLICK: 'play'
      }
    },
    play: {
      enter(ctx) {
        if (ctx.loader?.has && ctx.loader.has('celest-echo')) {
          ctx.audio.playMusic('celest-echo', { loop: true, fade: 0.3 });
        }
        setHint('Playing — press Q to quit');
        scene.add(cube);
        if (ctx.gsap) ctx.gsap.to(camera.position,
            { z: 2.2, duration: 1.0, ease: 'power2.out' });
      },
      tick(dt, ctx) {
        ctx.t += dt;
        cube.rotation.y += dt * 0.8;
        cube.rotation.x = Math.sin(ctx.t * 0.7) * 0.2;
        renderer.render(scene, camera);
      },
      exit(ctx) {
        scene.remove(cube);
        ctx.audio.stopMusic(0.3);
      },
      on: {
        QUIT: 'menu',
        PICK: (ctx, evt) => {
          const hit = evt.data?.hits?.[0];
          if (!hit) return;
          const obj = hit.object;
          if (obj?.material?.color) obj.material.color.setHex(Math.random() * 0xffffff);
          setHint(`Picked ${obj.name || obj.type}`);
        },

        // DOM pick (UI)
        DOM_PICK: (ctx, evt) => {
          console.log('DOM pick event', evt);
          const el = evt.data?.matched;
          if (!el) return;
          setHint(`DOM picked: ${el.tagName.toLowerCase()}#${el.id || ''}`);
          // return 'play'; // or route somewhere
        }
      }
    }
  },
});

m.start();