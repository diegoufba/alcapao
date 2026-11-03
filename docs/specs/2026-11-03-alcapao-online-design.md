# Alçapão: especificação do modo online

**Data:** 03/11/2026 · **Status:** em revisão · **Base:** [especificação do MVP](2026-11-02-alcapao-design.md)

---

## 1. Objetivo

Hoje o Alçapão só se joga na mesma tela, com 1 a 4 jogadores. Esta especificação acrescenta um **modo online com sala privada**. Alguém cria a sala, manda o código aos amigos, e cada um entra do seu computador.

O **modo offline continua exatamente como está** e segue como a entrada padrão do menu.

O jogo hoje é 100% estático (GitHub Pages) e deve continuar assim. Não há servidor de jogo: os computadores se conectam diretamente (P2P, via WebRTC).

**Critérios de sucesso**

- Duas a quatro pessoas, cada uma no seu PC, jogam uma partida completa de Sobrevivência e outra de Pontos. Isso vai da criação da sala até a tela final.
- O telão, as quedas, os empurrões, o áudio e o resultado são os mesmos em todas as telas.
- Quando um cliente cai, a partida segue para os outros. Quando o host cai, todos voltam ao menu com uma mensagem clara.
- O modo offline não muda: testes e atalhos `?quick=` funcionam como antes.

---

## 2. Decisões

| Tema | Decisão |
|---|---|
| Acesso | Sala privada, por código de 5 letras ou por link. Não há matchmaking público. |
| Jogadores | **Um por PC**, até 4 por sala. É preciso ter pelo menos 2 para começar. |
| Rede | **P2P (WebRTC) via PeerJS**. Quem cria a sala é o **host**: roda a partida e também joga. |
| Sincronização | **O host manda o estado**. Só o host roda `createGame()`. Os clientes mandam inputs e desenham snapshots interpolados. |
| Queda de cliente | **Quem cai sai.** O boneco fica parado até o fim da partida e não há reconexão. |
| Queda do host | A partida acaba para todos. |
| Controle da sala | Só o host escolhe o modo e as rodadas, e só ele inicia a partida e o "Jogar de novo". |
| Pausa | Online, ninguém pausa. Esc abre um menu com "Sair da sala" e o jogo segue. |
| Versão | Host e clientes precisam ter a mesma versão do protocolo e do jogo, o que inclui o mesmo banco de perguntas. |

**Por que o host manda o estado.** Uma alternativa seria cada PC rodar o `core/` e trocar só os inputs (lockstep). O problema é que a física usa `sin`, `cos`, `atan2` e `hypot` em ponto flutuante. Essas funções não têm garantia de dar o mesmo resultado bit a bit entre navegadores, então as simulações poderiam divergir. Além disso, no lockstep qualquer lag trava todo mundo. Com o host mandando o estado nada diverge, e um `GameState` cabe em menos de 1 KB.

O custo é que o próprio boneco responde com o atraso de uma ida e volta, uns 50 a 150 ms. Se isso incomodar, a próxima etapa é a predição local (§9).

---

## 3. Fluxo de telas

```
Menu ─┬─ Jogar ─────────── (offline, como hoje)
      └─ Jogar online ─ Online ─┬─ Criar sala ─────────┐
                                └─ Entrar com código ──┤
                                                       ▼
                                  Lobby ─(host: Começar)─▶ Partida ─▶ Resultados
                                    ▲                                     │
                                    └─────────(host: Jogar de novo)───────┘
```

- **Online.** Botões "Criar sala" e "Entrar com código". O campo do código aceita 5 letras e a normalização (§4.1) corrige o que for digitado. Abrir o jogo com `?sala=CODIGO` leva direto a "entrar" com o código preenchido.
- **Lobby.**
  - Mostra o código grande e um botão "Copiar link", que copia a URL com `?sala=`.
  - Lista os jogadores na cor de cada um e marca o seu com "(você)".
  - O host troca o modo e as rodadas com a mesma lógica da tela de entrada offline (`join.ts`), extraída para uma função compartilhada. Os clientes só veem a escolha.
  - O host vê "Começar", que só fica ativo a partir de 2 jogadores. Os clientes veem "Aguardando o host…".
  - Sair do lobby fecha a sala, se for o host, ou libera a vaga, se for cliente.
- **Partida.** É o HUD e a cena de sempre. Esc abre o overlay online com "Continuar" e "Sair da sala", sem pausar. Perder o foco da janela ou esconder a aba também não pausa.
- **Resultados.** O host vê "Jogar de novo", que leva todos ao lobby com as mesmas pessoas, e "Sair", que fecha a sala. Os clientes veem "Aguardando o host…" e "Sair".
- **Erros.** Eles aparecem no overlay de erro que já existe e voltam ao menu:
  - "Sala não encontrada";
  - "Sala cheia";
  - "Partida já começou";
  - "Versão diferente do host: atualize a página";
  - "A conexão com o host caiu";
  - "Não foi possível conectar (a rede pode estar bloqueando)".

