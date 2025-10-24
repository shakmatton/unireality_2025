// interactions.js
// Versão robusta para drag em touch/mouse (pointer-capture, touch-action:none, smoothing)
// Mantém um parâmetro de sensibilidade (_defaultTouchSensitivity) que você pode ajustar
// sem causar efeitos colaterais. Logs discretos para debug (console.debug).

import { TAP_DELAY } from "./config.js";

const THREE = window.MINDAR && window.MINDAR.IMAGE ? window.MINDAR.IMAGE.THREE : window.THREE;

export class InteractionManager {
  constructor(camera, scene, modelManager, opts = {}) {
    this.camera = camera;
    this.scene = scene;
    this.modelManager = modelManager;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // Drag state
    this.draggingObject = null;
    this.dragPlane = new THREE.Plane();
    this.dragOffset = new THREE.Vector3();
    this.initialPointerPos = new THREE.Vector2();
    this.hasMoved = false;

    // Tap state for removal (double-tap)
    this.tapData = new Map();

    // Sensitivity (default 1.0). Valores maiores -> arraste mais "amplificado".
    // Você pode ajustar em runtime via `interactionManager.setSensitivity(x)`.
    this._defaultTouchSensitivity = typeof opts.sensitivity === "number" ? opts.sensitivity : 1.0;

    // smoothing factor: 0..1; quanto maior mais "grudento" o objeto (0.9 é quase sem atraso)
    this._smoothing = typeof opts.smoothing === "number" ? opts.smoothing : 0.9;

    // throttled logs
    this._lastMoveLog = 0;
    this._moveLogInterval = 250; // ms
  }

  // opcional: ajustar sensibilidade em runtime
  setSensitivity(v) {
    const n = Number(v) || 1.0;
    this._defaultTouchSensitivity = Math.max(0.1, Math.min(12, n));
    console.debug("[IM] sensitivity set to", this._defaultTouchSensitivity);
  }

  init() {
    // prevenir gestos nativos que atrapalham o pointer (scroll, swipe)
    try { document.body.style.touchAction = "none"; } catch (e) {}

    // registrando listeners preferencialmente com passive:false para permitir preventDefault
    document.body.addEventListener("pointerdown", (e) => this._onPointerDown(e), { passive: false });
    document.body.addEventListener("pointermove", (e) => this._onPointerMove(e), { passive: false });
    document.body.addEventListener("pointerup", (e) => this._onPointerUp(e), { passive: false });
    document.body.addEventListener("pointercancel", (e) => this._onPointerUp(e), { passive: false });

    // compatibilidade: touch fallback (não ideal se pointer events existirem)
    document.body.addEventListener("touchstart", (e) => { /* noop - pointer handles it */ }, { passive: false });

    console.debug("[IM] init (touch-action:none, listeners attached). sensitivity=", this._defaultTouchSensitivity);
  }

  // Normaliza coordenadas para NDC
  _getNormalizedPointer(event) {
    const clientX = (typeof event.clientX === "number") ? event.clientX :
                    (event.touches && event.touches[0] && event.touches[0].clientX) || 0;
    const clientY = (typeof event.clientY === "number") ? event.clientY :
                    (event.touches && event.touches[0] && event.touches[0].clientY) || 0;

    return {
      x: (clientX / window.innerWidth) * 2 - 1,
      y: -(clientY / window.innerHeight) * 2 + 1
    };
  }

  // Coleta meshes interativos (gameGroups)
  _collectInteractiveObjects() {
    const objects = [];
    try {
      if (this.modelManager && Array.isArray(this.modelManager.gameGroups)) {
        this.modelManager.gameGroups.forEach(grp => {
          if (grp && grp.visible) {
            grp.traverse(child => { if (child.isMesh) objects.push(child); });
          }
        });
      } else if (this.modelManager && Array.isArray(this.modelManager.gameObjects)) {
        this.modelManager.gameObjects.forEach(obj => {
          if (obj) obj.traverse(child => { if (child.isMesh) objects.push(child); });
        });
      }
    } catch (err) {
      console.warn("[IM] _collectInteractiveObjects error", err);
    }
    return objects;
  }

  // Sobe na hierarquia até achar userData.clickable e userData.isGameMode
  _findClickableParent(object) {
    let cur = object;
    while (cur) {
      if (cur.userData && cur.userData.clickable && cur.userData.isGameMode) return cur;
      cur = cur.parent;
    }
    return null;
  }

  _onPointerDown(event) {
    // Ignora cliques em UI imagens/botões
    try {
      if (event.target && (event.target.tagName === "IMG" || (event.target.closest && event.target.closest("#uiContainerBottom")))) {
        return;
      }
    } catch (e) { /* ignore */ }

    try { event.preventDefault(); } catch (e) {}
    // pointer capture para garantir receber pointermove/up mesmo se o dedo sair do elemento
    try {
      if (typeof event.pointerId === "number" && event.target && event.target.setPointerCapture) {
        event.target.setPointerCapture(event.pointerId);
      }
    } catch (e) {}

    const coords = this._getNormalizedPointer(event);
    this.pointer.set(coords.x, coords.y);
    this.initialPointerPos.set(coords.x, coords.y);
    this.hasMoved = false;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const pickables = this._collectInteractiveObjects();
    if (!pickables || pickables.length === 0) {
      this.draggingObject = null;
      console.debug("[IM] pointerdown - no pickables");
      return;
    }

    const intersects = this.raycaster.intersectObjects(pickables, true);
    console.debug("[IM] pointerdown intersects:", intersects.length);

    if (!intersects || intersects.length === 0) {
      this.draggingObject = null;
      return;
    }

    const clickable = this._findClickableParent(intersects[0].object);
    if (!clickable) {
      this.draggingObject = null;
      console.debug("[IM] pointerdown - no clickable parent");
      return;
    }

    // Iniciar drag
    this.draggingObject = clickable;

    // calcula world position do objeto e cria plano perpendicular à câmera
    const worldPos = new THREE.Vector3();
    clickable.getWorldPosition(worldPos);

    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir);

