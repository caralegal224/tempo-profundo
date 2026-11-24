# Tempo Profundo

Simulador de evolução planetária. Escolha ou construa um mundo, semeie uma forma de vida mínima e acompanhe a seleção natural ao longo de bilhões de anos, em 2D ou 3D, com som inteiramente sintetizado em tempo real.

## Rodar

O jogo é uma única página HTML. Abra `dist/tempo-profundo.html` em um navegador ou gere de novo a partir do código:

```bash
npm install
```

```bash
npm run build
```

O build gera `dist/tempo-profundo.html` (a página publicada) e `dist/play.html` (a mesma página com cabeçalho HTML completo, para abrir localmente). O three.js r128 é carregado do cdnjs.

## Estrutura

| Arquivo | Papel |
|---|---|
| `src/planet.js` | Geração de planetas, relevo, luas, nomes |
| `src/sim.js` | Motor da simulação: ambiente, agentes, especiação, eventos, máquina do tempo |
| `src/genome.js` | Genes, inovações e fenótipo |
| `src/taxonomy.js` | Nomes científicos, populares e clados |
| `src/surface.js`, `src/map2d.js` | Pintura da superfície e vista 2D |
| `src/view3d.js`, `src/creature.js` | Globo 3D e criaturas procedurais |
| `src/audio.js` | Motor de áudio procedural |
| `src/main.js`, `src/index.html` | Interface e laço do jogo |
| `test/` | Testes headless da simulação e do navegador |

## Versões

Ver [VERSOES.md](VERSOES.md) para o sistema de versões, o histórico e o planejamento.
