# Celular: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** jogar no celular por toque, com analógico virtual e botão EMPURRAR, em paisagem. O offline fica limitado a 1 jogador; o online funciona como já é.

**Arquitetura:**
- A lógica de toque pura fica em `src/input/`, testada no Vitest:
  - a matemática do analógico e o rastreio de dedos ficam em `stick.ts`;
  - o leitor no formato do teclado fica em `touch.ts`.
- O toque entra como o dispositivo `'touch'` nos leitores que já existem (`deviceInput` e `anyDeviceInput`).
- O DOM dos controles (`ui/touch-controls.ts`) e o "modo toque" (`input/touch-mode.ts`, que liga a classe `body.is-touch`) só repassam eventos para essa lógica.

**Stack:** TypeScript, Vite, three.js e Vitest, sem dependência nova.

**Spec:** [docs/specs/2026-11-03-alcapao-celular-design.md](../specs/2026-11-03-alcapao-celular-design.md)

## Restrições globais

- Branch `feat/celular`. Tudo em pt-BR, inclusive textos, nomes de teste e commits. Cada commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `src/input/stick.ts` e `src/input/touch.ts` entram na regra de pureza do ESLint, a mesma de `src/core/**`.
- Analógico:
  - zona morta de **15%** do raio e comprimento limitado a **1**;
  - arrastar para cima dá **`-z`** (como a tecla W);
  - o raio da base é **60 px** em coordenadas de tela.
- Modo toque:
  - liga quando chega um `pointerdown` com `pointerType === 'touch'`;
  - desliga com `keydown` ou com botão de gamepad apertado.
- Textos exatos:
  - "Gire o celular" e, abaixo, "O Alçapão é jogado na horizontal";
  - "Só 1 jogador no celular";
  - "Toque em COMEÇAR";
  - "EMPURRAR";
  - rótulo do dispositivo: "Toque".
- No modo toque, o pixel ratio fica limitado a **1,5**. Fora dele continua o limite atual de 2 (`render/scene.ts:129`).
- No PC, com teclado ou gamepad, nada muda.
- Ao fim de cada tarefa: `npm test`, `npx tsc --noEmit` e `npm run lint` verdes. O Node vem do `fnm` (veja o `CLAUDE.md`).

## Foco da revisão

Cada item abaixo tem um teste na tarefa indicada.

1. **Dois dedos ao mesmo tempo:** soltar o dedo do EMPURRAR não pode zerar o analógico, e vice-versa. O rastreio é por `pointerId` (Tarefa 1).
2. **`pointercancel`**, por exemplo quando chega uma ligação: o movimento zera e o analógico não fica preso (Tarefa 1).
3. **Aba para o fundo ou janela sem foco:** o `TouchInput` zera, sem boneco correndo sozinho (Tarefa 1 testa o `reset`; a Tarefa 3 liga o `reset` ao `blur` e ao `visibilitychange`).
4. **Segundo dispositivo na entrada offline com o modo toque ligado:** é recusado (Tarefa 4).
5. **Teclas físicas num tablet com teclado:** o modo toque desliga e o fluxo de teclado volta a valer (Tarefa 2).

---

### Tarefa 1: entrada de toque pura e dispositivo `'touch'`

**Arquivos**
- Criar: `src/input/stick.ts`, `src/input/touch.ts`
- Modificar:
  - `src/input/keyboard.ts`: `DeviceId` ganha `'touch'`.
  - `src/input/match-input.ts`: `deviceInput`.
  - `src/input/any-input.ts`: `anyDeviceInput`.
  - `src/ui/hud.ts`: `deviceLabel`.
  - `eslint.config.js`.
- Testes: `tests/input/stick.test.ts`, `tests/input/touch.test.ts` e `tests/input/any-input.test.ts` (acrescentar casos).

**Interfaces que esta tarefa produz**

