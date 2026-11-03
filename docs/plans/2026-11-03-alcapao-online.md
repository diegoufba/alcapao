# Modo online: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** sala online privada por código, P2P, 1 jogador por PC, até 4 por sala. O offline não muda.

**Arquitetura:**
- O `match.ts` deixa de criar o jogo e passa a consumir uma `SimSource`, que pode ser:
  - `local`: offline, e também a do host, com ganchos;
  - `remote`: cliente, que desenha snapshots interpolados.
- O host roda `createGame()` e transmite estado e eventos pelo PeerJS. Os clientes mandam inputs.
- A lógica de rede pura (código, protocolo, snapshots e regras do host) fica em `src/net/`, testada sem DOM. As sessões falam com uma interface `Link`, que nos testes é falsa.

**Stack:** TypeScript + Vite + three.js (já existentes), `peerjs` (novo, versão exata) e Vitest.

**Spec:** [docs/specs/2026-11-03-alcapao-online-design.md](../specs/2026-11-03-alcapao-online-design.md)

## Restrições globais

- Código, comentários, textos de interface e commits em pt-BR, como no resto do repositório.
- Dependências com versão exata: `npm install --save-exact peerjs`.
- Pureza:
  - `src/net/room-code.ts`, `protocol.ts`, `snapshots.ts` e `host-rules.ts` e todo `src/sim/` entram na regra do ESLint de `src/core/**`: sem `three`, sem `window`, `document`, `localStorage` ou `navigator`.
  - Só `src/net/transport.ts` importa `peerjs`.
