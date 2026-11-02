# Alçapão

Jogo de perguntas e respostas para até 4 pessoas na mesma tela, no navegador. A cada rodada o telão faz uma pergunta com quatro alternativas, uma por plataforma: corra para a certa, empurre os rivais, e quem estiver na errada cai pelo alçapão.

## Requisitos

Node 20 ou mais novo e um navegador moderno.

## Como rodar

```bash
npm install
npm run dev        # abra a URL que aparecer no terminal
npm run build      # gera dist/
npm run preview    # serve o build de produção
npm test           # testes (Vitest)
npm run lint
```

## Controles

| Dispositivo | Mover | Empurrar |
|---|---|---|
| Teclado 1 | W A S D | F |
| Teclado 2 | Setas | Shift direito |
| Teclado 3 | I J K L | O |
| Gamepad | Analógico esquerdo ou D-pad | A / X |

| Tecla | Ação |
|---|---|
| M | Liga/desliga o mudo |
| Esc (ou Start no gamepad) | Pausa e continua |
| F1 | Modo debug: FPS, resposta certa, zonas e colisões |
| N | Em debug, durante a partida: pula a fase |

As teclas são lidas por posição física (`KeyboardEvent.code`), então funcionam no teclado ABNT.

## Perguntas

Ficam em `src/data/questions.json`:

```json
{ "version": 1, "questions": [
  { "id": "geo-001", "theme": "Geografia", "difficulty": 2,
    "text": "Qual é o maior estado do Brasil em área?",
    "options": ["Pará", "Amazonas", "Mato Grosso", "Bahia"], "correct": 1 }
] }
```

`id` único, `difficulty` 1, 2 ou 3 (vale 100, 200 ou 300 pontos), exatamente 4 `options` diferentes e `correct` de 0 a 3 (índice da alternativa certa). Perguntas inválidas são ignoradas.

## Áudio

Os arquivos ficam em `public/audio/music` e `public/audio/sfx`, em `.ogg` e `.mp3`. Para trocar um som, substitua os dois arquivos mantendo o nome, e atualize `public/audio/CREDITS.md` (título, autor, URL e licença). O pipeline que gerou os arquivos atuais está em `tools/audio` (`synth.py` sintetiza, `normalize.py` normaliza o volume e `encode.py` converte; exigem Python com NumPy/SciPy e `ffmpeg`).

## Documentação

- Especificação: [docs/specs/2026-11-02-alcapao-design.md](docs/specs/2026-11-02-alcapao-design.md)
- Plano de implementação: [docs/plans/2026-11-02-alcapao-mvp.md](docs/plans/2026-11-02-alcapao-mvp.md)
- Checklist final do MVP: [docs/checklist-mvp.md](docs/checklist-mvp.md)
