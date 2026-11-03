# Alçapão MVP — Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** construir o protótipo jogável do quiz 3D "Alçapão" para navegador (1–4 jogadores locais, modos Sobrevivência e Pontos, empurrão, música e mixagem), pronto para testar se o jogo é divertido.

**Arquitetura:** `src/core/` é TypeScript puro e simula toda a partida (fases, posições, física, regras, perguntas) com passo fixo de 60 Hz e RNG com semente. `src/render/` (Three.js), `src/ui/` (HTML sobreposto) e `src/audio/` só leem o estado e reagem a eventos. `audio/director.ts` também é puro, e `audio/mixer.ts` executa os comandos dele na Web Audio API.

**Stack:** TypeScript (strict) · Vite · Three.js · Vitest · Web Audio API · Gamepad API.

**Spec:** `docs/specs/2026-11-02-alcapao-design.md` (leia junto com este plano). **Referência visual:** canvas "Quiz 3D — Alçapão" e `tools/mockup/scene.html` (cena Three.js usada para gerar os renders do canvas).

## Restrições globais

- `src/core/**` e `src/audio/director.ts` **não importam** `three`, `window`, `document` nem APIs do navegador. Uma regra de lint (`no-restricted-imports` / `no-restricted-globals`) garante isso.
- Unidades em metros. A arena tem 11 × 11 m com centro na origem, e as plataformas têm 4 × 4 m, centradas em A(−2,5; −2,5), B(2,5; −2,5), C(−2,5; 2,5), D(2,5; 2,5). O eixo −z fica do lado do telão.
- Simulação em passo fixo de **1/60 s**. Toda aleatoriedade vem de `createRng(seed)`.
- Valores da spec, sem arredondar:
  - **Tempos das fases:** ROLETA 3 s · TRAVA 0,5 s · REVELAÇÃO 3 s · RESET 1,5 s · PERGUNTA 15/12/10 s (dificuldade 1/2/3).
  - **Pontos:** 100/200/300 por dificuldade 1/2/3.
  - **Boneco:** raio 0,4 m · velocidade 5 m/s · aceleração ~0,1 s.
  - **Empurrão:** alcance 1,2 m · cone ±45° · deslocamento 1,5 m em 0,35 s · quem empurra fica parado 0,3 s · recarga 2 s.
- **Cores dos jogadores:** P1 `#4C8DFF`, P2 `#FF8A3D`, P3 `#3DDC97`, P4 `#E06CF5`.
- **Interface:** fundo `#0E1120`, destaque `#FFC83D`, fontes Bungee (títulos) e Rubik (texto), embutidas via `@fontsource`. Todo texto visível em **pt-BR**.
- **Teclas:** WASD+F, Setas+Shift direito, IJKL+O. Leia por `KeyboardEvent.code`, para funcionar no teclado ABNT. No gamepad: analógico esquerdo/D-pad e botão 0 (A/X).
- **Volumes padrão:** Master 0,8 · Música 0,6 · Efeitos 1,0 · Interface 0,8. Mudo na tecla M.
- **Persistência:** todo acesso a `localStorage` passa por `src/storage.ts`, que nunca lança exceção.

## Foco de revisão

1. **`dt` enorme ao voltar de outra aba:** o loop deve limitar o tempo acumulado a 0,25 s, sem dar centenas de passos nem "teletransportar" bonecos. O teste fica na Tarefa 11.
2. **Diagonal no teclado:** W+D não pode andar √2 mais rápido. O input normaliza `move` para comprimento ≤ 1. O teste fica na Tarefa 8.
3. **Boneco esmagado num canto por dois outros:** a posição continua dentro da arena e sem `NaN` depois de 600 passos. O teste fica na Tarefa 3.
4. **Mesmo dispositivo apertando "entrar" de novo:** deve continuar no mesmo slot, sem ocupar um segundo. O teste fica na Tarefa 8.
5. **`localStorage` indisponível (aba anônima, bloqueado) ou com JSON corrompido:** configurações e recordes voltam ao padrão sem quebrar. O teste fica na Tarefa 13.

---

## Mapa de arquivos

```
package.json  tsconfig.json  vite.config.ts  eslint.config.js  index.html
tools/mockup/scene.html          (cópia do script de render do canvas, só referência)
src/
  storage.ts                     wrapper seguro de localStorage
  records.ts                     recordes (solo Sobrevivência; Pontos por 8/12/16)
  loop.ts                        stepper de passo fixo (puro)
  main.ts                        ligação de tudo
  core/  types.ts rng.ts arena.ts physics.ts questions.ts schedule.ts rules.ts game.ts
  input/ keyboard.ts gamepad.ts devices.ts
  render/ scene.ts arena.ts character.ts screen.ts effects.ts debug.ts
  ui/ nav.ts press-start.ts menu.ts options.ts join.ts hud.ts results.ts pause.ts error.ts styles.css
  audio/ settings.ts director.ts library.ts mixer.ts
  data/questions.json
public/audio/music/*  public/audio/sfx/*  public/audio/CREDITS.md
tests/ (espelha src/: tests/core/*.test.ts, tests/input/*.test.ts, tests/audio/*.test.ts …)
```

---

### Tarefa 1: Projeto, tipos e arena

**Arquivos:**
- Criar: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `index.html`, `src/core/types.ts`, `src/core/arena.ts`, `src/core/rng.ts`, `tools/mockup/scene.html`
- Teste: `tests/core/arena.test.ts`, `tests/core/rng.test.ts`

**Interfaces:**
- Produz (`types.ts`):
  ```ts
  type PlayerId = 'P1' | 'P2' | 'P3' | 'P4';
  type Zone = 'A' | 'B' | 'C' | 'D';
  type Mode = 'survival' | 'points';
  type Phase = 'spin' | 'question' | 'lock' | 'reveal' | 'reset' | 'over';
  type Difficulty = 1 | 2 | 3;
  interface Vec2 { x: number; z: number }
  interface PlayerInput { move: Vec2; push: boolean }          // push = apertou neste frame
  interface PlayerState {
    id: PlayerId; pos: Vec2; vel: Vec2; facing: number;          // facing em rad, 0 = +z
    inPlay: boolean;          // false = eliminado ou espectador da morte súbita
    fallen: boolean;          // caiu nesta rodada (até o RESET)
    score: number; pushCooldown: number; frozen: number; knockTime: number; knockVel: Vec2;
  }
  interface Question { id: string; theme: string; difficulty: Difficulty; text: string;
                       options: [string, string, string, string]; correct: 0 | 1 | 2 | 3 }
  interface ShownQuestion { id: string; theme: string; difficulty: Difficulty; text: string;
                            options: [string, string, string, string]; correct: Zone; value: number }
  interface RankEntry { pos: number; id: PlayerId; score?: number; eliminatedRound?: number }
  interface GameState { mode: Mode; phase: Phase; phaseTime: number; round: number; totalRounds: number | null;
                        players: PlayerState[]; theme: string | null; question: ShownQuestion | null;
                        suddenDeath: PlayerId[] | null }
  type GameEvent =  // a spec §6, mais phaseChanged e bumped
    | { type: 'phaseChanged'; phase: Phase }
    | { type: 'themeChosen'; theme: string }
    | { type: 'questionShown'; question: ShownQuestion }
    | { type: 'pushed'; by: PlayerId; targets: PlayerId[] }
    | { type: 'bumped'; a: PlayerId; b: PlayerId }
    | { type: 'locked'; zones: Partial<Record<PlayerId, Zone | null>> }
    | { type: 'revealed'; correct: Zone; fallen: PlayerId[]; voided: boolean; scored: Partial<Record<PlayerId, number>> }
    | { type: 'respawned'; players: PlayerId[] }
    | { type: 'suddenDeathStarted'; players: PlayerId[] }
    | { type: 'gameOver'; ranking: RankEntry[]; roundsSurvived?: number; scores?: Partial<Record<PlayerId, number>> };
  ```
