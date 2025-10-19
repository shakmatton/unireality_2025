# 📋 Estrutura Modular do Unireality++

## 🎯 Visão Geral
O código foi refatorado de **1604 linhas** em um único arquivo para **6 módulos organizados** com responsabilidades bem definidas.

---

## 📁 Arquivos da Nova Estrutura

### 1. **`index.html`**
- Permanece inalterado
- Carrega o script principal (`main.js`)

### 2. **`main.js`** (Orquestrador - ~40 linhas)
- Arquivo principal que coordena todos os módulos
- Inicializa o MindAR
- Cria instâncias dos gerenciadores
- Configura o loop de animação

### 3. **`config.js`** (Configurações - ~60 linhas)
- Constantes globais
- Caminhos de imagens (lixeiras, placas)
- Mappings de cores e modelos
- Configurações de interação (TAP_DELAY)
- Lista de arquivos GLTF

### 4. **`models.js`** (Gerenciamento de Modelos - ~140 linhas)
**Classe:** `ModelManager`
- Carregamento de modelos 3D
- Configuração inicial dos modelos
- Geração de posições em grid
- Clonagem de objetos
- Zoom (in/out)
- Reset de modelos
- Toggle de visibilidade
- Atualização de rotações

### 5. **`palette.js`** (Paleta de Cores - ~85 linhas)
**Classe:** `PaletteManager`
- Gerenciamento da paleta de cores
- Atualização das plaquinhas por cor
- Controle da imagem da lixeira
- Mudança de cor (rotação da mandala)

### 6. **`interactions.js`** (Interações - ~120 linhas)
**Classe:** `InteractionManager`
- Sistema de drag and drop
- Detecção de cliques (single, double, triple)
- Raycasting para seleção de objetos
- Rotação de objetos (single tap)
- Duplicação de objetos (double tap)
- Remoção de objetos (triple tap)

### 7. **`ui.js`** (Interface do Usuário - ~175 linhas)
**Classe:** `UIManager`
- Criação de botões inferiores (zoom, ON/OFF, reset)
- Menu lateral (Recicle, Colete, Loops)
- Botão Mandala (troca de cor)
- Botão de saída
- Gerenciamento de eventos da UI

---

## 🔗 Fluxo de Dependências

```
main.js
  ├─→ config.js (constantes)
  ├─→ models.js
  │     └─→ loader.js (já existente)
  │     └─→ config.js
  ├─→ palette.js
  │     └─→ config.js
  │     └─→ models.js (referência)
  ├─→ interactions.js
  │     └─→ config.js
  │     └─→ models.js (referência)
  └─→ ui.js
        └─→ config.js
        └─→ models.js (referência)
        └─→ palette.js (referência)
```

---

## ✅ Vantagens da Refatoração

1. **Organização**: Cada módulo tem uma responsabilidade clara
2. **Manutenibilidade**: Fácil localizar e modificar funcionalidades específicas
3. **Reutilização**: Classes podem ser reutilizadas em outros projetos
4. **Legibilidade**: Código mais limpo e fácil de entender
5. **Debug**: Mais fácil isolar e corrigir problemas
6. **Escalabilidade**: Adicionar novas funcionalidades sem bagunçar o código

---

## 🚀 Como Usar

1. Certifique-se de que todos os 6 arquivos JS estão no mesmo diretório
2. O `index.html` deve carregar apenas o `main.js`
3. Os imports ES6 cuidam de carregar os outros módulos
4. **Importante**: O servidor deve suportar módulos ES6

---

## ⚠️ Pontos de Atenção

- Todos os arquivos devem estar no mesmo diretório (ou ajustar os caminhos de import)
- O arquivo `loader.js` original deve permanecer no mesmo local
- As imagens e modelos GLTF devem estar nos caminhos especificados em `config.js`
- A aplicação funciona da mesma forma que antes, apenas melhor organizada

---

## 🔧 Próximos Passos Sugeridos

1. Testar cada módulo individualmente
2. Adicionar tratamento de erros mais robusto
3. Considerar adicionar um módulo de logging/debug
4. Documentar cada função com JSDoc
5. Criar testes unitários para cada classe