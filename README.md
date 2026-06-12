# THE BACKROOMS — Nível 0

Jogo de terror em primeira pessoa. Você "no-clipou" para fora da realidade e
precisa encontrar a **saída verde** antes que o **Smiler** te alcance no
labirinto amarelo. Feito com **HTML + CSS + JavaScript** (Three.js via CDN).
Roda direto no GitHub Pages.

## A intro (lore cinematográfica)

Ao clicar em começar, toca o áudio de `Assets/Audio-intro.mp3` e a tela
**clareia do preto** revelando um cômodo "lembrado". A câmera **desce de
verdade por uma torre de 9 salas 3D**, cada uma mais distorcida e amarela, até
**cair nos Fundos** (a 9ª sala — um salão amplo com pilares e luzes
fluorescentes), por onde ela então avança. As quedas são **sincronizadas ao
áudio**:

| Queda | No áudio | Queda | No áudio |
| ----- | -------- | ----- | -------- |
| 1ª    | 6s → 9s   | 5ª    | 28s → 30s |
| 2ª    | 15s → 17s | 6ª    | 31s → 32s |
| 3ª    | 21s → 22s | 7ª    | 34s → 35s |
| 4ª    | 25s → 26s | 8ª    | 37s → 38s (Fundos) |

A lore dura ~57s (um pouco menos que o áudio de 60s) e então entra no jogo.
Dá para pular com **Esc**, **Espaço** ou no botão "pular intro".

## Controles

| Ação     | Tecla         |
| -------- | ------------- |
| Olhar    | Mouse         |
| Mover    | W A S D       |
| Correr   | Shift (gasta fôlego) |
| Interagir / sair | E     |

> 🎧 Use fones — o som do monstro tem direção (esquerda/direita) e fica mais
> alto quanto mais perto ele está.

## Arquivos

```
index.html      → estrutura + telas (título, intro, menu, fim)
backrooms.css   → toda a interface
intro.js        → a intro cinematográfica (Canvas 2D, sincronizada ao áudio)
backrooms.js    → o jogo 3D (Three.js): labirinto, monstro, áudio procedural
Assets/Audio-intro.mp3  → trilha da intro
```

## Publicar no GitHub Pages

1. Suba todos os arquivos para a **raiz** do repositório (incluindo a pasta
   `Assets`). O `index.html` precisa ficar na raiz.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch.**
3. Escolha a branch `main` e a pasta `/ (root)`. Salve.
4. O jogo ficará em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

> ⚠️ **Atenção à maiúscula:** o GitHub Pages é sensível a maiúsculas/minúsculas.
> A pasta precisa se chamar exatamente `Assets` e o áudio `Audio-intro.mp3`
> (é assim que o código referencia). Se você renomear, ajuste em `index.html`.

## Testar localmente

Abra `index.html` no navegador. O Three.js é baixado de um CDN, então é preciso
estar **online**. O áudio só inicia após o clique (exigência dos navegadores).