```ts
// stick.ts (puro)
export const STICK_RADIUS = 60;
export const STICK_DEADZONE = 0.15;
export function stickVector(dx: number, dy: number, radius?: number, deadzone?: number): Vec2;
/** Rastreia o dedo do analógico; ignora outros pointerIds. */
export class StickTracker {
  down(id: number, x: number, y: number): void;  // só aceita se nenhum dedo está no analógico
  move(id: number, x: number, y: number): void;
  up(id: number): void;                          // também usado para pointercancel
  vector(): Vec2;                                // {0,0} sem dedo
  origin(): { x: number; y: number } | null;     // centro da base, para o desenho
}
// touch.ts (puro)
export class TouchInput {
  setStick(v: Vec2): void;
  pressPush(): void;
  read(): PlayerInput;   // push true só na 1ª leitura após pressPush
  reset(): void;
}
// mudanças de assinatura (parâmetro opcional no fim, sem quebrar chamadas atuais)
export function deviceInput(devices: DeviceSlots, keyboard: KeyboardInput, gamepad: GamepadInput, touch?: TouchInput): MatchInput;
export function anyDeviceInput(you: PlayerId, keyboard: KeyboardInput, gamepad: GamepadInput, slots: HudSlots, touch?: TouchInput): MatchInput;
```

O `stickVector` mede a distância `d = hypot(dx, dy)`:
- se `d <= deadzone*radius`, devolve `{0,0}`;
- senão, devolve a direção `(dx, dy)/d` multiplicada por `min(1, (d - deadzone*radius) / (radius - deadzone*radius))`.

O eixo `dy` da tela vira `z`: para cima é `dy < 0`, o que dá `z < 0`.

- [ ] **Passo 1: escrever os testes que falham.**
  - `stickVector`:
    - `'dentro da zona morta é parado'`: `stickVector(5, 0)` dá `{x:0,z:0}`, porque 5 < 9.
    - `'arrastar para cima dá z negativo'`: `stickVector(0, -60).z` dá `-1`.
    - `'fica limitado a 1'`: `Math.hypot(...stickVector(300, 300))` ≈ `1`.
    - `'proporcional entre a zona morta e o raio'`: `stickVector(34.5, 0).x` ≈ `0.5`.
  - `StickTracker`:
    - `'segundo dedo não rouba o analógico'`: com `down(1,0,0)`, `down(2,100,0)` e `move(2,200,0)`, o resultado é `vector()` igual a `{0,0}`.
    - `'soltar outro dedo não zera o analógico'` (Foco 1): com `down(1,0,0)`, `move(1,60,0)` e `up(2)`, `vector().x` dá `1`.
    - `'up do dedo do analógico zera'` (Foco 2, o mesmo `up` vale para `pointercancel`): o `vector()` volta a `{0,0}` e `origin()` vira `null`.
  - `TouchInput`:
    - `'empurrão sai em uma única leitura'`: depois de `pressPush()`, `read().push` dá `true` e a leitura seguinte dá `false`.
    - `'reset zera movimento e empurrão'` (Foco 3).
  - `any-input`:
    - `'toque move o jogador local'`: com `touch.setStick({x:0,z:-1})`, `read().get(you).move` dá `{x:0,z:-1}`.
    - `'empurrão do toque entra no OU'`.
  - Em `tests/input/match-input.test.ts`, se o arquivo não existir, crie-o:
    - `'deviceInput lê o toque para o slot com dispositivo touch'`;
    - `deviceLabel('touch')` dá `'Toque'`.
- [ ] **Passo 2:** rodar `npx vitest run tests/input` e ver as falhas.
- [ ] **Passo 3:** implementar.
  - Em `deviceInput`, o ramo é `d === 'touch' ? (touch?.read() ?? STILL) : …`.
  - Em `anyDeviceInput`, `touch` entra na lista de leituras quando existir.
  - Em `eslint.config.js`, acrescentar `stick.ts` e `touch.ts` à lista de módulos puros.
- [ ] **Passo 4:** rodar os testes, `tsc` e `lint` e ver tudo verde.
- [ ] **Passo 5: commit** `feat(input): analógico e botão virtuais (lógica pura)`

---

### Tarefa 2: modo toque

**Arquivos**
- Criar: `src/input/touch-mode.ts`
- Modificar: `src/main.ts` (criar a instância e desligar o modo no `handlePads` quando `poll.joined` ou os eventos de pad não vierem vazios)
- Teste: `tests/input/touch-mode.test.ts`

**Interface**

```ts
export interface TouchMode { isOn(): boolean; onChange(cb: (on: boolean) => void): void; setOff(): void; }
/** `target` recebe 'pointerdown' e 'keydown'; liga/desliga `classList` 'is-touch' em `root`. */
export function createTouchMode(target: EventTarget, root: { classList: { toggle(c: string, on: boolean): void } }): TouchMode;
```

