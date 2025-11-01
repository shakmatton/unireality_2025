// interactions.js
// Versão: bloqueio do movimento em Z (2D-only drag) + pointer-capture + smoothing
// Mantém double-tap para remoção (2 taps) conforme sua versão recente.

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

    // keep the locked local Z for the dragging object (to ensure 2D movement)
    this._draggingObjectInitialLocalZ = 0;

    // Tap state for removal (double-tap)
    this.tapData = new Map();

    // Sensitivity & smoothing
    this._defaultTouchSensitivity = typeof opts.sensitivity === "number" ? opts.sensitivity : 1.0;
    this._smoothing = typeof opts.smoothing === "number" ? opts.smoothing : 0.9;

    // logging throttle
    this._lastMoveLog = 0;
    this._moveLogInterval = 250;
  }

  setSensitivity(v) {
    const n = Number(v) || 1.0;
    this._defaultTouchSensitivity = Math.max(0.1, Math.min(12, n));
    console.debug("[IM] sensitivity set to", this._defaultTouchSensitivity);
  }

  init() {
    try { document.body.style.touchAction = "none"; } catch (e) { /* ignore */ }

    document.body.addEventListener("pointerdown", (e) => this._onPointerDown(e), { passive: false });
    document.body.addEventListener("pointermove", (e) => this._onPointerMove(e), { passive: false });
    document.body.addEventListener("pointerup", (e) => this._onPointerUp(e), { passive: false });
    document.body.addEventListener("pointercancel", (e) => this._onPointerUp(e), { passive: false });

    // keep console debug for diagnosis
    console.debug("[IM] init (touch-action:none). sensitivity=", this._defaultTouchSensitivity);
  }

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

  _findClickableParent(object) {
    let cur = object;
    while (cur) {
      if (cur.userData && cur.userData.clickable && cur.userData.isGameMode) return cur;
      cur = cur.parent;
    }
    return null;
  }

  _onPointerDown(event) {
    try {
      if (event.target && (event.target.tagName === "IMG" || (event.target.closest && event.target.closest("#uiContainerBottom")))) {
        return;
      }
    } catch (e) {}

    try { event.preventDefault(); } catch (e) {}

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
      return;
    }

    this.draggingObject = clickable;

    // store initial local Z to lock depth during drag
    // get local z relative to parent
    const parent = clickable.parent;
    if (parent) {
      // ensure worldToLocal works: compute current world position and convert to parent local
      const worldPos = new THREE.Vector3();
      clickable.getWorldPosition(worldPos);
      const localPos = parent.worldToLocal(worldPos.clone());
      this._draggingObjectInitialLocalZ = localPos.z;
    } else {
      this._draggingObjectInitialLocalZ = clickable.position.z;
    }

    // plane perpendicular to camera, passing through object world position
    const worldPos = new THREE.Vector3();
    clickable.getWorldPosition(worldPos);
    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir);
    this.dragPlane.setFromNormalAndCoplanarPoint(cameraDir.clone().negate(), worldPos);

    const intersectionPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint);
    this.dragOffset.copy(worldPos).sub(intersectionPoint);

    // register tap for removal (double-tap)
    this._registerTap(clickable);

    console.debug("[IM] drag started", { uuid: clickable.uuid, fixedLocalZ: this._draggingObjectInitialLocalZ });
  }

  _onPointerMove(event) {
    if (!this.draggingObject) return;
    try { event.preventDefault(); } catch (e) {}

    const coords = this._getNormalizedPointer(event);
    this.pointer.set(coords.x, coords.y);

    const dx = coords.x - this.initialPointerPos.x;
    const dy = coords.y - this.initialPointerPos.y;
    const distance = Math.sqrt(dx*dx + dy*dy);
    if (distance > 0.01) this.hasMoved = true;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersectionPoint = new THREE.Vector3();
    const ok = this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint);
    if (!ok) return;

    const desiredWorld = intersectionPoint.clone().add(this.dragOffset);

    // convert to local coordinates of parent to get local x,y and preserve local z
    const parent = this.draggingObject.parent;
    let desiredLocal;
    if (parent) {
      desiredLocal = parent.worldToLocal(desiredWorld.clone());
    } else {
      desiredLocal = desiredWorld.clone();
    }

    // LOCK Z: enforce the stored local Z (so the object will not move towards/away)
    desiredLocal.z = this._draggingObjectInitialLocalZ;

    // smoothing/lerp applied to position to avoid jumps
    const sensitivity = Math.max(0.1, Math.min(12, this._defaultTouchSensitivity));
    const smoothingFactor = Math.max(0.01, Math.min(0.99, this._smoothing));
    const blend = Math.min(0.98, Math.max(0.05, smoothingFactor * (0.8 + 0.05 * Math.log(sensitivity + 1))));

    try {
      this.draggingObject.position.lerp(desiredLocal, blend);
    } catch (err) {
      this.draggingObject.position.copy(desiredLocal);
    }

    // throttle logs
    const now = Date.now();
    if (now - this._lastMoveLog > this._moveLogInterval) {
      console.debug("[IM] dragging", {
        uuid: this.draggingObject.uuid,
        localPos: this.draggingObject.position.toArray().map(n=>n.toFixed(3)),
        fixedLocalZ: this._draggingObjectInitialLocalZ,
        blend: blend.toFixed(3)
      });
      this._lastMoveLog = now;
    }
  }

  _onPointerUp(event) {
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

      // NOTE: you previously had triple-tap; per your last requests, we use 2-tap removal
      if (data.count >= 2) {
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