**Entrada no PC online.** O jogador local usa **qualquer** grupo de teclado (WASD, setas, IJKL) ou gamepad, e vale o primeiro que for apertado. Ele é sempre "você". O `PlayerId`, e portanto a cor, é atribuído pelo host por ordem de chegada. O host é P1.

---

## 4. Rede

### 4.1 Sala e conexão

- O código tem **5 letras** de um alfabeto sem caracteres ambíguos, sem `O`, `0`, `I`, `1` nem `L`. A normalização passa para maiúsculas e remove espaços e hífens.
- O id do host no PeerJS é `alcapao-<CÓDIGO>`. Se o id já estiver em uso (erro `unavailable-id`), o host gera outro código.
- A sinalização usa o servidor público gratuito do PeerJS. Host, porta e servidores ICE ficam numa config em `src/net/transport.ts`, para que seja possível trocar de servidor ou acrescentar um TURN no futuro.
- Não há TURN. Atrás de NAT simétrico ou CGNAT a conexão pode falhar, e nesse caso aparece a mensagem de erro de rede (§3).
- Cada cliente abre **duas conexões** com o host:
  - `ctl`: confiável e ordenada, para lobby, inputs e eventos;
  - `snap`: não confiável e sem ordem, para os snapshots. Um snapshot atrasado é descartado.
- WebRTC exige contexto seguro. O GitHub Pages serve HTTPS, e em desenvolvimento `localhost` basta.

### 4.2 Mensagens

Todas as mensagens são JSON com um campo `t`. O `decode` valida **tudo**: tipos, faixas, `PlayerId`, fases e zonas, porque os dados vêm da rede. Uma mensagem inválida é descartada e não derruba o jogo.

**Cliente → host**

| `t` | Campos | Quando |
|---|---|---|
| `hello` | `protocol`, `build` | Primeira mensagem. Se a versão for diferente, o host responde `rejected`. |
| `input` | `move {x,z}`, `pushCount` | Vai pelo `ctl` quando o input muda, mais um heartbeat de ~5 Hz. |
| `bye` | n/a | O cliente saiu de propósito. |

`pushCount` é um contador que só cresce. O host aplica um empurrão a cada incremento, e assim nenhum empurrão se perde nem conta duas vezes.

**Host → cliente**

| `t` | Campos | Canal |
|---|---|---|
| `welcome` | `you: PlayerId` | `ctl` |
| `lobby` | `players: PlayerId[]`, `mode`, `rounds` | `ctl` |
| `start` | `config: GameConfig` | `ctl` |
| `events` | `tick`, `events: GameEvent[]` | `ctl` |
| `snap` | `tick`, `state: GameState`, `themes?` | `snap`, a 30 Hz |
| `left` | `id: PlayerId` | `ctl` |
| `rejected` | `reason: 'full' \| 'started' \| 'version'` | `ctl` |
| `closed` | n/a | `ctl` |

- `tick` conta os passos fixos de 1/60 s desde o início da partida.
- `themes` vai junto só na fase `spin`. É a saída de `game.availableThemes()`, de que `screenViewFor` precisa.

### 4.3 Regras do host

- Cada conexão fica ligada a um `PlayerId` fixo. Os inputs de uma conexão só valem para o jogador dela.
- `move` é limitado a comprimento ≤ 1, e valores não finitos viram `{0,0}`.
- O host guarda o último input de cada cliente e o repete em todos os passos até chegar um novo, como o `held` de hoje.
- Se uma conexão fechar durante a partida, o jogador passa a não ter input (fica parado) e é marcado como desconectado no HUD (`DeviceSlots.setConnected`). Os clientes recebem `left`.
- Se uma conexão fechar no lobby, a vaga é liberada.
- Pedidos de entrada com a partida em andamento ou com 4 jogadores na sala recebem `rejected`.

### 4.4 Cliente: interpolação

- Os snapshots vão para um buffer ordenado por `tick`.
- O cliente desenha com **~100 ms de atraso**. A posição de cada jogador é interpolada entre os dois snapshots que cercam o instante desenhado. Se faltar o snapshot seguinte, a posição fica no último, sem extrapolar.
- Os demais campos (fase, timer, pergunta, placar, `facing`, `fallen`, `inPlay`) vêm do snapshot mais recente já desenhado.
- Os eventos vão para uma fila e são liberados quando o instante desenhado alcança o `tick` deles. Assim o som e os efeitos batem com a imagem.
- Num salto de posição (eventos `respawned` e `phaseChanged → spin`), a interpolação daquele jogador recomeça, como `prev.delete` faz hoje.

---

## 5. Arquitetura

### 5.1 Módulos novos em `src/net/`

| Arquivo | Puro? | Papel |
|---|---|---|
| `room-code.ts` | sim | Gerar, validar e normalizar o código. |
| `protocol.ts` | sim | Tipos das mensagens, `encode`/`decode` com validação e `PROTOCOL_VERSION`. |
| `snapshots.ts` | sim | Buffer de snapshots, interpolação e fila de eventos por `tick`. |
| `transport.ts` | não | O **único** arquivo que importa `peerjs`. Expõe `hostRoom(code)` e `joinRoom(code)`, que devolvem conexões tipadas. |
| `host-session.ts` | não | Lobby, ligação conexão → `PlayerId`, inputs remotos, envio de estado e eventos, detecção de quedas. |
| `client-session.ts` | não | Lobby espelhado, envio de inputs, recepção de snapshots e eventos, detecção da queda do host. |

