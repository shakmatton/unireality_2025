// models.js - Gerenciamento de modelos 3D
// Versão: spawn por categorias (plates vs loops) com grid 3-per-row para plates,
// linhas separadas para loops e prevenção de sobreposição (checa distância mínima).
// Pequenas alterações:
//  - BASE_X_P / BASE_Y_P ajustados para centralizar e subir ligeiramente os spawns;
//  - comportamento especial para loops: se houver um loop já na linha, o segundo vai para a linha abaixo.
// Substitua seu models.js por este (faça backup primeiro).

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

    // Índice global de spawn (usado como fallback / ordenação)
    this._globalSpawnIndex = 0;
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
   * Determina a categoria do modelo para spawn:
   * - plates: indices 0..11 (as plaquinhas left/right/up)
   * - colete: index 12
   * - recicle: index 13
   * - loops: indices 14..15 (loop2, loop3)
   *
   * Para este ajuste, tratamos colete/recicle como "plate-like".
   */
  _isPlateLike(modelIndex) {
    return modelIndex >= 0 && modelIndex <= 13; // 0..11 plates, 12 colete, 13 recicle
  }

  _isLoop(modelIndex) {
    return modelIndex === 14 || modelIndex === 15;
  }

  /**
   * Encontra uma posição livre na grade inferior (plates) ou na linha de loops,
   * evitando colisões com os clones já existentes (gameObjects + demoObjects).
   *
   * Retorna um THREE.Vector3 local (no sistema de referência do anchor).
   */
  _findFreeSpawnPositionForModel(modelIndex, originalZ = 0) {
    // === PARAMS (ajustáveis) ===
    // Para plates (incl. colete/recicle)
    // NOTE: BASE_X_P desloca os spawns para a direita (aumente para mover mais à direita)
    //       BASE_Y_P menos negativo = spawns mais altos (subir)
    const BASE_X_P = 0.02;       // deslocamento para a direita (pequeno)
    const BASE_Y_P = -0.55;      // "subimos" um pouco para ficar acima dos botões inferiores
    const ITEMS_PER_ROW_P = 3;   // **3 por linha conforme solicitado**
    const H_SPACING_P = 0.26;    // espaçamento horizontal maior para evitar overlap
    const V_SPACING_P = 0.14;

    // Para loops (linha separada)
    const BASE_X_L = 0.0;
    const BASE_Y_L = -0.62;         // ligeiramente acima da linha de plates
    const ITEMS_PER_ROW_L = 1;
    const H_SPACING_L = 0.34;       // mais espaço horizontal (loops são maiores)
    const V_SPACING_L = 0.34;

    const MAX_SLOTS = 300;
    const MIN_DIST = 0.18; // distância mínima entre centros (aprox)

    // prepara lista de posições ocupadas (x,y)
    const occupied = [];
    const pushPositionsFrom = (arr) => {
      arr.forEach(obj => {
        if (obj && obj.position) {
          occupied.push(new THREE.Vector2(obj.position.x, obj.position.y));
        }
      });
    };
    pushPositionsFrom(this.gameObjects);
    pushPositionsFrom(this.demoObjects);

    const isCandidateFree = (candX, candY) => {
      for (let i = 0; i < occupied.length; i++) {
        const p = occupied[i];
        const dx = p.x - candX;
        const dy = p.y - candY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_DIST) return false;
      }
      return true;
    };

    // Conta quantos loops já existem (para a regra especial)
    const existingLoopsCount = [...this.gameObjects, ...this.demoObjects]
      .reduce((acc, obj) => acc + ((obj.userData && (obj.userData.modelIndex === 14 || obj.userData.modelIndex === 15)) ? 1 : 0), 0);

    // Escolhe parâmetros conforme categoria
    let BASE_X = BASE_X_P, BASE_Y = BASE_Y_P, ITEMS_PER_ROW = ITEMS_PER_ROW_P, H_SPACING = H_SPACING_P, V_SPACING = V_SPACING_P;

    if (this._isLoop(modelIndex)) {
      BASE_X = BASE_X_L; BASE_Y = BASE_Y_L; ITEMS_PER_ROW = ITEMS_PER_ROW_L; H_SPACING = H_SPACING_L; V_SPACING = V_SPACING_L;
    }

    // Primeiro, tentamos preencher "vagas" na ordem natural (linha por linha)
    for (let idx = 0; idx < MAX_SLOTS; idx++) {
      let rowIndex = Math.floor(idx / ITEMS_PER_ROW);
      let indexInRow = idx % ITEMS_PER_ROW;

      // Regra especial para loops: se já existir pelo menos 1 loop e estivermos prestes a
      // posicionar o segundo (indexInRow === 1 na primeira linha), então movemos esse
      // candidato para a linha seguinte (rowIndex = 1, indexInRow = 0).
      if (this._isLoop(modelIndex) && existingLoopsCount >= 1 && rowIndex === 0 && indexInRow === 1) {
        rowIndex = 1;
        indexInRow = 0;
      }

      const offsetX = (indexInRow - (ITEMS_PER_ROW - 1) / 2) * H_SPACING;
      const offsetY = rowIndex * V_SPACING;
      const candX = BASE_X + offsetX;
      const candY = BASE_Y + offsetY;
      if (isCandidateFree(candX, candY)) {
        return new THREE.Vector3(candX, candY, originalZ);
      }
    }

    // fallback: usar globalSpawnIndex para não travar
    const fallbackIndex = this._globalSpawnIndex++;
    const rowIndex = Math.floor(fallbackIndex / ITEMS_PER_ROW);
    const indexInRow = fallbackIndex % ITEMS_PER_ROW;
    const offsetX = (indexInRow - (ITEMS_PER_ROW - 1) / 2) * H_SPACING;
    const offsetY = rowIndex * V_SPACING;
    return new THREE.Vector3(BASE_X + offsetX, BASE_Y + offsetY, originalZ);
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

    // POSICIONAMENTO
    if (position && position.isVector3) {
      clone.position.copy(position).add(new THREE.Vector3(0.0, 0.0, 0));
    } else {
      // procura posição livre baseada no tipo do modelo
      const freePos = this._findFreeSpawnPositionForModel(modelIndex, originalModel.position.z);
      clone.position.copy(freePos);

      // atualiza contador local
      this.cloneCounts[modelIndex] = (this.cloneCounts[modelIndex] || 0) + 1;
    }

    // === Ajuste de escala para colete (12) e recicle (13) ===
    // reduzimos apenas ligeiramente para evitar sobreposição
    if (modelIndex === 12 || modelIndex === 13) {
      // multiplica a escala do clone (pequena redução)
      clone.scale.multiplyScalar(0.88);
      // também ajusta o originalScale guardado para operações futuras
      if (clone.userData && clone.userData.originalScale) {
        clone.userData.originalScale.multiplyScalar(0.88);
      }
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

    // Reseta índice global de spawn para reusar área limpa
    this._globalSpawnIndex = 0;
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
