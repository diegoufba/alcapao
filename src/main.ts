import '@fontsource/titan-one/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './ui/styles.css';
import { createScene } from './render/scene';
import { validateBank } from './core/questions';
import type { Question } from './core/types';
import type { GameConfig } from './core/game';
import { KeyboardInput, type DeviceId } from './input/keyboard';
import { GamepadInput, type PadLike } from './input/gamepad';
import { DeviceSlots } from './input/devices';
import { applyPadChanges } from './input/connection';
import { safeStorage } from './storage';
import { createMatchController } from './match';
import { createLocalSource } from './sim/local';
import type { SimSource } from './sim/source';
import { deviceInput, type MatchInput } from './input/match-input';
import { anyDeviceInput } from './input/any-input';
import { hostRoom, joinRoom, NetError } from './net/transport';
import { createHostSession, type HostSession } from './net/host-session';
import { joinSession, type ClientSession } from './net/client-session';
import { normalizeRoomCode } from './net/room-code';
import { createRouter, type Screen } from './ui/router';
import { createNav, emitUi, onUiEvent, PadNav, type PadEvent } from './ui/nav';
import { createPressStart } from './ui/press-start';
import { createMenu } from './ui/menu';
import { createOptions } from './ui/options';
import { createJoin } from './ui/join';
import { createResults } from './ui/results';
import { createPause } from './ui/pause';
import { createError } from './ui/error';
import type { ScreenCtl } from './ui/dom';
import { AudioDirector, type UiEvent } from './audio/director';
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from './audio/settings';
import { loadLibrary } from './audio/library';
import { Mixer } from './audio/mixer';

const params = new URLSearchParams(location.search);
const showcase = import.meta.env.DEV ? params.get('showcase') : null; // vitrine só em desenvolvimento

const RESULTS_DELAY = 1.2; // s entre o último RESET e a tela de resultados
const MODIFIER_CODES = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock']);

/** Carrega e valida o banco; devolve a mensagem de erro (pt-BR) quando não há perguntas utilizáveis. */
async function loadBank(): Promise<{ bank: Question[]; error: string | null }> {
  try {
    const raw: unknown = import.meta.env.DEV && params.get('bank') === 'empty'
      ? { version: 1, questions: [] }
      : (await import('./data/questions.json')).default;
    const { questions: bank, rejected } = validateBank(raw);
    for (const r of rejected) console.warn(`[perguntas] rejeitada #${r.index}: ${r.reason}`);
    if (bank.length === 0) return { bank, error: 'O banco de perguntas está vazio ou inválido. Não há com o que jogar.' };
    return { bank, error: null };
  } catch {
    return { bank: [], error: 'Não foi possível carregar o banco de perguntas. Verifique a conexão e tente de novo.' };
  }
}

