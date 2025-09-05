// Sea.js
export class Sea {
  constructor(ctx){
    const geo = new THREE.CylinderGeometry(600, 600, 20, 40, 10, true);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI/2));

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2266aa, roughness:.9, metalness:0, side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = -5;
    this.mesh.receiveShadow = true;

    // Wave params
    this.angle = 0;
  }

  update(dt){
    this.angle += dt * 0.2;
    this.mesh.rotation.z += dt * 0.05; // slow spin
  }

  dispose(){}
}