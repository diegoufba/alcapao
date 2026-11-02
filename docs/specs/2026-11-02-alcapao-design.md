# Alçapão — Especificação do MVP

**Data:** 02/11/2026 · **Status:** em revisão · **Nome:** "Alçapão" (provisório)

Referência visual: canvas de design "Quiz 3D — Alçapão" (cena 3D, planta, personagens e telas).

---

## 1. Objetivo

Um quiz 3D para navegador, para **1 a 4 jogadores na mesma tela**. Cada rodada mostra uma pergunta num telão. Os jogadores correm com seus bonecos até a plataforma da resposta que acham certa. Quem estiver na plataforma errada cai pelo alçapão.

O jogo tem dois modos:

- **Sobrevivência:** quem cai é eliminado. Vence o último de pé.
- **Pontos:** quem cai volta para a arena. Vence quem fizer mais pontos num número fixo de rodadas, e perguntas mais difíceis valem mais.

O MVP serve para responder uma pergunta: **o jogo é divertido?** Se for, ele pode ser portado e terminado em Godot. Por isso as regras ficam isoladas da parte visual.

**Critérios de sucesso do MVP**

- Uma partida completa com 1 a 4 jogadores (teclado e gamepad misturados) roda do menu até a tela final sem travar.
- As regras de eliminação, rodada anulada, vitória e empurrão funcionam como descrito abaixo e têm testes automatizados.
- 60 fps num notebook comum, com 4 bonecos em cena.

---

## 2. Regras do jogo

### 2.1 Fluxo da partida

```
Menu → Entrada de jogadores + escolha do modo → [Rodada]* → (Morte súbita)? → Fim de partida → (Jogar de novo | Menu)

Rodada:
  1. ROLETA     (3 s)   telão sorteia o tema
  2. PERGUNTA   (T s)   pergunta + 4 alternativas; jogadores se movem e empurram
  3. TRAVA      (0,5 s) tempo acabou: movimento e empurrão desligados, zonas registradas
  4. REVELAÇÃO  (3 s)   resposta destacada; alçapões das plataformas erradas abrem
  5. RESET      (1,5 s) bonecos em jogo voltam ao centro → próxima rodada ou fim
                        (modo Pontos: quem caiu reaparece no seu slot, caindo do alto)
```

Na tela de entrada, P1 escolhe o **modo** (Sobrevivência ou Pontos) e, no modo Pontos, o **número de rodadas** (8, 12 ou 16; o padrão é 12).

### 2.2 Tempo e dificuldade

O tempo da pergunta depende da dificuldade: **15 s** (1), **12 s** (2) e **10 s** (3).

| Modo | Dificuldade 1 | Dificuldade 2 | Dificuldade 3 |
|---|---|---|---|
| Sobrevivência | rodadas 1–3 | rodadas 4–7 | rodada 8 em diante |
| Pontos (N rodadas) | primeiro terço | terço do meio | último terço (inclui a sobra da divisão) |

Exemplo no modo Pontos com 12 rodadas: 1–4 fáceis, 5–8 médias, 9–12 difíceis.

### 2.3 Resposta de cada jogador

- A resposta é a plataforma (A, B, C ou D) onde está o **centro** do boneco no instante da TRAVA.
- Fora de qualquer plataforma (faixa neutra) = **sem resposta**, que conta como erro.

**Erro** = sem resposta ou plataforma diferente da correta. Nos dois modos, quem erra cai pelo alçapão.

### 2.4 Modo Sobrevivência

- Quem erra é **eliminado** e vira espectador.
- **Rodada anulada:** se a rodada começou com **2 ou mais** jogadores vivos e **todos** eles erram, ninguém cai e a partida segue.
- **Solo (1 jogador):** a regra de anulação não se aplica. Errou, a partida acaba.
- **Fim (multijogador):** quando sobra exatamente 1 vivo, que é o vencedor. O ranking segue a ordem inversa de eliminação, e quem caiu na mesma rodada empata na posição.
- **Fim (solo):** no primeiro erro. A pontuação é o número de rodadas sobrevividas, e o recorde fica salvo no `localStorage`.

### 2.5 Modo Pontos

