// models.js - carregamento e gerenciamento de modelos 3D
// Alterações: fixa z dos modelos/clones; recua slightly loop2/loop3 para evitar Z-fighting

import { loadGLTF } from "./loader.js";
import { modelPaths } from "./config.js";

const THREE = window.MINDAR.IMAGE.THREE;

export class ModelManager {
  constructor() {
    this.models = [];         // modelos originais (GLTF)
    this.anchors = [];        // anchors do MindAR
    this.cloneCounts = {};    // contador de clones por índice
    this.gameObjects = [];    // clones criados em modo JOGO (ON)
    this.demoObjects = [];    // clones criados em modo DEMO (OFF)

    // Grupos auxiliares por índice para separar objetos de demo e de jogo
    this.gameGroups = [];     // gameGroups[i] => THREE.Group() para clones ON do modelo i
    this.demoGroups = [];     // demoGroups[i] => THREE.Group() para clones OFF do modelo i
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

    // Prepara cada modelo (posicionamento, userData, scale)
    this.models.forEach((model, i) => {
      model.scene.scale.set(0.13, 0.13, 0.13);
      model.scene.userData.originalScale = model.scene.scale.clone();

      // set position X/Y/Z from positions; keep Z default 0 unless specified below
      const [x, y, z] = [positions[i][0], positions[i][1], (positions[i].length > 2 ? positions[i][2] : 0)];
      model.scene.position.set(x, y, z);
      model.scene.userData.originalPosition = model.scene.position.clone();
      model.scene.userData.originalRotation = model.scene.rotation.clone();

      model.scene.userData.clickable = true;
      model.scene.userData.modelIndex = i;
      model.scene.userData.tapCount = 0;
      model.scene.userData.tapTimer = null;
      model.scene.userData.isGridModel = true;

      // desativar rotações automáticas por padrão
      model.scene.userData.rotatable = false;
      model.scene.userData.targetRotation = model.scene.rotation.z;

      // store current Z as fixedZ (will be used by clones / drag locking)
      model.scene.userData.fixedZ = model.scene.position.z;
    });

    // Specific tweak: move loop molds slightly backwards in Z so plates appear in front
    // ASSUMPTION: loop2 is at model index 14 and loop3 at index 15 (per your modelPaths order)
    const loopBackOffset = -0.03; // small negative Z to push them slightly "back"
    if (this.models[14]) {
      this.models[14].scene.position.z = (this.models[14].scene.position.z || 0) + loopBackOffset;
      this.models[14].scene.userData.fixedZ = this.models[14].scene.position.z;
    }
    if (this.models[15]) {
      this.models[15].scene.position.z = (this.models[15].scene.position.z || 0) + loopBackOffset;
      this.models[15].scene.userData.fixedZ = this.models[15].scene.position.z;
    }

    // Cria anchors e adiciona dois grupos filhos em cada anchor: demoGroup e gameGroup
    this.anchors = this.models.map((model, i) => {
      const anchor = mindarThree.addAnchor(0);

      // anexar o modelo original (grade) diretamente ao anchor
      anchor.group.add(model.scene);

      // cria grupos para demo (OFF) e game (ON)
      const demoGroup = new THREE.Group();
      demoGroup.name = `demoGroup_${i}`;
      anchor.group.add(demoGroup);

      const gameGroup = new THREE.Group();
      gameGroup.name = `gameGroup_${i}`;
      anchor.group.add(gameGroup);

      // assegura arrays indexados
      this.demoGroups[i] = demoGroup;
      this.gameGroups[i] = gameGroup;

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

    // Ajustes finais
    positions[14][0] += 0.15;
    positions[15][0] = positions[14][0];
    positions[15][1] = positions[14][1] - 0.3;

    return positions;
  }

  /**
   * Adiciona um clone do modelo identificado por modelIndex.
   * - position: THREE.Vector3 (opcional) para posicionamento personalizado
   * - isGameMode: boolean -> true = ON (jogo), false = OFF (demo)
   *
   * Clones criados em ON são adicionados em gameGroups[modelIndex] (interativos).
   * Clones criados em OFF são adicionados em demoGroups[modelIndex] (imutáveis).
   */
  addClone(modelIndex, position = null, isGameMode = false) {
    if (!this.models[modelIndex]) {
      console.warn(`ModelManager.addClone: modelIndex ${modelIndex} inválido.`);
      return null;
    }

    const originalModel = this.models[modelIndex].scene;
    const clone = originalModel.clone(true);

    // ensure clone keeps transforms similar to original
    clone.userData = {
      clickable: Boolean(originalModel.userData.clickable && isGameMode),
      rotatable: Boolean(originalModel.userData.rotatable),
      targetRotation: originalModel.userData.targetRotation || 0,
      originalScale: originalModel.userData.originalScale ? originalModel.userData.originalScale.clone() : originalModel.scale.clone(),
      originalPosition: originalModel.userData.originalPosition ? originalModel.userData.originalPosition.clone() : originalModel.position.clone(),
      originalRotation: originalModel.userData.originalRotation ? originalModel.userData.originalRotation.clone() : originalModel.rotation.clone(),
      modelIndex: originalModel.userData.modelIndex,
      isClone: true,
      isGameMode: Boolean(isGameMode),
      tapCount: 0,
      tapTimer: null,
      isGridModel: false,
      fixedZ: typeof originalModel.userData.fixedZ !== "undefined" ? originalModel.userData.fixedZ : originalModel.position.z
    };

    if (position && position.isVector3) {
      clone.position.copy(position).add(new THREE.Vector3(0.3, -0.2, 0));
    } else {
      const cloneCount = this.cloneCounts[modelIndex]++;
      clone.position.set(
        originalModel.position.x + 0.3 * cloneCount,
        originalModel.position.y - 0.2 * cloneCount,
        originalModel.position.z
      );
    }

    // FORCE clone Z to match original fixedZ -- prevents clones from drifting in depth
    if (typeof clone.userData.fixedZ !== "undefined") {
      // convert to parent's local Z if needed (but here position.z is local)
      clone.position.z = clone.userData.fixedZ;
    }

    // Add clone to proper group
    if (isGameMode) {
      const grp = this.gameGroups[modelIndex];
      if (grp) {
        grp.add(clone);
      } else {
        this.anchors[modelIndex].group.add(clone);
      }
      clone.visible = true;
      // ensure clone is interactive
      clone.userData.clickable = true;
      this.gameObjects.push(clone);
    } else {
      const grp = this.demoGroups[modelIndex];
      if (grp) {
        grp.add(clone);
      } else {
        this.anchors[modelIndex].group.add(clone);
      }
      clone.visible = false;
      clone.userData.clickable = false;
      this.demoObjects.push(clone);
    }

    // OPTIONAL: set a renderOrder small tweak if needed (commented)
    // clone.traverse((c) => { if (c.isMesh) c.renderOrder = 0; });

    return clone;
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

  resetModels(isGameMode = false) {
    if (isGameMode) {
      this.gameObjects.forEach(obj => {
        if (obj.parent) obj.parent.remove(obj);
      });
      this.gameObjects = [];
      this.gameGroups.forEach(grp => {
        if (grp && grp.children.length) {
          while (grp.children.length) grp.remove(grp.children[0]);
        }
      });
    } else {
      this.demoObjects.forEach(obj => {
        if (obj.parent) obj.parent.remove(obj);
      });
      this.demoObjects = [];
      this.demoGroups.forEach(grp => {
        if (grp && grp.children.length) {
          while (grp.children.length) grp.remove(grp.children[0]);
        }
      });

      this.models.forEach(model => {
        if (model.scene.userData.originalPosition) model.scene.position.copy(model.scene.userData.originalPosition);
        if (model.scene.userData.originalRotation) model.scene.rotation.copy(model.scene.userData.originalRotation);
        if (model.scene.userData.originalScale) model.scene.scale.copy(model.scene.userData.originalScale);
        model.scene.userData.targetRotation = model.scene.userData.originalRotation ? model.scene.userData.originalRotation.z : model.scene.rotation.z;
      });
    }

    Object.keys(this.cloneCounts).forEach(key => {
      this.cloneCounts[key] = 0;
    });
  }

  setGameMode(isGameMode) {
    if (isGameMode) {
      this.models.forEach(model => model.scene.visible = false);
      this.demoGroups.forEach(grp => { if (grp) grp.visible = false; });
      this.gameGroups.forEach(grp => { if (grp) grp.visible = true; });
    } else {
      this.models.forEach(model => model.scene.visible = true);
      this.demoGroups.forEach(grp => { if (grp) grp.visible = true; });
      this.gameGroups.forEach(grp => { if (grp) grp.visible = false; });
    }
  }

  updateRotations() {
    this.models.forEach(model => {
      const target = model.scene.userData.targetRotation;
      if (typeof target === "number") {
        const current = model.scene.rotation.z;
        const diff = target - current;
        if (Math.abs(diff) > 0.01) model.scene.rotation.z += diff * 0.1;
        else model.scene.rotation.z = target;
      }
    });

    [...this.gameObjects, ...this.demoObjects].forEach(obj => {
      if (obj.userData && obj.userData.rotatable) {
        const current = obj.rotation.z;
        const target = obj.userData.targetRotation || 0;
        const diff = target - current;
        if (Math.abs(diff) > 0.01) obj.rotation.z += diff * 0.1;
        else obj.rotation.z = target;
      }
    });
  }
}
