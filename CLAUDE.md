# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Alçapão é um quiz party game 3D local (1 a 4 jogadores na mesma tela) no navegador: TypeScript + Vite + three.js, sem framework de UI. Código, comentários, textos da interface, docs e mensagens de commit são em português (pt-BR).

## Comandos

```bash
npm run dev                                   # servidor Vite
npm test                                      # Vitest (tests/**/*.test.ts)
npx vitest run tests/core/physics.test.ts     # um arquivo
npx vitest run -t "nome do teste"             # um teste pelo nome
npx tsc --noEmit                              # checagem de tipos (o build roda `tsc && vite build`)
npm run lint
npm run build
```

Neste computador (Windows) o Node vem do `fnm` e não está no PATH padrão do shell do agente. No PowerShell, antes do `npm`/`npx`:

```powershell
$fnm = "C:\Users\diego\AppData\Local\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\fnm.exe"; & $fnm env --shell powershell | Out-String | Invoke-Expression; & $fnm use default *> $null
```

Dependências usam versões exatas (`npm install --save-exact`).

### Atalhos só em desenvolvimento (`import.meta.env.DEV`)

- `?showcase=question|reveal|spin|suddenDeath|characters` monta só a cena com o telão num estado fixo (`src/showcase.ts`). Aceita `&mode=points` e `&sd` (morte súbita). É o jeito mais rápido de conferir mudanças visuais.
- `?quick=survival|points&players=1-4&rounds=8|12|16` pula os menus e entra direto numa partida.
- `?bank=empty` simula banco de perguntas vazio (tela de erro).
- No jogo: F1 liga o debug (FPS, resposta certa, zonas, colisões) e N pula a fase.

## Arquitetura

O fluxo de um quadro, em `src/main.ts` (`renderer.setAnimationLoop`): entradas → `match.update(dt)` → cena/efeitos → áudio. As camadas são:

- **`src/core/` — regras puras.** `createGame(config, questions)` (`game.ts`) é uma máquina de fases (`spin → question → lock → reveal → reset`, até `over`) com `step(dt, inputs)` que devolve `GameEvent[]`. Física, sorteio de perguntas (RNG com seed), pontuação e ranking ficam aqui. **O ESLint proíbe importar `three` e usar `window`/`document`/`localStorage`/`navigator` em `src/core/**` e em `src/audio/director.ts`** — mantenha-os puros; é o que permite testá-los no Vitest sem DOM.
- **`src/match.ts` — ponte entre core e cena.** Avança o jogo em passo fixo de 1/60 s (`src/loop.ts`) e interpola a posição dos personagens com `alpha`. Desenha o telão via `screenViewFor()` (`render/screen-view.ts`, puro e testado), anima arena/efeitos e repassa os eventos para o áudio (`drainEvents()`).
- **`src/render/` — three.js.** `scene.ts` cria renderer, câmera, céu (shader com transição para a morte súbita), luz e campo, e concentra a paleta: `PLAYER_COLORS`, `ZONE_STYLE` (cor/forma/nome de cada plataforma A–D) e `drawZoneShape()`, usados tanto no 3D quanto nas texturas de canvas. O telão (`screen.ts`) e o topo das plataformas (`arena.ts`) são `CanvasTexture` repintadas por código; alguns materiais têm shaders próprios ou `onBeforeCompile`, alimentados por um `uTime` atualizado no `update(dt)` de cada módulo.
- **`src/ui/` — telas em DOM.** Cada tela é um `ScreenCtl` (`dom.ts`) que o `router.ts` mostra/esconde. Telas são desenhadas em 1280×720 e escaladas por `--ui-scale`. `nav.ts` cuida do foco/navegação por teclado e gamepad e emite eventos de UI (`emitUi`) que viram sons. Estilos ficam todos em `ui/styles.css`, com a paleta em variáveis CSS no `:root`.
- **`src/input/`** — teclado lido por `KeyboardEvent.code` (funciona em ABNT), três grupos de teclas (`kb-wasd`, `kb-arrows`, `kb-ijkl`) e gamepads (`gp-N`); `DeviceSlots` liga dispositivo → jogador.
- **`src/audio/`** — `director.ts` traduz (tela, estado, eventos) em `AudioCommand`s de forma pura; `mixer.ts` executa com Web Audio. O `AudioContext` só nasce no primeiro input (política de autoplay).

### Convenções do jogo que atravessam arquivos

- As zonas internas são `'A' | 'B' | 'C' | 'D'`, mas o jogador nunca vê letras: vê cor + forma (vermelho/triângulo, azul/losango, amarelo/círculo, verde/quadrado). Textos de interface usam `ZONE_STYLE[z].name`.
- Os modos são `survival` (padrão na entrada) e `points` (8/12/16 rodadas, empate vai para morte súbita).
- Perguntas ficam em `src/data/questions.json` e são validadas em `core/questions.ts` (`validateBank`); inválidas são descartadas com aviso. Formato no `README.md`.
- Áudio em `public/audio/{music,sfx}` (`.ogg` + `.mp3` com o mesmo nome); créditos em `public/audio/CREDITS.md`; os scripts Python em `tools/audio` geraram os arquivos atuais.

## Documentação

Spec em `docs/specs/2026-11-02-alcapao-design.md`, plano em `docs/plans/2026-11-02-alcapao-mvp.md` e checklist em `docs/checklist-mvp.md`. Ao mudar números de jogo (velocidade, tempos, pontos), atualize a spec e o plano junto.
