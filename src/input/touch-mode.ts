export interface TouchMode {
  isOn(): boolean;
  onChange(cb: (on: boolean) => void): void;
  setOff(): void;
}

/**
 * Modo toque: liga no primeiro `pointerdown` de toque real e desliga no primeiro `keydown`
 * (ou quando `setOff` é chamado, por exemplo ao chegar botão de gamepad).
 * Mantém `is-touch` na `root` enquanto estiver ligado. Escuta em captura, como o `wakeAudio`.
 */
export function createTouchMode(target: EventTarget, root: { classList: { toggle(c: string, on: boolean): void } }): TouchMode {
  let on = false;
  const listeners: Array<(on: boolean) => void> = [];

  function set(next: boolean): void {
    if (next === on) return;
    on = next;
    root.classList.toggle('is-touch', on);
    for (const cb of listeners) cb(on);
  }

  target.addEventListener('pointerdown', (e) => {
    if ((e as PointerEvent).pointerType === 'touch') set(true);
  }, { capture: true });
  target.addEventListener('keydown', (e) => {
    // Teclado virtual do celular digitando num campo de texto: não é teclado físico, não desliga.
    const t = (e as { target?: { tagName?: string } | null }).target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    set(false);
  }, { capture: true });

  return {
    isOn: () => on,
    onChange: (cb) => { listeners.push(cb); },
    setOff: () => set(false),
  };
}