- **Ninguém é eliminado.** Acertar vale **100** pontos (dificuldade 1), **200** (dificuldade 2) ou **300** (dificuldade 3). Errar vale 0. Não há pontos negativos.
- **Queda e retorno:** quem erra cai pelo alçapão e, no RESET, reaparece no seu slot de partida caindo do alto.
- A regra de rodada anulada não existe neste modo.
- **Fim:** depois de N rodadas. O ranking é por pontos.
- **Empate no 1º lugar → morte súbita:** os empatados jogam rodadas extras só entre si, com dificuldade 3 e regras de Sobrevivência (errou, perdeu; se todos os empatados errarem, a rodada é anulada). A morte súbita se repete até sobrar um, e quem fica de fora assiste. Ela não dá pontos e só decide o 1º lugar. Empates nas outras posições continuam empates.
- **Solo:** joga as N rodadas e o resultado é a pontuação. O recorde fica salvo por número de rodadas (8, 12 e 16 separados).

### 2.6 Perguntas esgotadas

Se não houver mais perguntas disponíveis:

- **Sobrevivência:** a partida termina e todos os vivos empatam como vencedores (no solo, conta como fim normal).
- **Pontos:** a partida termina com o placar atual, e o empate no topo vira empate, sem morte súbita.
- **Morte súbita:** os jogadores ainda empatados dividem o 1º lugar.

### 2.7 Seleção de perguntas

- A roleta sorteia, com o mesmo peso, entre os temas que ainda têm perguntas não usadas.
- Dentro do tema, sorteia uma pergunta da dificuldade da rodada. Se não houver, usa a dificuldade mais próxima (empate de distância → a menor).
- Nenhuma pergunta se repete na mesma partida.
- As 4 alternativas são embaralhadas a cada exibição, e a plataforma correta acompanha o embaralhamento.

---

## 3. Movimento, colisão e empurrão

### 3.1 Arena (unidades = metros)

- Arena quadrada de **11 × 11 m**, com o centro na origem. As bordas têm parede invisível.
- 4 plataformas de **4 × 4 m**, centradas em (±2,5; ±2,5). A = trás-esquerda, B = trás-direita, C = frente-esquerda, D = frente-direita. É a mesma disposição 2×2 das alternativas no telão.
- A faixa neutra em cruz tem 1 m de largura entre as plataformas, mais 0,5 m de margem até a borda.
- Ponto de partida: os bonecos nascem num quadrado de 4 posições em volta do centro (±0,6; ±0,6), cada um no seu slot.

### 3.2 Bonecos

- Corpo de colisão: círculo de raio **0,4 m** no plano XZ.
- Velocidade máxima de **4 m/s**, com aceleração e frenagem curtas (~0,1 s) para não parecer "patinação".
- O boneco gira para a direção em que se move.
- Os bonecos não se atravessam: a sobreposição entre círculos é resolvida separando os dois igualmente.

### 3.3 Empurrão

- **Alcance:** atinge os bonecos cujo centro está até **1,2 m** à frente, num cone de **±45°**.
- **Efeito:** cada boneco atingido recebe um impulso que o desloca cerca de **1,5 m** para longe de quem empurrou. O impulso decai em ~0,35 s e, nesse tempo, o atingido não controla o movimento.
- **Custo:** quem empurra fica parado por **0,3 s** e o empurrão tem recarga de **2 s**, mesmo quando não acerta ninguém.
- **Quando vale:** só no estado PERGUNTA. Na TRAVA as posições congelam.- As paredes da arena seguram quem é empurrado. Não dá para jogar ninguém para fora da arena.

### 3.4 Física

- A física é feita à mão, sem motor de física: integração com passo fixo de 60 Hz, círculo × círculo, círculo × parede (AABB da arena) e impulsos com decaimento.
- Fica em `core/physics.ts`, em TypeScript puro e determinístico (com uma semente para sortear empates), para poder ser testada e portada.

---

## 4. Controles

| Slot | Dispositivo | Mover | Empurrar |
|---|---|---|---|
| Grupo 1 | Teclado | W A S D | F |
| Grupo 2 | Teclado | Setas | Shift direito |
| Grupo 3 | Teclado | I J K L | O |
| Gamepad N | Gamepad API | Analógico esquerdo / D-pad | A (Xbox) / X (PS) |

- **Entrada de jogadores:** qualquer tecla de um grupo ou qualquer botão de um gamepad ocupa a próxima vaga livre (P1 → P4). Cada dispositivo ocupa no máximo uma vaga.
- **Iniciar:** P1 aperta Espaço ou Start (mínimo 1 jogador). Esc ou B volta ao menu.
- **Menus:** setas ou analógico para navegar, Enter ou A para confirmar.
- **Teclado compartilhado:** alguns teclados não registram muitas teclas ao mesmo tempo (ghosting). Isso fica só como aviso no "Como jogar", sem solução no MVP.