- Produz (`arena.ts`): `ARENA_HALF = 5.5`, `PLATFORM_HALF = 2`, `PLATFORM_CENTERS: Record<Zone, Vec2>`, `SPAWNS: Record<PlayerId, Vec2>` (P1(−0,6; −0,6), P2(0,6; −0,6), P3(−0,6; 0,6), P4(0,6; 0,6)), `zoneOf(p: Vec2): Zone | null`.
- Produz (`rng.ts`): `type Rng = () => number` (em [0, 1)); `createRng(seed: number): Rng` (mulberry32); `shuffle<T>(arr: readonly T[], rng: Rng): T[]`.

- [ ] **Passo 1: criar o projeto.** Rode `npm create vite@latest . -- --template vanilla-ts`, depois `npm i three @fontsource/bungee @fontsource/rubik` e `npm i -D vitest @types/three eslint typescript-eslint`. Fixe as versões instaladas no `package.json` (sem `^`). Crie os scripts `dev`, `build`, `test` (`vitest run`) e `lint`. Rode `git init`.
- [ ] **Passo 2: configurar o lint de pureza.** Em `eslint.config.js`, para `src/core/**` e `src/audio/director.ts`: `no-restricted-imports` de `three` e `no-restricted-globals` de `window`, `document`, `localStorage` e `navigator`.
- [ ] **Passo 3: copiar a referência.** Copie `scene.html` (o script de render do canvas) para `tools/mockup/scene.html`.
- [ ] **Passo 4: escrever os testes que falham.**
  ```ts
  // tests/core/arena.test.ts
  test('centro da arena é faixa neutra', () => expect(zoneOf({ x: 0, z: 0 })).toBeNull());
  test('centro de cada plataforma', () => {
    expect(zoneOf({ x: -2.5, z: -2.5 })).toBe('A'); expect(zoneOf({ x: 2.5, z: -2.5 })).toBe('B');
    expect(zoneOf({ x: -2.5, z: 2.5 })).toBe('C'); expect(zoneOf({ x: 2.5, z: 2.5 })).toBe('D');
  });
  test('borda exata pertence à plataforma', () => expect(zoneOf({ x: 0.5, z: -2.5 })).toBe('B'));
  test('faixa neutra entre plataformas', () => expect(zoneOf({ x: 0.49, z: -2.5 })).toBeNull());
  test('fora da arena', () => expect(zoneOf({ x: 6, z: 0 })).toBeNull());
  // tests/core/rng.test.ts
  test('mesma semente, mesma sequência', () => { const a = createRng(42), b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]); });
  test('valores em [0,1)', () => { const r = createRng(1); for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); } });
  test('shuffle preserva elementos e não muta', () => { const src = [1, 2, 3, 4]; const out = shuffle(src, createRng(7));
    expect([...out].sort()).toEqual([1, 2, 3, 4]); expect(src).toEqual([1, 2, 3, 4]); });
  ```
- [ ] **Passo 5:** rode `npx vitest run tests/core`. Esperado: FAIL (módulos inexistentes).
- [ ] **Passo 6: implementar** `types.ts`, `arena.ts` (`zoneOf`: `|x−cx| ≤ 2 && |z−cz| ≤ 2`) e `rng.ts`.
- [ ] **Passo 7:** rode `npx vitest run tests/core && npm run lint && npm run build`. Esperado: tudo PASS.
- [ ] **Passo 8:** `git add -A && git commit -m "chore: projeto Vite+TS, tipos do core, arena e rng"`

---

### Tarefa 2: Banco de perguntas (validação e sorteio)

**Arquivos:**
- Criar: `src/core/questions.ts`
- Teste: `tests/core/questions.test.ts`

**Interfaces:**
- Consome: `Question`, `ShownQuestion`, `Difficulty`, `Zone`, `Rng`, `shuffle`.
- Produz:
  - `validateBank(raw: unknown): { questions: Question[]; rejected: { index: number; reason: string }[] }`
  - `class QuestionPicker { constructor(questions: Question[], rng: Rng); availableThemes(): string[]; pickTheme(): string | null; pickQuestion(theme: string, difficulty: Difficulty): Question | null }`. `pickQuestion` marca a pergunta como usada.
  - `toShown(q: Question, rng: Rng, value: number): ShownQuestion`

- [ ] **Passo 1: escrever os testes que falham.**
  - `validateBank` rejeita, cada caso com o índice e o motivo: `difficulty` 4; 3 opções; opção vazia; opções repetidas; `correct` 4; `id` duplicado (a segunda ocorrência). Também rejeita a raiz que não seja `{ version: 1, questions: [] }`. Aceita a pergunta do exemplo da spec §6.1.
  - `pickQuestion` nunca repete: com 3 perguntas do tema X na dificuldade 1, quatro chamadas devolvem 3 ids distintos e depois `null`.
  - Fallback para a dificuldade mais próxima: com o tema só nas dificuldades 1 e 3, `pickQuestion('X', 2)` devolve dificuldade 1 (empate → a menor). Com o tema só na dificuldade 3, `pickQuestion('X', 1)` devolve dificuldade 3.
  - `availableThemes` remove um tema quando todas as perguntas dele foram usadas, e `pickTheme` devolve `null` quando nenhum tema sobra.
  - `pickTheme` com semente fixa é reprodutível.
  - `toShown`: a letra `correct` aponta para a mesma string que `options[q.correct]` apontava. As 4 opções são as mesmas, só em outra ordem. `value` é preservado.
