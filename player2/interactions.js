// interactions.js
// Versão com Pointer Capture + touch-action:none para evitar pointercancel por gestos nativos.
// Logs opcionais ativáveis em runtime com window.__debugDrag = true
// Substitua apenas este arquivo (faça backup primeiro).

import { TAP_DELAY } from "./config.js";

const THREE = window.MINDAR && window.MINDAR.IMAGE ? window.MINDAR.IMAGE.THREE : window.THREE;

export class InteractionManager {
  constructor(camera, scene, modelManager) {
    this.camera = camera;
    this.scene = scene;
    this.modelManager = modelManager;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // Estado do drag
    this.draggingObject = null;
    this.dragPlane = new THREE.Plane();
    this.dragOffset = new THREE.Vector3();
    this.initialPointerPos = new THREE.Vector2();
    this.hasMoved = false;

    // Incremental trackers (para touch)
    this._lastDesiredWorld = null;
    this._lastWorldPos = null;

    // Sensibilidades
    this._mouseSensitivity = 1.0;
    this._defaultTouchSensitivity = 12.0; // <-- ajuste se quiser (valores maiores => arraste mais "amplificado")

    // pointer type/session
    this._currentPointerType = null;
    this._currentSensitivity = this._mouseSensitivity;

    // Pointer capture housekeeping
    this._pointerId = null;
    this._capturedElement = null;

    // Tap (double-tap remove)
    this.tapData = new Map();

    // Debug / logs
    // Ative no console com: window.__debugDrag = true
    this._debug = !!window.__debugDrag;
    this._pointerDownTime = null;
    this._lastMoveTime = null;
    this._moveCount = 0;

    // Bound handlers
    this._boundPointerDown = (e) => this._onPointerDown(e);
    this._boundPointerMove = (e) => this._onPointerMove(e);
    this._boundPointerUp   = (e) => this._onPointerUp(e);
    this._boundPointerCancel = (e) => this._onPointerCancel(e);
  }

  init() {
    // **Crucial fix**: tell the browser not to handle native touch gestures
    // This prevents the browser from cancelling pointer events (pointercancel)
    // due to scrolling/pinch gestures. This is safe for an AR app that occupies
    // the viewport and doesn't need page scroll.
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      try {
        document.body.style.touchAction = 'none';
        // old IE prefix
        document.body.style.msTouchAction = 'none';
        if (this._debug) console.log("[drag] touch-action set to 'none' on body");
      } catch (err) {
        if (this._debug) console.warn("[drag] failed to apply touch-action:none", err);
      }
    }