---

## 5. Visual e áudio

- **Mundo 3D:** palco escuro com o telão (16 × 6 m, suspenso atrás da arena) e a arena elevada. A câmera é fixa, a ~12 m de altura, inclinada para enquadrar o telão e a arena juntos.
- **Bonecos:** modelo low-poly chibi único (cabeça grande, boné, sombreamento chapado), com boné e camisa na cor do jogador. As cores são P1 `#4C8DFF`, P2 `#FF8A3D`, P3 `#3DDC97` e P4 `#E06CF5`. No MVP o modelo é montado com primitivas do Three.js, como no canvas, e as animações são procedurais (andar, empurrar, cair e comemorar).
- **Telão:** textura de canvas 2D desenhada em tempo real, com tema, rodada, timer, pergunta e alternativas, e a resposta destacada na revelação.
- **HUD em HTML:** uma faixa no rodapé com o cartão de cada jogador (cor, controle, status e barra de recarga do empurrão). No modo Pontos, o cartão mostra a **pontuação** e o "+200" voa para o cartão na revelação. O telão mostra "Rodada 7/12" e o valor da pergunta.- **Paleta e tipografia:** fundo `#0E1120`, destaque `#FFC83D`, títulos em Bungee e texto em Rubik.
### 5.1 Áudio

**Origem:** as músicas e os efeitos são faixas livres com licença **CC0** (bancos como OpenGameArt e Kenney). Cada arquivo fica listado em `public/audio/CREDITS.md`, com nome, autor, link e licença. O Claude pré-seleciona as faixas, e o **Diego ouve e aprova**, porque o Claude não consegue escutar áudio. Trocar uma faixa é só substituir o arquivo, sem mudar o código.

**Músicas (em loop, sem emenda audível):**

| Faixa | Quando toca |
|---|---|
| `menu` | Menu, entrada de jogadores e opções |
| `partida` | Da primeira ROLETA até o fim das rodadas normais |
| `morte-subita` | Durante a morte súbita (mais rápida e tensa) |
| `vitoria` | Vinheta curta (sem loop) na tela de fim de partida, seguida do loop `menu` |

**Efeitos sonoros:**

| Grupo | Efeitos |
|---|---|
| Roleta | cliques girando, parada no tema |
| Pergunta | aparição da pergunta, tique do timer nos últimos 5 s (mais agudo no último segundo), trava |
| Movimento | empurrão (whoosh), impacto em quem foi atingido, empurrão no vazio, colisão leve entre bonecos |
| Resultado | revelação da resposta, alçapão abrindo, queda, acerto, "+pontos" (modo Pontos), rodada anulada |
| Interface | navegar, confirmar, voltar, jogador entrou, jogador saiu ou gamepad desconectado |

**Mixagem (Web Audio API):**

```
música ─┐
efeitos ─┼─► master ─► compressor/limitador ─► saída
interface┘
```

- Há três canais com volume próprio (Música, Efeitos e Interface) mais o Master. Os padrões são Master 80%, Música 60%, Efeitos 100% e Interface 80%.
- O compressor no master evita estouro quando muitos sons tocam juntos, como 4 empurrões e um alçapão.
- **Ducking:** a música abaixa automaticamente em alguns momentos.
  - Nos últimos 5 s da pergunta: −6 dB, para o tique se destacar.
  - Na REVELAÇÃO: −10 dB por 1,5 s, para o alçapão e a queda.
  - Na pausa: −12 dB, com filtro passa-baixa ("som abafado").
- **Transições:** a troca de música é feita com crossfade de 1 s, e a vinheta de vitória corta a música da partida com fade de 0,3 s.
- **Limite de vozes:** cada efeito tem no máximo 4 cópias simultâneas, e a mais antiga é cortada. Os efeitos repetidos variam o tom em ±5% para não soar robótico.
- **Opções:** uma tela de **Opções** no menu tem os 4 controles deslizantes e um botão de mudo. A tecla **M** liga e desliga o mudo a qualquer momento. Os ajustes ficam salvos no `localStorage`.
- **Autoplay:** os navegadores bloqueiam som antes da primeira interação. Por isso a primeira tela é "Aperte qualquer tecla ou botão", e o áudio é ativado nesse toque.
- **Formatos:** `.ogg` como principal e `.mp3` como alternativa. Os loops são decodificados em `AudioBuffer` para tocar sem intervalo na emenda.

---