- [ ] **Passo 2:** rode `npx vitest run tests/core/questions.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar** `questions.ts`. Para o sorteio de tema, uniforme entre `availableThemes()`, use `Math.floor(rng() * n)`.
- [ ] **Passo 4:** rode o mesmo comando. Esperado: PASS.
- [ ] **Passo 5:** `git commit -am "feat(core): validação e sorteio de perguntas"`

---

### Tarefa 3: Física (movimento, colisão, paredes, empurrão)

**Arquivos:**
- Criar: `src/core/physics.ts`
- Teste: `tests/core/physics.test.ts`

**Interfaces:**
- Consome: `PlayerState`, `PlayerInput`, `Vec2`, `PlayerId`, `ARENA_HALF`.
- Produz:
  - Constantes `RADIUS = 0.4`, `MAX_SPEED = 4`, `ACCEL_TIME = 0.1`, `PUSH_RANGE = 1.2`, `PUSH_HALF_ANGLE = Math.PI / 4`, `PUSH_DISTANCE = 1.5`, `KNOCK_TIME = 0.35`, `PUSH_FREEZE = 0.3`, `PUSH_COOLDOWN = 2`.
  - `stepPhysics(players: PlayerState[], inputs: Partial<Record<PlayerId, PlayerInput>>, dt: number, opts: { allowMove: boolean; allowPush: boolean }): Array<Extract<GameEvent, { type: 'pushed' | 'bumped' }>>`. Muta `players` e ignora quem tem `inPlay === false` ou `fallen === true`.

**Algoritmo (o que os testes não determinam):**
1. **Timers:** `pushCooldown`, `frozen` e `knockTime` decrescem até 0.
2. **Velocidade alvo:** `move × MAX_SPEED`, ou zero se `frozen > 0`, `knockTime > 0` ou `!allowMove`. A `vel` se aproxima do alvo em `dt / ACCEL_TIME` da diferença por passo, limitado a 1. Se o alvo não é nulo, `facing = atan2(move.x, move.z)`.
3. **Empurrão:** com `push && allowPush && pushCooldown === 0 && frozen === 0`, os alvos são os outros em jogo com distância entre centros ≤ `PUSH_RANGE` e ângulo até `facing` ≤ `PUSH_HALF_ANGLE`. Todos os empurrões do passo são calculados **antes** de aplicar qualquer um.
   - Cada alvo recebe `knockVel = dir × v0` com `v0 = 2 × PUSH_DISTANCE / KNOCK_TIME` (decaimento linear até 0 em `KNOCK_TIME`) e `knockTime = KNOCK_TIME`. Os `knockVel` de vários empurrões se somam.
   - Quem empurra recebe `frozen = PUSH_FREEZE` e `pushCooldown = PUSH_COOLDOWN`, mesmo sem alvos.
4. **Integração:** `pos += (vel + knockVel × knockTime / KNOCK_TIME) × dt`.
5. **Colisão:** 2 iterações de separação círculo × círculo (metade para cada). Emita `bumped` se a velocidade relativa for > 1 m/s e o par não tiver emitido nos últimos 0,3 s (guarde o estado num `Map` do módulo, reiniciável por `resetPhysicsMemory()`).
6. **Paredes:** limite `x` e `z` a ±(`ARENA_HALF − RADIUS`).

- [ ] **Passo 1: escrever os testes que falham.** Use o helper `mk(id, x, z, facing = 0)` para criar `PlayerState`.
  - Em 1 s com `move = {x:1, z:0}`, `pos.x` fica entre 3,6 e 4,0, e `facing ≈ π/2`.
  - Com `allowMove: false`, ninguém se move.
  - Dois bonecos sobrepostos em (0,0) e (0,3; 0) ficam a ≥ 0,8 m um do outro depois de 1 passo.
  - Boneco andando para +x por 5 s para em `x = 5.1` (± 1e-6).
  - **[Foco 3]** P1 em (5,0; 5,0), com P2 e P3 encostados empurrando na diagonal para o canto por 600 passos: todas as coordenadas ficam finitas e dentro de ±5,1.
  - Empurrão acerta à frente: P1 em (0,0) com `facing = π/2` (+x) e P2 em (1,0; 0). Depois de 1 passo com `push`, o evento é `{type:'pushed', by:'P1', targets:['P2']}`. Depois de 0,5 s sem input, `P2.pos.x` fica entre 2,45 e 2,55 (1,0 + 1,5).
  - Erra fora do cone: P2 em (0; 1,0) com P1 olhando para +x → `targets: []`.
  - Erra fora do alcance: P2 em (1,3; 0) → `targets: []`.
  - Recarga: um segundo `push` 1 s depois não gera evento, e 2,01 s depois gera.
  - Quem empurra fica parado: durante 0,3 s após empurrar, `move` não altera `pos`.
  - Empurrão mútuo no mesmo passo: P1 e P2 frente a frente geram dois eventos, e os dois se afastam.
  - Com `allowPush: false` não há evento e a recarga não é consumida.
  - Bonecos com `fallen` ou `!inPlay` não se movem e não são alvo.
- [ ] **Passo 2:** rode `npx vitest run tests/core/physics.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar** `physics.ts` conforme o algoritmo acima.
- [ ] **Passo 4:** rode o mesmo comando. Esperado: PASS.
- [ ] **Passo 5:** `git commit -am "feat(core): física com colisão, paredes e empurrão"`

---

### Tarefa 4: Regras (resolução por modo, ranking, cronograma)

**Arquivos:**
- Criar: `src/core/rules.ts`, `src/core/schedule.ts`
- Teste: `tests/core/rules.test.ts`, `tests/core/schedule.test.ts`

**Interfaces:**
- Produz (`schedule.ts`):
  - `QUESTION_TIME: Record<Difficulty, number> = {1:15, 2:12, 3:10}`
  - `PHASE_TIME = { spin: 3, lock: 0.5, reveal: 3, reset: 1.5 }`
  - `POINTS: Record<Difficulty, number> = {1:100, 2:200, 3:300}`
  - `difficultyFor(mode: Mode, round: number, totalRounds: number | null, suddenDeath: boolean): Difficulty`
- Produz (`rules.ts`):
  - `resolveSurvival(contenders: PlayerId[], zones: Partial<Record<PlayerId, Zone | null>>, correct: Zone): { fallen: PlayerId[]; voided: boolean }`. A anulação só vale com `contenders.length ≥ 2`.
  - `resolvePoints(players: PlayerId[], zones, correct: Zone, value: number): { fallen: PlayerId[]; scored: Partial<Record<PlayerId, number>> }`. `scored` traz quem acertou com `value`; quem errou não aparece.
  - `survivalRanking(winners: PlayerId[], eliminations: { id: PlayerId; round: number }[]): RankEntry[]`. Ranking de competição (1, 1, 3…). Os vencedores ficam em 1º, e os demais ordenados pela rodada de eliminação decrescente, com empate na mesma rodada.
  - `pointsRanking(scores: Partial<Record<PlayerId, number>>, suddenDeathWinner: PlayerId | null): RankEntry[]`
  - `topTie(scores): PlayerId[]`