    if (window.PointerEvent) {
      document.body.addEventListener("pointerdown", this._boundPointerDown, { passive: false });
      document.body.addEventListener("pointermove", this._boundPointerMove, { passive: false });
      document.body.addEventListener("pointerup",   this._boundPointerUp,   { passive: false });
      document.body.addEventListener("pointercancel", this._boundPointerCancel, { passive: false });
    } else {
      document.body.addEventListener("touchstart", this._boundPointerDown, { passive: false });
      document.body.addEventListener("touchmove",  this._boundPointerMove, { passive: false });
      document.body.addEventListener("touchend",   this._boundPointerUp,   { passive: false });
      document.body.addEventListener("touchcancel", this._boundPointerCancel, { passive: false });

      document.body.addEventListener("mousedown", this._boundPointerDown, { passive: false });
      document.body.addEventListener("mousemove", this._boundPointerMove, { passive: false });
      document.body.addEventListener("mouseup",   this._boundPointerUp,   { passive: false });
    }
  }

  // Helpers
  _getNormalizedPointer(event) {
    const clientX = event.clientX ?? (event.touches && event.touches[0] && event.touches[0].clientX) ?? 0;
    const clientY = event.clientY ?? (event.touches && event.touches[0] && event.touches[0].clientY) ?? 0;

    return {
      x: (clientX / window.innerWidth) * 2 - 1,
      y: -(clientY / window.innerHeight) * 2 + 1
    };
  }

  _collectInteractiveObjects() {
    const objects = [];
    if (this.modelManager && this.modelManager.gameGroups) {
      this.modelManager.gameGroups.forEach(group => {
        if (group && group.visible) {
          group.traverse(child => {
            if (child.isMesh) objects.push(child);
          });
        }
      });
    }
    return objects;
  }

  _findClickableParent(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.clickable && current.userData.isGameMode) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  _detectPointerType(event) {
    let ptype = 'mouse';
    if (event.pointerType) {
      ptype = event.pointerType;
    } else if (event.type) {
      if (event.type.startsWith('touch')) ptype = 'touch';
      else if (event.type.startsWith('mouse')) ptype = 'mouse';
    }
    if (ptype === 'pen') ptype = 'touch';
    return (ptype === 'touch') ? 'touch' : 'mouse';
  }

  // --- Event handlers ---
  _onPointerDown(event) {
    // dynamic debug flag update
    this._debug = !!window.__debugDrag;

    // IGNORE UI clicks
    if (event.target && (event.target.tagName === 'IMG' || (event.target.closest && event.target.closest('#uiContainerBottom')))) {
      if (this._debug) console.log("[drag] pointerdown ignored on UI target");
      return;
    }

    if (event.cancelable) {
      try { event.preventDefault(); } catch (e) { /* ignore */ }
    }

    // pointer type & sensitivity
    this._currentPointerType = this._detectPointerType(event);
    this._currentSensitivity = (this._currentPointerType === 'mouse')
      ? this._mouseSensitivity
      : (window.__touchSensitivity ?? this._defaultTouchSensitivity);

    // Try pointer capture if available (keeps events even if finger leaves element)
    if (typeof event.pointerId !== 'undefined' && event.target && typeof event.target.setPointerCapture === 'function') {
      try {
        event.target.setPointerCapture(event.pointerId);
        this._pointerId = event.pointerId;
        this._capturedElement = event.target;
        if (this._debug) console.log(`[drag] setPointerCapture id=${this._pointerId}`, { pointerType: this._currentPointerType });
      } catch (err) {
        if (this._debug) console.warn("[drag] setPointerCapture failed:", err);
      }
    }

    const pointerCoords = this._getNormalizedPointer(event);
    this.pointer.set(pointerCoords.x, pointerCoords.y);
    this.initialPointerPos.set(pointerCoords.x, pointerCoords.y);
    this.hasMoved = false;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const interactiveObjects = this._collectInteractiveObjects();
    const intersects = this.raycaster.intersectObjects(interactiveObjects, true);

    if (!intersects || intersects.length === 0) {
      this.draggingObject = null;
      if (this._debug) console.log("[drag] pointerdown: no intersects");
      return;
    }

    const clickableObj = this._findClickableParent(intersects[0].object);
    if (!clickableObj) {
      this.draggingObject = null;
      if (this._debug) console.log("[drag] pointerdown: no clickable parent");
      return;
    }

    this.draggingObject = clickableObj;

    const worldPos = new THREE.Vector3();
    clickableObj.getWorldPosition(worldPos);

    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir);

    this.dragPlane.setFromNormalAndCoplanarPoint(cameraDir.clone().negate(), worldPos);

    const intersectionPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint);
    this.dragOffset.copy(worldPos).sub(intersectionPoint);

    // initialize trackers incremental
    const desiredWorld = intersectionPoint.clone().add(this.dragOffset);
    this._lastDesiredWorld = desiredWorld.clone();
    this._lastWorldPos = worldPos.clone();

    // timing & debug counters
    this._pointerDownTime = Date.now();
    this._lastMoveTime = this._pointerDownTime;
    this._moveCount = 0;

    if (this._debug) {
      console.log("[drag] pointerdown",
        {
          pointerId: event.pointerId ?? null,
          pointerType: this._currentPointerType,
          sensitivity: this._currentSensitivity,
          modelIndex: clickableObj.userData && clickableObj.userData.modelIndex
        });
    }

    // register tap (double-tap)
    this._registerTap(clickableObj);
  }

  _onPointerMove(event) {
    // dynamic debug flag update
    this._debug = !!window.__debugDrag;

    if (!this.draggingObject) {
      return;
    }

    if (event.cancelable) {
      try { event.preventDefault(); } catch (e) { /* ignore */ }
    }

    const pointerCoords = this._getNormalizedPointer(event);
    this.pointer.set(pointerCoords.x, pointerCoords.y);

    const dx = pointerCoords.x - this.initialPointerPos.x;
    const dy = pointerCoords.y - this.initialPointerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 0.01) this.hasMoved = true;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersectionPoint = new THREE.Vector3();
    const ok = this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint);
    if (!ok) {
      if (this._debug) console.warn("[drag] intersectPlane returned false on move");
      return;
    }

    const desiredWorld = intersectionPoint.clone().add(this.dragOffset);

    let newWorldPos;
    if (this._currentPointerType === 'mouse') {
      newWorldPos = desiredWorld.clone();
    } else {
      const prevDesired = this._lastDesiredWorld ? this._lastDesiredWorld : desiredWorld.clone();
      const delta = desiredWorld.clone().sub(prevDesired);
      const scaledDelta = delta.clone().multiplyScalar(this._currentSensitivity);

      if (scaledDelta.length() < 1e-6) {
        const fallback = desiredWorld.clone().sub(this._lastWorldPos || desiredWorld).multiplyScalar(Math.max(this._currentSensitivity, 2.0));
        if (fallback.length() < 1e-7) {
          newWorldPos = (this._lastWorldPos ? this._lastWorldPos.clone() : desiredWorld.clone()).lerp(desiredWorld.clone(), 0.5);
        } else {
          newWorldPos = (this._lastWorldPos ? this._lastWorldPos.clone() : desiredWorld.clone()).add(fallback);
        }
      } else {
        newWorldPos = (this._lastWorldPos ? this._lastWorldPos.clone() : desiredWorld.clone()).add(scaledDelta);
      }
    }

    // apply
    const parent = this.draggingObject.parent;
    if (parent) {
      const localPos = parent.worldToLocal(newWorldPos.clone());
      this.draggingObject.position.copy(localPos);
    } else {
      this.draggingObject.position.copy(newWorldPos);
    }

    // update trackers
    this._lastDesiredWorld = desiredWorld.clone();
    this._lastWorldPos = newWorldPos.clone();

    // debug logging (throttled)
    this._moveCount++;
    const now = Date.now();
    if (this._debug && (this._moveCount % 3 === 0)) {
      console.log("[drag] pointermove",
        {
          tSinceDown_ms: now - (this._pointerDownTime || now),
          tSinceLastMove_ms: now - (this._lastMoveTime || now),
          moveCount: this._moveCount,
          pointerType: this._currentPointerType,
          scaledDeltaLen: (this._lastWorldPos && desiredWorld) ? desiredWorld.distanceTo(this._lastWorldPos) : null
        });
    }
    this._lastMoveTime = now;
  }

  _onPointerUp(event) {
    // release pointer capture if we had it
    if (this._pointerId !== null && this._capturedElement) {
      try {
        if (typeof this._capturedElement.releasePointerCapture === 'function') {
          this._capturedElement.releasePointerCapture(this._pointerId);
        }
        if (this._debug) console.log("[drag] releasePointerCapture id=", this._pointerId);
      } catch (err) {
        if (this._debug) console.warn("[drag] releasePointerCapture failed:", err);
      }
      this._pointerId = null;
      this._capturedElement = null;
    }

    if (event.cancelable) {
      try { event.preventDefault(); } catch (e) { /* ignore */ }
    }

    if (!this.draggingObject) {
      if (this._debug) console.log("[drag] pointerup but no draggingObject");
      return;
    }

    const now = Date.now();
    const duration = this._pointerDownTime ? (now - this._pointerDownTime) : null;

    if (this._debug) {
      console.log("[drag] pointerup",
        {
          pointerType: this._currentPointerType,
          duration_ms: duration,
          totalMoves: this._moveCount
        });
    }

    // cleanup
    this.draggingObject = null;
    this.hasMoved = false;
    this._lastDesiredWorld = null;
    this._lastWorldPos = null;
    this._currentPointerType = null;
    this._currentSensitivity = this._mouseSensitivity;
    this._pointerDownTime = null;
    this._lastMoveTime = null;
    this._moveCount = 0;
  }

  _onPointerCancel(event) {
    this._debug = !!window.__debugDrag;

    if (this._debug) {
      console.warn("[drag] pointercancel detected", {
        pointerId: event.pointerId ?? null,
        type: event.type,
        pointerType: event.pointerType ?? null
      });
    }

    // release capture if present
    if (this._pointerId !== null && this._capturedElement) {
      try {
        if (typeof this._capturedElement.releasePointerCapture === 'function') {
          this._capturedElement.releasePointerCapture(this._pointerId);
        }
        if (this._debug) console.log("[drag] releasePointerCapture (cancel) id=", this._pointerId);
      } catch (err) {
        if (this._debug) console.warn("[drag] releasePointerCapture failed (cancel):", err);
      }
      this._pointerId = null;
      this._capturedElement = null;
    }

    // cleanup similar to pointerup
    this.draggingObject = null;
    this.hasMoved = false;
    this._lastDesiredWorld = null;
    this._lastWorldPos = null;
    this._currentPointerType = null;
    this._currentSensitivity = this._mouseSensitivity;
    this._pointerDownTime = null;
    this._lastMoveTime = null;
    this._moveCount = 0;
  }

  // Tap/double-tap
  _registerTap(object) {
    const now = Date.now();
    const id = object.uuid;

    if (!this.tapData.has(id)) {
      this.tapData.set(id, { count: 1, lastTap: now, timer: null });
      const that = this;
      const t = setTimeout(() => { that.tapData.delete(id); }, TAP_DELAY);
      this.tapData.get(id).timer = t;
    } else {
      const data = this.tapData.get(id);
      if (now - data.lastTap > TAP_DELAY) {
        data.count = 1;
      } else {
        data.count++;
      }
      data.lastTap = now;

      if (data.timer) {
        clearTimeout(data.timer);
        data.timer = null;
      }

      if (data.count >= 2) {
        this._removeObject(object);
        this.tapData.delete(id);
        return;
      }

      const that = this;
      data.timer = setTimeout(() => { that.tapData.delete(id); }, TAP_DELAY);
    }
  }

  _removeObject(object) {
    if (object && object.parent) {
      object.parent.remove(object);
      if (this.modelManager) {
        const gi = this.modelManager.gameObjects.indexOf(object);
        if (gi !== -1) this.modelManager.gameObjects.splice(gi, 1);
        const di = this.modelManager.demoObjects.indexOf(object);
        if (di !== -1) this.modelManager.demoObjects.splice(di, 1);
      }
      if (this._debug) console.log("[drag] object removed via double-tap", { uuid: object.uuid });
    }
  }
}
