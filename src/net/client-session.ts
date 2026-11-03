import type { GameConfig } from '../core/game';
import type { PlayerId, Question } from '../core/types';
import type { HudSlots } from '../input/match-input';
import { createRemoteSource } from '../sim/remote';
import type { PushCounter } from '../sim/remote';
import type { SimSource } from '../sim/source';
import { bankHash, decodeHost, encode, PROTOCOL_VERSION } from './protocol';
import type { ClientMsg, LobbyInfo } from './protocol';
import { createSnapshotBuffer } from './snapshots';
import type { SnapshotBuffer } from './snapshots';
import { NetError } from './transport';
import type { Link } from './transport';

export interface ClientSession extends HudSlots {
  readonly you: PlayerId;
  lobby(): LobbyInfo;
  onLobby(cb: (l: LobbyInfo) => void): void;
  onStart(cb: (config: GameConfig) => void): void;
  onClosed(cb: (why: 'host-left') => void): void;
  /** Fonte da partida atual: a mesma até o próximo 'start', que cria buffer e fonte novos. */
  source(): SimSource;
  /** Ida e volta do último ping, em ms; Infinity antes do primeiro pong. */
  rtt(): number;
  /** Segundos desde o último snapshot; Infinity antes do primeiro. */
  snapshotAge(): number;
  /** Manda 'bye' e fecha. */
  close(): void;
}

const PING_MS = 1000;
const DELAY_TICKS = 6; // 100 ms de atraso de desenho

/** Entra na sala por um link já aberto: manda 'hello' e resolve no 'welcome'; 'rejected' vira NetError. */
export function joinSession(link: Link, bank: Question[]): Promise<ClientSession> {
  return new Promise((resolve, reject) => {
    let session: ClientSession | null = null;
    let you: PlayerId | null = null;
    let lobbyInfo: LobbyInfo = { players: [], mode: 'survival', rounds: 12, started: false };
    let buffer: SnapshotBuffer | null = null;
    let current: SimSource | null = null;
    const pushes: PushCounter = { count: 0 }; // vale a conexão inteira: o host guarda a contagem por conexão
    let rtt = Infinity;
    let ended = false; // o link acabou (por nós ou pelo host)
    let ping: ReturnType<typeof setInterval> | null = null;
    const left = new Set<PlayerId>();
    const lobbyCbs: ((l: LobbyInfo) => void)[] = [];
    const startCbs: ((c: GameConfig) => void)[] = [];
    const closedCbs: ((why: 'host-left') => void)[] = [];

    const send = (m: ClientMsg) => link.send('ctl', encode(m));

    const finish = () => {
      ended = true;
      if (ping !== null) clearInterval(ping);
      ping = null;
    };

    const hostLeft = () => {
      if (ended) return;
      finish();
      if (!session) reject(new NetError('network'));
      else for (const cb of closedCbs) cb('host-left');
    };

    link.onClose(hostLeft);

    link.onMessage((_ch, data) => {
      if (ended) return;
      const msg = decodeHost(data);
      if (!msg) return;

      if (!session) {
        if (msg.t === 'welcome') {
          you = msg.you;
          session = build(msg.you);
          ping = setInterval(() => send({ t: 'ping', at: Date.now() }), PING_MS);
          resolve(session);
        } else if (msg.t === 'rejected') {
          finish();
          reject(new NetError(msg.reason));
          link.close();
        }
        return;
      }

      switch (msg.t) {
        case 'lobby':
          lobbyInfo = msg.lobby;
          if (!lobbyInfo.started) left.clear();
          for (const cb of lobbyCbs) cb({ ...lobbyInfo, players: [...lobbyInfo.players] });
          break;
        case 'start':
          buffer = createSnapshotBuffer({ delayTicks: DELAY_TICKS });
          current = newSource(buffer);
          left.clear();
          lobbyInfo = { ...lobbyInfo, started: true };
          for (const cb of startCbs) cb(msg.config);
          break;
        case 'snap':
          buffer?.pushSnap(msg.tick, msg.state, msg.themes);
          break;
        case 'events':
          buffer?.pushEvents(msg.tick, msg.events);
          break;
        case 'pong':
          rtt = Date.now() - msg.at;
          break;
        case 'left':
          left.add(msg.id);
          break;
        case 'closed':
          hostLeft();
          link.close();
          break;
        default:
          break;
      }
    });

    send({ t: 'hello', protocol: PROTOCOL_VERSION, build: bankHash(bank) });

    function newSource(buf: SnapshotBuffer): SimSource {
      return createRemoteSource(buf, you!, (move, pushCount) => {
        if (!ended) send({ t: 'input', move, pushCount });
      }, pushes);
    }

    function build(me: PlayerId): ClientSession {
      return {
        you: me,
        label: (p) => (p === you ? 'Você' : 'Online'),
        isConnected: (p) => !left.has(p),
        lobby: () => ({ ...lobbyInfo, players: [...lobbyInfo.players] }),
        onLobby(cb) { lobbyCbs.push(cb); },
        onStart(cb) { startCbs.push(cb); },
        onClosed(cb) { closedCbs.push(cb); },
        source() {
          if (!current) {
            buffer ??= createSnapshotBuffer({ delayTicks: DELAY_TICKS });
            current = newSource(buffer);
          }
          return current;
        },
        rtt: () => rtt,
        snapshotAge: () => buffer?.age() ?? Infinity,
        close() {
          if (ended) return;
          send({ t: 'bye' });
          finish();
          link.close();
        },
      };
    }
  });
}