- [ ] **Passo 1: escrever os testes que falham.** Use `EventTarget` do Node e eventos `new Event('pointerdown')` com `Object.assign(e, { pointerType: 'touch' })`.
  - `'toque liga'`;
  - `'mouse não liga'` (`pointerType: 'mouse'`);
  - `'tecla desliga'` (Foco 5);
  - `'setOff desliga'`, para o gamepad;
  - `'onChange só dispara quando muda'`;
  - `'root recebe is-touch'`.
- [ ] **Passo 2:** rodar e ver as falhas.
- [ ] **Passo 3:** implementar e ligar no `main.ts`: `createTouchMode(window, document.body)`, com escuta em captura, como o `wakeAudio`.
- [ ] **Passo 4:** testes, `tsc` e `lint` verdes.
- [ ] **Passo 5: commit** `feat(input): modo toque`

---

### Tarefa 3: controles na tela, pausa por toque e HUD no topo

**Arquivos**
- Criar: `src/ui/touch-controls.ts`
- Modificar:
  - `src/main.ts`:
    - criar a instância e repassar o `TouchInput` ao `deviceInput`/`matchParams` e ao fluxo online (`src/online.ts`, onde o `anyDeviceInput` é criado);
    - em `blur` e `visibilitychange`, chamar `touch.reset()`;
    - o botão de pausa chama o mesmo caminho do Esc (`pauseMatch`, ou o overlay online).
  - `src/online.ts`
  - `src/ui/styles.css`

**Interface**

```ts
export function createTouchControls(deps: {
  touch: TouchInput;
  onPause(): void;
  /** recarga 0..1 do jogador local (para o anel), ou null sem partida */
  cooldown(): number | null;
}): { el: HTMLElement; update(): void };  // update() a cada quadro: desenha base/pino e anel
```

O DOM é uma camada `div.touch-controls` com três partes:
- **Zona esquerda** (metade da largura): eventos de ponteiro vão para `StickTracker`, com `setPointerCapture` no `down`. `pointerup`, `pointercancel` e `lostpointercapture` chamam `up(id)`. Depois de cada evento, `touch.setStick(tracker.vector())`.
- **Botão `EMPURRAR`** à direita (`pointerdown` chama `touch.pressPush()`), com o anel de recarga desenhado por `conic-gradient`. O valor vem de `cooldown()`, calculado no `main.ts` como `pushCooldown` do jogador local (`state.players`) dividido por `PUSH_COOLDOWN` (`src/core/physics.ts:12`).
- **Botão de pausa**, com um ícone ‖.

A camada só aparece com `body.is-touch[data-screen="match"]` e usa `touch-action: none`. As margens vêm de `env(safe-area-inset-*)`.

Com `body.is-touch`, o `.hud` vai para o topo (`top`, sem `bottom`) e fica menor.

O jogador local é:
- no offline, o P1;
- no online, o `you` da sessão. Exponha o `you` do `online.ts` se ainda não existir.

- [ ] **Passo 1:** implementar.
- [ ] **Passo 2:** `tsc`, `lint` e testes verdes.
- [ ] **Passo 3: verificação no painel do navegador.** Use o preset mobile em paisagem, por exemplo 812×375, que emula toque. Rode `npm run dev` com `?quick=survival&players=1`, toque na tela e confira:
  - o analógico move o boneco nas quatro direções;
  - o EMPURRAR gera o evento `pushed` (veja `window.matchState`);
  - a pausa abre;
  - o HUD fica no topo;
  - no desktop sem toque, nada aparece.

  Volte ao preset desktop no fim.
- [ ] **Passo 4: commit** `feat(ui): controles de toque na partida`

---

### Tarefa 4: offline com 1 jogador no toque

**Arquivos**
- Modificar:
  - `src/ui/join-logic.ts`;
  - `src/ui/join.ts`, que recebe `touchMode: TouchMode` nas deps e, ao mostrar a tela com o toque ligado, faz `devices.join('touch')`;
  - `src/main.ts`, para passar a dependência.
- Teste: `tests/ui/join-logic.test.ts`

**Interface**

```ts
/** Pode este dispositivo entrar? No modo toque só o 'touch' entra, e só uma vez. */
export function canJoin(players: number, device: DeviceId, touchOn: boolean): boolean;
```

