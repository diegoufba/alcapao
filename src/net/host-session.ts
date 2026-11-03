import type { GameConfig } from '../core/game';
import type { Mode, PlayerId, Question } from '../core/types';
import type { HudSlots } from '../input/match-input';
import type { LocalHooks } from '../sim/local';
import { admit, RemoteInputs } from './host-rules';
import { bankHash, decodeClient, encode } from './protocol';
import type { HostMsg, LobbyInfo, Rounds } from './protocol';
import type { HostRoom, Link } from './transport';

export interface HostSession extends HudSlots {
  readonly code: string;
  lobby(): LobbyInfo;
  onLobby(cb: (l: LobbyInfo) => void): void;
  setOptions(mode: Mode, rounds: Rounds): void;
  /** null com menos de 2 jogadores (ou partida já em andamento); senão manda 'start' a todos. */
  start(seed: number): GameConfig | null;
  /** Ganchos da fonte local do host: inputs remotos antes de cada passo, envio de estado depois do quadro. */
  hooks(): LocalHooks;
  /** Volta todos ao lobby (quem caiu na partida sai da lista). */
  backToLobby(): void;
  /** Manda 'closed' e fecha tudo. */
  close(): void;
}

const ORDER: readonly PlayerId[] = ['P1', 'P2', 'P3', 'P4'];
const SNAP_EVERY = 2; // ticks: 30 Hz
/** Tempo para a recusa chegar antes de o host fechar a conexão (o cliente costuma fechar antes). */
const REJECT_CLOSE_MS = 2000;

export function createHostSession(room: HostRoom, bank: Question[]): HostSession {
  const build = bankHash(bank);
  let players: PlayerId[] = ['P1'];
  let mode: Mode = 'survival';
  let rounds: Rounds = 12;
  let started = false;
  let closed = false;
  const members = new Map<Link, PlayerId>(); // só conexões admitidas
  const dropped = new Set<PlayerId>(); // caíram durante a partida
  const remote = new RemoteInputs(); // pushCount é por conexão: nunca zera entre partidas
  let lastSnapTick: number | null = null;
  const lobbyCbs: ((l: LobbyInfo) => void)[] = [];

  const lobby = (): LobbyInfo => ({ players: [...players], mode, rounds, started });

  const broadcast = (m: HostMsg, ch: 'ctl' | 'snap' = 'ctl') => {
    const data = encode(m);
    for (const link of members.keys()) link.send(ch, data);
  };

  const lobbyChanged = () => {
    const l = lobby();
    broadcast({ t: 'lobby', lobby: l });
    for (const cb of lobbyCbs) cb(lobby());
  };

  room.onLink((link) => {
    let rejected = false;

    link.onMessage((ch, data) => {
      if (closed || ch !== 'ctl' || rejected) return;
      const msg = decodeClient(data);
      if (!msg) return;
      const id = members.get(link);

      if (id === undefined) {
        if (msg.t !== 'hello') return;
        const res = admit(lobby(), msg, build);
        if (!res.ok) {
          rejected = true;
          link.send('ctl', encode({ t: 'rejected', reason: res.reason }));
          setTimeout(() => link.close(), REJECT_CLOSE_MS);
          return;
        }
        members.set(link, res.id);
        remote.drop(res.id); // vaga reaproveitada: a contagem da conexão nova começa em 0
        players = ORDER.filter((p) => p === res.id || players.includes(p));
        link.send('ctl', encode({ t: 'welcome', you: res.id }));
        lobbyChanged();
        return;
      }

      switch (msg.t) {
        case 'input':
          // fora da partida também: a contagem precisa acompanhar; o start zera o que ficou pendente
          remote.set(id, msg.move, msg.pushCount);
          break;
        case 'ping':
          link.send('ctl', encode({ t: 'pong', at: msg.at }));
          break;
        case 'bye':
          link.close();
          break;
        default:
          break; // hello repetido: ignora
      }
    });

    link.onClose(() => {
      const id = members.get(link);
      if (closed || id === undefined) return;
      members.delete(link);
      remote.drop(id);
      if (started) {
        dropped.add(id);
        broadcast({ t: 'left', id });
      } else {
        players = players.filter((p) => p !== id);
        lobbyChanged();
      }
    });
  });

  return {
    code: room.code,
    label: (p) => (p === 'P1' ? 'Você' : 'Online'),
    isConnected: (p) => p === 'P1' || !dropped.has(p),
    lobby,
    onLobby(cb) { lobbyCbs.push(cb); },

    setOptions(m, r) {
      mode = m;
      rounds = r;
      lobbyChanged();
    },

    start(seed) {
      if (started || players.length < 2) return null;
      const config: GameConfig = mode === 'points'
        ? { mode, rounds, players: [...players], seed }
        : { mode, players: [...players], seed };
      started = true;
      remote.resetPending();
      lastSnapTick = null;
      dropped.clear();
      broadcast({ t: 'start', config });
      return config;
    },

    hooks() {
      return {
        remoteInputs: () => remote.next(),
        afterFrame(tick, state, events, themes) {
          if (events.length > 0) broadcast({ t: 'events', tick, events });
          if (lastSnapTick === null || tick - lastSnapTick >= SNAP_EVERY) {
            lastSnapTick = tick;
            broadcast(state.phase === 'spin' ? { t: 'snap', tick, state, themes } : { t: 'snap', tick, state }, 'snap');
          }
        },
      };
    },

    backToLobby() {
      started = false;
      players = ORDER.filter((p) => p === 'P1' || [...members.values()].includes(p));
      dropped.clear();
      lobbyChanged();
    },

    close() {
      if (closed) return;
      broadcast({ t: 'closed' });
      closed = true;
      for (const link of [...members.keys()]) link.close();
      members.clear();
      room.close();
    },
  };
}
