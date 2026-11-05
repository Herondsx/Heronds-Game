# THE BACKROOMS — Nível 0

Jogo de terror em primeira pessoa que roda direto no navegador (Three.js r128 + Web Audio).
Você "no-clipou" para fora da realidade. Religue a energia, encontre a saída e não deixe
**ele** te encontrar.

> Use fones de ouvido. O som é 3D (HRTF) e é a sua principal ferramenta para saber onde ele está.

## Como jogar

Online: **https://herondsx.github.io/Heronds-Game/**

Ou sirva a pasta localmente (o áudio não funciona abrindo o arquivo direto, via `file://`):

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

### Publicação no GitHub Pages

O jogo é 100% estático (HTML + CSS + JavaScript rodando no navegador), que é exatamente o que o
GitHub Pages hospeda. Não há nada de servidor (PHP, Python, Node...).

- **Settings → Pages → Build and deployment:** *Deploy from a branch*, branch `main`, pasta `/ (root)`.
- O arquivo vazio `.nojekyll` desliga o Jekyll: o Pages publica os arquivos exatamente como estão.
- Todos os caminhos são **relativos** e respeitam maiúsculas/minúsculas (`Assets/` com A maiúsculo,
  `src/` minúsculo). Isso é obrigatório, porque o site fica em `/Heronds-Game/` e o servidor diferencia letras.
- O Three.js r128 vem do CDN (cdnjs, HTTPS). O restante é gerado no próprio navegador.
- Tamanho total ≈ 19 MB (o limite do Pages é 1 GB por site).

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
- **Prólogo — o escritório (23:47):** salve o relatório, pegue a lanterna de emergência na gaveta e vá ao
  banheiro lavar o rosto. Algo está errado com este prédio... e você atravessa a parede.
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

## A entidade ("O Inquilino") — e ela CRESCE

Criatura procedural com **física de pernas em IK** (`src/creature.js`), em três estágios:

1. **O Magro** — humanoide alto e esquelético, anda em pé.
2. **Aranha** — os braços viraram pernas: anda de quatro, joelhos acima do corpo, pescoço comprido.
3. **Gigante** — seis pernas longuíssimas, corpo no alto e um tronco humano pendurado de cabeça para
   baixo, com os braços arrastando no chão.

Os pés ficam **plantados** no mundo e só se movem quando o corpo se afasta (passada em arco, grupos
alternados). Em corredores estreitos as pernas **sobem pelas paredes**, e ela também anda **pelo teto**.
O corpo tem mola (afunda a cada passo pesado) e os braços balançam como pêndulos. Ela muda de forma
longe dos seus olhos: depois do 2º disjuntor no Nível 0 e do 2º fusível no Nível 1.

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
- **Truques que você não espera:** imita os SEUS passos de corrida atrás de você, faz o clique da sua
  lanterna, bate na parede perto de você; apaga as lâmpadas ao seu redor uma a uma antes de atacar no
  escuro; espera **no teto** em cima do caminho e cai quando você passa por baixo; e às vezes "vai
  embora" com passos pesados se afastando... enquanto volta em silêncio.
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
src/entity.js     humanoide antigo (usado nas alucinações) + materiais da entidade
src/creature.js   a criatura que cresce: estágios, IK, pés plantados, paredes e teto
src/layouts.js    plantas fixas: escritório do prólogo e salão do fim da abertura
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
- Texturas e geometria são geradas na hora (nenhuma imagem externa).
- **Sons gravados** (`Assets/`, enviados para o projeto) são recortados em `Assets/sfx/`: passos no
  carpete andando e correndo (cada passo é disparado no instante da pisada; a corrida tem cadência 1,3×
  a da gravação), passos pesados da entidade (mais graves conforme ela cresce), um único clique da
  lanterna, o grito do jumpscare e um loop sem emenda do zumbido fluorescente. Os efeitos que não têm
  gravação continuam sintetizados.
- **Transições sem teletransporte:** ao atravessar a parede do banheiro ou a porta de saída, o mundo
  distorce, as paredes respiram, o som abafa, você atravessa a parede e acorda caído no chão do próximo
  lugar, levantando devagar.
- **Abertura:** a câmera desce reta como um elevador pelos andares (com a laje entre eles), sem
  legendas, até o Nível 0 real — onde as luzes se apagam fileira por fileira na sua direção.

Em **Ajustes** (Esc) dá para mudar sensibilidade, brilho, intensidade dos efeitos de tela, a
resolução de renderização (útil em notebooks) e três volumes separados: **geral**, **música e intro**
(músicas do rádio + áudio da abertura) e **efeitos e ambiente**. Os volumes também aparecem na tela de
título e durante a intro, e a escolha fica salva no navegador.