- Código da sala: 5 letras do alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ` (sem I, L e O). O id no PeerJS é `alcapao-<CÓDIGO>`.
- Ritmo:
  - passo fixo de 1/60 s;
  - snapshots a 30 Hz, um a cada 2 ticks;
  - atraso de desenho no cliente de 100 ms (6 ticks);
  - heartbeat de input a 5 Hz.
- Jogadores: host = P1; até 4; "Começar" só com 2 ou mais; entrada recusada com a partida em andamento.
- Online não pausa: nem Esc, nem blur, nem aba escondida.
- Caminhos em `public/` passam por `import.meta.env.BASE_URL`. O build precisa passar em `npm run build:pages`.
- Ao fim de cada tarefa: `npm test`, `npx tsc --noEmit` e `npm run lint` verdes. Antes, carregue o Node pelo `fnm`, como diz o `CLAUDE.md`.

## Foco da revisão

Situações que a spec implica e que mais podem incomodar quem joga. Cada uma tem teste na tarefa indicada:

1. **Aba do cliente em segundo plano e depois de volta.** O cliente pula para o presente e não reproduz segundos de atraso (Tarefa 4).
2. **Mensagem malformada ou hostil** (JSON quebrado, `PlayerId` inválido, `NaN`, campos a mais ou a menos). É descartada, e a sessão segue viva (Tarefas 3 e 6).
3. **Spam de empurrão ou `pushCount` que salta** (+50 de uma vez). No máximo 2 empurrões ficam pendentes (Tarefa 5).
4. **Host fecha a aba no lobby, antes de qualquer partida.** O cliente recebe `onClosed('host-left')` (Tarefa 6).
5. **Cliente entra depois do "Começar".** Recebe `rejected 'started'` e vê "Partida já começou" (Tarefas 5 e 6).

---

### Tarefa 1: `SimSource` local e `match.ts` desacoplado (sem mudar o offline)

**Arquivos**
- Criar:
  - `src/sim/source.ts` (só tipos);
  - `src/sim/local.ts`;
  - `src/input/match-input.ts`.
- Modificar:
  - `src/match.ts`: `start` e `update`; o `held`, o `prev` e o `stepper` saem daqui;
  - `src/ui/hud.ts`: `update` recebe `HudSlots` no lugar de `DeviceSlots`;
  - `src/main.ts`: rota `match`, `?quick=`;
  - `eslint.config.js`: pureza de `src/sim/**`.
- Testes:
  - `tests/sim/local.test.ts`;
  - o banco de perguntas de teste fica em `tests/helpers/bank.ts`. Se o fixture estiver dentro de `tests/core/game.test.ts`, extraia-o para lá e passe a importá-lo.

**Interfaces que esta tarefa produz**

```ts
// src/sim/source.ts
export interface SimFrame {
  state: GameState; events: GameEvent[];
  positions: ReadonlyMap<PlayerId, Vec2>; // já interpolada para desenhar
  themes: string[];                       // availableThemes() (telão na roleta)
}
export interface SimSource {
  /** null = ainda não há estado (cliente sem snapshot). */
  advance(realDt: number, local: ReadonlyMap<PlayerId, PlayerInput>): SimFrame | null;
  readonly pausable: boolean;
  skipPhase(): void;
}
// src/sim/local.ts
export interface LocalHooks {
  /** Chamado uma vez por passo; cada chamada consome no máximo um empurrão pendente por jogador. */
  remoteInputs?(): ReadonlyMap<PlayerId, PlayerInput>;
  /** Depois de cada quadro que avançou ao menos um passo. `tick` = passos desde o início. */
  afterFrame?(tick: number, state: GameState, events: GameEvent[], themes: string[]): void;
}
export function createLocalSource(config: GameConfig, bank: Question[], hooks?: LocalHooks): SimSource; // pausable: !hooks
// src/input/match-input.ts
export interface HudSlots { label(p: PlayerId): string; isConnected(p: PlayerId): boolean }
export interface MatchInput extends HudSlots { read(): Map<PlayerId, PlayerInput> }
export function deviceInput(devices: DeviceSlots, keyboard: KeyboardInput, gamepad: GamepadInput): MatchInput;
// src/match.ts
start(source: SimSource, input: MatchInput): void; // substitui start(config, devices)
```

- [ ] **Passo 1: testes que falham** em `tests/sim/local.test.ts`:
  - `'mesma seed e mesmos inputs dão o mesmo estado que createGame direto'`: 120 quadros de 1/60 com `move {x:1,z:0}` para P1, comparando com `createGame(...).step` repetido. Espera `toEqual`.
  - `'empurrão de um quadro sem passo é aplicado no passo seguinte, uma única vez'`: `advance(0.001, {P1: push:true})`, depois `advance(1/60, {P1: push:false})`. Espera exatamente um evento `pushed` com `by:'P1'`, e nenhum depois de mais 30 quadros.
  - `'positions interpola entre o passo anterior e o atual'`: depois de `advance(1.5/60)`, a posição de P1 fica estritamente entre a do passo 0 e a do passo 1.
  - `'respawned zera a interpolação daquele jogador'`: no quadro com evento `respawned`, `positions.get(id)` é igual a `state.players[id].pos`.
  - `'afterFrame recebe tick acumulado'`: com `advance(2/60)` e depois `advance(1/60)`, os ticks recebidos são `[2, 3]`.
  - `'remoteInputs entra só para os jogadores dele'`: o gancho devolve `{P2: move x:1}` e o mapa local `{P1: move x:-1}`. Espera P2 com `vel.x > 0` e P1 com `vel.x < 0`.
- [ ] **Passo 2:** `npx vitest run tests/sim/local.test.ts` falha (o módulo não existe).
- [ ] **Passo 3: implementar `createLocalSource`.** Leve para lá o `held` com OU no empurrão, o `prev` e o `alpha` (`createStepper`) e o reset de `prev` em `phaseChanged → spin` e `respawned`, que hoje estão em `match.ts:89,110,165-182`.
- [ ] **Passo 4: implementar `deviceInput`.** É o laço de `match.ts:166-172`. `label` usa `deviceLabel(devices.deviceOf(p))` de `hud.ts:14`; `isConnected` delega a `devices`.
- [ ] **Passo 5: adaptar `match.ts` e o resto.**
  - `match.ts`: `update` chama `source.advance(realDt, input.read())`. `handleEvents`, telão, HUD e debug continuam iguais e usam `frame.state`. `syncCharacters` usa `frame.positions`.
  - `pause()` não faz nada se `!source.pausable`. `skipPhase` delega à fonte.
  - `main.ts`: os parâmetros da rota `match` passam a ser `{ source, input, devices? }`. `devices` continua para `applyPadChanges` no offline.
  - `hud.ts`: troque o tipo para `HudSlots`.
- [ ] **Passo 6:** `npm test`, `npx tsc --noEmit` e `npm run lint` verdes. Depois, `npm run dev` com `?quick=survival&players=2` e com `?quick=points&players=4&rounds=8`: os bonecos andam, empurram, caem e o resultado aparece como antes.
- [ ] **Passo 7: commit** `refactor(match): partida passa a vir de uma SimSource`

---

### Tarefa 2: `room-code.ts`

**Arquivos**
- Criar: `src/net/room-code.ts`.
- Modificar: `eslint.config.js`, que passa a cobrir os arquivos puros de `src/net/` listados nas restrições globais.
- Teste: `tests/net/room-code.test.ts`.

**Interfaces que esta tarefa produz**

```ts
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 5;
export function generateRoomCode(rand: () => number): string;
/** Maiúsculas, sem espaços e hífens; null se não for um código válido. */
export function normalizeRoomCode(raw: string): string | null;
export function peerIdFor(code: string): string; // `alcapao-${code}`
```

- [ ] **Passo 1: testes que falham.**
  - `'gera 5 letras do alfabeto'`: 200 códigos com `mulberry32` de `core/rng.ts`.
  - `'normaliza " ab-cde "' → 'ABCDE'`.
  - `'recusa O, I, L, dígitos, tamanho errado'`: `'ABCDO'`, `'ABC1E'`, `'ABCD'` e `'ABCDEF'` dão `null`.
  - `'peerIdFor'` devolve `'alcapao-ABCDE'`.
- [ ] **Passo 2:** os testes falham.
- [ ] **Passo 3:** implementar e ampliar o ESLint.
- [ ] **Passo 4:** os testes e o lint passam.
- [ ] **Passo 5: commit** `feat(net): código de sala`

---

### Tarefa 3: `protocol.ts`, com mensagens e validação

**Arquivos**
- Criar: `src/net/protocol.ts`.
- Teste: `tests/net/protocol.test.ts`.

**Interfaces que esta tarefa produz**

```ts
export const PROTOCOL_VERSION = 1;
export type Rounds = 8 | 12 | 16;
export interface LobbyInfo { players: PlayerId[]; mode: Mode; rounds: Rounds; started: boolean }
export type ClientMsg =
  | { t: 'hello'; protocol: number; build: string }
  | { t: 'input'; move: Vec2; pushCount: number }
  | { t: 'ping'; at: number }
  | { t: 'bye' };
