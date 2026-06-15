import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';

// WKWebView (Quick Look 拡張) から起動された場合、console を Swift 側の
// os_log に転送する。ブラウザ単体実行時は messageHandlers が無いので無視される。
const nativeLog = (window as any).webkit?.messageHandlers?.log;
if (nativeLog) {
  const forward = (level: string, args: unknown[]) => {
    try {
      nativeLog.postMessage(
        `[${level}] ` +
          args
            .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
            .join(' '),
      );
    } catch {
      /* noop */
    }
  };
  for (const level of ['log', 'warn', 'error'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      forward(level, args);
      orig(...args);
    };
  }
  window.addEventListener('error', (e) =>
    forward('error', [e.message, e.filename, e.lineno]),
  );
  window.addEventListener('unhandledrejection', (e) =>
    forward('error', ['unhandledrejection', String(e.reason)]),
  );
}

// ---------------------------------------------------------------------------
// セットアップ
// ---------------------------------------------------------------------------
const app = document.getElementById('app')!;
const overlay = document.getElementById('overlay')!;
const overlayText = document.getElementById('overlay-text')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 1.3, 3);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.update();

// ライティング（キーライト + フィル + 環境光）
const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(1, 2, 1.5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
fillLight.position.set(-1.5, 1, -1);
scene.add(fillLight);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 0.6));

// 床のグリッド
const grid = new THREE.GridHelper(10, 20, 0x444444, 0x2a2a2a);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.4;
scene.add(grid);

// ---------------------------------------------------------------------------
// ローダー
// ---------------------------------------------------------------------------
const gltfLoader = new GLTFLoader();
gltfLoader.register((parser) => new VRMLoaderPlugin(parser));
const fbxLoader = new FBXLoader();

// VRM でも素の glTF/GLB でも、シーンに足した root を覚えておいて差し替える
let currentRoot: THREE.Object3D | null = null;
let currentVrm: VRM | null = null;
let currentMixer: THREE.AnimationMixer | null = null;
let currentSkeletonHelper: THREE.SkeletonHelper | null = null;
const clock = new THREE.Clock();

/** メッシュ（描画される面）を持つか。VRMA や スキン無し FBX は false。 */
function hasRenderableMesh(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) found = true;
  });
  return found;
}