- [ ] **Passo 1: escrever os testes que falham.**
  - **`difficultyFor` na Sobrevivência:** rodadas 1, 3 → 1; 4, 7 → 2; 8, 30 → 3.
  - **`difficultyFor` no Pontos:** N=12: rodadas 4 → 1, 5 → 2, 8 → 2, 9 → 3. N=8: rodadas 2 → 1, 3 → 2, 5 → 3, 8 → 3. N=16: rodadas 5 → 1, 6 → 2, 10 → 2, 11 → 3, 16 → 3. Morte súbita → 3 sempre.
  - **`resolveSurvival`:**
    - Com contenders [P1, P2, P3] e zonas {P1: B, P2: A, P3: null}, correta B → `fallen` [P2, P3] e `voided` false.
    - Todos errando com 2 ou mais → `fallen` [] e `voided` true.
    - Solo errando → `fallen` [P1] e `voided` false.
    - Zona ausente no mapa conta como erro.
  - **`resolvePoints`:** com value 200, P1 certo e P2 errado → `scored` {P1: 200} e `fallen` [P2]. Todos errando → `fallen` com todos e sem anulação.
  - **`survivalRanking`:** com winners [P1] e eliminações P2 r9, P3 r5, P4 r5 → posições P1 1, P2 2, P3 3, P4 3.
  - **`pointsRanking`:** com {P1: 1900, P3: 1900, P2: 1400, P4: 1100} e vencedor da morte súbita P1 → P1 1, P3 2, P2 3, P4 4. Sem vencedor → P1 1, P3 1, P2 3, P4 4.
  - **`topTie`:** {P1: 500, P2: 500, P3: 100} → [P1, P2].
- [ ] **Passo 2:** rode `npx vitest run tests/core/rules.test.ts tests/core/schedule.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar** os dois arquivos. No Pontos, `third = Math.floor(N/3)`: rodada ≤ `third` → 1, ≤ `2·third` → 2, senão 3.
- [ ] **Passo 4:** rode o mesmo comando. Esperado: PASS.
- [ ] **Passo 5:** `git commit -am "feat(core): regras dos dois modos, ranking e cronograma"`

---

### Tarefa 5: Máquina da partida (`game.ts`)

**Arquivos:**
- Criar: `src/core/game.ts`
- Teste: `tests/core/game.test.ts`

**Interfaces:**
- Consome: tudo das Tarefas 1–4.
- Produz:
  ```ts
  type GameConfig =
    | { mode: 'survival'; players: PlayerId[]; seed: number }
    | { mode: 'points'; rounds: 8 | 12 | 16; players: PlayerId[]; seed: number };
  interface Game {
    readonly state: GameState;
    step(dt: number, inputs: Partial<Record<PlayerId, PlayerInput>>): GameEvent[];
    debugSkipPhase(): void;          // pula para o fim da fase atual
  }
  function createGame(config: GameConfig, questions: Question[]): Game;
  ```

**Comportamento (spec §2):**
- **Início:** fase `spin`, rodada 1, bonecos em `SPAWNS`.
- **Na entrada de cada fase:** emite `phaseChanged`.
  - `spin`: emite `themeChosen` (sem tema disponível → fim por esgotamento, §2.6).
  - `question`: escolhe a pergunta (sem pergunta → esgotamento), emite `questionShown` com `value = POINTS[difficulty real]` e `phaseTime = QUESTION_TIME[difficulty real]`.
  - `lock`: emite `locked` com `zoneOf` de cada boneco em jogo.
  - `reveal`: resolve (Sobrevivência ou morte súbita → `resolveSurvival` só com os contenders; Pontos → `resolvePoints`), marca `fallen`, soma os pontos e emite `revealed`.
  - `reset`: no Pontos, emite `respawned` com quem caiu.
- **Física:** em todas as fases menos `over`, com `allowMove` e `allowPush` só em `question`.
- **Fim do `reset`:** reposiciona todos os que estão em jogo em `SPAWNS`, limpa `fallen` e `vel` e, na Sobrevivência, quem caiu fica com `inPlay = false`. Depois decide o que vem:
  - **Sobrevivência:** com 1 em jogo e partida multijogador → `gameOver` com vencedor. No solo, se caiu → `gameOver` com `roundsSurvived = round − 1`.
  - **Pontos:** se `round === totalRounds` e `topTie` tem mais de 1 → `suddenDeath = empatados` e os demais ficam com `inPlay = false`, emite `suddenDeathStarted`. Senão → `gameOver` com `scores`.
  - **Morte súbita:** sobrando 1 dos contenders → `gameOver`.
  - **Caso contrário:** `round++` e volta para `spin`.
- **Esgotamento (§2.6):**
  - Na Sobrevivência, todos os vivos ficam em 1º (no solo, `roundsSurvived = round − 1`).
  - No Pontos, ranking por pontos sem morte súbita.
  - Na morte súbita, os contenders restantes empatam em 1º.

- [ ] **Passo 1: escrever os testes que falham.** Use o helper `run(game, seconds, inputsFn?)`, que chama `step(1/60, …)` e acumula os eventos, e um banco fixo de 30 perguntas geradas no teste (5 temas × 6, 2 por dificuldade).
  - **Sequência de fases:** começa em spin e, em 3 s, entra question com `phaseTime` 15 (rodada 1). Depois vem lock (0,5 s), reveal (3 s) e reset (1,5 s), e então spin com rodada 2.
  - **Sobrevivência com 2:** forçando P1 na plataforma correta (input direcionado até `PLATFORM_CENTERS[correct]`) e P2 parado no centro → `revealed.fallen` [P2] e depois `gameOver` com ranking P1 1, P2 2.
  - **Sobrevivência com 2, ambos parados:** `revealed.voided` true e a partida continua na rodada 2.
  - **Solo parado:** `gameOver.roundsSurvived` 0.
  - **Pontos com N=8, ninguém se movendo:** termina com todos em 0 e empate no topo, o que dispara `suddenDeathStarted` com todos. Na morte súbita, P1 vai à correta → `gameOver` com P1 1.
  - **Pontos:** acerto na rodada 1 soma 100 e aparece em `revealed.scored`. No reset, `respawned` traz quem caiu, e as posições voltam aos spawns.
  - **Empurrão só em question:** `push` durante spin não gera `pushed`.
  - **Esgotamento:** com banco de 2 perguntas e Sobrevivência com 2 jogadores ambos acertando, na rodada 3 vem `gameOver` com os dois em 1º.
  - **Reprodutibilidade:** mesma semente → mesma sequência de `themeChosen` e `questionShown.id`.
  - **`debugSkipPhase`:** em question, o próximo `step` já está em lock.
- [ ] **Passo 2:** rode `npx vitest run tests/core/game.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar** `createGame` conforme o comportamento acima.
- [ ] **Passo 4:** rode `npx vitest run tests/core && npm run lint`. Esperado: PASS e lint limpo.
- [ ] **Passo 5:** `git commit -am "feat(core): máquina de estados da partida nos dois modos"`

