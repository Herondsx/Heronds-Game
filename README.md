# THE BACKROOMS — Nível 0

Jogo de terror em primeira pessoa que roda direto no navegador (Three.js r128 + Web Audio).
Você "no-clipou" para fora da realidade. Religue a energia, encontre a saída e não deixe
**ele** te encontrar.

> Use fones de ouvido. O som é 3D (HRTF) e é a sua principal ferramenta para saber onde ele está.

## Como jogar

Abra pelo GitHub Pages ou sirva a pasta localmente (o áudio não funciona via `file://`):

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

| Tecla | Ação |
|---|---|
| Mouse | olhar |
| W A S D | mover |
| Shift | correr (faz **muito** barulho) |
| C | agachar (quase silencioso, mais difícil de ver) |
| F | lanterna |
| E | interagir / pegar / ler bilhete |
| Q (segurar) | prender a respiração |
| R | trocar as pilhas da lanterna |
| X | beber água de amêndoa (recupera sanidade) |
| G | arremessar garrafa vazia (distração) |
| M | mapa (só mostra o que você já viu) |
| Esc | pausa / ajustes |
| F3 | ver o estado e os "pensamentos" da entidade em tempo real |

### Objetivos
- **Nível 0 — O Saguão:** religue 3 disjuntores para destravar a porta de manutenção.
  Cada disjuntor faz um estalo alto, e a entidade passa a entender para onde você vai.
- **Nível 1 — Zona Habitável:** encontre 3 fusíveis, leve-os ao gerador e corra até o elevador de carga.

## Mecânicas

- **Lanterna com bateria:** enfraquece e falha com a pilha fraca. Também falha perto da entidade
  (interferência). Apontada para ela, a lanterna te denuncia de longe, mas de perto ofusca a entidade
  por um instante.
- **Furtividade de verdade:** cada passo gera um ruído com raio próprio (agachado 2 m, andando 7 m,
  correndo 17 m, na poça ×1,7). A entidade calcula a distância pelo **caminho real** nos corredores.
- **Prender a respiração:** silencia a sua respiração ofegante. Quando o ar acaba, você arfa alto.
- **Sanidade:** cai no escuro, ao ver a entidade e durante caçadas. Com sanidade baixa as paredes
  "respiram", a imagem ondula, você ouve sussurros e passos atrás de você e vê figuras que não existem.
  Abaixo de 15%, **ela sente o seu medo**.
- **Água de amêndoa, pilhas, garrafas, bilhetes, rádio, mapa explorado**, além de eventos
  ambientes (batidas na parede, portas batendo, um telefone antigo tocando, apagões).

## A entidade ("O Inquilino")

Modelo procedural articulado (~2,6 m, costelas aparentes, braços longos demais, mandíbula que abre
demais, olhos que refletem a lanterna). Anda curvada, corre de quatro na caçada e tem espasmos.
Fica "stop-motion" quando você olha para ela de perto. As lâmpadas piscam ao redor dela.

### Como ela pensa (`src/ai.js`)

- **Percepção:** cone de visão com linha de visão real; o alcance depende da luz onde **você** está,
  da lanterna, de estar agachado e da sua velocidade. A detecção é um medidor que sobe aos poucos.
  A audição usa a distância pelo caminho, com imprecisão proporcional à distância.
- **Memória:** última posição e velocidade vistas, mapa de calor dos lugares onde você costuma estar,
  esconderijos onde já te encontrou.
- **Aprendizado:** depois de ser enganada por garrafas, fica cética e passa a ir até **de onde** a
  garrafa foi jogada. Ganha tolerância à lanterna. Entende seu objetivo e faz **emboscadas** perto
  dos próximos disjuntores/fusíveis.
- **Estados:** dormente → patrulha → investigar → espreitar/recuar (se percebe que você a viu, volta
  para a sombra) → caçar (prevê sua rota para interceptar e tenta **flanquear** evitando o seu rastro)
  → procurar (último ponto visto, direção da fuga, cantos escuros) → emboscar. Também apaga lâmpadas
  de propósito para deixar o nível mais escuro.
- **Diretor de IA:** se você passa muito tempo sem encontro, ela "fareja" e se reposiciona fora da
  sua vista. Depois de uma caçada, dá um respiro.

## Estrutura do código

```
index.html        fluxo: título → intro → menu → jogo
backrooms.css     interface (HUD, menus, bilhetes, mapa, telas finais)
src/core.js       utilitários, ruído procedural, configurações, GLSL comum
src/textures.js   texturas procedurais (papel de parede, carpete, forro, concreto...)
src/postfx.js     pós-processamento: bloom, aberração, grão, VHS, glitch, distorções
src/audio.js      áudio 3D procedural (HRTF, reverb, oclusão, todos os efeitos)
src/shading.js    shaders de iluminação (lightmap + lanterna + neblina)
src/world.js      geração de níveis, lightmap assado, geometria, colisão, A*, Dijkstra
src/entity.js     modelo e animação procedural da entidade
src/ai.js         cérebro da entidade
src/game.js       jogador, mecânicas, objetivos, interface e laço principal
src/intro.js      abertura cinematográfica sincronizada com Assets/Audio-intro.mp3
```

### Detalhes técnicos
- **Iluminação:** em vez de dezenas de luzes dinâmicas, cada nível assa um *lightmap* na CPU com
  oclusão pelas paredes (DDA na grade). Os canais RGBA guardam as lâmpadas estáveis, dois grupos que
  piscam e a luz rebatida borrada (GI). Assim, piscar ou quebrar uma lâmpada custa quase nada.
- **Geometria mesclada:** paredes, chão, forro e luminárias viram poucas *draw calls*, com AO por vértice.
- **Pathfinding:** A* em 8 direções com suavização (*string pulling*) e Dijkstra a partir do jogador
  (usado para audição, oclusão sonora e para o diretor).
- Tudo é gerado na hora: nenhuma imagem externa. As únicas mídias são as músicas e o áudio da
  intro em `Assets/`.

Em **Ajustes** dá para mudar sensibilidade, volume, brilho, intensidade dos efeitos de tela e a
resolução de renderização (útil em notebooks).
