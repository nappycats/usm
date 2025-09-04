const { USM: Machine, adapters } = window.USM;
const THREE = window.THREE;

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f1a);
const camera = new THREE.PerspectiveCamera(60,1,0.1,100);
camera.position.set(0,1.2,3);
const amb = new THREE.AmbientLight(0xffffff, 0.6); scene.add(amb);
const dir = new THREE.DirectionalLight(0xffffff, .8); dir.position.set(2,3,2); scene.add(dir);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1,1,1),
  new THREE.MeshStandardMaterial({ color: 0x44aaff })
); cube.name = 'player';

function resize(){
  const w = app.clientWidth || window.innerWidth;
  const h = app.clientHeight || window.innerHeight;
  renderer.setSize(w,h);
  camera.aspect = w/h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

// Build machine
const m = new Machine({
  initial: 'menu',
  states: {
    menu: {
      enter(){ /* uiAdapter toggles hints via data-show="menu" */ },
      on: { START: 'play', POINTER_CLICK: 'play', Space: 'play' }
    },
    play: {
      enter(ctx){ scene.add(cube); ctx.tween.to(cube.rotation, { y: cube.rotation.y + Math.PI*2 }, { duration: 2 }); },
      tick(dt){ cube.rotation.x += dt*0.5; renderer.render(scene, camera); },
      on: {
        KeyP: 'pause',
        POINTER_CLICK: (ctx) => { ctx.fx.shake(0.5); }, // camera shake on click
        KeyQ: 'menu'
      },
      exit(){ scene.remove(cube); }
    },
    pause: {
      enter(){ /* timeAdapter is still running; you can pause it if you want */ },
      on: { KeyP: 'play', KeyQ: 'menu' }
    }
  },
  adapters: [
    adapters.timeAdapter({ fixedStep: 1/60 }),
    adapters.uiAdapter(),                                   // toggles data-show + data-state
    adapters.pointerAdapter({ target: renderer.domElement, capture: renderer.domElement, map:{ click:'POINTER_CLICK' } }),
    adapters.keyboardAdapter({ bindings: { Space:'Space', KeyP:'KeyP', KeyQ:'KeyQ' } }),
    adapters.tweenAdapter(),                                 // micro tween
    adapters.threeAdapter({ THREE, scene, camera, renderer, mode:'window' }),
    adapters.threeFxAdapter({ THREE, camera })              // camera shake
  ]
});

m.start();