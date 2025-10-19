// config.js - Configurações e constantes do projeto

export const isMobile = /Mobi|Android/i.test(navigator.userAgent);

// Caminhos das imagens das lixeiras (ordem: Vermelha, Verde, Azul, Amarela)
export const trashBinImages = [
  "./gltf/imgs/pla.jpg",    // Vermelha
  "./gltf/imgs/vi.jpg",     // Verde
  "./gltf/imgs/pa.jpg",     // Azul
  "./gltf/imgs/me.jpg"      // Amarela
];

// Mapping das plaquinhas para cada cor (4 cores, cada uma com 3 tipos: left, right, up)
export const platesMapping = {
  0: { left: "./gltf/imgs/vermelho_left.png", right: "./gltf/imgs/vermelho_right.png", up: "./gltf/imgs/vermelho_up.png" },
  1: { left: "./gltf/imgs/verde_left.png",    right: "./gltf/imgs/verde_right.png",    up: "./gltf/imgs/verde_up.png"    },
  2: { left: "./gltf/imgs/azul_left.png",     right: "./gltf/imgs/azul_right.png",     up: "./gltf/imgs/azul_up.png"     },
  3: { left: "./gltf/imgs/amarelo_left.png",  right: "./gltf/imgs/amarelo_right.png",  up: "./gltf/imgs/amarelo_up.png"  }
};

// Mapping para determinar qual modelo 3D corresponde a cada placa
export const plateModelIndices = {
  0: { left: 3, right: 7, up: 11 }, // Vermelha: r_left, r_right, r_up
  1: { left: 2, right: 6, up: 10 }, // Verde: g_left, g_right, g_up
  2: { left: 1, right: 5, up: 9  }, // Azul:  b_left, b_right, b_up
  3: { left: 0, right: 4, up: 8  }  // Amarela: y_left, y_right, y_up
};

// Constantes de interação
export const TAP_DELAY = 300;

// Arquivos GLTF a serem carregados
export const modelPaths = [
  "./gltf/amarelo_left.gltf",
  "./gltf/azul_left.gltf",
  "./gltf/verde_left.gltf",
  "./gltf/vermelho_left.gltf",
  "./gltf/amarelo_right.gltf",
  "./gltf/azul_right.gltf",
  "./gltf/verde_right.gltf",
  "./gltf/vermelho_right.gltf",
  "./gltf/amarelo_up.gltf",
  "./gltf/azul_up.gltf",
  "./gltf/verde_up.gltf",
  "./gltf/vermelho_up.gltf",
  "./gltf/colete2.gltf",
  "./gltf/recicle.gltf",
  "./gltf/loop2_molde.gltf",
  "./gltf/loop3_molde.gltf"
];
