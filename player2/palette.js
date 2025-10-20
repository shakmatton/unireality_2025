// palette.js - Gerenciamento da paleta de cores e plaquinhas
// Substitua seu arquivo palette.js por este (backup primeiro).

import { isMobile, trashBinImages, platesMapping, plateModelIndices } from "./config.js";

export class PaletteManager {
  constructor(modelManager, uiManager) {
    this.modelManager = modelManager;
    this.uiManager = uiManager; // Recebe UIManager para saber qual modo está ativo
    this.currentColorIndex = -1;
    this.platesContainer = null;
    this.trashBinImg = null;
  }

  init() {
    this._createPlatesContainer();
    this._createTrashBinImage();
  }

  _createPlatesContainer() {
    this.platesContainer = document.createElement("div");
    this.platesContainer.style.position = "absolute";
    this.platesContainer.style.top = isMobile ? "125px" : "145px";
    this.platesContainer.style.right = "10px";
    this.platesContainer.style.display = "flex";
    this.platesContainer.style.flexDirection = "column";
    this.platesContainer.style.gap = "5px";
    this.platesContainer.style.zIndex = "1000";
    document.body.appendChild(this.platesContainer);
  }

  _createTrashBinImage() {
    this.trashBinImg = document.createElement("img");
    this.trashBinImg.alt = "Lixeira";
    this.trashBinImg.style.position = "absolute";
    this.trashBinImg.style.top = isMobile ? "60px" : "80px";
    this.trashBinImg.style.right = "10px";
    this.trashBinImg.style.width = "40px";
    this.trashBinImg.style.height = "auto";
    this.trashBinImg.style.display = "none";
    this.trashBinImg.style.zIndex = "1000";
    document.body.appendChild(this.trashBinImg);
  }

  updatePlates() {
    this.platesContainer.innerHTML = "";
    if (this.currentColorIndex === -1) return;

    // Ordem: left, right, up (de cima para baixo)
    const types = ['left', 'right', 'up'];

    types.forEach(type => {
      const icon = document.createElement("img");
      icon.src = platesMapping[this.currentColorIndex][type];
      icon.alt = `Placa ${type}`;
      icon.style.width = isMobile ? "41px" : "40px";
      icon.style.cursor = "pointer";

      // Clique só cria clone se estivermos em modo JOGO (ON)
      icon.addEventListener("click", (e) => {
        e.stopPropagation();
        const isGameMode = this.uiManager && typeof this.uiManager.getGameMode === "function" ? this.uiManager.getGameMode() : false;
        if (!isGameMode) {
          // Bloqueia criação em OFF; pequeno feedback visual
          icon.style.opacity = "0.5";
          setTimeout(() => icon.style.opacity = "1", 120);
          return;
        }
        const modelIndex = plateModelIndices[this.currentColorIndex][type];
        this.modelManager.addClone(modelIndex, null, true);
      });

      this.platesContainer.appendChild(icon);
    });
  }

  updateTrashBin() {
    if (this.currentColorIndex !== -1) {
      this.trashBinImg.src = trashBinImages[this.currentColorIndex];
      this.trashBinImg.style.display = "block";
    }
  }

  changeColor(direction = 1) {
    this.currentColorIndex = (this.currentColorIndex + direction) % 4;
    if (this.currentColorIndex < 0) this.currentColorIndex = 3;
    this.updatePlates();
    this.updateTrashBin();
  }

  getCurrentColorIndex() {
    return this.currentColorIndex;
  }
}
