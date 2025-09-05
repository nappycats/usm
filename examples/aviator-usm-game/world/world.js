// world/world.js
export function createWorld(ctx){
  const { scene, camera, renderer } = ctx.three;

  // Fog + lights reminiscent of Aviator
  scene.fog = new THREE.Fog(0x0b1020, 100, 500);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x334466, 0.6);
  const dir  = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(150, 200, 100);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024,1024);
  scene.add(hemi, dir);

  // Camera
  camera.position.set(0, 100, 200);
  camera.lookAt(0, 60, 0);

  // Resize follows your earlier fix
  function onResize(){
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w/h; camera.updateProjectionMatrix();
    renderer.setSize(w,h);
  }
  onResize(); window.addEventListener('resize', onResize);

  return {
    add: (obj) => scene.add(obj),
    update: (dt)=>{ /* add world-level effects if needed */ },
    dispose(){ window.removeEventListener('resize', onResize); }
  };
}