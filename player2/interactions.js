// interactions.js - Sistema de interações (drag, clique, rotação)

import { TAP_DELAY } from "./config.js";

const THREE = window.MINDAR.IMAGE.THREE;

export class InteractionManager {
  constructor(camera, scene, modelManager) {
    this.camera = camera;
    this.scene = scene;
    this.modelManager = modelManager;
    
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.draggingModel = null;
    this.initialPointer = new THREE.Vector2();
    this.initialPosition = new THREE.Vector3();
    this.isDragging = false;
    this.currentTapObject = null;
  }

  init() {
    document.body.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    document.body.addEventListener("pointermove", (e) => this.onPointerMove(e));
    document.body.addEventListener("pointerup", (e) => this.onPointerUp(e));
    document.body.addEventListener("touchstart", (e) => this.onPointerDown(e));
    document.body.addEventListener("touchmove", (e) => this.onPointerMove(e));
    document.body.addEventListener("touchend", (e) => this.onPointerUp(e));
  }

  onPointerDown(e) {
    if (e.target.closest("#uiContainerBottom") || 
        e.target.closest(".corner-btn") || 
        e.target.closest(".top-btn")) {
      return;
    }

    this.isDragging = false;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    this.initialPointer.set(clientX, clientY);
    this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.clickable) {
        obj = obj.parent;
      }
      if (obj.userData.clickable) {
        this.draggingModel = obj;
        this.currentTapObject = obj;
        this.initialPosition.copy(this.draggingModel.position);
      }
    }
  }

  onPointerMove(e) {
    if (!this.draggingModel) return;
    
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    const dx = clientX - this.initialPointer.x;
    const dy = clientY - this.initialPointer.y;
    
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      this.isDragging = true;
    }
    
    if (this.isDragging) {
      const deltaX = dx * 0.002575;
      const deltaY = dy * -0.002575;
      this.draggingModel.position.set(
        this.initialPosition.x + deltaX,
        this.initialPosition.y + deltaY,
        this.initialPosition.z
      );
    }
  }

  onPointerUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggingModel = null;
      return;
    }

    if (!this.currentTapObject) {
      this.draggingModel = null;
      return;
    }
    
    const obj = this.currentTapObject;
    obj.userData.tapCount = (obj.userData.tapCount || 0) + 1;

    if (obj.userData.tapTimer) {
      clearTimeout(obj.userData.tapTimer);
    }

    obj.userData.tapTimer = setTimeout(() => {
      const taps = obj.userData.tapCount;
      
      if (taps === 1 && obj.userData.rotatable) {
        // Rotação para objetos rotacionáveis
        obj.userData.targetRotation += THREE.Math.degToRad(90);
      } else if (taps === 2) {
        // Duplicar objeto
        this.modelManager.addClone(obj.userData.modelIndex, obj.position.clone());
      } else if (taps >= 3) {
        // Remover objeto
        if (obj.parent) {
          obj.parent.remove(obj);
        }
      }

      obj.userData.tapCount = 0;
      obj.userData.tapTimer = null;
    }, TAP_DELAY);

    this.currentTapObject = null;
    this.draggingModel = null;
  }
}
