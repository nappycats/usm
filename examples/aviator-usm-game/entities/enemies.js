// Enemies.js
export class Enemies {
  constructor(ctx){
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.spawnTimer = 2;
  }

  spawnOne(){
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 0),
      new THREE.MeshStandardMaterial({ color: 0xee3344, metalness:.2, roughness:.6 })
    );
    m.position.set(220, 50 + Math.random()*40, (Math.random()-0.5)*200);
    m.userData.vx = -80 - Math.random()*40;
    this.group.add(m);
  }

  update(dt, plane, onHit){
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 1.6 + Math.random()*0.8; this.spawnOne(); }

    const toRemove = [];
    for (const m of this.group.children){
      m.position.x += m.userData.vx * dt;
      m.rotation.y += dt*1.5;
      if (m.position.distanceTo(plane.group.position) < 18){
        onHit?.();
        toRemove.push(m);
      } else if (m.position.x < -260){
        toRemove.push(m);
      }
    }
    toRemove.forEach(m => this.group.remove(m));
  }

  dispose(){ this.group.clear(); }
}