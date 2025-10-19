// models.js - Carregamento e gerenciamento de modelos 3D

import { loadGLTF } from "./loader.js";
import { modelPaths } from "./config.js";

const THREE = window.MINDAR.IMAGE.THREE;

export class ModelManager {
  constructor() {
    this.models = [];
    this.anchors = [];
    this.cloneCounts = {};
    this.gameObjects = []; // Objetos adicionados durante o jogo (ON)
    this.demoObjects = []; // Objetos adicionados durante demo (OFF)
  }

  async loadModels() {
    for (let i = 0; i < modelPaths.length; i++) {
      const model = await loadGLTF(modelPaths[i]);
      this.models.push(model);
      this.cloneCounts[i] = 0;
    }
    return this.models;
  }

  setupModels(mindarThree) {
    const positions = this._generateGridPositions();
    
    this.models.forEach((model, i) => {
      model.scene.scale.set(0.13, 0.13, 0.13);
      model.scene.userData.originalScale = model.scene.scale.clone();
      model.scene.position.set(...positions[i]);
      model.scene.userData.originalPosition = model.scene.position.clone();
      model.scene.userData.originalRotation = model.scene.rotation.clone();
      model.scene.userData.clickable = true;
      model.scene.userData.modelIndex = i;
      model.scene.userData.tapCount = 0;
      model.scene.userData.tapTimer = null;
      model.scene.userData.isGridModel = true;
      
      if (i >= 8 && i < 12) {
        model.scene.userData.rotatable = true;
        model.scene.userData.targetRotation = model.scene.rotation.z;
      } else {
        model.scene.userData.rotatable = false;
      }
    });

    // Adiciona cada modelo a uma âncora AR
    this.anchors = this.models.map(model => {
      const anchor = mindarThree.addAnchor(0);
      anchor.group.add(model.scene);
      return anchor;
    });

    // Grid visível ao iniciar (OFF ativado)
    this.models.forEach(model => model.scene.visible = true);
  }

  _generateGridPositions() {
    const positions = [];
    const gridSize = 4;
    const spacing = 0.3;

    for (let i = 0; i < 16; i++) {
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;
      const x = (col - 1.5) * spacing;
      const y = (1.5 - row) * spacing;
      positions.push([x, y, 0]);
    }

    // Ajustes cirúrgicos
    positions[14][0] += 0.15;
    positions[15][0] = positions[14][0];
    positions[15][1] = positions[14][1] - 0.3;

    return positions;
  }

  // ✅ addClone agora identifica se está em modo demo (OFF) ou jogo (ON)
  addClone(modelIndex, position = null, isGameMode = false) {
    const originalModel = this.models[modelIndex].scene;
    const clone = originalModel.clone();
    
    clone.userData = {
      clickable: originalModel.userData.clickable,
      rotatable: originalModel.userData.rotatable,
      targetRotation: originalModel.userData.targetRotation,
      originalScale: originalModel.userData.originalScale.clone(),
      originalPosition: originalModel.userData.originalPosition.clone(),
      originalRotation: originalModel.userData.originalRotation.clone(),
      modelIndex: originalModel.userData.modelIndex,
      isClone: true,
      isGameMode: isGameMode, // ✅ Identifica se é objeto de jogo (ON) ou demo (OFF)
      tapCount: 0,
      tapTimer: null
    };
    
    if (position) {
      clone.position.copy(position).add(new THREE.Vector3(0.3, -0.2, 0));
    } else {
      const cloneCount = this.cloneCounts[modelIndex]++;
      clone.position.set(
        originalModel.position.x + 0.3 * cloneCount,
        originalModel.position.y - 0.2 * cloneCount,
        originalModel.position.z
      );
    }
    
    this.anchors[modelIndex].group.add(clone);
    
    // ✅ Adiciona ao array apropriado
    if (isGameMode) {
      this.gameObjects.push(clone);
    } else {
      this.demoObjects.push(clone);
    }
  }

  zoomIn() {
    this.models.forEach(model => {
      model.scene.scale.multiplyScalar(1.1);
    });
    this.gameObjects.forEach(obj => {
      obj.scale.multiplyScalar(1.1);
    });
    this.demoObjects.forEach(obj => {
      obj.scale.multiplyScalar(1.1);
    });
  }

  zoomOut() {
    this.models.forEach(model => {
      model.scene.scale.multiplyScalar(0.9);
    });
    this.gameObjects.forEach(obj => {
      obj.scale.multiplyScalar(0.9);
    });
    this.demoObjects.forEach(obj => {
      obj.scale.multiplyScalar(0.9);
    });
  }

  // ✅ Reset diferente para OFF (demo) e ON (jogo)
  resetModels(isGameMode = false) {
    if (isGameMode) {
      // Reset em ON: limpa apenas objetos do jogo
      this.gameObjects.forEach(obj => {
        if (obj.parent) {
          obj.parent.remove(obj);
        }
      });
      this.gameObjects = [];
    } else {
      // Reset em OFF: limpa objetos demo e restaura grid original
      this.demoObjects.forEach(obj => {
        if (obj.parent) {
          obj.parent.remove(obj);
        }
      });
      this.demoObjects = [];
      
      // Restaura grid original
      this.models.forEach(model => {
        model.scene.position.copy(model.scene.userData.originalPosition);
        model.scene.rotation.copy(model.scene.userData.originalRotation);
        model.scene.scale.copy(model.scene.userData.originalScale);
        if (model.scene.userData.rotatable) {
          model.scene.userData.targetRotation = model.scene.userData.originalRotation.z;
        }
      });
    }
    
    // Reseta contadores
    Object.keys(this.cloneCounts).forEach(key => {
      this.cloneCounts[key] = 0;
    });
  }

  // ✅ Toggle visibilidade agora controla grid e objetos separadamente
  setGameMode(isGameMode) {
    if (isGameMode) {
      // Modo ON (jogo): esconde grid e objetos demo, mostra objetos do jogo
      this.models.forEach(model => model.scene.visible = false);
      this.demoObjects.forEach(obj => obj.visible = false);
      this.gameObjects.forEach(obj => obj.visible = true);
    } else {
      // Modo OFF (demo): mostra grid e objetos demo, esconde objetos do jogo
      this.models.forEach(model => model.scene.visible = true);
      this.demoObjects.forEach(obj => obj.visible = true);
      this.gameObjects.forEach(obj => obj.visible = false);
    }
  }

  updateRotations() {
    this.models.forEach(model => {
      if (model.scene.userData.rotatable) {
        const current = model.scene.rotation.z;
        const target = model.scene.userData.targetRotation;
        const diff = target - current;
        if (Math.abs(diff) > 0.01) {
          model.scene.rotation.z += diff * 0.1;
        } else {
          model.scene.rotation.z = target;
        }
      }
    });
    
    // Atualiza rotações de todos os clones
    [...this.gameObjects, ...this.demoObjects].forEach(obj => {
      if (obj.userData.rotatable) {
        const current = obj.rotation.z;
        const target = obj.userData.targetRotation;
        const diff = target - current;
        if (Math.abs(diff) > 0.01) {
          obj.rotation.z += diff * 0.1;
        } else {
          obj.rotation.z = target;
        }
      }
    });
  }
}