export type HostMsg =
  | { t: 'welcome'; you: PlayerId }
  | { t: 'lobby'; lobby: LobbyInfo }
  | { t: 'start'; config: GameConfig }
  | { t: 'events'; tick: number; events: GameEvent[] }
  | { t: 'snap'; tick: number; state: GameState; themes?: string[] }
  | { t: 'pong'; at: number }
  | { t: 'left'; id: PlayerId }
  | { t: 'rejected'; reason: 'full' | 'started' | 'version' }
  | { t: 'closed' };
export function encode(m: ClientMsg | HostMsg): string;           // JSON.stringify
export function decodeClient(raw: string): ClientMsg | null;
export function decodeHost(raw: string): HostMsg | null;
/** Identifica o banco de perguntas: FNV-1a 32 bits, em hex, sobre os ids na ordem do banco unidos por '\n'. Vai em `hello.build`. */
export function bankHash(bank: Question[]): string;
```

`ping` e `pong` medem o RTT para o debug (F1). Eles não estão na tabela da spec, mas a spec pede o RTT no §5.3.

As validações `isGameState`, `isGameEvent` e `isGameConfig` ficam neste arquivo e conferem todos os campos de `core/types.ts`:
- `PlayerId`, `Zone`, `Phase` e `Mode` dentro das uniões;
- números finitos;
- `options` com exatamente 4 strings;
- os dez tipos de `GameEvent`.

- [ ] **Passo 1: testes que falham.**
  - `'ida e volta de cada mensagem'`: um exemplo de cada `t`. Para `snap`, use o `state` de `createGame(...)` depois de alguns passos com o banco de `tests/helpers/bank.ts`. Para `events`, use um exemplo de cada um dos dez tipos.
  - `'recusa entrada malformada'`, tabela com `null` esperado:
    - `'{'`, `'null'`, `'[]'`;
    - `{t:'nada'}`;
    - `input` sem `move`;
    - `input` com `move.x` igual a `"1"`;
    - `snap` com `players[0].id` igual a `'P9'`;
    - `snap` com `phaseTime` igual a `null`. Como `JSON.stringify(NaN)` vira `null`, isso cobre `NaN`;
    - `events` com `{type:'locked', zones:{P1:'E'}}`;
    - `start` com `rounds: 10`;
    - `rejected` com `reason:'outro'`.
  - `'bankHash muda se um id muda e é estável'`.
- [ ] **Passo 2:** os testes falham.
- [ ] **Passo 3: implementar.** O `decode` faz `JSON.parse` dentro de `try` e valida antes de devolver.
- [ ] **Passo 4:** os testes passam.
- [ ] **Passo 5: commit** `feat(net): protocolo com validação das mensagens`

---

### Tarefa 4: `snapshots.ts`, com buffer, interpolação e fila de eventos

**Arquivos**
- Criar: `src/net/snapshots.ts`.
- Teste: `tests/net/snapshots.test.ts`.

**Interfaces que esta tarefa produz**

```ts
export interface SnapshotBuffer {
  pushSnap(tick: number, state: GameState, themes?: string[]): void; // descarta tick <= o mais novo já recebido
  pushEvents(tick: number, events: GameEvent[]): void;
  /** Avança o relógio de desenho; null até chegar o primeiro snapshot. */
  advance(realDt: number): SimFrame | null;
  age(): number; // segundos desde o último snapshot recebido
}
export function createSnapshotBuffer(opts?: { delayTicks?: number }): SnapshotBuffer; // padrão 6
```

**Relógio de desenho.** O código precisa seguir exatamente este algoritmo:

```
ao receber o 1º snapshot: clock = tick
advance(dt): clock += dt * 60
  se newest - clock > 30 ou clock > newest + 6: clock = newest   // aba voltou do segundo plano / host travou
