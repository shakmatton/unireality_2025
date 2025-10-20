// models.js - Carregamento e gerenciamento de modelos 3D
// Substitua o seu arquivo por este (backup primeiro).

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
      model.scene.position.set(...positions[i]);
      model.scene.userData.originalPosition = model.scene.position.clone();
      model.scene.userData.originalRotation = model.scene.rotation.clone();
      model.scene.userData.clickable = true;
      model.scene.userData.modelIndex = i;
      model.scene.userData.tapCount = 0;
      model.scene.userData.tapTimer = null;
      model.scene.userData.isGridModel = true;

      // Por segurança desativamos rotações automáticas (você pediu isso)
      model.scene.userData.rotatable = false;
      model.scene.userData.targetRotation = model.scene.rotation.z;

      // --- Ajuste de profundidade (Z) para modelos específicos ---
      // Garante que as imagens "loop2_molde.gltf" (índice 14) e "loop3_molde.gltf" (índice 15)
      // fiquem ligeiramente mais atrás (menor z) para que as placas coloridas apareçam sobre elas.
      // Ajuste sutil: deslocamento para trás de 0.03 unidades (suficiente para sobreposição).
      if (i === 14 || i === 15) {
        // aplicamos um deslocamento negativo no Z
        model.scene.position.z = (model.scene.position.z || 0) - 0.15;
        // atualiza a posição original também
        model.scene.userData.originalPosition = model.scene.position.clone();
      }
    });

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
    // clonagem profunda para preservar geometria/estrutura
    const clone = originalModel.clone(true);

    // userData do clone
    clone.userData = {
      clickable: Boolean(originalModel.userData.clickable && isGameMode), // clicável apenas se for gameMode (ON)
      rotatable: false, // rotatable desativado por requisito
      targetRotation: originalModel.userData.targetRotation || 0,
      originalScale: originalModel.userData.originalScale ? originalModel.userData.originalScale.clone() : originalModel.scale.clone(),
      originalPosition: originalModel.userData.originalPosition ? originalModel.userData.originalPosition.clone() : originalModel.position.clone(),
      originalRotation: originalModel.userData.originalRotation ? originalModel.userData.originalRotation.clone() : originalModel.rotation.clone(),
      modelIndex: originalModel.userData.modelIndex,
      isClone: true,
      isGameMode: Boolean(isGameMode), // identifica se foi criado em ON (true) ou OFF (false)
      tapCount: 0,
      tapTimer: null,
      isGridModel: false
    };

    // posicionamento
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

    // Adiciona o clone ao grupo apropriado para manter separação de objetos
    if (isGameMode) {
      // Garantir que exista o gameGroup
      const grp = this.gameGroups[modelIndex];
      if (grp) {
        grp.add(clone);
      } else {
        // fallback: anexar no anchor.group (menos desejado, mas seguro)
        this.anchors[modelIndex].group.add(clone);
      }
      // visível imediatamente no modo ON
      clone.visible = true;
      // armazenar
      this.gameObjects.push(clone);
    } else {
      // demo (OFF) clones vão para demoGroup
      const grp = this.demoGroups[modelIndex];
      if (grp) {
        grp.add(clone);
      } else {
        this.anchors[modelIndex].group.add(clone);
      }
      // esses clones serão visíveis apenas em OFF; durante o jogo (ON) devem ficar invisíveis
      clone.visible = false;
      // tornar não clicável/imutável
      clone.userData.clickable = false;
      this.demoObjects.push(clone);
    }

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

  /**
   * Reset diferente para OFF (demo) e ON (jogo)
   */
  resetModels(isGameMode = false) {
    if (isGameMode) {
      // Reset em ON: limpa apenas objetos do jogo (gameGroups)
      this.gameObjects.forEach(obj => {
        if (obj.parent) obj.parent.remove(obj);
      });
      this.gameObjects = [];
      // limpar também os children de gameGroups para garantir consistência
      this.gameGroups.forEach(grp => {
        if (grp && grp.children.length) {
          while (grp.children.length) grp.remove(grp.children[0]);
        }
      });
    } else {
      // Reset em OFF: limpa objetos demo e restaura grid original
      this.demoObjects.forEach(obj => {
        if (obj.parent) obj.parent.remove(obj);
      });
      this.demoObjects = [];
      // limpar children de demoGroups
      this.demoGroups.forEach(grp => {
        if (grp && grp.children.length) {
          while (grp.children.length) grp.remove(grp.children[0]);
        }
      });

      // Restaura grid original
      this.models.forEach(model => {
        if (model.scene.userData.originalPosition) model.scene.position.copy(model.scene.userData.originalPosition);
        if (model.scene.userData.originalRotation) model.scene.rotation.copy(model.scene.userData.originalRotation);
        if (model.scene.userData.originalScale) model.scene.scale.copy(model.scene.userData.originalScale);
        model.scene.userData.targetRotation = model.scene.userData.originalRotation ? model.scene.userData.originalRotation.z : model.scene.rotation.z;
      });
    }

    // Reseta contadores
    Object.keys(this.cloneCounts).forEach(key => {
      this.cloneCounts[key] = 0;
    });
  }

  /**
   * Controla a visibilidade geral conforme o modo.
   * - isGameMode = true  -> ON: grade oculta, demoGroups ocultos, gameGroups visíveis
   * - isGameMode = false -> OFF: grade visível, demoGroups visíveis, gameGroups ocultos
   */
  setGameMode(isGameMode) {
    if (isGameMode) {
      // ON
      this.models.forEach(model => model.scene.visible = false);
      // demoGroups off
      this.demoGroups.forEach(grp => { if (grp) grp.visible = false; });
      // gameGroups on
      this.gameGroups.forEach(grp => { if (grp) grp.visible = true; });
    } else {
      // OFF
      this.models.forEach(model => model.scene.visible = true);
      this.demoGroups.forEach(grp => { if (grp) grp.visible = true; });
      this.gameGroups.forEach(grp => { if (grp) grp.visible = false; });
    }
  }

  updateRotations() {
    // Rotations dos modelos (se houver)
    this.models.forEach(model => {
      const target = model.scene.userData.targetRotation;
      if (typeof target === "number") {
        const current = model.scene.rotation.z;
        const diff = target - current;
        if (Math.abs(diff) > 0.01) model.scene.rotation.z += diff * 0.1;
        else model.scene.rotation.z = target;
      }
    });

    // Atualiza rotações dos clones caso algum tenha rotatable (por segurança)
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