Os módulos puros entram na mesma regra do ESLint de `src/core/`: proibido importar `three` e usar `window`, `document`, `localStorage` e `navigator`.

A dependência nova é `peerjs`, instalada com `--save-exact`.

### 5.2 Fonte de simulação em `src/match.ts`

Hoje o `MatchController.start(config, devices)` cria o jogo e o avança. Ele passa a receber uma **fonte de simulação**, que decide de onde vêm o estado e os eventos de cada quadro:

- **`local`** é o comportamento atual: `createGame`, `createStepper` e inputs dos dispositivos. O offline usa esta fonte.
- **`host`** é a `local` com dois acréscimos. Antes de cada passo, junta os inputs remotos da `HostSession` aos locais. Depois de cada quadro, entrega `state`, `events` e `tick` à sessão, que transmite.
- **`remote`** não roda o jogo. A cada quadro pede ao `ClientSession` o estado interpolado e os eventos liberados, e manda o input local.

`handleEvents`, `syncCharacters`, telão, HUD, debug e `drainEvents`, que alimenta o áudio, continuam iguais e leem o estado de qualquer fonte. `prev` e `alpha` só existem na fonte local.

`pause()` não faz nada nas fontes `host` e `remote`, e o `main.ts` deixa de chamar a pausa em blur ou aba escondida quando a partida é online.

### 5.3 Atalhos de desenvolvimento

Só valem com `import.meta.env.DEV`:

- `?online=host` cria a sala e vai direto ao lobby.
- `?online=join&sala=XXXXX` entra direto na sala.
- O debug (F1) mostra o RTT e a idade do último snapshot.

Para testar no mesmo PC, basta abrir duas abas, porque o PeerJS funciona entre abas.

---

## 6. Casos de borda

- **Host fecha a aba no lobby ou na partida.** Os clientes detectam o fechamento do `ctl` e veem "A conexão com o host caiu".
- **Cliente fecha a aba na partida.** O boneco fica parado e marcado como desconectado. No modo Sobrevivência ele provavelmente cai na próxima revelação.
- **Todos os clientes caem.** A partida segue só com o host, que pode sair pelo menu.
- **Snapshot fora de ordem ou repetido.** É descartado pelo `tick`.
- **Empurrão apertado e solto entre dois envios.** O `pushCount` garante que ele chega.
- **Mesmo código gerado por outro host ao mesmo tempo.** O PeerJS recusa o id (`unavailable-id`) e o host gera outro.
- **Banco de perguntas.** O host manda a pergunta dentro do estado, e o cliente nunca sorteia nada. A versão é conferida no `hello`.
- **Aba do cliente em segundo plano.** O navegador reduz o `requestAnimationFrame`. Ao voltar, o buffer descarta os snapshots velhos e o cliente pula para o presente.

---

## 7. Testes

**Automatizados (Vitest):**

- `room-code`:
  - o código gerado usa só o alfabeto e tem 5 letras;
  - a normalização aceita minúsculas, espaços e hífen;
  - códigos inválidos são recusados.
- `protocol`:
  - ida e volta de cada mensagem;
  - `decode` rejeita JSON quebrado, `t` desconhecido, campos faltando, tipos errados, `PlayerId` inválido e números não finitos.
- `snapshots`:
  - a interpolação entre dois snapshots está certa;
  - sem snapshot seguinte, a posição fica no último;
  - snapshots fora de ordem são descartados;
  - eventos são liberados pelo `tick`;
  - um salto de posição reinicia a interpolação.
- **Regras do host**, testadas como lógica pura extraída da sessão:
  - limite de `move`;
  - aplicação do `pushCount`;
  - recusa de sala cheia e de partida em andamento.
- **`match.ts`**: a refatoração da fonte local não muda nenhum teste existente.

**Manuais:**

- Duas abas: uma partida completa de cada modo, depois o cliente fecha a aba no meio, depois o host fecha a aba.
- Dois PCs em redes diferentes, já com o build no GitHub Pages.

---

## 8. Etapas

1. Refatorar `match.ts` para a fonte de simulação, sem mudar o offline.
2. Criar os módulos puros `room-code`, `protocol` e `snapshots` com TDD, e ampliar a regra do ESLint.
3. Criar `transport` e as sessões de host e cliente, e implementar as fontes `host` e `remote`. O marco é uma partida jogável entre duas abas via `?online=`.
4. Criar as telas Online e Lobby, o overlay online, os erros, "Jogar de novo" e o link `?sala=`.
5. Atualizar as docs: a §9 da especificação do MVP, o `README`, o `CLAUDE.md` (camada `src/net/`) e o checklist.

---

## 9. Fora do escopo

- Predição do próprio boneco. É o primeiro candidato se o atraso incomodar.
- Reconexão de cliente e migração de host.
- Vários jogadores no mesmo PC dentro de uma sala online.
- Servidor TURN, matchmaking público, salas abertas e chat.
