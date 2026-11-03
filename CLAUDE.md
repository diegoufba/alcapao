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
npm run build:pages                           # build com base /alcapao/ (GitHub Pages)
```

Neste computador (Windows) o Node vem do `fnm` e não está no PATH padrão do shell do agente. No PowerShell, antes do `npm`/`npx`:

```powershell
$fnm = "C:\Users\diego\AppData\Local\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\fnm.exe"; & $fnm env --shell powershell | Out-String | Invoke-Expression; & $fnm use default *> $null
```

Dependências usam versões exatas (`npm install --save-exact`).

### Atalhos só em desenvolvimento (`import.meta.env.DEV`)

- `?showcase=question|reveal|spin|suddenDeath|characters` monta só a cena com o telão num estado fixo (`src/showcase.ts`). Aceita `&mode=points` e `&sd` (morte súbita). É o jeito mais rápido de conferir mudanças visuais.
- `?quick=survival|points&players=1-4&rounds=8|12|16` pula os menus e entra direto numa partida. Com `&touch` (ou `pointer: coarse`), o P1 usa o dispositivo de toque em vez do teclado.
- `?online=host` cria a sala e vai direto ao lobby; `?online=join&sala=XXXXX` entra direto numa sala. Para testar no mesmo PC, abra duas abas (o PeerJS funciona entre abas): uma com `?online=host`, a outra com `?online=join&sala=` e o código que o lobby mostra. No cliente online, F1 também mostra o RTT e a idade do último snapshot (só aparecem no cliente).
- Teste de toque no painel do navegador: use o preset mobile do `resize_window` e 812×375 para paisagem. Os cliques do painel chegam como mouse e não ligam o modo toque; despache `document.dispatchEvent(new PointerEvent('pointerdown', {pointerType: 'touch', bubbles: true}))`. Para testar num celular de verdade, rode `npm run dev -- --host` e abra o endereço "Network".
- `?bank=empty` simula banco de perguntas vazio (tela de erro).
- No jogo: F1 liga o debug (FPS, resposta certa, zonas, colisões) e N pula a fase.

O `?sala=X` vale também em produção: abre a tela Online com o código preenchido e some da URL depois de usado.

## Arquitetura

O fluxo de um quadro, em `src/main.ts` (`renderer.setAnimationLoop`): entradas → `match.update(dt)` → cena/efeitos → áudio. As camadas são:

- **`src/core/` — regras puras.** `createGame(config, questions)` (`game.ts`) é uma máquina de fases (`spin → question → lock → reveal → reset`, até `over`) com `step(dt, inputs)` que devolve `GameEvent[]`. Física, sorteio de perguntas (RNG com seed), pontuação e ranking ficam aqui. **O ESLint proíbe importar `three` e usar `window`/`document`/`localStorage`/`navigator` em `src/core/**`, `src/sim/**`, `src/audio/director.ts` e nos módulos puros de `src/net/` (`room-code`, `protocol`, `snapshots`, `host-rules`) e `src/input/` (`stick`, `touch`)** — mantenha-os puros; é o que permite testá-los no Vitest sem DOM.
- **`src/match.ts` — ponte entre core e cena.** Lê uma `SimSource` (o passo fixo de 1/60 s e a interpolação com `alpha` moram em `src/sim/local.ts`, com `src/loop.ts`). Desenha o telão via `screenViewFor()` (`render/screen-view.ts`, puro e testado), anima arena/efeitos e repassa os eventos para o áudio (`drainEvents()`).
- **`src/sim/` — fonte de simulação (`SimSource`).** O `match.ts` lê estado e eventos de uma `SimSource`: `local.ts` roda o `createGame` (offline e host) e `remote.ts` não roda o jogo, só desenha o que o `ClientSession` entrega. Online não pausa (nem Esc ou blur). Esconder ou minimizar a aba do HOST congela a partida para todos (o navegador para o `requestAnimationFrame`) e os clientes veem "Aguardando o host…" depois de 2 s sem snapshot. Em produção, o F1 online mostra só FPS/RTT, sem a resposta, e o N não funciona.
- **`src/net/` — modo online (P2P por WebRTC, sem servidor de jogo).** O host roda a partida e é o P1; os clientes mandam input e recebem snapshots a 30 Hz, desenhados com 100 ms de atraso e interpolados. `transport.ts` é o único que importa `peerjs`, por import dinâmico (chunk separado). `host-session.ts` e `client-session.ts` fazem lobby, inputs e detecção de queda; `protocol.ts` valida tudo o que vem da rede. `src/online.ts` junta isso ao fluxo de telas (`ui/online.ts`, `lobby.ts`, `net-errors.ts`). Spec em `docs/specs/2026-11-03-alcapao-online-design.md`.
- **`src/render/` — three.js.** `scene.ts` cria renderer, câmera, céu (shader com transição para a morte súbita), luz e campo, e concentra a paleta: `PLAYER_COLORS`, `ZONE_STYLE` (cor/forma/nome de cada plataforma A–D) e `drawZoneShape()`, usados tanto no 3D quanto nas texturas de canvas. O telão (`screen.ts`) e o topo das plataformas (`arena.ts`) são `CanvasTexture` repintadas por código; alguns materiais têm shaders próprios ou `onBeforeCompile`, alimentados por um `uTime` atualizado no `update(dt)` de cada módulo.
- **`src/ui/` — telas em DOM.** Cada tela é um `ScreenCtl` (`dom.ts`) que o `router.ts` mostra/esconde. Telas são desenhadas em 1280×720 e escaladas por `--ui-scale`. `nav.ts` cuida do foco/navegação por teclado e gamepad e emite eventos de UI (`emitUi`) que viram sons. Estilos ficam todos em `ui/styles.css`, com a paleta em variáveis CSS no `:root`.
- **`src/input/`** — teclado lido por `KeyboardEvent.code` (funciona em ABNT), três grupos de teclas (`kb-wasd`, `kb-arrows`, `kb-ijkl`), gamepads (`gp-N`) e toque (`touch`); `DeviceSlots` liga dispositivo → jogador. `stick.ts` (vetor do analógico) e `touch.ts` (`TouchInput`) são puros; `touch-mode.ts` liga o modo toque no primeiro `pointerdown` com `pointerType === 'touch'`, desliga com `keydown` (fora de campo de texto) ou botão de gamepad, e põe `body.is-touch`. Os controles na tela (`ui/touch-controls.ts`), o HUD no topo, os botões de voltar/sair (`.touch-only`) e o pixel ratio de 1,5 dependem desse modo; os controles aparecem só com `body.touch-local` (no offline, P1 `touch`; no online, sempre). O aviso `rotate-hint` e os textos da press-start NÃO dependem do modo: são só `@media (pointer: coarse)` (o aviso, também em retrato). Regra de 1 jogador (`canJoin`/`joinAction` em `ui/join-logic.ts`): um `touch` na sala não divide a tela, então com ele ninguém mais entra; o `touch` só entra com a sala vazia, e teclado ou gamepad usado com o P1 de toque sozinho troca o P1.
- **`src/audio/`** — `director.ts` traduz (tela, estado, eventos) em `AudioCommand`s de forma pura; `mixer.ts` executa com Web Audio. O `AudioContext` só nasce no primeiro input (política de autoplay).

### Convenções do jogo que atravessam arquivos

- As zonas internas são `'A' | 'B' | 'C' | 'D'`, mas o jogador nunca vê letras: vê cor + forma (vermelho/triângulo, azul/losango, amarelo/círculo, verde/quadrado). Textos de interface usam `ZONE_STYLE[z].name`.
- Os modos são `survival` (padrão na entrada) e `points` (8/12/16 rodadas, empate vai para morte súbita).
- Perguntas ficam em `src/data/questions.json` e são validadas em `core/questions.ts` (`validateBank`); inválidas são descartadas com aviso. Formato no `README.md`.
- Áudio em `public/audio/{music,sfx}` (`.ogg` + `.mp3` com o mesmo nome); créditos em `public/audio/CREDITS.md`; os scripts Python em `tools/audio` geraram os arquivos atuais.

## Documentação

Spec em `docs/specs/2026-11-02-alcapao-design.md`, plano em `docs/plans/2026-11-02-alcapao-mvp.md` e checklist em `docs/checklist-mvp.md`. Ao mudar números de jogo (velocidade, tempos, pontos), atualize a spec e o plano junto.

## Deploy

Cada push na `main` dispara `.github/workflows/pages.yml`: lint, testes, `npm run build:pages` e publicação em <https://diegoufba.github.io/alcapao/>. Caminhos de arquivos em `public/` precisam passar por `import.meta.env.BASE_URL`, senão quebram fora da raiz.
