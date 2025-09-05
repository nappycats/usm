// Sky.js
export class Sky {
  constructor(ctx){
    this.group = new THREE.Group();
    // Build some clouds from boxes (as in the tutorial spirit)
    for (let i=0; i<20; i++){
      const cloud = new THREE.Group();
      const nBlocs = 3 + Math.floor(Math.random()*3);
      for (let j=0; j<nBlocs; j++){
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(20,20,20),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness:.95, metalness:0 })
        );
        m.position.set(j*15, Math.random()*10, Math.random()*10);
        m.castShadow = true; m.receiveShadow = true;
        cloud.add(m);
      }
      const a = (i/20) * Math.PI*2;
      const r = 400 + Math.random()*200;
      cloud.position.set(Math.cos(a)*r, 80+Math.random()*40, Math.sin(a)*r);
      cloud.rotation.y = a + Math.random();
      this.group.add(cloud);
    }
    this.mesh = this.group;
  }

  update(dt){
    this.group.children.forEach(c => c.rotation.y += dt*0.2);
  }

  dispose(){}
}