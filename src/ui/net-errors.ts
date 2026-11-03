import { NetError, type NetErrorKind } from '../net/transport';

const REDE = 'Não foi possível conectar (a rede pode estar bloqueando)';

/** Textos dos erros do online (spec §3). */
export const NET_ERROR_TEXT: Record<NetErrorKind | 'host-left', string> = {
  'not-found': 'Sala não encontrada',
  full: 'Sala cheia',
  started: 'Partida já começou',
  version: 'Versão diferente do host: atualize a página',
  'host-left': 'A conexão com o host caiu',
  network: REDE,
  server: REDE,
};

/** Texto de uma falha ao criar ou entrar na sala; o que não for NetError conta como erro de rede. */
export function netErrorText(err: unknown): string {
  return err instanceof NetError ? NET_ERROR_TEXT[err.kind] : NET_ERROR_TEXT.network;
}
