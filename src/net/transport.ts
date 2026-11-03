// Único módulo que conhece o PeerJS. O resto do online fala com `Link` e `HostRoom`.
// O pacote é carregado sob demanda (import dinâmico): quem só joga offline não baixa o PeerJS.
import type { DataConnection, Peer, PeerError, PeerOptions } from 'peerjs';
import { generateRoomCode, peerIdFor } from './room-code';

export type Channel = 'ctl' | 'snap';

/** Conexão com um par: `ctl` confiável e ordenado; `snap` não confiável. */
export interface Link {
  send(ch: Channel, data: string): void;
  onMessage(cb: (ch: Channel, data: string) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

export interface HostRoom {
  code: string;
  onLink(cb: (link: Link) => void): void;
  close(): void;
}

export type NetErrorKind = 'not-found' | 'network' | 'server' | 'full' | 'started' | 'version';

export class NetError extends Error {
  readonly kind: NetErrorKind;
  constructor(kind: NetErrorKind) {
    super(`erro de rede: ${kind}`);
    this.name = 'NetError';
    this.kind = kind;
  }
}

/**
 * Servidor de sinalização e ICE. Sem `host`, o PeerJS usa o servidor público gratuito (0.peerjs.com).
 * Para trocar de servidor ou acrescentar um TURN: `host`, `port`, `path`, `secure` e `config.iceServers`.
 */
export const PEER_OPTIONS: PeerOptions = {};

const CONNECT_TIMEOUT_MS = 10_000;
const MAX_CODE_TRIES = 5;

function netErrorFor(err: unknown): NetError {
  const type = (err as Partial<PeerError<string>> | undefined)?.type;
  switch (type) {
    case 'peer-unavailable': return new NetError('not-found');
    case 'server-error':
    case 'socket-closed': return new NetError('server');
    default: return new NetError('network'); // 'network', 'webrtc', 'socket-error' e o resto
  }
}

async function loadPeer(): Promise<typeof Peer> {
  try {
    return (await import('peerjs')).Peer;
  } catch {
    throw new NetError('network');
  }
}

/** Espera o `open` do peer (registrado no servidor de sinalização). */
function whenOpen(peer: Peer): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new NetError('network')), CONNECT_TIMEOUT_MS);
    peer.once('open', () => { clearTimeout(timer); resolve(); });
    peer.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

/**
 * Junta as duas DataConnections de um par num `Link`. O `snap` pode chegar depois (`attachSnap`);
 * até lá, o que for mandado por ele é descartado. O link fecha quando o `ctl` fecha ou dá erro.
 */
function makeLink(ctl: DataConnection, onGone?: () => void): { link: Link; attachSnap(snap: DataConnection): void } {
  let snap: DataConnection | null = null;
  const msgCbs: ((ch: Channel, data: string) => void)[] = [];
  const closeCbs: (() => void)[] = [];
  let closed = false;

  const shutdown = () => {
    if (closed) return;
    closed = true;
    try { ctl.close(); } catch { /* já fechada */ }
    try { snap?.close(); } catch { /* já fechada */ }
    onGone?.();
    for (const cb of closeCbs) cb();
  };

  const deliver = (ch: Channel) => (data: unknown) => {
    if (closed || typeof data !== 'string') return;
    for (const cb of msgCbs) cb(ch, data);
  };

  ctl.on('data', deliver('ctl'));
  ctl.on('close', shutdown);
  ctl.on('error', shutdown);

  const link: Link = {
    send(ch, data) {
      if (closed) return;
      const conn = ch === 'ctl' ? ctl : snap;
      if (!conn?.open) return; // snap ainda não abriu: o snapshot é descartável
      try { void conn.send(data); } catch { /* canal caindo: o close avisa */ }
    },
    onMessage(cb) { msgCbs.push(cb); },
    onClose(cb) { closeCbs.push(cb); },
    close: shutdown,
  };
  return {
    link,
    attachSnap(s) {
      snap = s;
      s.on('data', deliver('snap'));
    },
  };
}

/** Cria a sala: registra `alcapao-<CÓDIGO>` no servidor, trocando de código se já estiver em uso. */
export async function hostRoom(): Promise<HostRoom> {
  const PeerCtor = await loadPeer();
  let peer: Peer | null = null;
  let code = '';
  for (let i = 0; i < MAX_CODE_TRIES; i++) {
    code = generateRoomCode(Math.random);
    const candidate = new PeerCtor(peerIdFor(code), PEER_OPTIONS);
    try {
      await whenOpen(candidate);
      peer = candidate;
      break;
    } catch (err) {
      candidate.destroy();
      const type = (err as Partial<PeerError<string>>).type;
      if (type === 'unavailable-id' && i < MAX_CODE_TRIES - 1) continue;
      throw err instanceof NetError ? err : netErrorFor(err);
    }
  }
  if (!peer) throw new NetError('server');
  const host = peer;

  const linkCbs: ((link: Link) => void)[] = [];
  // conexões de cada par, até o 'ctl' abrir e virar Link
  type Entry = { ctl: DataConnection | null; snap: DataConnection | null; attach: ((s: DataConnection) => void) | null };
  const pending = new Map<string, Entry>();

  host.on('connection', (conn) => {
    const entry: Entry = pending.get(conn.peer) ?? { ctl: null, snap: null, attach: null };
    pending.set(conn.peer, entry);

    if (conn.label === 'snap') {
      entry.snap = conn;
      entry.attach?.(conn);
      return;
    }
    if (conn.label !== 'ctl' || entry.ctl) { conn.close(); return; }
    entry.ctl = conn;
    conn.once('open', () => {
      const { link, attachSnap } = makeLink(conn, () => {
        if (pending.get(conn.peer) === entry) pending.delete(conn.peer);
      });
      entry.attach = attachSnap;
      if (entry.snap) attachSnap(entry.snap);
      for (const cb of linkCbs) cb(link);
    });
  });
  // o servidor de sinalização pode cair sem afetar as conexões já abertas; erros de um par chegam aqui também
  host.on('error', () => {});

  return {
    code,
    onLink(cb) { linkCbs.push(cb); },
    close() { host.destroy(); },
  };
}

/** Entra na sala: abre 'ctl' (confiável) e 'snap' (não confiável) com o host. */
export async function joinRoom(code: string): Promise<Link> {
  const PeerCtor = await loadPeer();
  const peer = new PeerCtor(PEER_OPTIONS);
  try {
    await whenOpen(peer);
    const target = peerIdFor(code);
    const ctl = peer.connect(target, { label: 'ctl', serialization: 'raw', reliable: true });
    const snap = peer.connect(target, { label: 'snap', serialization: 'raw', reliable: false });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new NetError('network')), CONNECT_TIMEOUT_MS);
      ctl.once('open', () => { clearTimeout(timer); resolve(); });
      ctl.once('error', () => { clearTimeout(timer); reject(new NetError('network')); });
      peer.once('error', (err) => { clearTimeout(timer); reject(netErrorFor(err)); });
    });

    const { link, attachSnap } = makeLink(ctl, () => peer.destroy());
    attachSnap(snap);
    peer.on('error', () => {}); // depois de aberto, a queda chega pelo close do 'ctl'
    return link;
  } catch (err) {
    peer.destroy();
    throw err instanceof NetError ? err : netErrorFor(err);
  }
}
