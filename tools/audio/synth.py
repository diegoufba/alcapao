#!/usr/bin/env python3
"""Gera proceduralmente todos os sons do Alçapão (CC0). Uso: synth.py <pasta-de-saída-wav>

Produz <out>/sfx/<id>.wav e <out>/music/<faixa>.wav (44,1 kHz, float, mono).
Pipeline: synth.py <wav> -> normalize.py <wav> <wav-norm> (loudness) -> encode.py <wav-norm> <public/audio> (.ogg/.mp3, exige ffmpeg).
"""
import sys, os
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
rng = np.random.default_rng(14)


def tt(d): return np.arange(int(d * SR)) / SR
def midi(n): return 440.0 * 2 ** ((n - 69) / 12)


def osc(kind, f, d=None, t=None):
    """f pode ser escalar ou array (frequência instantânea)."""
    if t is None: t = tt(d)
    f = np.broadcast_to(np.asarray(f, float), t.shape)
    ph = 2 * np.pi * np.cumsum(f) / SR
    if kind == 'sine': return np.sin(ph)
    if kind == 'square': return np.sign(np.sin(ph)) * 0.6
    if kind == 'pulse': return np.where((ph / (2 * np.pi)) % 1 < 0.25, 1.0, -1.0) * 0.6
    if kind == 'saw': return 2 * ((ph / (2 * np.pi)) % 1) - 1
    if kind == 'tri': return 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1) - 1) - 1
    raise ValueError(kind)


def env(n, a=0.003, d=None, curve=4.0):
    t = np.arange(n) / SR
    dur = n / SR
    d = dur - a if d is None else d
    e = np.minimum(t / max(a, 1e-4), 1.0) * np.exp(-curve * np.clip(t - a, 0, None) / max(d, 1e-3))
    fade = min(int(0.004 * SR), n // 4)
    if fade: e[-fade:] *= np.linspace(1, 0, fade)
    return e


def noise(d): return rng.uniform(-1, 1, int(d * SR))


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'lowpass', fs=SR, output='sos'), x)
def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'highpass', fs=SR, output='sos'), x)


def sweep(f0, f1, d, curve='exp'):
    t = tt(d); x = t / d
    return f0 * (f1 / f0) ** x if curve == 'exp' else f0 + (f1 - f0) * x


def seq(parts, gap=0.0):
    """Concatena (ou sobrepõe, com gap<0) trechos."""
    out = np.zeros(0)
    for p in parts:
        if gap >= 0:
            out = np.concatenate([out, p, np.zeros(int(gap * SR))])
        else:
            o = int(-gap * SR); n = max(len(out) - o, 0)
            end = n + len(p)
            if end > len(out): out = np.concatenate([out, np.zeros(end - len(out))])
            out[n:end] += p
    return out


def mix(*xs):
    n = max(len(x) for x in xs); out = np.zeros(n)
    for x in xs: out[:len(x)] += x
    return out


def note(kind, f, d, a=0.004, curve=4.0, g=1.0):
    return osc(kind, f, d) * env(int(d * SR), a, None, curve) * g


