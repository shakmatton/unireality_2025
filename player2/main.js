// main.js - Arquivo principal (orquestrador)

import { ModelManager } from "./models.js";
import { PaletteManager } from "./palette.js";
import { InteractionManager } from "./interactions.js";
import { UIManager } from "./ui.js";

const THREE = window.MINDAR.IMAGE.THREE;

document.addEventListener("DOMContentLoaded", () => {
  const start = async () => {
    // Instancia o MindAR
    const mindarThree = new window.MINDAR.IMAGE.MindARThree({
      container: document.body,
      imageTargetSrc: "./p2_papel.mind"
    });
    const { scene, camera, renderer } = mindarThree;
    
    // Adiciona iluminação
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    scene.add(light);
    
    // Inicializa os gerenciadores
    const modelManager = new ModelManager();
    const uiManager = new UIManager(modelManager, null); // ✅ Passa null temporariamente
    const paletteManager = new PaletteManager(modelManager, uiManager); // ✅ Passa uiManager
    const interactionManager = new InteractionManager(camera, scene, modelManager);
    
    // ✅ Atualiza referência do paletteManager no uiManager
    uiManager.paletteManager = paletteManager;
    
    // Carrega e configura os modelos
    await modelManager.loadModels();
    modelManager.setupModels(mindarThree);
    
    // Inicializa os sistemas
    paletteManager.init();
    interactionManager.init();
    uiManager.init();
    
    // Loop de animação
    renderer.setAnimationLoop(() => {
      modelManager.updateRotations();
      renderer.render(scene, camera);
    });
    
    // Inicia o MindAR
    await mindarThree.start();
  };
  
  start();
});