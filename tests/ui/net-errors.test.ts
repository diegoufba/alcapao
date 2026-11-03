import { test, expect } from 'vitest';
import { NET_ERROR_TEXT, netErrorText } from '../../src/ui/net-errors';
import { NetError, type NetErrorKind } from '../../src/net/transport';

const KINDS: NetErrorKind[] = ['not-found', 'network', 'server', 'full', 'started', 'version'];
const REDE = 'Não foi possível conectar (a rede pode estar bloqueando)';

test('NET_ERROR_TEXT tem os textos da spec para cada erro de rede e para a queda do host', () => {
  expect(NET_ERROR_TEXT).toEqual({
    'not-found': 'Sala não encontrada',
    full: 'Sala cheia',
    started: 'Partida já começou',
    version: 'Versão diferente do host: atualize a página',
    'host-left': 'A conexão com o host caiu',
    network: REDE,
    server: REDE,
  });
  expect(Object.keys(NET_ERROR_TEXT).sort()).toEqual([...KINDS, 'host-left'].sort());
});

test('netErrorText traduz NetError pelo tipo e o resto como erro de rede', () => {
  for (const k of KINDS) expect(netErrorText(new NetError(k))).toBe(NET_ERROR_TEXT[k]);
  expect(netErrorText(new Error('qualquer'))).toBe(REDE);
  expect(netErrorText(undefined)).toBe(REDE);
});