render = clock - delayTicks
A = maior snapshot com tick <= render, B = o seguinte (se houver)
positions: lerp(A, B, (render - A.tick) / (B.tick - A.tick)); sem B → A
  se |B.pos - A.pos| > 2 m para um jogador: usa B.pos (salto: respawn/slot)
state: A.state com players[].pos substituído por positions
themes: os mais recentes recebidos até A
events: libera, em ordem, os de tick <= render ainda não liberados
descarta snapshots com tick < A.tick
```

- [ ] **Passo 1: testes que falham.** Use um `state` de exemplo em que só P1 se move em x.
  - `'null antes do primeiro snapshot'`.
  - `'interpola no meio'`: snaps nos ticks 0 (x=0) e 2 (x=1), `delayTicks: 0`. Depois do primeiro push, `advance(1/60)` dá x≈0.5.
  - `'sem o seguinte fica no último'`: x=1 nos ticks seguintes, sem extrapolar.
  - `'fora de ordem é descartado'`: push nos ticks 4 e depois 2. O tick 2 é ignorado.
  - `'salto > 2 m não interpola'`: x=0 e depois x=5. O resultado é 5 já no meio do intervalo.
  - `'eventos saem pelo tick'`: um evento no tick 10 com `delayTicks: 6` não sai em render=9 e sai em render=10, uma única vez.
  - `'aba volta do segundo plano'` (Foco 1): snaps até o tick 600 e então `advance(10)`. O relógio vai para o mais novo (render = 594) e o próximo `advance` não libera eventos antigos. Os eventos de tick ≤ 594 são liberados de uma vez, num só quadro.
- [ ] **Passo 2:** os testes falham.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** os testes passam.
- [ ] **Passo 5: commit** `feat(net): buffer de snapshots com interpolação`

---

### Tarefa 5: `host-rules.ts`, regras puras do host

**Arquivos**
- Criar: `src/net/host-rules.ts`.
- Teste: `tests/net/host-rules.test.ts`.

**Interfaces que esta tarefa produz**

```ts
export function sanitizeMove(v: Vec2): Vec2; // não finito → {0,0}; comprimento > 1 → normaliza
export class RemoteInputs {
  set(id: PlayerId, move: Vec2, pushCount: number): void; // pendente += max(0, count - último), teto 2
  /** Um passo: devolve o input de cada jogador remoto e consome ≤ 1 empurrão pendente de cada. */
  next(): Map<PlayerId, PlayerInput>;
  drop(id: PlayerId): void; // o jogador some do mapa (fica parado)
}
export type Admission = { ok: true; id: PlayerId } | { ok: false; reason: 'full' | 'started' | 'version' };
export function admit(lobby: LobbyInfo, hello: { protocol: number; build: string }, expectedBuild: string): Admission;
// ordem das checagens: versão (protocol e build) → started → lotado (4) → menor PlayerId livre
```

- [ ] **Passo 1: testes que falham.**
  - `sanitizeMove`: `{x:3,z:4}` vira `{0.6,0.8}`; `{NaN,0}` e `{Infinity,0}` viram `{0,0}`; `{0.3,0}` fica igual.
  - `'pushCount 0→1 gera um empurrão em um passo só'`.
  - `'pushCount repetido não gera outro'`.
  - `'salto de +50 fica com no máximo 2 pendentes'` (Foco 3): `next()` dá `push:true` duas vezes e depois `false`.
  - `'pushCount menor que o último é ignorado'`.
  - `'drop remove o jogador'`.
  - `admit`:
    - versão diferente dá `'version'`;
    - `started` dá `'started'` (Foco 5);
    - quatro jogadores dão `'full'`;
    - com `['P1','P3']` o resultado é `'P2'`.
- [ ] **Passo 2:** os testes falham.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** os testes passam.
- [ ] **Passo 5: commit** `feat(net): regras do host para inputs remotos e entrada na sala`

---

### Tarefa 6: transporte PeerJS e sessões de host e cliente

**Arquivos**
- Criar:
  - `src/net/transport.ts` (único arquivo que importa `peerjs`);
  - `src/net/host-session.ts`;
  - `src/net/client-session.ts`;
  - `src/sim/remote.ts`.
- Testes:
  - `tests/net/fake-link.ts`: um par em memória que implementa `Link`. `close()` de um lado dispara `onClose` do outro;
  - `tests/net/host-session.test.ts`;
  - `tests/net/client-session.test.ts`.
- Modificar: `package.json`, com `npm install --save-exact peerjs`.

**Interfaces que esta tarefa consome:** `LocalHooks` e `SimSource` (Tarefa 1); `generateRoomCode` e `peerIdFor` (2); `encode`, `decode*`, `LobbyInfo`, `bankHash` e `PROTOCOL_VERSION` (3); `createSnapshotBuffer` (4); `RemoteInputs`, `admit` e `sanitizeMove` (5).

**Interfaces que esta tarefa produz**

```ts
// transport.ts
export type Channel = 'ctl' | 'snap';
export interface Link {
  send(ch: Channel, data: string): void;
  onMessage(cb: (ch: Channel, data: string) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}
export interface HostRoom { code: string; onLink(cb: (link: Link) => void): void; close(): void }
export type NetErrorKind = 'not-found' | 'network' | 'server' | 'full' | 'started' | 'version';
export class NetError extends Error { constructor(readonly kind: NetErrorKind) }
export const PEER_OPTIONS: PeerOptions; // servidor/ICE configuráveis (§4.1); padrão = servidor público
export function hostRoom(): Promise<HostRoom>;   // até 5 códigos se 'unavailable-id'
export function joinRoom(code: string): Promise<Link>; // abre 'ctl' (reliable) + 'snap' (reliable:false); 'peer-unavailable' → not-found
// host-session.ts
export interface HostSession extends HudSlots {
  readonly code: string;
  lobby(): LobbyInfo;
  onLobby(cb: (l: LobbyInfo) => void): void;
  setOptions(mode: Mode, rounds: Rounds): void;
  start(seed: number): GameConfig | null;   // null com < 2 jogadores; envia 'start', started=true
  hooks(): LocalHooks;                       // remoteInputs = RemoteInputs.next; afterFrame envia events (se houver) e snap a cada 2 ticks
  backToLobby(): void;                       // started=false, reenvia lobby
  close(): void;                             // envia 'closed' e fecha tudo
}
export function createHostSession(room: HostRoom, bank: Question[]): HostSession;
// client-session.ts
export interface ClientSession extends HudSlots {
  readonly you: PlayerId;
  lobby(): LobbyInfo;
  onLobby(cb: (l: LobbyInfo) => void): void;
  onStart(cb: (config: GameConfig) => void): void;
  onClosed(cb: (why: 'host-left') => void): void;
  source(): SimSource;      // nova a cada partida (buffer novo)
  rtt(): number; snapshotAge(): number;
  close(): void;            // envia 'bye'
}
export function joinSession(link: Link, bank: Question[]): Promise<ClientSession>; // resolve no 'welcome'; 'rejected' → NetError(reason)
// sim/remote.ts
export function createRemoteSource(buffer: SnapshotBuffer, you: PlayerId, send: (move: Vec2, pushCount: number) => void): SimSource;
// pausable=false; a cada advance soma 1 ao pushCount quando local.get(you).push; manda quando move ou pushCount mudam, ou a cada 0,2 s
```

Regras da `HostSession`:
- Cada `Link` novo só ganha vaga depois de um `hello` válido e de `admit` aprovar.
- Uma mensagem inválida (`decodeClient` devolve `null`) é ignorada e a conexão não cai.
- Os inputs são aplicados só ao `PlayerId` daquela conexão.
- `onClose` de um link:
  - no lobby, libera a vaga e reenvia `lobby`;
  - na partida, chama `RemoteInputs.drop`, faz `isConnected` devolver `false` e envia `left`.
- `label(p)` devolve `'Você'` para P1 e `'Online'` para os demais.

Regras do `ClientSession`:
- `onClose` do link ou a mensagem `closed` chamam `onClosed('host-left')`.
- `left` marca o jogador desconectado.
- O ping vai a cada 1 s.

- [ ] **Passo 1: testes que falham** (com `fake-link`).
  - Host:
    - `'hello válido ganha P2 e todos recebem lobby'`;
    - `'hello com build diferente recebe rejected version'`;
    - `'entrada depois de start recebe rejected started'` (Foco 5);
    - `'start com 1 jogador devolve null'`;
    - `'mensagem lixo não derruba a conexão'`: depois de `'{'` e `{t:'input',move:'x'}`, um `input` válido ainda é aplicado (Foco 2);
    - `'queda na partida: isConnected false, left enviado, jogador para'`;
    - `'afterFrame manda snap a cada 2 ticks e events só quando há eventos'`.
  - Cliente:
    - `'resolve com you do welcome'`;
    - `'rejected full rejeita com NetError full'`;
    - `'host fecha no lobby → onClosed host-left'` (Foco 4);
    - `'onStart recebe a config'`;
    - `'source() gera input com pushCount crescente e heartbeat'`, com um relógio falso via `advance(0.2)`.
- [ ] **Passo 2:** os testes falham.
- [ ] **Passo 3: instalar e implementar.** Rode `npm install --save-exact peerjs` e depois implemente `transport`, `host-session`, `client-session` e `remote`.
- [ ] **Passo 4:** os testes passam, além de `npx tsc --noEmit`, `npm run lint` e `npm run build:pages`. Confira que o `peerjs` entra no bundle.
- [ ] **Passo 5: commit** `feat(net): transporte PeerJS e sessões de host e cliente`

---

### Tarefa 7: partida online de ponta a ponta (atalhos de dev)

**Arquivos**
- Criar: `src/input/any-input.ts`.
- Modificar:
  - `src/input/gamepad.ts`: `connectedIds(): DeviceId[]`;
  - `src/main.ts`;
  - `src/render/debug.ts` ou o `fpsEl` em `main.ts`: RTT e idade do snapshot.
- Teste: `tests/input/any-input.test.ts`.

**Interfaces**

```ts
// any-input.ts: o jogador local online aceita qualquer grupo de teclado ou gamepad
export function anyDeviceInput(you: PlayerId, keyboard: KeyboardInput, gamepad: GamepadInput, slots: HudSlots): MatchInput;
// read(): { you → move = primeiro não nulo entre KEY_GROUPS e connectedIds(), push = OU de todos }
```

Mudanças no `main.ts`:
- Guarde uma variável `online: { kind: 'host'; session: HostSession } | { kind: 'client'; session: ClientSession } | null`.
- `pauseMatch()` não faz nada quando `online` está ativo. O blur continua chamando `keyboard.reset()`.
- Na partida online, Esc abre o overlay da Tarefa 8. Até lá, Esc não faz nada.
- Quando a partida acaba:
  - no host, `results` passa a ter `onAgain`, que chama `session.backToLobby()`;
  - no cliente, a tela de resultados aparece igual e espera o `onLobby`.
- `onClosed('host-left')` mostra a tela de erro com o texto da Tarefa 8 e volta ao menu.
- Atalhos (só em DEV):
  - `?online=host` chama `hostRoom()` e mostra o código no console. Assim que houver 2 jogadores e o host apertar Espaço, a partida começa com `createLocalSource(config, bank, session.hooks())` e `anyDeviceInput('P1', …)`;
  - `?online=join&sala=XXXXX` chama `joinRoom`, depois `joinSession`, e, no `onStart`, `router.go('match', { source: session.source(), input: anyDeviceInput(session.you, …) })`.
- F1 mostra `RTT 42 ms · snap 18 ms`.

- [ ] **Passo 1: teste que falha** para `anyDeviceInput`: com `ArrowLeft` pressionada, o resultado é `you → move {x:-1,z:0}`; com o `KeyF` de WASD, `push:true` uma vez.
- [ ] **Passo 2:** o teste falha.
- [ ] **Passo 3:** implementar `any-input`, `connectedIds` e a fiação do `main.ts`.
- [ ] **Passo 4: testes verdes e verificação manual.** Rode `npm test`, `tsc` e `lint`. Depois, `npm run dev` com duas abas (painel do navegador), na aba A `?online=host` e na aba B `?online=join&sala=<código>`, e confira:
  - os dois bonecos andam e se empurram nas duas telas;
  - o telão e as quedas batem nas duas abas;
  - o áudio toca no cliente;
  - a partida chega a `results` nas duas;
  - fechar a aba B deixa o boneco parado e a partida segue;
  - fechar a aba A faz B mostrar o erro.
- [ ] **Passo 5: commit** `feat: partida online jogável entre duas abas`

---

### Tarefa 8: telas Online e Lobby, overlay e erros

**Arquivos**
- Criar:
  - `src/ui/mode-picker.ts`, extraído de `join.ts:11-19,54-70,90-100,135-150`;
  - `src/ui/online.ts`;
  - `src/ui/lobby.ts`;
  - `src/ui/net-errors.ts`.
- Modificar:
  - `src/ui/router.ts`: `Screen` ganha `'online' | 'lobby'`;
  - `src/ui/menu.ts`: novo item "JOGAR ONLINE" (`onOnline`);
  - `src/ui/join.ts`: usa o `mode-picker`;
  - `src/ui/pause.ts`: variante online;
  - `src/ui/results.ts`: o cliente vê "Aguardando o host…" no lugar de "Jogar de novo";
  - `src/main.ts` e `src/ui/styles.css`.
- Testes:
  - `tests/ui/net-errors.test.ts`;
  - os testes de `join` continuam verdes.

**Interfaces**

```ts
// mode-picker.ts
export function createModePicker(onChange: (mode: Mode, rounds: Rounds) => void): {
  el: HTMLElement; get(): { mode: Mode; rounds: Rounds }; set(mode: Mode, rounds: Rounds): void;
  dir(d: Dir): void; setEditable(on: boolean): void; showRow(on: boolean): void;
};
// net-errors.ts: textos exatos da spec §3
export const NET_ERROR_TEXT: Record<NetErrorKind | 'host-left', string>;
```

`NET_ERROR_TEXT`, texto exato:

| Chave | Texto |
|---|---|
| `not-found` | `Sala não encontrada` |
| `full` | `Sala cheia` |
| `started` | `Partida já começou` |
| `version` | `Versão diferente do host: atualize a página` |
| `host-left` | `A conexão com o host caiu` |
| `network` e `server` | `Não foi possível conectar (a rede pode estar bloqueando)` |

Telas:
- **Online:** botões "CRIAR SALA" e "ENTRAR". O campo de código normaliza com `normalizeRoomCode` e o botão fica desativado enquanto o resultado for `null`. Esc volta ao menu.
- **Lobby:**
  - mostra o código grande e "COPIAR LINK", que copia `location.origin + import.meta.env.BASE_URL + '?sala=' + code` com `navigator.clipboard.writeText`;
  - mostra 4 vagas com `PLAYER_COLORS` e "(você)";
  - tem o `mode-picker`, editável só no host;
  - o host vê "COMEÇAR" (desativado com menos de 2 jogadores); o cliente vê "Aguardando o host…";
  - Esc fecha a sessão e volta ao menu.
- **Pausa online:** "CONTINUAR" e "SAIR DA SALA". Não chama `match.pause()`.
- **`?sala=CODIGO`**, fora do DEV também: depois do press-start, vai direto para Online com o código preenchido.

- [ ] **Passo 1: teste que falha.** `NET_ERROR_TEXT` tem uma entrada para cada `NetErrorKind` e para `'host-left'`, com os textos da tabela acima.
- [ ] **Passo 2:** o teste falha.
- [ ] **Passo 3:** implementar as telas e extrair o `mode-picker`. Sem mudança visual no `join`.
- [ ] **Passo 4: verificação.** Testes, `tsc`, `lint` e `npm run build:pages` verdes. Depois, com duas abas, pelo menu:
  - criar a sala, copiar o link e abrir esse link na outra aba;
  - o host troca de modo e o cliente vê a troca;
  - jogar uma partida de Sobrevivência e outra de Pontos (8 rodadas) até o fim;
  - "Jogar de novo" leva os dois ao lobby;
  - forçar cada erro: código inexistente, terceira e quinta abas, entrar depois de começar, fechar o host.
- [ ] **Passo 5: commit** `feat(ui): telas de sala online e lobby`

---

### Tarefa 9: documentação

**Arquivos a modificar**
- `docs/specs/2026-11-02-alcapao-design.md`: na §9, troque "multijogador online" por um link para a spec online. Celular continua fora do escopo.
- `docs/specs/2026-11-03-alcapao-online-design.md`: status "implementado" e a nota de `build = bankHash` e `ping`/`pong`.
- `README.md`: como jogar online, com o aviso de redes que bloqueiam.
- `CLAUDE.md`:
  - camadas `src/sim/` e `src/net/`;
  - regra de pureza;
  - atalhos `?online=`;
  - teste com duas abas.
- `docs/checklist-mvp.md`: itens online.

- [ ] **Passo 1:** editar os arquivos.
- [ ] **Passo 2:** `npm run lint`, porque os docs não quebram nada, mas o pipeline roda.
- [ ] **Passo 3: commit** `docs: modo online`
