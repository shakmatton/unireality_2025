// ui.js - Interface do usuário (botões, ícones)
// Substitua seu ui.js por este (faça backup antes).

import { isMobile, TAP_DELAY } from "./config.js";

export class UIManager {
  constructor(modelManager, paletteManager = null) {
    this.modelManager = modelManager;
    this.paletteManager = paletteManager; // Pode ser null inicialmente
    this.isGameActive = false; // false = OFF (demo), true = ON (jogo)

    // Guardar referências dos ícones à direita para poder esconder/exibir
    this._sideIcons = [];

    // referência ao botão ON/OFF e Reset para atualizações visuais
    this._els = {
      btnOnOff: null,
      btnReset: null,
      mandala: null
    };

    this.mandalaRotation = 0;
    this.mandalaTapCount = 0;
    this.mandalaTapTimer = null;
  }

  init() {
    this._createBottomUI();
    this._createSideMenu();
    this._createMandalaButton();
    this._createExitButton();

    // Sincroniza o modelManager com o modo atual (garante consistência inicial)
    if (this.modelManager && typeof this.modelManager.setGameMode === "function") {
      this.modelManager.setGameMode(this.isGameActive);
    }

    // Aplica a visibilidade inicial da área direita (OFF => oculta ícones da direita)
    this._updateSideMenuVisibility();
  }

  // Getter para saber qual modo está ativo
  getGameMode() {
    return this.isGameActive;
  }