## 6. Arquitetura

**Stack:** TypeScript + Vite + Three.js. Testes com Vitest.

**Princípio:** `core/` é dono de toda a simulação (estado da partida, posições, física e regras) e não importa nada de Three.js nem do DOM. As camadas `render/` e `ui/` só leem o estado e reagem a eventos. Isso torna o core testável e permite portá-lo para Godot sem mudar as regras.

```
src/
  core/
    types.ts        tipos compartilhados (PlayerId, Zone, GameState, eventos)
    game.ts         máquina de estados da partida + timers
    rules.ts        resolução da rodada por modo: quem cai, anulação, pontos, vencedor, morte súbita, ranking
    physics.ts      movimento, colisão, empurrão (passo fixo)
    questions.ts    carregamento/validação do JSON, sorteio de tema e pergunta
    arena.ts        constantes da arena e zoneOf(posição) → 'A'|'B'|'C'|'D'|null
  input/
    keyboard.ts     3 grupos de teclas → PlayerInput
    gamepad.ts      Gamepad API → PlayerInput, conexão e desconexão
    devices.ts      mapa dispositivo ↔ slot, entrada de jogadores
  render/
    scene.ts        renderer, câmera, luzes, palco
    arena.ts        plataformas, alçapões, faixa neutra
    character.ts    modelo low-poly + animações procedurais
    screen.ts       textura do telão (roleta, pergunta, timer, revelação)
    effects.ts      partículas do empurrão, linhas de movimento
  audio/
    director.ts     PURO: estado + eventos do jogo → comandos de áudio (tocar, crossfade, duck, parar)
    mixer.ts        grafo Web Audio: canais, compressor, ducking, crossfade, limite de vozes
    library.ts      carregamento e decodificação dos arquivos, mapa id → AudioBuffer
    settings.ts     volumes e mudo, salvos no localStorage
  ui/
    press-start.ts  menu.ts  options.ts  join.ts  hud.ts  results.ts  pause.ts
  data/
    questions.json
  main.ts           loop: lê inputs → core.step(1/60) → render(state, events) → audio.director(state, events)
public/audio/       music/*.ogg|mp3, sfx/*.ogg|mp3, CREDITS.md
```

O `audio/director.ts` segue o mesmo princípio do core. Ele não toca som nenhum: só decide **o que** tocar, e o `mixer.ts` executa. Assim a lógica de áudio pode ser testada sem navegador.

**Interface principal do core**

```ts
type PlayerInput = { move: { x: number; z: number }; push: boolean }; // move normalizado

type GameConfig =
  | { mode: 'survival'; players: PlayerId[]; seed: number }
  | { mode: 'points'; rounds: 8 | 12 | 16; players: PlayerId[]; seed: number };

function createGame(config: GameConfig, bank: QuestionBank): Game;

interface Game {
  step(dt: number, inputs: Record<PlayerId, PlayerInput>): GameEvent[];
  readonly state: GameState;   // modo, fase, timer, rodada, jogadores (posição, vivo, pontos,
                               // recarga), pergunta atual, suddenDeath?: PlayerId[]
}

type GameEvent =
  | { type: 'themeChosen'; theme: string }
  | { type: 'questionShown'; question: ShownQuestion }   // alternativas já embaralhadas
  | { type: 'pushed'; by: PlayerId; targets: PlayerId[] }
  | { type: 'locked'; zones: Record<PlayerId, Zone | null> }
  | { type: 'revealed'; correct: Zone; fallen: PlayerId[]; voided: boolean;
      scored: Partial<Record<PlayerId, number>> }          // vazio no modo Sobrevivência
  | { type: 'respawned'; players: PlayerId[] }             // modo Pontos
  | { type: 'suddenDeathStarted'; players: PlayerId[] }
  | { type: 'gameOver'; ranking: RankEntry[]; roundsSurvived?: number; scores?: Record<PlayerId, number> };
```

- O loop usa passo fixo de 60 Hz com acumulador. A renderização interpola entre o estado anterior e o atual.
- O core recebe uma semente de aleatoriedade (`seed`), para que os testes sejam reproduzíveis.

### 6.1 Formato do banco de perguntas

```json
{
  "version": 1,
  "questions": [
    {
      "id": "geo-001",
      "theme": "Geografia",
      "difficulty": 2,
      "text": "Qual é o maior estado do Brasil em área?",
      "options": ["Pará", "Amazonas", "Mato Grosso", "Bahia"],
      "correct": 1
    }
  ]
}
```

