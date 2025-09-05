// Coins.js
export class Coins {
  constructor(ctx){
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.spawnTimer = 0;
  }

  spawnOne(){
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(6, 2, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd94a, metalness:.8, roughness:.25 })
    );
    m.position.set(200, 50 + Math.random()*40, (Math.random()-0.5)*200);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.vx = -60 - Math.random()*60; // fly toward camera/left
    this.group.add(m);
  }

  update(dt, plane, onPickup){
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 0.6 + Math.random()*0.6; this.spawnOne(); }

    const toRemove = [];
    for (const m of this.group.children){
      m.position.x += m.userData.vx * dt;
      m.rotation.y += dt*2;
      // Simple distance check to plane
      if (m.position.distanceTo(plane.group.position) < 15){
        onPickup?.(1);
        toRemove.push(m);
      } else if (m.position.x < -250){
        toRemove.push(m);
      }
    }
    toRemove.forEach(m => this.group.remove(m));
  }

  dispose(){ this.group.clear(); }
}