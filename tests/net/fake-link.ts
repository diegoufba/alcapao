import type { Channel, HostRoom, Link } from '../../src/net/transport';

/** Lado de um par em memória, com acesso ao que passou por ele (para os testes). */
export interface FakeLink extends Link {
  /** Mensagens que este lado enviou, na ordem. */
  readonly sent: { ch: Channel; data: string }[];
  readonly closed: boolean;
}

/** Par de links em memória: `send` de um lado entrega na hora no outro; `close` fecha os dois. */
export function createLinkPair(): [FakeLink, FakeLink] {
  interface Side {
    sent: { ch: Channel; data: string }[];
    closed: boolean;
    peer: Side | null;
    msgCbs: ((ch: Channel, data: string) => void)[];
    closeCbs: (() => void)[];
  }
  const make = (): Side => ({ sent: [], closed: false, peer: null, msgCbs: [], closeCbs: [] });
  const a = make();
  const b = make();
  a.peer = b;
  b.peer = a;

  const shutdown = () => {
    if (a.closed) return;
    a.closed = true;
    b.closed = true;
    for (const cb of a.closeCbs) cb();
    for (const cb of b.closeCbs) cb();
  };

  const link = (me: Side): FakeLink => ({
    get sent() { return me.sent; },
    get closed() { return me.closed; },
    send(ch, data) {
      if (me.closed) return;
      me.sent.push({ ch, data });
      for (const cb of me.peer!.msgCbs) cb(ch, data);
    },
    onMessage(cb) { me.msgCbs.push(cb); },
    onClose(cb) { me.closeCbs.push(cb); },
    close: shutdown,
  });
  return [link(a), link(b)];
}

/** Sala falsa: `connect()` cria um par, entrega um lado ao host e devolve o do cliente. */
export function createFakeRoom(code = 'ABCDE'): HostRoom & { connect(): FakeLink; closed: boolean } {
  const cbs: ((link: Link) => void)[] = [];
  const room = {
    code,
    closed: false,
    onLink(cb: (link: Link) => void) { cbs.push(cb); },
    close() { room.closed = true; },
    connect(): FakeLink {
      const [host, client] = createLinkPair();
      for (const cb of cbs) cb(host);
      return client;
    },
  };
  return room;
}
