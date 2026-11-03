# Checklist final do MVP (spec §8)

Data: 2026-11-02 · Branch `mvp`.

Legenda: ✅ verificado automaticamente · ✅ verificado via Playwright/headless · ⏳ pendente — Diego (precisa de gente, ouvido, controle ou hardware real).

Ambiente das verificações automáticas: Chromium headless (Playwright 1.63) com SwiftShader (`--use-gl=angle --use-angle=swiftshader`), servidor de desenvolvimento do Vite. Os testes empurraram o estado da partida pelo gancho de DEV `window.matchState` (posicionar jogadores nas plataformas) e usaram F1 + N para pular fases. O gamepad foi simulado sobrescrevendo `navigator.getGamepads` com `page.addInitScript`. Uma captura de tela (4 jogadores, fase de pergunta) foi conferida visualmente: HUD, telão, plataformas e bonecos corretos.

## 1. Build e testes

| Item | Resultado |
|---|---|
| `npx vitest run` | ✅ verificado automaticamente: 18 arquivos, 188 testes passando |
| `npm run lint` | ✅ verificado automaticamente: sem avisos |
| `npm run build` (`tsc && vite build`) | ✅ verificado automaticamente: sem erros de tipo nem avisos |
| Build de produção (`vite preview`) abre, vai de press-start a menu, entrada e partida, sem erros no console; os 25 arquivos `.ogg` e os JS respondem 200 | ✅ verificado via Playwright/headless |

## 2. Partidas

| Item | Resultado |
|---|---|
| 1 jogador, Sobrevivência (acerta 2 rodadas, erra a 3ª): tela "Você caiu na rodada 3", 2 rodadas, recorde salvo | ✅ verificado via Playwright/headless |
| 1 jogador, Pontos (12 rodadas, alterna acerto/erro): 1.200 pts, recorde salvo | ✅ verificado via Playwright/headless |
| 2 jogadores no teclado (WASD + Setas), Sobrevivência: P2 cai na rodada 2, P1 vence | ✅ verificado via Playwright/headless |
| 4 jogadores (WASD, Setas, IJKL + gamepad simulado), Sobrevivência: eliminações P2, P3, P4 nas rodadas 1, 2 e 3; P1 vence | ✅ verificado via Playwright/headless |
| 4 jogadores, Pontos (12 rodadas): placar 2.400 / 1.500 / 1.200 / 0 coerente com 100 pts/acerto por dificuldade; ranking correto | ✅ verificado via Playwright/headless |
| 2 jogadores em Pontos, partida de ponta a ponta | ⏳ pendente — Diego: jogar uma partida em Pontos com 2 pessoas (WASD + Setas) e conferir pontuação e ranking |
| Partida real, com gente jogando de verdade (correr, empurrar, sentir a jogabilidade) | ⏳ pendente — Diego: `npm run dev`, jogar 1, 2 e 4 jogadores nos dois modos |
| Morte súbita (empate no topo em Pontos): regras e fim de partida | ✅ verificado automaticamente: testes de `rules` e `game` |
| Morte súbita vista na tela | ⏳ pendente — Diego: em Pontos, provocar empate no topo (ex.: 2 jogadores acertando as mesmas rodadas) e conferir a rodada de desempate no telão e a música `morte-subita` |

## 3. Empurrão, perda de foco, gamepad

| Item | Resultado |
|---|---|
| Empurrar alguém para a plataforma errada: P1 (WASD+F) empurra P2 de x=-0,7 para x=0,87 (≈1,5 m), a vítima fica na plataforma B, e na revelação cai (`fallen=true`) enquanto P1 segue de pé | ✅ verificado via Playwright/headless |
| Perda de foco (evento `blur`) pausa a partida, o cronômetro congela, Esc continua e o tempo volta a correr | ✅ verificado via Playwright/headless |
| Aba oculta (`visibilitychange`, `document.hidden`) também pausa | ✅ verificado via Playwright/headless |
| Teclado + gamepad na mesma partida: analógico (eixo X) move P2 e WASD move P1 | ✅ verificado via Playwright/headless (gamepad simulado) |
| Desconectar o gamepad no meio: a partida segue rodando, sem erro no console; ao reconectar o jogador volta a se mover | ✅ verificado via Playwright/headless (gamepad simulado) |
| Gamepad físico real (Xbox/PS): entrada na tela de jogadores, analógico, D-pad, botão A/X, Start pausa, desconexão ao puxar o USB/desligar | ⏳ pendente — Diego: plugar um controle, entrar na tela "Quem vai jogar?" com um botão, jogar uma rodada, mover pelo analógico e D-pad, empurrar com A/X, apertar Start (pausa) e desconectar no meio |
| Ghosting com 3 grupos de teclas no teclado ABNT (várias teclas ao mesmo tempo) | ⏳ pendente — Diego: com 3 jogadores no mesmo teclado, segurar movimento + empurrar dos 3 grupos juntos e ver se alguma tecla "some"; o menu já avisa sobre ghosting |

## 4. Áudio