  // ---------------------------
  // Bottom UI (zoom, ON/OFF, Reset, etc)
  // ---------------------------
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
      if (this.modelManager && this.modelManager.models) {
        this.modelManager.models.forEach(model => {
          if (model.scene && model.scene.userData && model.scene.userData.originalScale) {
            model.scene.scale.copy(model.scene.userData.originalScale);
          }
        });
      }
      if (this.modelManager) {
        this.modelManager.gameObjects.forEach(obj => {
          if (obj.userData && obj.userData.originalScale) obj.scale.copy(obj.userData.originalScale);
        });
        this.modelManager.demoObjects.forEach(obj => {
          if (obj.userData && obj.userData.originalScale) obj.scale.copy(obj.userData.originalScale);
        });
      }
    });
    container.appendChild(btnZoomOriginal);

    // Botão Zoom+
    const btnZoomPlus = this._createButton("./gltf/imgs/plus.jpg", "Zoom+", () => {
      if (this.modelManager && typeof this.modelManager.zoomIn === "function") this.modelManager.zoomIn();
    });
    container.appendChild(btnZoomPlus);

    // Botão Zoom-
    const btnZoomMinus = this._createButton("./gltf/imgs/minus.jpg", "Zoom-", () => {
      if (this.modelManager && typeof this.modelManager.zoomOut === "function") this.modelManager.zoomOut();
    });
    container.appendChild(btnZoomMinus);

    // BOTÃO ON/OFF - Alterna entre demo (OFF) e jogo (ON)
    const btnOnOff = this._createButton("./gltf/imgs/off.jpg", "ON/OFF", () => {
      this.isGameActive = !this.isGameActive;

      // aplica mudanças de visibilidade no modelManager
      if (this.modelManager && typeof this.modelManager.setGameMode === "function") {
        this.modelManager.setGameMode(this.isGameActive);
      }

      // atualiza imagem do botão
      btnOnOff.src = this.isGameActive ? "./gltf/imgs/on.jpg" : "./gltf/imgs/off.jpg";

      // atualiza a visibilidade dos ícones à direita
      this._updateSideMenuVisibility();
    });
    container.appendChild(btnOnOff);
    this._els.btnOnOff = btnOnOff;

    // Ajuste específico de tamanho (somente ON/OFF) - valores conservadores
    // Desktop: 42px, Mobile: 36px
    btnOnOff.style.width = isMobile ? "66px" : "62px";
    btnOnOff.style.height = isMobile ? "32px" : "35px";

    // BOTÃO RESET - Comportamento diferente em OFF e ON
    const btnReset = this._createButton("./gltf/imgs/reset.jpg", "Reset", () => {
      if (this.modelManager && typeof this.modelManager.resetModels === "function") {
        this.modelManager.resetModels(this.isGameActive);
      }
    });
    container.appendChild(btnReset);
    this._els.btnReset = btnReset;

    // Ajuste específico de tamanho (somente RESET) - valores conservadores (desktop a combinar com ON/OFF)
    btnReset.style.width = isMobile ? "76px" : "72px";
    btnReset.style.height = isMobile ? "32px" : "35px";
  }

  // ---------------------------
  // Side menu (ícones à direita) — RESTAURADO positions explícitas
  // ---------------------------
  _createSideMenu() {
    // cria os ícones com posições ABSOLUTAS como em versões anteriores
    // função auxiliar para criar e armazenar icon
    const makeAndStoreIconWithPos = (src, alt, top, width, onClick) => {
      const icon = document.createElement("img");
      icon.src = src;
      icon.alt = alt;
      icon.title = alt;
      icon.style.position = "absolute";
      icon.style.top = top;
      icon.style.right = "10px";
      icon.style.width = width;
      icon.style.height = "auto";
      icon.style.cursor = "pointer";
      icon.style.zIndex = "1000";
      icon.addEventListener("click", (e) => {
        e.stopPropagation();
        // se não estivermos em modo ON, bloqueia (efeito visual)
        if (!this.isGameActive) {
          icon.style.opacity = "0.5";
          setTimeout(() => (icon.style.opacity = "1"), 120);
          return;
        }
        onClick(e);
      });
      document.body.appendChild(icon);
      this._sideIcons.push(icon);
      return icon;
    };

    // Posições restauradas para cada ícone (mobile / desktop)
    const recicleTop = isMobile ? "360px" : "390px";
    const coleteTop = isMobile ? "290px" : "320px";
    const loop2Top = isMobile ? "460px" : "470px";
    const loop3Top = isMobile ? "510px" : "520px";

    // Ícone Recicle (index 13)
    makeAndStoreIconWithPos("./gltf/imgs/recicle.png", "Recicle", recicleTop, "40px", () => {
      if (this.modelManager) this.modelManager.addClone(13, null, true);
    });

    // Ícone Colete (index 12)
    makeAndStoreIconWithPos("./gltf/imgs/colete2.png", "Colete", coleteTop, "42px", () => {
      if (this.modelManager) this.modelManager.addClone(12, null, true);
    });

    // Ícone Loop 2 (index 14)
    makeAndStoreIconWithPos("./gltf/imgs/loop-2.png", "Loop 2", loop2Top, "40px", () => {
      if (this.modelManager) this.modelManager.addClone(14, null, true);
    });

    // Ícone Loop 3 (index 15)
    makeAndStoreIconWithPos("./gltf/imgs/loop-3.png", "Loop 3", loop3Top, "40px", () => {
      if (this.modelManager) this.modelManager.addClone(15, null, true);
    });

    // A mandala também tem posição top-right (restaurada para top 10 right 10)
    // porém a mandala é criada no _createMandalaButton e depois adicionada a _sideIcons lá.
  }

  _updateSideMenuVisibility() {
    // Se estivermos em OFF (isGameActive === false) -> esconder todos os icons da direita
    // Se estivermos em ON  (isGameActive === true)  -> mostrar todos os icons da direita
    const visible = this.isGameActive;
    this._sideIcons.forEach(icon => {
      icon.style.display = visible ? "block" : "none";
      icon.style.pointerEvents = visible ? "auto" : "none";
      icon.style.opacity = visible ? "1" : "0.0";
    });

    // Mandala (se existir) segue o mesmo comportamento
    if (this._els.mandala) {
      this._els.mandala.style.display = visible ? "block" : "none";
      this._els.mandala.style.pointerEvents = visible ? "auto" : "none";
      this._els.mandala.style.opacity = visible ? "1" : "0.0";
    }
  }

  // ---------------------------
  // Mandala button (agora armazenada em this._els.mandala)
  // ---------------------------
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
    btnMandala.style.zIndex = "1000";

    btnMandala.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
    btnMandala.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      // segurança: só permite mudar cor quando em ON
      if (!this.isGameActive) {
        btnMandala.style.opacity = "0.5";
        setTimeout(() => (btnMandala.style.opacity = "1"), 120);
        return;
      }

      this.mandalaTapCount++;
      if (this.mandalaTapCount === 1) {
        this.mandalaTapTimer = setTimeout(() => {
          this.mandalaRotation += 90;
          btnMandala.style.transform = `rotate(${this.mandalaRotation}deg)`;
          if (this.paletteManager && typeof this.paletteManager.changeColor === "function") {
            this.paletteManager.changeColor(1);
          }
          this.mandalaTapCount = 0;
        }, TAP_DELAY);
      } else if (this.mandalaTapCount === 2) {
        clearTimeout(this.mandalaTapTimer);
        this.mandalaRotation -= 90;
        btnMandala.style.transform = `rotate(${this.mandalaRotation}deg)`;
        if (this.paletteManager && typeof this.paletteManager.changeColor === "function") {
          this.paletteManager.changeColor(1);
        }
        this.mandalaTapCount = 0;
      }
    });

    document.body.appendChild(btnMandala);
    this._els.mandala = btnMandala;
    // também trate o mandala como um side icon (para ser escondido/exibido junto)
    this._sideIcons.push(btnMandala);
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
    // Utilidade não usada aqui (mantida para compatibilidade)
    const icon = document.createElement("img");
    icon.src = src;
    icon.alt = alt;
    icon.style.position = "absolute";
    icon.style.top = top || "0px";
    icon.style.right = "10px";
    icon.style.width = width || "40px";
    icon.style.height = "auto";
    icon.style.cursor = "pointer";
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(e);
    });
    return icon;
  }
}