# ------------------------------------------------------------------ SFX
def sfx_all():
    S = {}
    S['roleta-clique'] = mix(note('square', 2200, 0.035, 0.001, 6) * 0.5, bp(noise(0.035), 2000, 6000) * env(int(0.035 * SR), 0.0005, None, 8) * 0.7)
    S['roleta-para'] = mix(
        osc('sine', sweep(320, 110, 0.35), 0.35) * env(int(0.35 * SR), 0.003, None, 7),
        note('tri', 880, 0.5, 0.003, 5) * 0.4, note('tri', 1320, 0.5, 0.003, 5) * 0.25)
    S['pergunta'] = seq([note('square', midi(m), 0.1, 0.004, 3, 0.45) for m in (72, 76, 79)] + [note('square', midi(84), 0.3, 0.004, 3, 0.5)])
    S['tick'] = mix(note('sine', 1000, 0.07, 0.001, 6), note('square', 2000, 0.03, 0.001, 8) * 0.25)
    S['tick-final'] = mix(note('sine', 1600, 0.16, 0.001, 4), note('square', 3200, 0.05, 0.001, 8) * 0.3)
    S['trava'] = mix(osc('square', sweep(700, 180, 0.22), 0.22) * env(int(0.22 * SR), 0.002, None, 5) * 0.5,
                     osc('sine', sweep(160, 60, 0.25), 0.25) * env(int(0.25 * SR), 0.002, None, 6))
    w = noise(0.35)
    sw = bp(w, 400, 4000) * np.sin(np.pi * np.linspace(0, 1, len(w))) ** 1.5
    S['empurrao'] = sw
    S['impacto'] = mix(osc('sine', sweep(180, 45, 0.25), 0.25) * env(int(0.25 * SR), 0.001, None, 6),
                       lp(noise(0.08), 3000) * env(int(0.08 * SR), 0.0005, None, 8) * 0.6)
    w2 = bp(noise(0.25), 1500, 6000) * np.sin(np.pi * np.linspace(0, 1, int(0.25 * SR))) ** 2
    S['empurrao-vazio'] = w2
    S['colisao'] = mix(osc('sine', sweep(240, 110, 0.12), 0.12) * env(int(0.12 * SR), 0.001, None, 8),
                       lp(noise(0.03), 2500) * env(int(0.03 * SR), 0.0005, None, 8) * 0.4)
    rise = osc('saw', sweep(200, 1600, 0.45), 0.45) * env(int(0.45 * SR), 0.05, 0.4, 1.0) * 0.25
    chord = sum(note('square', midi(m), 0.5, 0.004, 3, 0.2) for m in (72, 76, 79, 84))
    S['revelacao'] = mix(rise, np.concatenate([np.zeros(int(0.3 * SR)), chord]))
    creak = np.zeros(int(0.7 * SR))
    for k in range(6):
        s = int((0.02 + k * 0.07) * SR); n = int(0.05 * SR)
        creak[s:s + n] += bp(noise(0.05), 200 + 60 * k, 900 + 80 * k) * env(n, 0.002, None, 5)
    thud = np.concatenate([np.zeros(int(0.45 * SR)), osc('sine', sweep(120, 40, 0.25), 0.25) * env(int(0.25 * SR), 0.002, None, 5)])
    S['alcapao'] = mix(creak * 1.5, thud, lp(np.concatenate([np.zeros(int(0.45 * SR)), noise(0.15) * env(int(0.15 * SR), 0.001, None, 6)]), 1200) * 0.5)
    t = tt(1.0)
    fall = osc('sine', sweep(1100, 140, 0.85) * (1 + 0.03 * np.sin(2 * np.pi * 9 * tt(0.85))), 0.85) * env(int(0.85 * SR), 0.02, None, 2.5)
    S['queda'] = mix(np.concatenate([fall, np.zeros(int(0.15 * SR))]),
                     np.concatenate([np.zeros(int(0.85 * SR)), osc('sine', sweep(110, 45, 0.15), 0.15) * env(int(0.15 * SR), 0.001, None, 5)]) * 0.9)
    S['acerto'] = seq([note('square', midi(79), 0.09, 0.003, 3, 0.45), note('square', midi(86), 0.4, 0.003, 4, 0.5)])
    S['pontos'] = seq([note('square', midi(83), 0.06, 0.002, 4, 0.45), note('square', midi(88), 0.28, 0.002, 5, 0.45)])
    wom = lambda f0, f1: osc('saw', sweep(f0, f1, 0.28), 0.28) * env(int(0.28 * SR), 0.01, None, 2.5)
    S['anulada'] = lp(seq([wom(300, 200), wom(250, 150)], 0.04), 1500)
    S['ui-navegar'] = note('square', 950, 0.04, 0.001, 6, 0.5)
    S['ui-confirmar'] = seq([note('square', 620, 0.05, 0.002, 5, 0.5), note('square', 930, 0.12, 0.002, 4, 0.5)])
    S['ui-voltar'] = seq([note('square', 700, 0.04, 0.002, 5, 0.5), note('square', 460, 0.1, 0.002, 4, 0.5)])
    S['jogador-entrou'] = seq([note('square', midi(m), 0.08, 0.003, 3, 0.45) for m in (79, 84)] + [note('square', midi(88), 0.2, 0.003, 4, 0.45)])
    S['jogador-saiu'] = seq([note('square', midi(m), 0.08, 0.003, 3, 0.45) for m in (88, 84)] + [note('square', midi(76), 0.2, 0.003, 4, 0.45)])
    return S


