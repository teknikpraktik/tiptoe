/**
 * 3D-jämförelsen i spik 1: en statisk glTF-modell i Three.js ovanpå kamerabilden. Laddas bara med `import()` (egen bunt), så att
 * Three.js aldrig hamnar i huvudbunten. Används bara om spiken visar att 3D är stabilt på iPhone.
 */
import { AmbientLight, DirectionalLight, Group, PerspectiveCamera, Scene, WebGLRenderer, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EYE_HEIGHT_M } from "./projection";

export interface ThreeView {
  canvas: HTMLCanvasElement;
  loadMs: number;
  resize(w: number, h: number, dpr: number): void;
  /** Kamerans kurs/höjd, djurets bäring, avstånd och kurs (grader), synfält (vertikalt, grader, redan delat med zoomen). */
  render(o: { yawDeg: number; pitchDeg: number; bearingDeg: number; distM: number; animalHeadingDeg: number; vfovDeg: number; nudgeDeg: number }): void;
  info(): { geometries: number; textures: number; calls: number; triangles: number };
  dispose(): void;
}

const rad = (d: number) => (d * Math.PI) / 180;

export async function createThreeView(modelUrl: string): Promise<ThreeView> {
  const t0 = performance.now();
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  scene.add(new AmbientLight(0xfff1dd, 1.1));
  const sun = new DirectionalLight(0xffe2b8, 1.6);
  sun.position.set(-3, 6, 2);
  scene.add(sun);
  const camera = new PerspectiveCamera(50, 1, 0.1, 500);
  camera.rotation.order = "YXZ";
  camera.position.set(0, EYE_HEIGHT_M, 0);
  const gltf = await new GLTFLoader().loadAsync(modelUrl);
  const holder = new Group();
  holder.add(gltf.scene as Object3D);
  scene.add(holder);
  const loadMs = performance.now() - t0;
  return {
    canvas: renderer.domElement,
    loadMs,
    resize(w, h, dpr) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    render(o) {
      // Världen: x = öster, y = upp, −z = norr. Kurs medsols ⇒ negativ rotation kring y.
      holder.position.set(Math.sin(rad(o.bearingDeg)) * o.distM, 0, -Math.cos(rad(o.bearingDeg)) * o.distM);
      holder.rotation.y = Math.PI - rad(o.animalHeadingDeg); // modellen tittar längs +z
      camera.rotation.set(rad(o.pitchDeg + o.nudgeDeg), -rad(o.yawDeg), 0);
      if (Math.abs(camera.fov - o.vfovDeg) > 0.01) { camera.fov = o.vfovDeg; camera.updateProjectionMatrix(); }
      renderer.render(scene, camera);
    },
    info() { const i = renderer.info; return { geometries: i.memory.geometries, textures: i.memory.textures, calls: i.render.calls, triangles: i.render.triangles }; },
    dispose() { renderer.dispose(); renderer.forceContextLoss(); },
  };
}