async function runGame(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;
  const canvas = document.createElement('canvas');
  const hudRoot = document.createElement('div');
  hudRoot.className = 'is-hidden';
  const fpsEl = document.createElement('div');
  fpsEl.className = 'fps';
  const devEl = document.createElement('div'); // código da sala nos atalhos de desenvolvimento do online
  devEl.className = 'dev-online';
  const ui = document.createElement('div');
  ui.id = 'ui';
  app.replaceChildren(canvas, hudRoot, fpsEl, ui, devEl);

  await Promise.all([document.fonts.load('40px "Titan One"'), document.fonts.load('700 40px Nunito'), document.fonts.load('800 40px Nunito')]);
  const { renderer, scene, camera, resize, update: updateScene } = createScene(canvas);
  const { bank, error } = await loadBank();

  const storage = safeStorage(); // uma única instância, repassada às telas
  const keyboard = new KeyboardInput();
  const gamepad = new GamepadInput();
  const padNav = new PadNav();
  const nav = createNav();
  const router = createRouter();
  const match = createMatchController({ scene, hudRoot, keyboard, gamepad });

  // --- áudio ---------------------------------------------------------------
  // O AudioContext só nasce no primeiro input da press-start (política de autoplay dos navegadores).
  let audioSettings: AudioSettings = loadAudioSettings(storage);
  let actx: AudioContext | null = null;
  let mixer: Mixer | null = null;
  const director = new AudioDirector();
  const uiQueue: UiEvent[] = [];
  onUiEvent((e) => { uiQueue.push(e); });

  function applyAudioSettings(next: AudioSettings): void {
    audioSettings = next;
    mixer?.setSettings(next);
    saveAudioSettings(storage, next);
  }
  let audioFailed = false; // new AudioContext() lançou: não tenta de novo a cada tecla
  function syncAudioHint(): void {
    document.body.dataset.audio = audioFailed || actx?.state === 'running' ? 'on' : 'locked';
  }
  function wakeAudio(): void {
    if (!actx && !audioFailed) {
      try {
        const ctx = new AudioContext();
        actx = ctx;
        ctx.addEventListener('statechange', syncAudioHint);
        void loadLibrary(ctx).then((lib) => {
          const m = new Mixer(ctx, lib);
          m.setSettings(audioSettings);
          mixer = m;
        }).catch((err: unknown) => { console.warn('[audio] falha ao carregar os sons', err); });
      } catch (err) {
        audioFailed = true;
        console.warn('[audio] indisponível', err);
      }
    }
    if (actx && actx.state === 'suspended') void actx.resume().then(syncAudioHint, () => undefined);
    syncAudioHint();
  }
  for (const type of ['keydown', 'pointerdown'] as const) window.addEventListener(type, wakeAudio, { capture: true });
  syncAudioHint();

  /** Parâmetros da rota `match` para uma partida offline: fonte local + dispositivos. */
  function matchParams(config: GameConfig, devices: DeviceSlots): { source: SimSource; input: MatchInput; devices: DeviceSlots } {
    return { source: createLocalSource(config, bank), input: deviceInput(devices, keyboard, gamepad), devices };
  }

  let overTimer = -1; // contagem até a tela de resultados (<0 = inativa)
  let activeDevices: DeviceSlots | null = null; // jogadores da partida em andamento
  /** Sessão online ativa (host ou cliente); null no offline. */
  let online: { kind: 'host'; session: HostSession } | { kind: 'client'; session: ClientSession } | null = null;
  /** A partida atual (e a tela de resultados dela) é online. Nasce na entrada em `match` e morre fora de match/results. */
  let matchOnline = false;

  /** Fecha a sessão online, se houver, e volta ao offline. */
  function leaveOnline(): void {
    online?.session.close();
    online = null;
    devEl.textContent = '';
  }

  // --- telas ---------------------------------------------------------------
  const pressStart = createPressStart();
  const menu = createMenu({ nav, storage, onPlay: () => { leaveOnline(); router.go('join'); }, onOptions: () => router.go('options') });
  const options = createOptions({
    nav,
    get: () => audioSettings,
    set: applyAudioSettings,
    testSfx: () => mixer?.apply({ type: 'sfx', id: 'acerto', bus: 'sfx' }),
    onBack: () => router.go('menu'),
  });
  const join = createJoin({
    keyboard,
    isPadConnected: (d) => gamepad.isConnected(d),
    onStart: (config, devices) => { router.go('match', matchParams(config, devices)); },
    onBack: () => router.go('menu'),
  });
  const results = createResults({
    nav,
    storage,
    onAgain: () => {
      // online: o host volta todos ao lobby (espera o Espaço); o cliente só espera o próximo 'start'
      if (!matchOnline) router.go('join', { keep: true });
      else if (online?.kind === 'host') { online.session.backToLobby(); router.go('menu'); }
    },
    onMenu: () => { if (matchOnline) leaveOnline(); router.go('menu'); },
  });
  const pause = createPause(nav, resumeMatch, () => { resumeMatch(); router.go('menu'); });
  const errorScreen = createError(nav);
  const noop: ScreenCtl = { el: document.createElement('div'), show() {}, hide() {} };
  const screens: Record<Screen, ScreenCtl> = { 'press-start': pressStart, menu, options, join, match: noop, results };
  ui.append(pressStart.el, menu.el, options.el, join.el, results.el, pause.el, errorScreen.el);

  function pauseMatch(): void {
    if (matchOnline) return; // online não pausa
    if (router.current() !== 'match' || match.isPaused() || match.isOver() || overTimer >= 0) return;
    match.pause();
    pause.show();
  }
  function resumeMatch(): void {
    if (!match.isPaused()) return;
    pause.hide();
    match.resume();
    keyboard.reset(); // teclas soltas durante a pausa não podem ficar "presas"
    gamepad.reset();
  }

  router.onChange((s, p, from) => {
    screens[from].hide();
    document.body.dataset.screen = s;
    hudRoot.classList.toggle('is-hidden', s !== 'match');
    activeDevices = null;
    if (s === 'match') {
      const { source, input, devices, online: isOnline } = p as { source: SimSource; input: MatchInput; devices?: DeviceSlots; online?: boolean };
      activeDevices = devices ?? null;
      matchOnline = isOnline === true;
      overTimer = -1;
      match.start(source, input);
      nav.setActive(null);
    } else if (from === 'match') {
      match.stop();
    }
    if (s !== 'match' && s !== 'results') matchOnline = false;
    screens[s].show(p);
  });

  // --- clique/Enter em qualquer botão da interface soa como "confirmar" ------
  ui.addEventListener('click', (e) => { if ((e.target as Element).closest('button')) emitUi('confirmar'); });

  // --- teclado ---------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const s = router.current();
    if (e.code === 'F1') { e.preventDefault(); const on = !fpsEl.classList.contains('is-on'); fpsEl.classList.toggle('is-on', on); match.setDebug(on); return; }
    if (e.code === 'KeyM') { if (!e.repeat) { applyAudioSettings({ ...audioSettings, muted: !audioSettings.muted }); options.sync(); } return; }
    if (e.code === 'KeyN' && fpsEl.classList.contains('is-on') && s === 'match') { match.skipPhase(); return; }
    if (errorScreen.el.hidden === false) { if (nav.key(e.code)) e.preventDefault(); return; }

    // atalho do host online: Espaço/Enter começa a partida (enquanto não há tela de lobby)
    if (online?.kind === 'host' && (s === 'press-start' || s === 'menu') && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      if (!e.repeat) hostStart();
      return;
    }
    if (s === 'press-start') {
      if (e.repeat || MODIFIER_CODES.has(e.code) || e.code === 'Tab' || /^F\d+$/.test(e.code)) return;
      e.preventDefault();
      emitUi('confirmar');
      router.go('menu');
      return;
    }
    if (s === 'match' && !match.isPaused()) {
      if (e.code === 'Escape') { e.preventDefault(); pauseMatch(); return; }
      if (keyboard.keyDown(e.code)) e.preventDefault();
      return;
    }
    const isDir = e.code.startsWith('Arrow') || e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD';
    if (e.repeat && !(isDir && s !== 'join')) { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') e.preventDefault(); return; }
    if (s === 'join') { if (join.key(e.code)) e.preventDefault(); return; }
    if (nav.key(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keyboard.keyUp(e.code);
    // o clique nativo do Espaço sai no keyup: a navegação já tratou no keydown
    if (router.current() !== 'match' && (e.code === 'Space' || e.code === 'Enter')) e.preventDefault();
  });
  window.addEventListener('blur', () => { keyboard.reset(); pauseMatch(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseMatch(); });

  // --- escala da interface (desenhada em 1280x720) -------------------------
  const onResize = (): void => {
    resize();
    ui.style.setProperty('--ui-scale', String(Math.min(window.innerWidth / 1280, window.innerHeight / 720)));
  };
  window.addEventListener('resize', onResize);
  onResize();

  // --- gamepads ---------------------------------------------------------------
  function handlePads(now: number): void {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) as (PadLike | null)[] : [];
    const poll = gamepad.poll(pads);
    const events: PadEvent[] = padNav.poll(pads, now);
    const s = router.current();
    if (s === 'join') for (const d of poll.disconnected) join.padDisconnected(d);
    else if (s === 'match' && activeDevices) for (const e of applyPadChanges(activeDevices, poll, s)) emitUi(e);

    if (errorScreen.el.hidden === false) { for (const e of events) nav.pad(e.kind); return; }
    if (s === 'press-start') {
      if (poll.joined.length > 0 || events.length > 0) { wakeAudio(); emitUi('confirmar'); router.go('menu'); }
      return;
    }
    if (s === 'join') { join.pads(poll.joined, events); return; }
    if (s === 'match') {
      for (const e of events) {
        if (match.isPaused()) { if (!nav.pad(e.kind) && e.kind === 'start') resumeMatch(); }
        else if (e.kind === 'start') { pauseMatch(); break; }
      }
      return;
    }
    for (const e of events) {
      nav.pad(e.kind);
      if (router.current() !== s) break; // a tela mudou: descarta o resto do quadro
    }
  }

  // --- laço principal --------------------------------------------------------
  const frames: number[] = [];
  let last = performance.now();
  renderer.setAnimationLoop((now: number) => {
    const real = (now - last) / 1000; last = now;
    frames.push(now);
    while (frames.length > 1 && now - frames[0] > 1000) frames.shift();

    handlePads(now);
    if (actx?.state === 'suspended' && navigator.getGamepads?.()?.some((p) => p?.buttons.some((b) => b.pressed))) wakeAudio();
    match.update(real);
    const activeState = router.current() === 'match' ? match.state() : null;
    updateScene(real, Boolean(activeState?.suddenDeath));

    // áudio: o diretor traduz o quadro em comandos; sem mixer (ainda carregando ou sem áudio) só descarta a fila
    const uiEvents = uiQueue.splice(0);
    const events = match.drainEvents();
    if (mixer) {
      const s = router.current();
      const cmds = director.update(Math.min(real, 0.1), { screen: s, state: s === 'match' ? match.state() : null, events, paused: match.isPaused(), uiEvents });
      for (const c of cmds) mixer.apply(c);
    }

    if (router.current() === 'match' && !match.isPaused()) {
      if (overTimer < 0 && match.isOver()) overTimer = RESULTS_DELAY;
      else if (overTimer >= 0) {
        overTimer -= Math.min(real, 0.1);
        const res = match.result();
        if (overTimer <= 0 && res) { overTimer = -1; router.go('results', res); }
      }
    }
    if (fpsEl.classList.contains('is-on')) fpsEl.textContent = fpsText(frames.length);
    renderer.render(scene, camera);
  });

  /** FPS e, no cliente online, ida e volta do ping e idade do último snapshot. */
  function fpsText(fps: number): string {
    if (online?.kind !== 'client') return `${fps} FPS`;
    const ms = (v: number) => (Number.isFinite(v) ? `${Math.round(v)} ms` : '—');
    return `${fps} FPS · RTT ${ms(online.session.rtt())} · snap ${ms(online.session.snapshotAge() * 1000)}`;
  }

  // --- online (por enquanto só pelos atalhos de desenvolvimento) --------------
  /** Host: começa a partida com quem está no lobby (precisa de 2 ou mais). */
  function hostStart(): void {
    if (online?.kind !== 'host') return;
    const { session } = online;
    const config = session.start(Date.now());
    if (!config) { console.info('[online] precisa de 2 jogadores ou mais para começar'); return; }
    router.go('match', { source: createLocalSource(config, bank, session.hooks()), input: anyDeviceInput('P1', keyboard, gamepad, session), online: true });
  }

  function netErrorText(err: unknown): string {
    if (!(err instanceof NetError)) return 'Não foi possível conectar.';
    switch (err.kind) {
      case 'not-found': return 'Sala não encontrada.';
      case 'full': return 'A sala está cheia.';
      case 'started': return 'Partida já começou.';
      case 'version': return 'Sua versão do jogo é diferente da do host.';
      default: return 'Não foi possível conectar.';
    }
  }

  /** Erro do online: sai da sessão, volta ao menu e mostra a tela de erro (o "Tentar de novo" recarrega sem o atalho). */
  function onlineFailed(text: string): void {
    leaveOnline();
    const url = new URL(location.href);
    url.searchParams.delete('online');
    url.searchParams.delete('sala');
    history.replaceState(null, '', url);
    router.go('menu');
    document.body.dataset.screen = 'error';
    errorScreen.show(text);
  }

  /** O atalho só assume a sessão se a pessoa ainda estiver esperando (press-start ou menu). */
  const stillWaiting = (): boolean => router.current() === 'press-start' || router.current() === 'menu';

  async function startOnlineDev(kind: string | null): Promise<void> {
    try {
      if (kind === 'host') {
        const room = await hostRoom();
        let session: HostSession;
        try {
          session = createHostSession(room, bank);
        } catch (err) {
          room.close();
          throw err;
        }
        if (!stillWaiting()) { session.close(); return; } // foi jogar offline enquanto a sala abria
        online = { kind: 'host', session };
        console.info('[online] sala', room.code);
        const show = () => {
          const n = session.lobby().players.length;
          devEl.textContent = `Sala ${room.code} · ${n} ${n === 1 ? 'jogador' : 'jogadores'} · Espaço começa (2+)`;
        };
        session.onLobby(show);
        show();
      } else if (kind === 'join') {
        const code = normalizeRoomCode(params.get('sala') ?? '');
        if (!code) throw new NetError('not-found');
        const session = await joinSession(await joinRoom(code), bank);
        if (!stillWaiting()) { session.close(); return; }
        online = { kind: 'client', session };
        devEl.textContent = `Sala ${code} · você é ${session.you} · esperando o host`;
        session.onStart(() => {
          if (online?.session !== session) return; // sessão já fechada: não sequestra a tela
          router.go('match', { source: session.source(), input: anyDeviceInput(session.you, keyboard, gamepad, session), online: true });
        });
        session.onClosed(() => { if (online?.session === session) onlineFailed('A conexão com o host caiu.'); });
      }
    } catch (err) {
      console.warn('[online]', err);
      if (stillWaiting()) onlineFailed(netErrorText(err));
    }
  }
  // avisa os outros na hora em vez de esperar o timeout da conexão
  window.addEventListener('pagehide', () => { online?.session.close(); });

  // --- partida rápida para testes (só em desenvolvimento) ---------------------
  if (error) {
    document.body.dataset.screen = 'error';
    errorScreen.show(error);
  } else if (import.meta.env.DEV && params.has('quick')) {
    const quick = params.get('quick');
    const n = Math.min(Math.max(Number(params.get('players')) || 2, 1), 4);
    const devices = new DeviceSlots();
    (['kb-wasd', 'kb-arrows', 'kb-ijkl', 'gp-0'] as DeviceId[]).slice(0, n).forEach((d) => devices.join(d));
    const players = devices.players();
    const seed = Date.now();
    const rounds = Number(params.get('rounds'));
    const config: GameConfig = quick === 'points'
      ? { mode: 'points', rounds: rounds === 12 || rounds === 16 ? rounds : 8, players, seed }
      : { mode: 'survival', players, seed };
    router.go('match', matchParams(config, devices));
  } else if (import.meta.env.DEV && params.has('online')) {
    document.body.dataset.screen = 'press-start';
    pressStart.show();
    void startOnlineDev(params.get('online'));
  } else {
    document.body.dataset.screen = 'press-start';
    pressStart.show();
  }
}

/** Falha na partida de largada (ex.: WebGL indisponível): mostra a tela de erro em vez de ficar em branco. */
function showStartupError(err: unknown): void {
  console.error('[start]', err);
  const app = document.querySelector<HTMLDivElement>('#app');
  const ui = document.createElement('div');
  ui.id = 'ui';
  app?.replaceChildren(ui);
  const screen = createError(createNav());
  ui.append(screen.el);
  document.body.dataset.screen = 'error';
  screen.show('Não foi possível iniciar o jogo (WebGL indisponível?).');
}

if (showcase) {
  void import('./showcase').then((m) => m.runShowcase(showcase, params));
} else {
  runGame().catch(showStartupError);
}
