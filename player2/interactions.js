// interactions.js - Sistema de interações com drag & drop funcional
// Alteração mínima: remoção por toques reduzida de 3 -> 2 (double-tap remove)

import { TAP_DELAY } from "./config.js";

const THREE = window.MINDAR.IMAGE.THREE;

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
    
    // Tap data (antes triple, agora double)
    this.tapData = new Map();
  }

  init() {
    document.body.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    document.body.addEventListener("pointermove", (e) => this._onPointerMove(e));
    document.body.addEventListener("pointerup", (e) => this._onPointerUp(e));
    document.body.addEventListener("touchstart", (e) => this._onPointerDown(e));
    document.body.addEventListener("touchmove", (e) => this._onPointerMove(e));
    document.body.addEventListener("touchend", (e) => this._onPointerUp(e));
  }

  _getNormalizedPointer(event) {
    const clientX = event.clientX || (event.touches && event.touches[0].clientX) || 0;
    const clientY = event.clientY || (event.touches && event.touches[0].clientY) || 0;
    
    return {
      x: (clientX / window.innerWidth) * 2 - 1,
      y: -(clientY / window.innerHeight) * 2 + 1
    };
  }

  _collectInteractiveObjects() {
    const objects = [];
    
    // Coleta apenas objetos do jogo (gameGroups) que são interativos
    if (this.modelManager && this.modelManager.gameGroups) {
      this.modelManager.gameGroups.forEach(group => {
        if (group && group.visible) {
          group.traverse(child => {
            // Adiciona meshes que fazem parte de objetos clicáveis
            if (child.isMesh) {
              objects.push(child);
            }
          });
        }
      });
    }
    
    return objects;
  }

  _findClickableParent(object) {
    let current = object;
    
    // Sobe na hierarquia até encontrar um objeto com userData.clickable
    while (current) {
      if (current.userData && current.userData.clickable && current.userData.isGameMode) {
        return current;
      }
      current = current.parent;
    }
    
    return null;
  }

  _onPointerDown(event) {
    // Ignora cliques em UI
    if (event.target.tagName === 'IMG' || 
        event.target.closest('#uiContainerBottom') || 
        event.target.id === 'uiContainerBottom') {
      return;
    }
    
    event.preventDefault();
    
    const pointerCoords = this._getNormalizedPointer(event);
    this.pointer.set(pointerCoords.x, pointerCoords.y);
    this.initialPointerPos.set(pointerCoords.x, pointerCoords.y);
    this.hasMoved = false;
    
    this.raycaster.setFromCamera(this.pointer, this.camera);
    
    const interactiveObjects = this._collectInteractiveObjects();
    const intersects = this.raycaster.intersectObjects(interactiveObjects, true);
    
    if (intersects.length === 0) {
      this.draggingObject = null;
      return;
    }
    
    // Encontra o objeto clicável na hierarquia
    const clickableObj = this._findClickableParent(intersects[0].object);
    
    if (!clickableObj) {
      this.draggingObject = null;
      return;
    }
    
    // Registra o objeto para possível drag
    this.draggingObject = clickableObj;
    
    // Configura o plano de arrasto perpendicular à câmera
    const worldPos = new THREE.Vector3();
    clickableObj.getWorldPosition(worldPos);
    
    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir);
    
    this.dragPlane.setFromNormalAndCoplanarPoint(
      cameraDir.clone().negate(),
      worldPos
    );
    
    // Calcula offset entre ponto de interseção e posição do objeto
    const intersectionPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint);
    
    this.dragOffset.copy(worldPos).sub(intersectionPoint);
    
    // Registra tap para possível double-tap removal (AGORA 2 taps)
    this._registerTap(clickableObj);
  }

  _onPointerMove(event) {
    if (!this.draggingObject) return;
    
    event.preventDefault();
    
    const pointerCoords = this._getNormalizedPointer(event);
    this.pointer.set(pointerCoords.x, pointerCoords.y);
    
    // Verifica se houve movimento significativo
    const dx = pointerCoords.x - this.initialPointerPos.x;
    const dy = pointerCoords.y - this.initialPointerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0.01) {
      this.hasMoved = true;
    }
    
    // Atualiza posição do objeto durante o drag
    this.raycaster.setFromCamera(this.pointer, this.camera);
    
    const intersectionPoint = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint);
    
    if (!intersected) return;
    
    const newWorldPos = intersectionPoint.clone().add(this.dragOffset);
    
    // Converte para coordenadas locais do parent
    const parent = this.draggingObject.parent;
    if (parent) {
      const localPos = parent.worldToLocal(newWorldPos.clone());
      this.draggingObject.position.copy(localPos);
    } else {
      this.draggingObject.position.copy(newWorldPos);
    }
  }

  _onPointerUp(event) {
    if (!this.draggingObject) return;
    
    // Se não houve movimento significativo, pode ser um tap
    if (!this.hasMoved) {
      // O double-tap já foi registrado no pointerdown
      // Aqui só limpamos o estado
    }
    
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
      
      // Se o tap foi muito tempo depois do último, reseta
      if (now - data.lastTap > TAP_DELAY) {
        data.count = 1;
      } else {
        data.count++;
      }
      
      data.lastTap = now;
      
      // Limpa timer anterior se existir
      if (data.timer) {
        clearTimeout(data.timer);
      }
      
      // Se chegou a 2 taps, remove o objeto (ANTES era 3)
      if (data.count >= 2) {
        this._removeObject(object);
        this.tapData.delete(id);
        return;
      }
      
      // Aguarda para ver se haverá mais taps
      data.timer = setTimeout(() => {
        this.tapData.delete(id);
      }, TAP_DELAY);
    }
  }

  _removeObject(object) {
    if (object && object.parent) {
      object.parent.remove(object);
      
      // Remove das listas do modelManager
      if (this.modelManager) {
        const gameIndex = this.modelManager.gameObjects.indexOf(object);
        if (gameIndex !== -1) {
          this.modelManager.gameObjects.splice(gameIndex, 1);
        }
      }
    }
  }
}