- [ ] **Passo 1: escrever os testes que falham.**
  - `'toque ligado recusa teclado'`: `canJoin(1,'kb-wasd',true)` dá `false` (Foco 4);
  - `'toque ligado recusa gamepad'`;
  - `'toque entra sozinho'`: `canJoin(0,'touch',true)` dá `true`;
  - `'toque desligado segue como hoje'`: `canJoin(1,'kb-wasd',false)` dá `true` e `canJoin(4,'gp-0',false)` dá `false`.
- [ ] **Passo 2:** rodar e ver as falhas.
- [ ] **Passo 3: implementar.**
  - O `tryJoin` consulta `canJoin`.
  - Com o toque ligado:
    - as vagas 2 a 4 mostram "Só 1 jogador no celular";
    - a dica do rodapé vira "Toque em COMEÇAR";
    - o card de P1 mostra "P1 · Toque" e o texto de teclas fica vazio (`deviceInfo('touch')`).
  - Se o modo toque desligar com a tela aberta, ela volta ao comportamento normal sem tirar o P1.
- [ ] **Passo 4: testes verdes.** No painel, use o preset mobile em paisagem: menu → Jogar. O P1 já aparece como Toque, as outras vagas mostram o aviso, e COMEÇAR inicia a partida. Volte ao preset desktop.
- [ ] **Passo 5: commit** `feat(ui): offline com 1 jogador no celular`

---

### Tarefa 5: orientação, tela cheia, viewport e desempenho

**Arquivos**
- Modificar: `index.html`, `src/ui/styles.css`, `src/main.ts`, `src/render/scene.ts`, `src/ui/online.ts`

O que fazer em cada um:
- **`index.html`**: a meta viewport vira `width=device-width, initial-scale=1.0, maximum-scale=1, viewport-fit=cover`. Acrescente um `div.rotate-hint` com os dois textos exatos.
- **CSS**:
  - `.rotate-hint` fica oculto por padrão e só aparece em `@media (orientation: portrait) and (pointer: coarse)`, cobrindo tudo com `z-index` acima da UI, no estilo da paleta;
  - `body { touch-action: manipulation; }`.
- **`main.ts`**:
  - no primeiro `pointerdown` de toque na press-start, tentar `document.documentElement.requestFullscreen?.()` e depois `screen.orientation?.lock?.('landscape')`, os dois com `catch` silencioso;
  - com o modo toque ligado e uma partida offline, a mudança para retrato (`matchMedia('(orientation: portrait)')` em `change`) chama `autoPause()`.
- **`scene.ts`**: expor `setMaxPixelRatio(n: number)`. O `main.ts` chama com 1,5 quando o modo toque liga e com 2 quando desliga.
- **`ui/online.ts`**: no campo de código, `autocapitalize="characters"`, `inputmode="text"` e `enterkeyhint="go"`.

- [ ] **Passo 1:** implementar.
- [ ] **Passo 2:** `tsc`, `lint`, testes e `npm run build:pages` verdes.
- [ ] **Passo 3: verificação no painel.**
  - Preset mobile em retrato (375×812): aparece o aviso.
  - Em paisagem, o aviso some.
  - Partida offline com toque, girar para retrato: a partida pausa.
  - No desktop, o aviso nunca aparece.
  - Volte ao preset desktop no fim.
- [ ] **Passo 4: commit** `feat: paisagem, tela cheia e viewport para celular`

---

### Tarefa 6: documentação

**Arquivos a modificar:**
- `docs/specs/2026-11-02-alcapao-design.md`, §9: o celular passa a apontar para a spec do celular.
- `docs/specs/2026-11-03-alcapao-celular-design.md`: status "implementado" e notas do que mudou na implementação.
- `README.md`: como jogar no celular (paisagem, offline 1 jogador, online) e como testar na rede local com `npm run dev -- --host`.
- `CLAUDE.md`:
  - o modo toque (`touch-mode.ts`, `body.is-touch`);
  - os arquivos novos em `src/input/`;
  - os módulos puros na regra do ESLint;
  - o teste com o preset mobile do painel e com o celular na rede local.
- `docs/checklist-mvp.md`: itens do celular.

- [ ] **Passo 1:** editar. Cada afirmação precisa ser conferida no código.
- [ ] **Passo 2:** `npm run lint`.
- [ ] **Passo 3: commit** `docs: jogo no celular`
