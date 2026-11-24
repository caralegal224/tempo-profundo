# Guia de versões — Tempo Profundo

Este arquivo é o mapa do projeto: como numeramos as versões, quando o GitHub é atualizado e o que cada versão traz. Ele é atualizado a cada versão publicada.

## Como numeramos

| Formato | Quando muda | Exemplo |
|---|---|---|
| **X.0** — versão maior | Um marco que muda o jogo de forma ampla | 1.0 → 2.0 |
| **X.Y** — versão menor | Cada atualização publicada com adições, melhorias ou mudanças | 1.1 → 1.2 |
| **X.Y.Z** — correção | Só conserto de defeitos, sem conteúdo novo | 1.2 → 1.2.1 |

Cada versão menor tem um **nome** e uma lista dividida em três partes: **Adições** (coisas novas), **Melhorias** (o que já existia ficou melhor) e **Mudanças** (o que funciona diferente agora, inclusive correções de comportamento).

## Quando o GitHub é atualizado

- A versão jogável (o link do artifact) é atualizada a **cada versão**.
- O repositório no GitHub recebe o código a cada **cinco versões menores**: nas versões **X.5** e **X.0**. Exemplos: 1.5, 2.0, 2.5, 3.0.
- Cada envio ao GitHub ganha uma etiqueta (`v1.5`, `v2.0`…) para que qualquer versão salva possa ser recuperada.
- Exceção: o primeiro envio acontece agora, na **1.1**, como ponto de partida.

## Histórico

### 1.1 — Tempo Profundo *(atual · primeiro envio ao GitHub)*
**Mudanças**
- A evolução passou a acompanhar o tempo geológico. Mutações acumulam pela raiz do tempo de cada passo: em horas, dias ou meses não surgem espécies novas; em milhões de anos a evolução é intensa.
- As escalas de 10 Ma e 100 Ma rodam vários subpassos internos, então o mesmo intervalo de tempo produz resultados parecidos em qualquer escala.
- Oxigênio atmosférico e deriva climática passaram a depender dos anos, não do número de passos.
- Especiação por população: uma espécie nova só nasce quando pelo menos 4 indivíduos divergem juntos, eliminando milhares de "espécies" de um único indivíduo.
- A linha do tempo usa anos no eixo horizontal e pede confirmação antes de voltar no tempo.

**Melhorias**
- Diversidade: em 4,8 bilhões de anos partindo de micróbios, surgem ~100–180 espécies vivas simultâneas e alguns milhares ao longo da história, com plantas, animais, fungos e anômalos.
- Número da versão visível na tela inicial e no trilho de ferramentas.

### 1.0 — Gênese
**Adições**
- Planetas aleatórios ou construídos à mão: estrela, órbita, atmosfera, oceanos, inclinação, dia, raio, vulcanismo, relevo e luas.
- Luas com marés (zonas intermarés na costa) e estabilização do clima.
- Vista 2D (atlas com relevo, curvas de nível, gelo, vegetação, nuvens, noite e marés) e vista 3D (globo, oceano, atmosfera, criaturas detalhadas de perto).
- Cinco formas-base de vida, 21 genes e 16 inovações evolutivas que definem clados.
- Nomes científicos em latim/grego e nomes populares em português, todos editáveis.
- Inspetor de indivíduos e espécies com edição de traços; atlas filogenético e tabela de linhagens.
- Eventos de extinção (asteroide, vulcanismo, glaciação, estufa, anoxia, raios gama, pandemia e personalizado).
- Cofre da Vida, escalas de 1 hora a 100 milhões de anos, pausa e máquina do tempo.
- Som 100% procedural: drone harmônico, oceano, vento, biofonia, cantos por espécie, música generativa e efeitos de eventos.

## Planejamento

Os nomes e conteúdos abaixo são uma proposta e podem mudar a qualquer momento.

| Versão | Nome proposto | Foco |
|---|---|---|
| 1.2 | Teia Alimentar | Equilíbrio ecológico: predadores e presas mais estáveis, herbivoria, cadeias tróficas visíveis |
| 1.3 | Deriva | Placas tectônicas e deriva continental ao longo de centenas de milhões de anos |
| 1.4 | Simbiose | Endossimbiose, líquens, parasitismo e mutualismo como eventos evolutivos |
| **1.5** | Arquivo | Salvar e carregar partidas inteiras; exportar e importar o Cofre da Vida · **envio ao GitHub** |
| 1.6 | Biomas | Biomas emergentes (florestas, recifes, desertos) com efeito no clima e no som |
| 1.7 | Comportamento | Bandos, migração, territórios e cuidado parental |
| 1.8 | Sexo e Seleção | Reprodução sexuada, seleção sexual e ornamentos |
| 1.9 | Observatório | Gráficos de populações, comparação entre espécies, modo foto |
| **2.0** | Inteligência | Comportamento complexo, ferramentas e o surgimento de espécies inteligentes · **envio ao GitHub** |

## Como registrar uma versão nova

1. Atualizar `VERSION` e `VERSION_NAME` em `src/main.js` e `version` em `package.json`.
2. Escrever a entrada no **Histórico** acima (Adições, Melhorias, Mudanças) e marcá-la como *(atual)*.
3. Rodar `npm run build` e publicar `dist/tempo-profundo.html`.
4. Se for X.5 ou X.0: commit, etiqueta `vX.Y` e envio ao GitHub.