# ------------------------------------------------------------------ MÚSICA
class Track:
    def __init__(self, bpm, bars, tail_bars=1):
        self.bpm, self.bars = bpm, bars
        self.beat = 60 / bpm
        self.total = int((bars + tail_bars) * 4 * self.beat * SR) + SR
        self.buf = np.zeros(self.total)

    def put(self, beat_pos, x):
        s = int(beat_pos * self.beat * SR)
        e = min(s + len(x), self.total)
        if s < self.total: self.buf[s:e] += x[:e - s]

    def loop(self):
        n = int(self.bars * 4 * self.beat * SR)
        out = self.buf[:n].copy()
        tail = self.buf[n:]
        out[:len(tail[:n])] += tail[:n]  # a cauda dos últimos compassos volta ao início
        return out


def kick(l=0.18):
    return osc('sine', sweep(150, 45, l), l) * env(int(l * SR), 0.001, None, 5) * 1.0
def snare(l=0.16):
    return mix(bp(noise(l), 1500, 7000) * env(int(l * SR), 0.001, None, 5) * 0.7, osc('tri', 190, l) * env(int(l * SR), 0.001, None, 8) * 0.4)
def hat(l=0.04, o=False):
    l = 0.18 if o else l
    return hp(noise(l), 7000) * env(int(l * SR), 0.0005, None, 6 if o else 10) * 0.35


def pluck(f, d, kind='pulse', g=0.3, curve=5.0):
    return osc(kind, f, d) * env(int(d * SR), 0.003, None, curve) * g