- **Validação ao carregar:** `id` único, `difficulty` de 1 a 3, exatamente 4 `options` não vazias e distintas, `correct` de 0 a 3. Perguntas inválidas são ignoradas e listadas no console.
- **Banco inicial:** 6 temas (Geografia, História, Ciências, Esportes, Entretenimento, Tecnologia) × 20 perguntas (8 fáceis, 7 médias, 5 difíceis). O Claude gera um rascunho e o Diego revisa antes de considerar pronto.

---

## 7. Casos de borda

| Situação | Comportamento |
|---|---|
| Gamepad desconecta no meio da partida | O boneco recebe input zero e fica parado, e o HUD mostra "Controle desconectado". Se reconectar o mesmo índice, ele volta para o mesmo slot. |
| Centro do boneco exatamente na borda da plataforma | A borda pertence à plataforma (≤ meia largura conta como dentro). |
| Boneco empurrado durante a TRAVA | Não acontece, porque o empurrão só vale em PERGUNTA. |
| Dois empurram um ao outro no mesmo frame | Os dois empurrões valem e os impulsos se somam. |
| Aba perde o foco | Pausa automática (timer e física). Volta com qualquer tecla. |
| JSON ausente ou sem nenhuma pergunta válida | Tela de erro amigável no lugar do menu. |
| Tema sem perguntas na dificuldade da vez | Usa a dificuldade mais próxima (2.6). |
| Todas as perguntas usadas | Depende do modo (2.6). |
| Modo Pontos com 16 rodadas e poucas perguntas difíceis | Fallback de dificuldade (2.7). O valor em pontos segue a dificuldade **real** da pergunta mostrada. |
| Arquivo de áudio ausente ou falha ao decodificar | O jogo segue sem aquele som e avisa no console. Nunca trava por causa de áudio. |
| Aba volta do segundo plano com o `AudioContext` suspenso | Retoma o contexto na próxima interação. |
| Jogador desconecta o gamepad e não volta | Continua na partida parado (cai sozinho se não estiver numa plataforma certa). Sem remoção automática no MVP. |

---

## 8. Testes

**Automatizados (Vitest), cobrindo só o `core/`:**

- **`rules` (Sobrevivência):** eliminação simples; anulação com 2+ vivos todos errando; sem anulação no solo; vencedor quando sobra 1; ranking com empate na mesma rodada; sem resposta = erro.
- **`rules` (Pontos):** 100/200/300 por dificuldade; erro vale 0 e ninguém é eliminado; fim após N rodadas; divisão das dificuldades em terços (8, 12 e 16); empate no topo dispara a morte súbita só com os empatados; anulação na morte súbita; empate nas outras posições se mantém.- **`arena`:** `zoneOf` no centro, na faixa neutra, na borda exata e fora da arena.
- **`physics`:** separação de círculos; parede segura o boneco; empurrão acerta dentro do cone e erra fora; recarga e congelamento; impulso desloca ~1,5 m.
- **`questions`:** validação rejeita entradas inválidas; sem repetição; fallback de dificuldade; temas esgotados saem da roleta.
- **`audio/director`:** cada transição de tela ou fase gera a música certa com crossfade; duck nos últimos 5 s, na revelação e na pausa; morte súbita troca para `morte-subita`; vitória toca a vinheta e depois `menu`; tique só nos últimos 5 s.
- **`audio/settings`:** valores padrão; limites de 0 a 100%; persistência e leitura com `localStorage` vazio ou corrompido.
- **`game`:** sequência de fases com tempos corretos; fim da partida em todos os cenários (vitória, solo, perguntas esgotadas, fim das N rodadas, morte súbita).

**Manuais (checklist):** partidas com 1, 2 e 4 jogadores no teclado, nos dois modos; ouvir uma partida inteira com fones (emendas dos loops, volumes relativos, nada estourando com 4 empurrões); sliders e tecla M; teclado + 1 gamepad; desconectar o gamepad no meio; empurrar alguém para a plataforma errada; perda de foco.

**Modo debug (F1):** mostra a resposta correta, a zona de cada jogador e os círculos de colisão, e permite pular a fase.

---

## 9. Fora do MVP

Trilha original ou composta sob encomenda, música adaptativa em camadas, áudio espacial (3D posicional), personalização de bonecos e skins, power-ups, editor e importação de perguntas, multijogador online ou com celular, acesso pago, mobile/touch, localização para outros idiomas e modelos 3D feitos em ferramenta externa.