---

### Tarefa 6: Banco inicial de perguntas

**Arquivos:**
- Criar: `src/data/questions.json`
- Teste: `tests/data/questions.test.ts`

- [ ] **Passo 1: escrever o teste que falha.** `validateBank(json)` tem `rejected` vazio e 120 perguntas. Cada tema (Geografia, História, Ciências, Esportes, Entretenimento, Tecnologia) tem exatamente 8 de dificuldade 1, 7 de dificuldade 2 e 5 de dificuldade 3. Os `id` seguem o padrão `^(geo|his|cie|esp|ent|tec)-\d{3}$`. Nenhum `text` aparece duplicado.
- [ ] **Passo 2:** rode o teste. Esperado: FAIL.
- [ ] **Passo 3: escrever as 120 perguntas** em pt-BR, com fatos verificáveis e estáveis (nada que mude com o tempo, como "atual campeão") e alternativas plausíveis. A pergunta `geo-001` é a do exemplo da spec.
- [ ] **Passo 4:** rode o teste. Esperado: PASS.
- [ ] **Passo 5: revisão do Diego (bloqueante para a Tarefa 16, não para as seguintes).** Entregue o arquivo e peça a revisão de fatos e dificuldade. Aplique as correções e rode o teste de novo.
- [ ] **Passo 6:** `git commit -am "content: banco inicial de 120 perguntas"`

---

### Tarefa 7: Armazenamento seguro e recordes

**Arquivos:**
- Criar: `src/storage.ts`, `src/records.ts`
- Teste: `tests/storage.test.ts`

**Interfaces:**
- Produz:
  - `interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }`
  - `safeStorage(): StorageLike`. Usa `window.localStorage` e cai para um `Map` em memória se o acesso lançar exceção.
  - `readJson<T>(s: StorageLike, key: string, fallback: T, isValid: (v: unknown) => v is T): T`
  - `writeJson(s: StorageLike, key: string, v: unknown): void`
  - `type RecordKey = 'survival' | 'points-8' | 'points-12' | 'points-16'`
  - `getRecord(s, k): number` (0 se não houver)
  - `submitRecord(s, k, value): boolean` (true se bateu o recorde)
  - Chaves: `alcapao.records.v1` e `alcapao.audio.v1` (esta usada na Tarefa 13).

- [ ] **Passo 1: escrever os testes que falham.**
  - **[Foco 5]** Um `StorageLike` cujo `getItem` e `setItem` lançam exceção → `readJson` devolve o fallback e `writeJson` não lança.
  - JSON corrompido (`"{"`) → fallback.
  - `submitRecord` só grava quando o valor é maior, e as chaves 8, 12 e 16 são independentes.
- [ ] **Passo 2:** rode `npx vitest run tests/storage.test.ts`. Esperado: FAIL.
- [ ] **Passo 3:** implemente os dois arquivos.
- [ ] **Passo 4:** rode o mesmo comando. Esperado: PASS.
- [ ] **Passo 5:** `git commit -am "feat: storage seguro e recordes"`

---

### Tarefa 8: Entrada (teclado, gamepad, slots)

**Arquivos:**
- Criar: `src/input/keyboard.ts`, `src/input/gamepad.ts`, `src/input/devices.ts`
- Teste: `tests/input/keyboard.test.ts`, `tests/input/gamepad.test.ts`, `tests/input/devices.test.ts`

**Interfaces:**
- Produz (`keyboard.ts`):
  - `type DeviceId = 'kb-wasd' | 'kb-arrows' | 'kb-ijkl' | \`gp-${number}\``
  - `KEY_GROUPS: { id: DeviceId; up: string; down: string; left: string; right: string; push: string }[]`, com os códigos `KeyW/KeyS/KeyA/KeyD/KeyF`, `ArrowUp/ArrowDown/ArrowLeft/ArrowRight/ShiftRight` e `KeyI/KeyK/KeyJ/KeyL/KeyO`.
  - `class KeyboardInput { keyDown(code: string): DeviceId | null; keyUp(code: string): void; read(id: DeviceId): PlayerInput; reset(): void }`. `read` consome o "apertou" do push (borda) e devolve `move` normalizado. Cima = −z.
- Produz (`gamepad.ts`):
  - `interface PadLike { index: number; connected: boolean; axes: readonly number[]; buttons: readonly { pressed: boolean }[] }`
  - `class GamepadInput { poll(pads: (PadLike | null)[]): { joined: DeviceId[]; disconnected: DeviceId[]; reconnected: DeviceId[] }; read(id: DeviceId): PlayerInput }`. Zona morta de 0,2 no analógico, D-pad nos botões 12–15 e push no botão 0 (borda).
- Produz (`devices.ts`):
  - `class DeviceSlots { join(d: DeviceId): PlayerId | null; slotOf(d): PlayerId | null; deviceOf(p: PlayerId): DeviceId | null; players(): PlayerId[]; leave(p: PlayerId): void; setConnected(d, c: boolean): void; isConnected(p): boolean }`

- [ ] **Passo 1: escrever os testes que falham.**
  - **[Foco 2]** W+D pressionadas → `|move| ≈ 1` (não 1,414). Só W → `move = {x: 0, z: -1}`.
  - Push é borda: depois de `keyDown('KeyF')`, a primeira `read` traz `push` true e a segunda false (tecla ainda segurada). Soltar e apertar de novo → true.
  - `keyDown('KeyW')` devolve `'kb-wasd'`, e uma tecla fora dos grupos devolve null.
  - Gamepad com axes [0,1; 0] → `move` zero (zona morta). Com [1, 0] → `{x: 1, z: 0}`. Botão 14 (D-pad esquerda) → `x = −1`.
  - **[Foco 4]** `join('kb-wasd')` duas vezes → P1 nas duas, e `players()` com tamanho 1.
  - Quatro dispositivos ocupam P1–P4, e o quinto recebe null.
  - Desconectar `gp-0` mantém o slot. `poll` com o pad 0 de volta → `reconnected` contém `gp-0` e `slotOf` não muda.
