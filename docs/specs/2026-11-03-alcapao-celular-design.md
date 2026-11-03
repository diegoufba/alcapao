# Alçapão: especificação do jogo no celular

**Data:** 03/11/2026 · **Status:** implementado · **Base:** [MVP](2026-11-02-alcapao-design.md) e [modo online](2026-11-03-alcapao-online-design.md)

---

## 1. Objetivo

Hoje só dá para jogar com teclado ou gamepad. A §9 do MVP deixava o celular fora do escopo.

Com esta especificação, o jogo passa a funcionar no navegador do celular por toque:

- **Offline:** só **1 jogador**, porque a tela é pequena demais para dividir.
- **Online:** cada celular é um jogador. Isso já é o modelo do online (1 jogador por aparelho).

No PC, nada muda.

**Critérios de sucesso**

- No celular em paisagem, dá para ir da tela inicial até o fim de uma partida offline (Sobrevivência e Pontos) só tocando.
- Um celular entra numa sala online criada no PC, joga a partida inteira e volta ao lobby.
- Com o celular em pé, aparece o aviso para girar o aparelho.
- No PC, com teclado ou gamepad, o comportamento e o visual continuam iguais.

---

## 2. Decisões

| Tema | Decisão |
|---|---|
| Controle | **Analógico virtual flutuante** à esquerda e **botão EMPURRAR** à direita |
| Orientação | Só **paisagem** (16:9, como hoje). Em retrato, o aviso "Gire o celular" cobre a tela |
| Offline no toque | **1 jogador**. P1 entra sozinho com o dispositivo de toque |
| Quando vale o "modo toque" | Liga no **primeiro toque real** (`pointerType === 'touch'`). Desliga ao chegar input de teclado ou gamepad |
| Pausa | Botão de pausa na tela, no lugar do Esc. No online, abre o overlay que não pausa |
| Tela cheia | No primeiro toque, tenta tela cheia e travar em paisagem. Onde não houver suporte (iOS), vale só o aviso |

**Por que o modo toque é ligado pelo toque e não pelo tipo de aparelho?** Um tablet com teclado ou gamepad deve continuar funcionando como no PC. Detectar "celular" pelo navegador falha nos dois sentidos.

---

## 3. Controles na tela

Os controles só aparecem com o modo toque ligado e só na tela da partida.

- **Analógico flutuante** (metade esquerda da tela):
  - a base aparece onde o polegar encosta e o pino segue o dedo até o raio da base;
  - arrastar para cima move o boneco para o fundo da arena (`-z`), como a tecla W;
  - a velocidade é proporcional ao deslocamento, com zona morta de 15% do raio e limite de 1;
  - ao soltar, o movimento zera e a base some.
- **Botão EMPURRAR** (canto inferior direito, grande):
  - cada toque vale um empurrão, guardado até o próximo passo do jogo, como as teclas de hoje;
  - um anel mostra a recarga a partir do `pushCooldown` do jogador local.
- **Botão de pausa** (canto superior direito, pequeno).
- **Multitoque:** cada dedo é tratado pelo seu `pointerId`, com `setPointerCapture`, então dá para andar e empurrar ao mesmo tempo.
- **Área segura:** a camada usa `touch-action: none` e respeita `env(safe-area-inset-*)` (entalhe e barra de gestos).

---

## 4. Fluxo de telas no toque

- **Tela inicial e menus:** já respondem a toque, porque os botões são clicáveis. O primeiro toque também acorda o áudio, como já acontece com `pointerdown`.
- **Entrada (offline):**
  - P1 entra sozinho com o dispositivo `touch` assim que a tela abre;
  - nenhum outro dispositivo entra enquanto o modo toque estiver ligado;
  - as vagas 2 a 4 mostram "Só 1 jogador no celular";
  - a dica muda para "Toque em COMEÇAR";
  - modo e rodadas são escolhidos tocando nos chips.
- **Online:** o jogador local passa a ler também o toque. O campo de código ganha `autocapitalize="characters"` para o teclado do celular já abrir em maiúsculas.
- **HUD:** no modo toque, os cards saem do rodapé, onde ficam os polegares, e vão para o topo, menores.

---

## 5. Orientação, tela cheia e viewport

- **Viewport:** `viewport-fit=cover` e sem zoom por gesto (`maximum-scale=1`). O `body` usa `touch-action: manipulation`, o que elimina o duplo toque para zoom.
- **Aviso "Gire o celular":**
  - é só CSS, com `@media (orientation: portrait) and (pointer: coarse)`;
  - uma camada cobre tudo;
  - o jogo continua rodando por trás.
- **No primeiro toque da tela inicial:** `requestFullscreen()` e depois `screen.orientation.lock('landscape')`, ambos dentro de try/catch e sem erro visível se falharem.

