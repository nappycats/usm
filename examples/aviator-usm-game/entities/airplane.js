// AirPlane.js
export class AirPlane {
  constructor(ctx){
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.hp = 3;

    // Fuselage
    const geo = new THREE.BoxGeometry(40, 8, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5533, roughness:0.6, metalness:0.2 });
    const body = new THREE.Mesh(geo, mat); body.castShadow = body.receiveShadow = true;
    body.position.y = 60;
    this.group.add(body);

    // Propeller
    const pGeo = new THREE.BoxGeometry(1, 40, 4);
    const pMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness:.6, roughness:.3 });
    const prop = new THREE.Mesh(pGeo, pMat);
    prop.position.set(20, 60, 0);
    this.group.add(prop);
    this.propeller = prop;

    // Target for mouse-follow
    this.target = new THREE.Vector2(0, 60);

    // Simple gun timing
    this.cooldown = 0;
  }

  setTargetFromPointer(p){
    // p.localX/localY are canvas coords; map to game space
    const nx = (p.localX / p.width)  * 2 - 1;
    const ny = (p.localY / p.height) * 2 - 1;
    this.target.set(nx * 80, 60 + ny * 40);
  }

  shoot(){
    if (this.cooldown > 0) return;
    this.cooldown = 0.2; // seconds
    // TODO: spawn bullet meshes and animate forward; for now, just a flash on prop
    const { tween } = this.ctx;
    const s = { k:1 };
    tween.to(s, { k:1.25 }, { duration:.08, ease:'quadOut',
      onUpdate:()=> this.propeller.scale.set(1, s.k, 1),
      onComplete:()=> tween.to(s, { k:1 }, { duration:.12, ease:'quadIn', onUpdate:()=> this.propeller.scale.set(1, s.k, 1) })
    });
  }

  takeHit(){ this.hp--; }

  update(dt){
    // Smoothly move toward target
    const pos = this.group.position;
    pos.x += (this.target.x - pos.x) * Math.min(1, dt*3);
    pos.y += (this.target.y - pos.y) * Math.min(1, dt*3);

    // Propeller spin
    this.propeller.rotation.x += dt * 50;

    // Cooldown
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  dispose(){ /* free geometries/materials if you add buffers */ }
}