| Item | Resultado |
|---|---|
| Todos os arquivos de áudio carregam (200) e o jogo roda sem erro de console com áudio ligado; tecla M não gera erro | ✅ verificado via Playwright/headless |
| Lógica do diretor de áudio (transições, crossfade, duck, tique, morte súbita, vitória) e das configurações | ✅ verificado automaticamente: testes de `audio/director` e `audio/settings` |
| Ouvir uma partida inteira com fones: emendas dos loops, volumes relativos, nada estourando com 4 empurrões seguidos | ⏳ pendente — Diego: partida completa com 4 jogadores usando fones; prestar atenção na emenda do loop (a cada 64 s), no equilíbrio música × efeitos e nos 4 empurrões ao mesmo tempo |
| Sliders (Master, Música, Efeitos, Interface) na tela Opções e tecla M (mudo) de fato mudam o som | ⏳ pendente — Diego: Opções → mexer em cada slider ouvindo, apertar M dentro e fora da partida, recarregar a página e ver se os valores persistem |
| Aprovação do áudio (Tarefa 14) | ⏳ pendente — Diego: aprovar ou pedir troca das faixas e efeitos (todos gerados proceduralmente, ver `public/audio/CREDITS.md`) |

## 5. Perguntas

| Item | Resultado |
|---|---|
| Banco com 120 perguntas válidas, 20 por tema, 48/42/30 nas dificuldades 1/2/3; validação rejeita entradas inválidas | ✅ verificado automaticamente (contagem por script e testes de `questions`) |
| Revisão do conteúdo das 120 perguntas (resposta correta, texto, dificuldade) | ⏳ pendente — Diego: ler `src/data/questions.json` e conferir fatos e dificuldades |
| Aprovação do banco (Tarefa 6) | ⏳ pendente — Diego |

## 6. Desempenho

| Item | Resultado |
|---|---|
| 60 fps com 4 bonecos | ⏳ pendente — Diego: em um PC de verdade, apertar F1 em partida com 4 jogadores e ler o contador "N FPS" no canto. (No SwiftShader do ambiente de teste o contador marcou ~3 FPS, o que não é representativo de hardware real.) |

## 7. Aprovações adiadas

- ⏳ Tarefa 6 (banco de perguntas): aprovação do Diego.
- ⏳ Tarefa 14 (áudio): aprovação do Diego.

## 8. Modo online

Spec: [2026-11-03-alcapao-online-design.md](specs/2026-11-03-alcapao-online-design.md). Os testes de rede só rodaram com duas abas no mesmo PC (`?online=host` e `?online=join&sala=`).

| Item | Resultado |
|---|---|
| Código de sala, protocolo (validação de mensagens hostis), buffer de snapshots, regras do host e fontes de simulação | ✅ verificado automaticamente: testes de `net` e `sim` |
| Criar sala, entrar por código ou link `?sala=` e jogar uma partida até a tela final, entre duas abas | ⏳ pendente — Diego: conferir os dois modos, o telão, as quedas, os empurrões e o áudio iguais nas duas abas |
| Entrada recusada: sala cheia (5ª pessoa), partida em andamento ("Partida já começou") e versão diferente | ⏳ pendente — Diego |
| Cliente fecha a aba no meio: a partida segue para os outros, com o jogador marcado como desconectado | ⏳ pendente — Diego |
| Host fecha a aba (no lobby e na partida): os clientes voltam ao menu com "A conexão com o host caiu" | ⏳ pendente — Diego |
| Online não pausa: Esc, perder o foco e aba de cliente escondida não param a partida (ao voltar, o jogo salta para o presente). Esconder a aba do host congela todos: o cliente vê "Aguardando o host…" e a partida segue quando o host volta | ⏳ pendente — Diego |
| "Jogar de novo" (só o host) leva todos ao lobby | ⏳ pendente — Diego |
| Partida entre dois computadores de verdade, em redes diferentes (latência, fluidez, rede que bloqueia por NAT simétrico/CGNAT) | ⏳ pendente — Diego |
| Em produção (GitHub Pages): o chunk do PeerJS carrega só ao abrir o online e `?sala=` abre a tela Online | ⏳ pendente — Diego: conferir após o deploy |

## 9. Jogo no celular

Spec: [2026-11-03-alcapao-celular-design.md](specs/2026-11-03-alcapao-celular-design.md). Testes automatizados de `stick`, `touch` e `canJoin`; o resto depende de conferir no painel (preset mobile, 812×375) e num celular de verdade.

| Item | Resultado |
|---|---|
| Analógico (zona morta, limite, eixo), `TouchInput` (empurrão único, dois dedos, `reset`) e regra de 1 jogador na entrada | ✅ verificado automaticamente: testes de `input` e `ui` |
| Partida offline inteira só com toque e aviso "Gire o celular" em retrato | ⏳ pendente — Diego: conferir no painel do navegador (preset mobile) |
| Celular de verdade na rede local (`npm run dev -- --host`): partida offline e online com o PC de host | ⏳ pendente — Diego |
| Tela cheia, trava em paisagem, áudio e FPS no Android; no iOS vale só o aviso | ⏳ pendente — Diego |
| No PC, com teclado ou gamepad, nada muda (`?quick=points&players=4` e o fluxo normal) | ⏳ pendente — Diego |

## Observações

- Nenhum erro ou aviso no console em nenhum dos cenários automatizados.
- Os cenários automatizados posicionam os jogadores via `window.matchState` (só existe em `npm run dev`), então não substituem testar a movimentação real.