- [ ] **Passo 2:** rode `npx vitest run tests/input`. Esperado: FAIL.
- [ ] **Passo 3:** implemente os três arquivos.
- [ ] **Passo 4:** rode o mesmo comando. Esperado: PASS.
- [ ] **Passo 5:** `git commit -am "feat(input): teclado, gamepad e slots de jogadores"`

---

### Tarefa 9: Cena 3D, arena e telão

**Arquivos:**
- Criar: `src/render/scene.ts`, `src/render/arena.ts`, `src/render/screen.ts`, `src/render/debug.ts`

**Interfaces:**
- Consome: `GameState`, `GameEvent`, `PLATFORM_CENTERS`, `ARENA_HALF`.
- Produz:
  - `createScene(canvas: HTMLCanvasElement): { renderer; scene; camera; resize(): void }`. Câmera em (0; 10,5; 15,5) olhando para (0; 2,6; −2,6), FOV 42, como no mockup.
  - `createArena(scene): { setRevealed(correct: Zone | null, holes: Zone[]): void; reset(): void }`. As portas dos alçapões abrem animadas em 0,4 s.
  - `createScreen(scene): { draw(view: ScreenView): void }` com:
    ```ts
    type ScreenView =
      | { kind: 'spin'; themes: string[]; highlighted: string; round: number; totalRounds: number | null }
      | { kind: 'question'; q: ShownQuestion; timeLeft: number; round: number; totalRounds: number | null; mode: Mode }
      | { kind: 'reveal'; q: ShownQuestion; round: number; totalRounds: number | null; mode: Mode }
      | { kind: 'suddenDeath'; players: PlayerId[] };
    ```
  - O telão é uma `CanvasTexture` de 1600 × 600, redesenhada só quando a view muda (inclusive o segundo inteiro do timer). O cabeçalho mostra "Rodada R · Dificuldade D" (Sobrevivência) ou "Rodada R/N · Vale X pts" (Pontos).
  - `createDebug(scene): { setVisible(b: boolean): void; update(state: GameState): void }`. Mostra os círculos de colisão, a letra da zona de cada boneco e a resposta correta.

- [ ] **Passo 1:** monte a cena, a arena e o telão, portando a geometria, as luzes e as cores de `tools/mockup/scene.html`.
- [ ] **Passo 2:** crie um modo de vitrine em `main.ts` com `?showcase=question` e `?showcase=reveal`, que desenha um estado fixo (a pergunta do exemplo, correta B, alçapão em A).
- [ ] **Passo 3: verificar.** Rode `npm run dev`, abra `http://localhost:5173/?showcase=question` e compare com o artboard "Rodada" do canvas: enquadramento do telão e da arena, cores e textos legíveis. Esperado: equivalente ao render de referência, sem erros no console.
- [ ] **Passo 4:** `git add -A && git commit -m "feat(render): cena, arena com alçapões e telão"`

---

### Tarefa 10: Personagens e efeitos

**Arquivos:**
- Criar: `src/render/character.ts`, `src/render/effects.ts`

**Interfaces:**
- Produz:
  - `type Pose = 'idle' | 'walk' | 'push' | 'fall' | 'cheer'`
  - `createCharacter(id: PlayerId): { root: THREE.Group; update(dt: number, s: { pos: Vec2; facing: number; speed: number; pose: Pose; visible: boolean }): void; playFall(): void; playRespawnDrop(): void }`. Escala 1,45, como no mockup. `walk` balança braços e pernas proporcionalmente a `speed`. `fall` desce 3 m em 0,8 s girando. `playRespawnDrop` cai de y = 6 até 0 em 0,5 s.
  - `createEffects(scene): { pushPuff(at: Vec2, dir: Vec2): void; update(dt: number): void }`. Partículas low-poly e linhas de movimento, como no mockup, com duração de 0,4 s.

- [ ] **Passo 1:** porte `makeChar` do mockup para `createCharacter` e adicione as poses.
- [ ] **Passo 2:** adicione `?showcase=characters`, com os 4 bonecos lado a lado alternando as poses a cada 1 s.
- [ ] **Passo 3: verificar.** Abra `?showcase=characters` e compare com o artboard "Personagens": cores corretas, boné com aba visível e animações sem os membros se soltarem.
- [ ] **Passo 4:** `git commit -am "feat(render): personagens low-poly, poses e efeitos"`

---

### Tarefa 11: Loop, HUD e partida jogável

**Arquivos:**
- Criar: `src/loop.ts`, `src/ui/hud.ts`, `src/ui/styles.css`
- Modificar: `src/main.ts`
- Teste: `tests/loop.test.ts`

**Interfaces:**
- Produz:
  - `createStepper(step = 1/60, maxFrame = 0.25): { advance(realDt: number): { steps: number; alpha: number } }`
  - `createHud(root: HTMLElement): { update(state: GameState, devices: DeviceSlots, events: GameEvent[]): void }`. Um cartão por jogador com cor, id, rótulo do controle, status, barra de recarga e aviso "Controle desconectado". No Pontos, mostra os pontos, e "+X" voa até o cartão em `revealed`. Atualiza o DOM só quando um valor muda.

- [ ] **Passo 1: escrever os testes que falham.**
  - `advance(1/60)` → 1 passo.
  - `advance(0.01)` duas vezes → 0 passos e depois 1.
  - **[Foco 1]** `advance(5)` → 15 passos (limite de 0,25 s).
  - `alpha` sempre em [0, 1).
- [ ] **Passo 2:** rode `npx vitest run tests/loop.test.ts`. Esperado: FAIL.
- [ ] **Passo 3:** implemente `loop.ts`.
- [ ] **Passo 4:** rode o mesmo comando. Esperado: PASS.
- [ ] **Passo 5: ligar tudo em `main.ts`.**
  - O ciclo de cada frame é `requestAnimationFrame` → ler inputs → `stepper.advance` → `game.step` × N → personagens (posição interpolada por `alpha`) → arena, telão e HUD a partir de estado e eventos.
  - **Atalhos:** F1 alterna o debug, e com o debug ativo, N chama `debugSkipPhase`.
  - **Atalho temporário:** `?quick=survival&players=2` inicia uma partida direto com WASD e Setas.
- [ ] **Passo 6: verificar.** Com `?quick=survival&players=2`, jogue uma partida até o fim: dá para mover, empurrar, cair e terminar. Os cartões e a recarga funcionam, e o F1 mostra as zonas. Repita com `?quick=points&rounds=8&players=2`.
- [ ] **Passo 7:** `git commit -am "feat: loop de passo fixo, HUD e partida jogável"`

---

### Tarefa 12: Telas e navegação