def chiptune(name, bpm, bars, prog, scale_root, minor, style):
    """prog: lista de (grau-raiz MIDI do acorde, tipo 'maj'/'min') por compasso, repetida."""
    T = Track(bpm, bars)
    scale = [0, 2, 3, 5, 7, 8, 10] if minor else [0, 2, 4, 5, 7, 9, 11]
    def tones(root, kind): return [root, root + (3 if kind == 'min' else 4), root + 7]
    # 4 compassos de frase; sessões A (0-15) e B (16-): melodia gerada com motivo repetido
    def phrase(seed, density):
        r = np.random.default_rng(seed); notes = []
        for b in range(4):
            root, kind = prog[b % len(prog)]
            ct = tones(root + 12, kind)
            for s in range(8):  # colcheias
                if r.random() < density:
                    if s % 2 == 0 and r.random() < 0.7: n = ct[r.integers(0, 3)] + (12 if r.random() < 0.25 else 0)
                    else: n = scale_root + 12 + scale[r.integers(0, 7)] + (12 if r.random() < 0.3 else 0)
                    notes.append((b * 4 + s * 0.5, n, 0.5 if r.random() < 0.7 else 1.0))
        return notes
    phrases = {'A': phrase(style['seedA'], style['dens']), 'B': phrase(style['seedB'], style['dens'] + 0.1)}
    form = style['form']  # um símbolo por bloco de 4 compassos
    for blk in range(bars // 4):
        sec = form[blk % len(form)]
        b0 = blk * 16
        for bar in range(4):
            root, kind = prog[(blk * 4 + bar) % len(prog)] if style.get('prog_per_bar', True) else prog[bar % len(prog)]
            bb = b0 + bar * 4
            tn = tones(root, kind)
            # baixo
            for s in range(style['bass_div']):
                step = 4 / style['bass_div']
                f = midi(tn[0] - 12) if (s % 4 != 3 or style['bass_div'] == 4) else midi(tn[2] - 12)
                T.put(bb + s * step, osc('tri', f, 0.9 * step * T.beat) * env(int(0.9 * step * T.beat * SR), 0.004, None, 3) * 0.55)
            # arpejo
            if style['arp']:
                arp = tn + [tn[0] + 12]
                for s in range(8):
                    T.put(bb + s * 0.5, pluck(midi(arp[s % 4] + 12 + style['arp_oct']), 0.35 * T.beat * 2, 'pulse', style['arp_g'], 6))
            # pad
            if style['pad']:
                for n in tn:
                    d = 4 * T.beat
                    T.put(bb, osc('tri', midi(n), d) * np.minimum(np.linspace(0, 1, int(d * SR)) * 8, 1) * np.minimum(np.linspace(1, 0, int(d * SR)) * 8, 1) * 0.12)
            # bateria
            dr = style['drums']
            if dr:
                for beat in range(4):
                    if dr == 'four' or (dr == 'half' and beat in (0, 2)) or dr == 'soft' and beat == 0:
                        T.put(bb + beat, kick() * (0.9 if dr != 'soft' else 0.5))
                    if dr in ('four', 'half') and beat in (1, 3): T.put(bb + beat, snare() * 0.8)
                    if dr in ('four', 'half', 'soft'):
                        T.put(bb + beat, hat() * (0.6 if dr == 'soft' else 1))
                        T.put(bb + beat + 0.5, hat(o=(beat == 3)) * (0.5 if dr == 'soft' else 0.8))
                if dr == 'four' and bar == 3:  # virada
                    for k in range(4): T.put(bb + 3 + k * 0.25, snare(0.08) * (0.4 + 0.15 * k))
        # melodia
        if style['mel']:
            for (bt, n, ln) in phrases[sec]:
                T.put(b0 + bt, pluck(midi(n + style['mel_oct']), ln * T.beat * 1.1, 'square', style['mel_g'], 3.5))
    return T.loop()


def vitoria():
    T = Track(120, 2, 1)
    tn = [(72, 0), (76, 0.5), (79, 1), (84, 1.5)]
    for n, b in tn: T.put(b, pluck(midi(n), 0.4, 'square', 0.35, 3))
    for k, (n, b) in enumerate([(84, 2), (86, 2.5), (88, 3), (91, 3.5)]): T.put(b, pluck(midi(n), 0.4, 'square', 0.35, 3))
    T.put(4, sum(pluck(midi(n), 2.2, 'square', 0.28, 1.4) for n in (72, 76, 79, 84)))
    T.put(4, osc('tri', midi(48), 2.2) * env(int(2.2 * SR), 0.005, None, 1.4) * 0.6)
    T.put(0, kick() * 0.9); T.put(2, kick() * 0.9); T.put(1, snare() * 0.6); T.put(3, snare() * 0.6); T.put(4, kick())
    for b in range(0, 8): T.put(b * 1.0 * 0.5 * 2 / 2, hat() * 0.7)
    out = T.buf[: int(4.0 * SR)].copy()
    fade = int(0.25 * SR); out[-fade:] *= np.linspace(1, 0, fade)
    return out


def music_all():
    M = {}
    # partida: 120 BPM, dó maior, 32 compassos = 64 s
    M['partida'] = chiptune('partida', 120, 32,
        [(48, 'maj'), (45, 'min'), (41, 'maj'), (43, 'maj')], 60, False,
        dict(seedA=1, seedB=2, dens=0.6, form='AABA', bass_div=8, arp=True, arp_oct=0, arp_g=0.14, pad=False, drums='four', mel=True, mel_oct=0, mel_g=0.2))
    # morte súbita: 150 BPM, lá menor, 40 compassos = 64 s
    M['morte-subita'] = chiptune('morte-subita', 150, 40,
        [(45, 'min'), (41, 'maj'), (43, 'maj'), (40, 'maj')], 57, True,
        dict(seedA=5, seedB=9, dens=0.75, form='ABABAABB', bass_div=8, arp=True, arp_oct=0, arp_g=0.16, pad=False, drums='four', mel=True, mel_oct=0, mel_g=0.2))
    # menu: 90 BPM, fá maior, 24 compassos ≈ 64 s
    M['menu'] = chiptune('menu', 90, 24,
        [(41, 'maj'), (50, 'min'), (46, 'maj'), (48, 'maj')], 65, False,
        dict(seedA=21, seedB=22, dens=0.35, form='AB', bass_div=2, arp=True, arp_oct=0, arp_g=0.11, pad=True, drums='soft', mel=True, mel_oct=0, mel_g=0.14))
    M['vitoria'] = vitoria()
    return M


def write(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    wavfile.write(path, SR, x.astype(np.float32))


if __name__ == '__main__':
    out = sys.argv[1]
    for k, v in sfx_all().items(): write(f'{out}/sfx/{k}.wav', v)
    for k, v in music_all().items(): write(f'{out}/music/{k}.wav', v)
    print('ok')
