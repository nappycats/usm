/**
 * Three FX adapter
 * WHAT: Camera shake driven by timeAdapter + tiny helpers for quick meshes/lights.
 * WHY : Common game/site effects without bloating the core three adapter.
 */
import { createAdapter } from '../../usm-core';

export interface ThreeFxOpts {
  camera: any; // THREE.Camera
  THREE: any;
  intensity?: number;   // default 0.02
  decay?: number;       // how fast the shake falls (default 2.5)
}

export function threeFxAdapter({ camera, THREE, intensity=0.02, decay=2.5 }: ThreeFxOpts){
  return createAdapter('three-fx','1.0.0',['fx'], (usm)=>{
    const basePos = camera.position.clone();
    const baseRot = camera.rotation.clone();
    let power = 0;
    const t = (usm.context as any).time;

    function shake(add = 0.25){
      power = Math.min(1, power + add); // kick strength
    }

    // Small builder helpers (optional sugar)
    function box(w=1,h=1,d=1,color=0xffffff){
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w,h,d),
        new THREE.MeshStandardMaterial({ color })
      );
      return m;
    }
    function light(intensity=0.8){
      return new THREE.DirectionalLight(0xffffff, intensity);
    }

    (usm.context as any).fx = { shake, box, light };

    return {
      onStart(){
        if (!t?.onFrame) return;
        const rand = (s:number)=> (Math.sin(s*12.9898)*43758.5453)%1 - 0.5; // cheap hash noise
        t.onFrame((dt:number)=>{
          // exponential decay towards zero
          power = Math.max(0, power - decay * dt);
          if (power <= 0.0001){
            camera.position.copy(basePos);
            camera.rotation.copy(baseRot);
            return;
          }
          const p = power*intensity;
          camera.position.set(
            basePos.x + rand(t.elapsed+1)*p,
            basePos.y + rand(t.elapsed+2)*p,
            basePos.z + rand(t.elapsed+3)*p
          );
          camera.rotation.x = baseRot.x + rand(t.elapsed+4)*p*0.5;
          camera.rotation.y = baseRot.y + rand(t.elapsed+5)*p*0.5;
        });
      },
      onStop(){
        camera.position.copy(basePos);
        camera.rotation.copy(baseRot);
      }
    };
  });
}