**Arquivos:**
- Criar: `src/ui/nav.ts`, `src/ui/press-start.ts`, `src/ui/menu.ts`, `src/ui/join.ts`, `src/ui/results.ts`, `src/ui/pause.ts`, `src/ui/error.ts`
- Modificar: `src/main.ts` (remover `?quick`, ou mantê-lo só com `import.meta.env.DEV`)

**Interfaces:**
- Consome: `DeviceSlots`, `KeyboardInput`, `GamepadInput`, `createGame`, `getRecord` e `submitRecord`.
- Produz:
  - `type Screen = 'press-start' | 'menu' | 'options' | 'join' | 'match' | 'results'`
  - `createRouter(): { go(s: Screen, params?: unknown): void; current(): Screen }`
  - `nav.ts`: navegação por foco com setas, analógico, Enter, A, Esc e B sobre `<button>`s reais.

**Conteúdo** (textos e layout iguais aos artboards do canvas):
- **press-start:** logo, os 4 bonecos e "APERTE QUALQUER TECLA OU BOTÃO". Qualquer tecla ou botão vai para o menu (a Tarefa 14 liga o áudio aqui).
- **menu:** JOGAR, Como jogar (um painel com as regras dos dois modos, a tabela de controles e o aviso de teclas fantasma no teclado), Opções e Recordes (Sobrevivência solo e Pontos 8/12/16).
- **join:** 4 vagas. Um dispositivo entra apertando qualquer tecla do seu grupo ou botão. P1 escolhe o modo (Sobrevivência ou Pontos) e o número de rodadas (8/12/16, padrão 12) e começa com Espaço ou Start. Esc ou B volta.
- **results:** ranking. No solo, mostra o resultado, o recorde e "Novo recorde!" quando `submitRecord` devolve true. Botões "Jogar de novo" (volta ao join com os mesmos jogadores) e "Menu".
- **pause:** abre com `visibilitychange` ou `blur` e com Esc/Start durante a partida. O jogo não chama `step` enquanto pausado. "Continuar" e "Sair para o menu".
- **error:** aparece se `validateBank` devolver 0 perguntas ou o JSON falhar ao carregar.

- [ ] **Passo 1:** implemente as telas, o roteador e a navegação.
- [ ] **Passo 2: verificar com este roteiro.**
  1. press-start → menu → join, com 1 jogador no teclado, Sobrevivência, até o fim e Jogar de novo.
  2. Pontos com 8 rodadas e 2 jogadores (teclado + gamepad) até o fim.
  3. Trocar de aba no meio da partida pausa o jogo.
  4. Renomear `questions.json` mostra a tela de erro.
  5. Recordes atualizam depois de uma partida solo.
- [ ] **Passo 3:** `git commit -am "feat(ui): telas, navegação, pausa, recordes e erro"`

---

### Tarefa 13: Áudio — configurações e diretor (puro)

**Arquivos:**
- Criar: `src/audio/settings.ts`, `src/audio/director.ts`
- Teste: `tests/audio/settings.test.ts`, `tests/audio/director.test.ts`

**Interfaces:**
- Produz (`settings.ts`):
  - `interface AudioSettings { master: number; music: number; sfx: number; ui: number; muted: boolean }`, valores em [0, 1]
  - `AUDIO_DEFAULTS = { master: 0.8, music: 0.6, sfx: 1, ui: 0.8, muted: false }`
  - `loadAudioSettings(s: StorageLike): AudioSettings`. Mescla com o padrão e limita os valores a [0, 1].
  - `saveAudioSettings(s: StorageLike, v: AudioSettings): void`
- Produz (`director.ts`):
  ```ts
  type Track = 'menu' | 'partida' | 'morte-subita';
  type SfxId = 'roleta-clique' | 'roleta-para' | 'pergunta' | 'tick' | 'tick-final' | 'trava' | 'empurrao' | 'impacto'
    | 'empurrao-vazio' | 'colisao' | 'revelacao' | 'alcapao' | 'queda' | 'acerto' | 'pontos' | 'anulada'
    | 'ui-navegar' | 'ui-confirmar' | 'ui-voltar' | 'jogador-entrou' | 'jogador-saiu';
  type AudioCommand =
    | { type: 'music'; track: Track; fade: number }
    | { type: 'stinger'; id: 'vitoria'; then: Track }
    | { type: 'sfx'; id: SfxId; bus: 'sfx' | 'ui' }
    | { type: 'duck'; key: 'tick' | 'reveal' | 'pause'; db: number; seconds: number | null }
    | { type: 'unduck'; key: 'tick' | 'reveal' | 'pause' }
    | { type: 'lowpass'; on: boolean };
  class AudioDirector {
    update(dt: number, ctx: { screen: Screen; state: GameState | null; events: GameEvent[]; paused: boolean;
                              uiEvents: Array<'navegar' | 'confirmar' | 'voltar' | 'entrou' | 'saiu'> }): AudioCommand[];
  }
  ```
  - **Regras:**
    - **Música:** telas não-match → `menu`; match → `partida`; com `suddenDeath` → `morte-subita`. Sempre `fade: 1`, e só emite quando a faixa muda. Ao entrar em `results`: `stinger vitoria`, depois `menu`.
    - **Tique:** `tick` a cada segundo inteiro cruzado com `phase === 'question'` e `phaseTime ≤ 5`; no último segundo, `tick-final`. Ao cruzar 5 s: `duck tick −6 dB` (sem duração), e ao sair de question: `unduck tick`.
    - **Revelação:** `revealed` → `duck reveal −10 dB por 1,5 s`.
    - **Pausa:** ao pausar → `duck pause −12 dB` e `lowpass on`; ao despausar → o inverso.
    - **Roleta:** em `spin`, `roleta-clique` a cada 0,12 s nos primeiros 2,5 s e depois `roleta-para` uma vez.
    - **Eventos → sfx:** `questionShown` → pergunta; entrar em `lock` → trava; `pushed` com alvos → empurrao + impacto; sem alvos → empurrao-vazio; `bumped` → colisao; `revealed` → revelacao, e se houver `fallen`, alcapao + queda; acerto se alguém acertou; pontos se `scored` não for vazio; anulada se `voided`.
    - **Interface:** cada `uiEvent` vira o sfx `ui-*` ou `jogador-*` no canal `ui`.