---

## 6. Arquitetura

| Arquivo | Puro? | Papel |
|---|---|---|
| `src/input/stick.ts` | sim | `stickVector(dx, dy, radius, deadzone): Vec2`, que transforma o arrasto no vetor de movimento |
| `src/input/touch.ts` | sim | `TouchInput`: `setStick`, `pressPush`, `read(): PlayerInput` e `reset`. O empurrão fica pendente até ser lido |
| `src/input/touch-mode.ts` | não | Liga e desliga o modo toque, mantém `body.is-touch` e expõe `isOn()` e `onChange()` |
| `src/ui/touch-controls.ts` | não | DOM do analógico, do EMPURRAR e da pausa. Ligado ao `TouchInput` |

Mudanças em arquivos existentes:

- `DeviceId` (`input/keyboard.ts`) ganha `'touch'`.
- `deviceInput` (`input/match-input.ts`) e `anyDeviceInput` (`input/any-input.ts`) passam a ler o `TouchInput`.
- `deviceLabel` (`ui/hud.ts`) mostra "Toque".
- O `ui/join.ts` ganha a regra de 1 jogador, com a lógica em `ui/join-logic.ts`.
- `render/scene.ts` limita o pixel ratio a 1,5 no modo toque. Hoje o limite é 2.

`stick.ts` e `touch.ts` entram na regra de pureza do ESLint.

---

## 7. Casos de borda

- **Dedo sai da área do analógico:** com a captura do ponteiro, o analógico continua seguindo o dedo até ele ser solto.
- **Toque cancelado** (`pointercancel`, por exemplo numa chamada recebida): o movimento zera.
- **Aba vai para o fundo:** `blur` e `visibilitychange` zeram o `TouchInput` e mantêm o comportamento de pausa de hoje no offline.
- **Teclado ou gamepad no meio da partida:** o modo toque desliga e os controles somem. No offline, a vaga continua com o dispositivo `touch`, e o jogador volta ao toque tocando de novo.
- **Girar para retrato no meio da partida:** o aviso cobre a tela. O offline pausa, e o online segue, como já é a regra do online.

---

## 8. Testes

**Automatizados (Vitest):**

- `stickVector`:
  - dentro da zona morta dá `{0,0}`;
  - arrastar para cima dá `z` negativo;
  - o comprimento fica limitado a 1;
  - o vetor é proporcional entre a zona morta e o raio.
- `TouchInput`: um `pressPush` resulta em `push: true` em uma única leitura, e `reset` zera tudo.
- Regra da entrada: com o modo toque ligado, um segundo dispositivo é recusado.

**Manuais:**

- **Painel do navegador** (preset mobile, que emula toque):
  - partida offline inteira só com toque;
  - aviso em retrato.
- **Celular de verdade na rede local:**
  - rodar `npm run dev -- --host` e abrir no celular o endereço "Network";
  - jogar uma partida offline e uma online, com o PC de host;
  - conferir FPS (F1), áudio e tela cheia no Android.
- **PC sem mudança:** `?quick=points&players=4` e o fluxo normal.

---

## 9. Fora do escopo

- Layout em retrato.
- Vários jogadores no mesmo celular.
- Vibração.
- Personalizar a posição dos controles.
- Instalar o jogo na tela inicial (PWA).

---

## 10. Notas da implementação

Desvios em relação ao que está escrito acima:

- **HUD no toque (§4):** os cards ficaram nos cantos do topo, com 140 px (P1 e P3 à esquerda, P2 e P4 à direita), para não cobrir o telão. O rótulo do dispositivo fica escondido nesse modo.
- **Tela inicial:** passou a sair também por toque e por clique (botão principal do mouse). Antes saía só por tecla ou gamepad, e no celular a pessoa ficava presa.
- **Tela cheia (§5):** `requestFullscreen()` e `orientation.lock` são pedidos no `pointerup` do toque, não no primeiro toque, porque o `pointerdown` não dá ativação de usuário no toque.
- **Clique fantasma:** o clique que o toque gera depois de sair da tela inicial é descartado se chegar em até 400 ms (`SWALLOW_CLICK_MS`), para não acionar o botão do menu que fica embaixo do dedo.
- **Teclado virtual:** teclas digitadas num campo de texto não desligam o modo toque (§2).
- **Textos da entrada (§4):** o topo da tela de entrada no toque diz "Você joga sozinho no celular". O rodapé é "Toque em COMEÇAR".
- **Tablet híbrido:** quando o toque liga, jogadores de teclado ou gamepad que já estavam na entrada não são removidos. O P1 de toque só entra com a sala vazia.
- **Atalho de DEV:** `?quick=...&touch` (ou `pointer: coarse`) faz o P1 usar o dispositivo de toque.
