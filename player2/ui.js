// ui.js - Interface do usuário (botões, ícones)

import { isMobile, TAP_DELAY } from "./config.js";

export class UIManager {
  constructor(modelManager, paletteManager = null) {
    this.modelManager = modelManager;
    this.paletteManager = paletteManager; // Pode ser null inicialmente
    this.isGameActive = false; // false = OFF (demo), true = ON (jogo)
    this.mandalaRotation = 0;
    this.mandalaTapCount = 0;
    this.mandalaTapTimer = null;
  }

  init() {
    this._createBottomUI();
    this._createSideMenu();
    this._createMandalaButton();
    this._createExitButton();
  }

  // ✅ Getter para saber qual modo está ativo
  getGameMode() {
    return this.isGameActive;
  }

  _createBottomUI() {
    const container = document.createElement("div");
    container.id = "uiContainerBottom";
    container.style.position = "absolute";
    container.style.bottom = "20px";
    container.style.left = "50%";
    container.style.transform = "translateX(-50%)";
    container.style.display = "flex";
    container.style.gap = "10px";
    container.style.zIndex = "1000";
    container.style.pointerEvents = "auto";
    document.body.appendChild(container);

    // Botão Zoom Original
    const btnZoomOriginal = this._createButton("./gltf/imgs/home.png", "Zoom Original", () => {
      this.modelManager.models.forEach(model => {
        model.scene.scale.copy(model.scene.userData.originalScale);
      });
      this.modelManager.gameObjects.forEach(obj => {
        obj.scale.copy(obj.userData.originalScale);
      });
      this.modelManager.demoObjects.forEach(obj => {
        obj.scale.copy(obj.userData.originalScale);
      });
    });
    container.appendChild(btnZoomOriginal);

    // Botão Zoom+
    const btnZoomPlus = this._createButton("./gltf/imgs/plus.jpg", "Zoom+", () => {
      this.modelManager.zoomIn();
    });
    container.appendChild(btnZoomPlus);

    // Botão Zoom-
    const btnZoomMinus = this._createButton("./gltf/imgs/minus.jpg", "Zoom-", () => {
      this.modelManager.zoomOut();
    });
    container.appendChild(btnZoomMinus);

    // ✅ BOTÃO ON/OFF - Alterna entre demo (OFF) e jogo (ON)
    const btnOnOff = this._createButton("./gltf/imgs/off.jpg", "ON/OFF", () => {
      this.isGameActive = !this.isGameActive;
      
      // ✅ CORRIGIDO: Usa setGameMode em vez de toggleVisibility
      this.modelManager.setGameMode(this.isGameActive);
      
      // Atualiza imagem do botão
      btnOnOff.src = this.isGameActive ? "./gltf/imgs/on.jpg" : "./gltf/imgs/off.jpg";
    });
    container.appendChild(btnOnOff);

    // ✅ BOTÃO RESET - Comportamento diferente em OFF e ON
    const btnReset = this._createButton("./gltf/imgs/reset.jpg", "Reset", () => {
      this.modelManager.resetModels(this.isGameActive);
    });
    container.appendChild(btnReset);
  }

  _createSideMenu() {
    // ✅ Todos os ícones agora passam o modo atual (isGameActive) para addClone
    
    // Ícone Recicle
    const recicleIcon = this._createIcon(
      "./gltf/imgs/recicle.png",
      "Recicle",
      isMobile ? "360px" : "390px",
      "40px",
      () => this.modelManager.addClone(13, null, this.isGameActive)
    );
    document.body.appendChild(recicleIcon);

    // Ícone Colete
    const coleteIcon = this._createIcon(
      "./gltf/imgs/colete2.png",
      "Colete",
      isMobile ? "290px" : "320px",
      "42px",
      () => this.modelManager.addClone(12, null, this.isGameActive)
    );
    document.body.appendChild(coleteIcon);

    // Ícone Loop 2
    const loop2Icon = this._createIcon(
      "./gltf/imgs/loop-2.png",
      "Loop 2",
      isMobile ? "460px" : "470px",
      "40px",
      () => this.modelManager.addClone(14, null, this.isGameActive)
    );
    document.body.appendChild(loop2Icon);

    // Ícone Loop 3
    const loop3Icon = this._createIcon(
      "./gltf/imgs/loop-3.png",
      "Loop 3",
      isMobile ? "510px" : "520px",
      "40px",
      () => this.modelManager.addClone(15, null, this.isGameActive)
    );
    document.body.appendChild(loop3Icon);
  }

  _createMandalaButton() {
    const btnMandala = document.createElement("img");
    btnMandala.src = "./gltf/imgs/mandala.jpg";
    btnMandala.alt = "Mandala";
    btnMandala.style.cursor = "pointer";
    btnMandala.style.height = isMobile ? "40px" : "40px";
    btnMandala.style.width = "auto";
    btnMandala.style.position = "absolute";
    btnMandala.style.top = "10px";
    btnMandala.style.right = "10px";
    btnMandala.style.transition = "transform 0.3s ease";
    
    btnMandala.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
    btnMandala.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      this.mandalaTapCount++;
      
      if (this.mandalaTapCount === 1) {
        this.mandalaTapTimer = setTimeout(() => {
          this.mandalaRotation += 90;
          btnMandala.style.transform = `rotate(${this.mandalaRotation}deg)`;
          this.paletteManager.changeColor(1);
          this.mandalaTapCount = 0;
        }, TAP_DELAY);
      } else if (this.mandalaTapCount === 2) {
        clearTimeout(this.mandalaTapTimer);
        this.mandalaRotation -= 90;
        btnMandala.style.transform = `rotate(${this.mandalaRotation}deg)`;
        this.paletteManager.changeColor(1);
        this.mandalaTapCount = 0;
      }
    });
    
    document.body.appendChild(btnMandala);
  }

  _createExitButton() {
    const btnSair = document.createElement("img");
    btnSair.src = "./gltf/imgs/sair.png";
    btnSair.alt = "Sair";
    btnSair.style.cursor = "pointer";
    btnSair.style.height = isMobile ? "40px" : "50px";
    btnSair.style.width = "auto";
    btnSair.style.position = "absolute";
    btnSair.style.top = "10px";
    btnSair.style.left = "10px";
    btnSair.addEventListener("click", (e) => {
      e.stopPropagation();
      window.location.href = "https://shakmatton.github.io/unireality";
    });
    document.body.appendChild(btnSair);
  }

  _createButton(src, alt, onClick) {
    const btn = document.createElement("img");
    btn.src = src;
    btn.alt = alt;
    btn.style.cursor = "pointer";
    btn.style.width = isMobile ? "32px" : "35px";
    btn.style.height = isMobile ? "32px" : "35px";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  _createIcon(src, alt, top, width, onClick) {
    const icon = document.createElement("img");
    icon.src = src;
    icon.alt = alt;
    icon.style.position = "absolute";
    icon.style.top = top;
    icon.style.right = "10px";
    icon.style.width = width;
    icon.style.height = "auto";
    icon.style.cursor = "pointer";
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return icon;
  }
}