function showOverlay(text: string, isError = false) {
  overlayText.textContent = text;
  overlay.classList.toggle('error', isError);
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

/** モデルのバウンディングボックスからカメラとターゲットを自動調整する */
function frameModel(root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(root);
  // メッシュが無い（ボーンだけ）と box が空になるので、各ノードの位置から算出する
  if (box.isEmpty()) {
    const p = new THREE.Vector3();
    root.updateWorldMatrix(true, true);
    root.traverse((o) => box.expandByPoint(o.getWorldPosition(p)));
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // 全身が収まる距離を視野角から逆算
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  const distance = (maxDim / 2 / Math.tan(fov / 2)) * 1.4;

  controls.target.copy(center);
  camera.position.set(center.x, center.y + size.y * 0.05, center.z + distance);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

/** 現在表示中のモデル（VRM / glTF / FBX / VRMA どれでも）を破棄する */
function disposeCurrent() {
  if (currentMixer) {
    currentMixer.stopAllAction();
    currentMixer = null;
  }
  if (currentSkeletonHelper) {
    scene.remove(currentSkeletonHelper);
    currentSkeletonHelper.dispose();
    currentSkeletonHelper = null;
  }
  if (currentRoot) {
    scene.remove(currentRoot);
    VRMUtils.deepDispose(currentRoot);
    currentRoot = null;
  }
  currentVrm = null;
}

/** 先頭バイトを見て FBX かどうか判定する（VRM/GLB は "glTF" マジックで始まる） */
function isFBX(u8: Uint8Array): boolean {
  // バイナリ FBX: "Kaydara FBX Binary  \x00"
  const sig = 'Kaydara FBX Binary';
  let binMatch = u8.length > sig.length;
  for (let i = 0; binMatch && i < sig.length; i++) {
    if (u8[i] !== sig.charCodeAt(i)) binMatch = false;
  }
  if (binMatch) return true;
  // ASCII FBX: 先頭付近に "FBX" を含む（GLB は 'glTF' なので該当しない）
  const head = new TextDecoder().decode(u8.subarray(0, 64));
  return head.includes('FBX');
}

/** 読み込んだ root をシーンに反映する（VRM / glTF / FBX / VRMA 共通の後処理） */
function applyModel(
  root: THREE.Object3D,
  vrm: VRM | null,
  clips: THREE.AnimationClip[],
) {
  // アニメーションクリップがあれば先頭を再生（GLB/FBX のアニメ、VRMA など）
  if (clips.length > 0) {
    currentMixer = new THREE.AnimationMixer(root);
    currentMixer.clipAction(clips[0]).play();
  }
  // フラスタムカリングで一部メッシュが消えるのを防ぐ
  root.traverse((obj) => {
    obj.frustumCulled = false;
  });
  scene.add(root);

  // メッシュが無くアニメーションだけ（VRMA / スキン無し FBX）は
  // ボーン階層をスケルトンヘルパーで可視化する。
  if (!vrm && clips.length > 0 && !hasRenderableMesh(root)) {
    root.traverse((o) => {
      // SkeletonHelper はボーンのみを線で結ぶので、ノードを Bone 扱いにする
      if (o !== root) (o as unknown as { isBone: boolean }).isBone = true;
    });
    currentSkeletonHelper = new THREE.SkeletonHelper(root);
    scene.add(currentSkeletonHelper);
  }

  currentRoot = root;
  currentVrm = vrm;
  frameModel(root);
  hideOverlay();
}

async function loadModelFromArrayBuffer(buffer: ArrayBuffer) {
  showOverlay('Loading…');
  try {
    disposeCurrent();

    if (isFBX(new Uint8Array(buffer))) {
      // --- FBX ---
      const root = fbxLoader.parse(buffer, '');
      applyModel(root, null, root.animations);
      console.log('FBX loaded & added to scene');
      return;
    }

    // --- VRM / VRMA / glTF / GLB ---
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const gltf = await gltfLoader.loadAsync(url);
    URL.revokeObjectURL(url);

    // VRM プラグインが解釈できれば userData.vrm が入る。無ければ素の glTF/GLB。
    // VRMA（メッシュ無し・アニメーションのみ）は vrm=null + animations あり となり、
    // applyModel 側でスケルトン表示に回る。
    const vrm = (gltf.userData.vrm as VRM | undefined) ?? null;
    if (vrm) {
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(vrm); // VRM 0.x の座標系（Z+ 向き）を補正
    }
    applyModel(vrm ? vrm.scene : gltf.scene, vrm, vrm ? [] : gltf.animations);
    console.log(
      vrm
        ? 'VRM loaded & added to scene'
        : hasRenderableMesh(gltf.scene)
          ? 'glTF/GLB loaded & added to scene'
          : 'skeleton (mesh-less) loaded & added to scene',
    );
  } catch (e) {
    console.error('[model] load failed', e);
    showOverlay('読み込みに失敗しました', true);
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ---------------------------------------------------------------------------
// Swift 側（WKWebView）からの受け口
//   window.postMessage({ type: 'loadVRM', base64 }) で受け取る
// ---------------------------------------------------------------------------
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'loadVRM') return;
  console.log('received loadVRM message, base64 length =', event.data.base64?.length);
  void loadModelFromArrayBuffer(base64ToArrayBuffer(event.data.base64));
});

console.log('renderer booted, WebGL context =', !!renderer.getContext());

// ブラウザでの開発用フォールバック ---------------------------------------
// 1) ?url=... が付いていればそれを読み込む
// 2) .vrm ファイルをウィンドウにドラッグ&ドロップして読み込む
(function devFallbacks() {
  const params = new URLSearchParams(location.search);
  const url = params.get('url');
  if (url) {
    showOverlay('Loading…');
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => loadModelFromArrayBuffer(buf))
      .catch(() => showOverlay('読み込みに失敗しました', true));
  } else if (location.protocol.startsWith('http')) {
    showOverlay('.vrm / .vrma / .glb / .fbx をドラッグ&ドロップ');
  }

  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    file.arrayBuffer().then((buf) => loadModelFromArrayBuffer(buf));
  });
})();

// ---------------------------------------------------------------------------
// レンダリングループ
// ---------------------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  controls.update();
  if (currentVrm) currentVrm.update(delta); // 揺れもの・表情などの更新
  if (currentMixer) currentMixer.update(delta); // glTF/GLB のアニメーション
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