    this.dragPlane.setFromNormalAndCoplanarPoint(cameraDir.clone().negate(), worldPos);

    // interseção atual do raio com o plano
    const intersectionPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint);

    // offset = worldPos - intersectionPoint
    this.dragOffset.copy(worldPos).sub(intersectionPoint);

    // marca possível double-tap
    this._registerTap(clickable);

    console.debug("[IM] drag started", { uuid: clickable.uuid, sens: this._defaultTouchSensitivity });
  }

  _onPointerMove(event) {
    if (!this.draggingObject) return;
    try { event.preventDefault(); } catch (e) {}

    const coords = this._getNormalizedPointer(event);
    this.pointer.set(coords.x, coords.y);

    // detecta movimento mínimo
    const dx = coords.x - this.initialPointerPos.x;
    const dy = coords.y - this.initialPointerPos.y;
    const distance = Math.sqrt(dx*dx + dy*dy);
    if (distance > 0.01) this.hasMoved = true;

    // atualiza ray e interseção
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersectionPoint = new THREE.Vector3();
    const ok = this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint);
    if (!ok) return;

    // desired world pos = intersectionPoint + dragOffset
    const desiredWorld = intersectionPoint.clone().add(this.dragOffset);

    // Convertemos para coordenadas locais do parent do objeto
    const parent = this.draggingObject.parent;
    let desiredLocal;
    if (parent) {
      desiredLocal = parent.worldToLocal(desiredWorld.clone());
    } else {
      desiredLocal = desiredWorld.clone();
    }

    // Aplica sensibilidade como factor de suavização + escalonamento do delta
    // Em vez de multiplicar posição absoluta (que pode saltar), fazemos lerp do local atual -> desiredLocal
    // weight depende de smoothing e sensitivity. Valores altos de sensitivity => mais responsivo.
    const sensitivity = Math.max(0.1, Math.min(12, this._defaultTouchSensitivity));
    const smoothingFactor = Math.max(0.01, Math.min(0.99, this._smoothing)); // ex 0.9
    // combinação: blend = lerpWeight = 1 - (0.3 / sensitivity) clamped -> mas queremos que sens=1 seja responsivo
    // Vamos usar blend = smoothingFactor * (0.8 + 0.2 * (sensitivity / 4))
    const blend = Math.min(0.98, Math.max(0.05, smoothingFactor * (0.8 + 0.05 * Math.log(sensitivity + 1))));
    // Aplica lerp
    try {
      this.draggingObject.position.lerp(desiredLocal, blend);
    } catch (err) {
      // fallback assign direto
      this.draggingObject.position.copy(desiredLocal);
    }

    // logs throttled
    const now = Date.now();
    if (now - this._lastMoveLog > this._moveLogInterval) {
      console.debug("[IM] dragging", {
        uuid: this.draggingObject.uuid,
        desiredWorld: desiredWorld.toArray().map(n => n.toFixed(3)),
        localPos: this.draggingObject.position.toArray().map(n => n.toFixed(3)),
        sens: this._defaultTouchSensitivity,
        blend: blend.toFixed(3)
      });
      this._lastMoveLog = now;
    }
  }

  _onPointerUp(event) {
    // libera pointer capture se possível
    try {
      if (typeof event.pointerId === "number" && event.target && event.target.releasePointerCapture) {
        event.target.releasePointerCapture(event.pointerId);
      }
    } catch (e) {}

    if (!this.draggingObject) return;
    console.debug("[IM] drag ended", this.draggingObject.uuid);
    this.draggingObject = null;
    this.hasMoved = false;
  }

  _registerTap(object) {
    const now = Date.now();
    const id = object.uuid;
    if (!this.tapData.has(id)) {
      this.tapData.set(id, { count: 1, lastTap: now, timer: null });
    } else {
      const data = this.tapData.get(id);
      if (now - data.lastTap > TAP_DELAY) {
        data.count = 1;
      } else {
        data.count++;
      }
      data.lastTap = now;
      if (data.timer) clearTimeout(data.timer);

      if (data.count >= 2) { // double-tap remove
        console.debug("[IM] double-tap remove", id);
        this._removeObject(object);
        this.tapData.delete(id);
        return;
      }
      data.timer = setTimeout(() => { this.tapData.delete(id); }, TAP_DELAY);
    }
  }

  _removeObject(object) {
    if (!object) return;
    if (object.parent) object.parent.remove(object);
    if (this.modelManager && Array.isArray(this.modelManager.gameObjects)) {
      const idx = this.modelManager.gameObjects.indexOf(object);
      if (idx !== -1) this.modelManager.gameObjects.splice(idx, 1);
    }
    console.debug("[IM] removed object", object.uuid);
  }
}
