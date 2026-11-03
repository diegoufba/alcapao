import type { Mode, PlayerId, PlayerInput, Question } from './core/types';
import type { GamepadInput } from './input/gamepad';
import type { KeyboardInput } from './input/keyboard';
import type { TouchInput } from './input/touch';
import type { HudSlots, MatchInput } from './input/match-input';
import { anyDeviceInput } from './input/any-input';
import { createLocalSource } from './sim/local';
import { hostRoom, joinRoom } from './net/transport';
import { createHostSession, type HostSession } from './net/host-session';
import { joinSession, type ClientSession } from './net/client-session';
import type { LobbyInfo, Rounds } from './net/protocol';
import type { Router } from './ui/router';
import type { LobbyParams } from './ui/lobby';
import { NET_ERROR_TEXT, netErrorText } from './ui/net-errors';

interface OnlineDeps {
  bank: Question[];
  keyboard: KeyboardInput;
  gamepad: GamepadInput;
  /** Controles na tela do modo toque: o jogador local também lê daqui. */
  touch: TouchInput;
  router: Router;
  /** O overlay online está aberto: o boneco local recebe input parado. */
  inputBlocked(): boolean;
  /** A sala mudou com a tela de lobby aberta. */
  lobbyChanged(l: LobbyInfo): void;
  /** Falha de rede (ao conectar ou queda do host); a sessão já foi encerrada. */
  failed(text: string): void;
}

export interface OnlineFlow {
  /** Cria a sala e vai ao lobby. */
  host(): Promise<void>;
  /** Entra na sala e vai ao lobby. */
  join(code: string): Promise<void>;
  /** Fecha a sala (host) ou sai dela (cliente), e descarta uma conexão ainda em andamento. */
  leave(): void;
  role(): 'host' | 'client' | null;
  /** O jogador local na sala (o host é o P1), ou null sem sessão. */
  you(): PlayerId | null;
  /** Host: começa a partida (precisa de 2 jogadores ou mais). */
  start(): void;
  /** Host: troca modo e rodadas. */
  setOptions(mode: Mode, rounds: Rounds): void;
  /** Host: leva todos de volta ao lobby. */
  backToLobby(): void;
  /** Linha extra do debug (F1) no cliente: RTT e idade do último snapshot. */
  debugText(): string | null;
  /** Cliente: true quando faz mais de 2 s que não chega snapshot do host. */
  hostStalled(): boolean;
}

const STILL: PlayerInput = { move: { x: 0, z: 0 }, push: false };

/** Fiação das telas online com as sessões de host e cliente. */
export function createOnlineFlow(deps: OnlineDeps): OnlineFlow {
  const { bank, keyboard, gamepad, touch, router } = deps;
  let online: { kind: 'host'; session: HostSession } | { kind: 'client'; session: ClientSession; code: string } | null = null;
  let attempt = 0; // cada host()/join()/leave() invalida a conexão anterior ainda em andamento

  function lobbyParams(): LobbyParams | null {
    if (!online) return null;
    return online.kind === 'host'
      ? { code: online.session.code, you: 'P1', host: true, lobby: online.session.lobby() }
      : { code: online.code, you: online.session.you, host: false, lobby: online.session.lobby() };
  }
  const goLobby = (): void => router.go('lobby', lobbyParams());

  /** Entrada do jogador local: qualquer dispositivo; parada enquanto o overlay estiver aberto. */
  function matchInput(you: PlayerId, slots: HudSlots): MatchInput {
    const inner = anyDeviceInput(you, keyboard, gamepad, slots, touch);
    return {
      label: inner.label,
      isConnected: inner.isConnected,
      read() {
        const m = inner.read(); // lê sempre, para consumir o empurrão apertado no overlay
        return deps.inputBlocked() ? new Map([...m.keys()].map((p) => [p, STILL])) : m;
      },
    };
  }

  function leave(): void {
    attempt++;
    online?.session.close();
    online = null;
  }

  function fail(text: string): void {
    leave();
    deps.failed(text);
  }

  async function host(): Promise<void> {
    leave();
    const my = attempt;
    try {
      const room = await hostRoom();
      if (my !== attempt) { room.close(); return; }
      let session: HostSession;
      try {
        session = createHostSession(room, bank);
      } catch (err) {
        room.close();
        throw err;
      }
      online = { kind: 'host', session };
      console.info('[online] sala', room.code);
      session.onLobby((l) => {
        if (online?.session === session && router.current() === 'lobby') deps.lobbyChanged(l);
      });
      goLobby();
    } catch (err) {
      if (my !== attempt) return;
      console.warn('[online]', err);
      fail(netErrorText(err));
    }
  }

  async function join(code: string): Promise<void> {
    leave();
    const my = attempt;
    try {
      const link = await joinRoom(code);
      if (my !== attempt) { link.close(); return; }
      const session = await joinSession(link, bank);
      if (my !== attempt) { session.close(); return; }
      online = { kind: 'client', session, code };
      session.onLobby((l) => {
        if (online?.session !== session) return;
        const s = router.current();
        if (s === 'lobby') deps.lobbyChanged(l);
        else if (!l.started && (s === 'match' || s === 'results')) goLobby(); // o host voltou ao lobby
      });
      session.onStart(() => {
        if (online?.session !== session) return; // sessão já fechada: não sequestra a tela
        router.go('match', { source: session.source(), input: matchInput(session.you, session), online: true });
      });
      session.onClosed(() => { if (online?.session === session) fail(NET_ERROR_TEXT['host-left']); });
      goLobby();
    } catch (err) {
      if (my !== attempt) return;
      console.warn('[online]', err);
      fail(netErrorText(err));
    }
  }

  return {
    host,
    join,
    leave,
    role: () => online?.kind ?? null,
    you: () => (online ? (online.kind === 'host' ? 'P1' : online.session.you) : null),
    start() {
      if (online?.kind !== 'host') return;
      const { session } = online;
      const config = session.start(Date.now());
      if (!config) return;
      router.go('match', { source: createLocalSource(config, bank, session.hooks()), input: matchInput('P1', session), online: true });
    },
    setOptions(mode, rounds) {
      if (online?.kind === 'host') online.session.setOptions(mode, rounds);
    },
    backToLobby() {
      if (online?.kind !== 'host') return;
      online.session.backToLobby();
      goLobby();
    },
    hostStalled() {
      return online?.kind === 'client' && online.session.snapshotAge() > 2;
    },
    debugText() {
      if (online?.kind !== 'client') return null;
      const { session } = online;
      const ms = (v: number): string => (Number.isFinite(v) ? `${Math.round(v)} ms` : '—');
      return `RTT ${ms(session.rtt())} · snap ${ms(session.snapshotAge() * 1000)}`;
    },
  };
}
