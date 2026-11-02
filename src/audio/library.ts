import type { SfxId, Track } from './director'

export type LibraryId = Track | 'vitoria' | SfxId

export const MUSIC_IDS: readonly (Track | 'vitoria')[] = ['menu', 'partida', 'morte-subita', 'vitoria']
export const SFX_IDS: readonly SfxId[] = [
  'roleta-clique', 'roleta-para', 'pergunta', 'tick', 'tick-final', 'trava', 'empurrao', 'impacto',
  'empurrao-vazio', 'colisao', 'revelacao', 'alcapao', 'queda', 'acerto', 'pontos', 'anulada',
  'ui-navegar', 'ui-confirmar', 'ui-voltar', 'jogador-entrou', 'jogador-saiu',
]

const BASE = `${import.meta.env.BASE_URL}audio/`

async function loadOne(ctx: AudioContext, path: string): Promise<AudioBuffer | null> {
  for (const ext of ['ogg', 'mp3']) {
    try {
      const res = await fetch(`${BASE}${path}.${ext}`)
      if (!res.ok) continue
      return await ctx.decodeAudioData(await res.arrayBuffer())
    } catch {
      // tenta o próximo formato
    }
  }
  return null
}

/** Carrega e decodifica todos os áudios. Arquivo ausente ou ilegível vira `console.warn` e fica fora do mapa. */
export async function loadLibrary(ctx: AudioContext): Promise<Map<LibraryId, AudioBuffer>> {
  const lib = new Map<LibraryId, AudioBuffer>()
  const jobs: [LibraryId, string][] = [
    ...MUSIC_IDS.map((id): [LibraryId, string] => [id, `music/${id}`]),
    ...SFX_IDS.map((id): [LibraryId, string] => [id, `sfx/${id}`]),
  ]
  await Promise.all(jobs.map(async ([id, path]) => {
    const buf = await loadOne(ctx, path)
    if (buf) lib.set(id, buf)
    else console.warn(`[audio] arquivo ausente ou ilegível: ${path}`)
  }))
  return lib
}