- [ ] **Passo 1: escrever os testes que falham.**
  - **[Foco 5]** `loadAudioSettings` com storage que lança exceção ou JSON corrompido → `AUDIO_DEFAULTS`. `{ music: 3 }` → `music` 1 e o restante no padrão.
  - menu → match gera um único `{music:'partida', fade:1}`, e frames seguintes não repetem o comando.
  - `suddenDeath` não nulo → `morte-subita`. Ao entrar em results → `stinger` e depois nenhum `music` extra.
  - Em question, de `phaseTime` 6,0 até 0, em passos de 1/60 → exatamente 4 `tick` e 1 `tick-final`, um `duck tick` e, ao entrar em lock, `unduck tick` + `trava`.
  - `revealed` com `fallen` [P2] → `revelacao`, `alcapao`, `queda` e `duck reveal −10 1,5`. Com `voided` → `anulada` e sem `alcapao`.
  - `pushed` com `targets: []` → só `empurrao-vazio`.
  - Pausar e despausar → `duck pause`, `lowpass on`, e depois `unduck pause`, `lowpass off`.
  - Spin completo de 3 s → 21 `roleta-clique` (de 0 a 2,4 s) e 1 `roleta-para`.
- [ ] **Passo 2:** rode `npx vitest run tests/audio`. Esperado: FAIL.
- [ ] **Passo 3:** implemente os dois arquivos.
- [ ] **Passo 4:** rode `npx vitest run tests/audio && npm run lint`. Esperado: PASS.
- [ ] **Passo 5:** `git commit -am "feat(audio): configurações e diretor de áudio"`

---

### Tarefa 14: Áudio — arquivos CC0, biblioteca, mixer e tela de Opções

**Arquivos:**
- Criar: `public/audio/music/{menu,partida,morte-subita,vitoria}.{ogg,mp3}`, `public/audio/sfx/<SfxId>.{ogg,mp3}`, `public/audio/CREDITS.md`, `src/audio/library.ts`, `src/audio/mixer.ts`, `src/ui/options.ts`
- Modificar: `src/main.ts`, `src/ui/press-start.ts`, `src/ui/menu.ts`

**Interfaces:**
- Produz:
  - `loadLibrary(ctx: AudioContext): Promise<Map<Track | 'vitoria' | SfxId, AudioBuffer>>`. Tenta `.ogg` e, se falhar, `.mp3`. Arquivo ausente vira `console.warn` e fica fora do mapa.
  - `class Mixer { constructor(ctx: AudioContext, lib: Map<string, AudioBuffer>); apply(cmd: AudioCommand): void; setSettings(s: AudioSettings): void }`
- **Grafo:** `music`, `sfx` e `ui` (`GainNode`) → `master` (`GainNode`) → `BiquadFilter` passa-baixa (desligado = 20 kHz; ligado = 800 Hz) → `DynamicsCompressor` (threshold −12 dB, ratio 8) → destino.
  - **Ducking:** um ganho extra de música por chave, combinado multiplicativamente, com rampa de 0,15 s.
  - **Música:** em loop pelo `AudioBufferSourceNode.loop`, com crossfade linear na duração `fade`.
  - **Vinheta:** fade de 0,3 s na música atual, toca o stinger e, ao terminar, inicia `then`.
  - **Vozes:** no máximo 4 por `SfxId`, cortando a mais antiga, e `playbackRate` aleatório em [0,95; 1,05].
  - **Mudo:** zera o master. A tecla M alterna `muted` em qualquer tela e salva.
  - **Autoplay:** `AudioContext` criado e `resume()` no primeiro input da press-start. `resume()` de novo em toda interação se `state === 'suspended'`.

- [ ] **Passo 1: selecionar os áudios.** Escolha 4 músicas e 21 efeitos com licença **CC0** (OpenGameArt, Kenney e similares) e converta para `.ogg` e `.mp3` com `ffmpeg`. Normalize as músicas para cerca de −16 LUFS e os efeitos com pico em −3 dBFS. Preencha `CREDITS.md` (arquivo, título, autor, link e licença).
- [ ] **Passo 2:** implemente `library.ts`, `mixer.ts` e `options.ts`. A tela de Opções segue o artboard "Opções": quatro sliders (Geral, Música, Efeitos, Interface) em passos de 5%, Mudo, Testar efeito (toca `acerto` no canal sfx), Restaurar padrão e Voltar. As mudanças valem na hora e são salvas.
- [ ] **Passo 3:** ligue em `main.ts`: `director.update(...)` a cada frame → `mixer.apply` para cada comando.
- [ ] **Passo 4: verificar.**
  1. O console não mostra erros nem avisos de arquivos ausentes.
  2. Com o áudio silenciado no sistema, uma partida inteira ainda roda.
  3. Removendo um arquivo, o jogo continua funcionando.
- [ ] **Passo 5: aprovação do Diego (bloqueante).** Peça para ele ouvir uma partida de cada modo com fones e avaliar:
  - escolha das faixas;
  - emendas dos loops;
  - volume da música versus efeitos;
  - ducking no tique e na revelação;
  - som abafado na pausa;
  - nada estourando com 4 empurrões simultâneos;
  - sliders e tecla M.

  Troque as faixas e ajuste os níveis até ele aprovar.
- [ ] **Passo 6:** `git add -A && git commit -m "feat(audio): mixer, biblioteca CC0 e tela de Opções"`

---

### Tarefa 15: Robustez dos dispositivos

**Arquivos:**
- Modificar: `src/main.ts`, `src/ui/hud.ts`, `src/ui/join.ts`

- [ ] **Passo 1:** ligue `GamepadInput.poll` a cada frame e reaja aos eventos:
  - **`disconnected`:** `devices.setConnected(false)`, input zero para o jogador, aviso no cartão e uiEvent `saiu`.
  - **`reconnected`:** limpa o aviso.
  - **Na tela de entrada:** um gamepad desconectado libera a vaga.
- [ ] **Passo 2: verificar.**
  1. Desconecte o gamepad no meio da pergunta: o boneco para, aparece o aviso e a partida segue.
  2. Reconecte: ele volta para o mesmo slot.
  3. Repita na tela de entrada: a vaga é liberada.
- [ ] **Passo 3:** `git commit -am "feat: robustez de desconexão de gamepad"`

---

### Tarefa 16: Checklist final

- [ ] **Passo 1:** rode `npm run test && npm run lint && npm run build`. Esperado: tudo PASS e build sem avisos de tipo.
- [ ] **Passo 2:** rode o checklist manual da spec §8 e anote os resultados em `docs/checklist-mvp.md`. Inclui:
  - partidas com 1, 2 e 4 jogadores no teclado, nos dois modos;
  - teclado + gamepad;
  - desconexão;
  - empurrar alguém para a plataforma errada;
  - perda de foco;
  - partida inteira ouvida com fones;
  - 60 fps com 4 bonecos (contador de FPS no debug F1).
- [ ] **Passo 3:** confirme que as Tarefas 6 e 14 foram aprovadas pelo Diego (perguntas e áudio).
- [ ] **Passo 4:** `git commit -am "docs: checklist do MVP"` e entregue o resultado ao Diego.
