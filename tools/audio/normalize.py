#!/usr/bin/env python3
"""Normaliza os WAV: música ≈ -16 LUFS (limitada a -1 dBFS), efeitos com pico em -3 dBFS.
Uso: normalize.py <wav-in> <wav-out>"""
import sys, os, re, subprocess
import numpy as np
from scipy.io import wavfile

def lufs(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    return float(re.findall(r'I:\s+(-?\d+\.\d+) LUFS', r.stderr)[-1])

src, dst = sys.argv[1:3]
for kind in ('sfx', 'music'):
    os.makedirs(f'{dst}/{kind}', exist_ok=True)
    for f in sorted(os.listdir(f'{src}/{kind}')):
        sr, x = wavfile.read(f'{src}/{kind}/{f}'); x = x.astype(np.float64)
        x -= x.mean()
        if kind == 'sfx':
            x *= 10 ** (-3 / 20) / np.abs(x).max()
        else:
            tmp = f'{dst}/{kind}/_t.wav'
            wavfile.write(tmp, sr, x.astype(np.float32))
            x *= 10 ** ((-16 - lufs(tmp)) / 20)
            for _ in range(3):  # limitador suave: tanh acima de -1 dBFS, depois remedir
                lim = 10 ** (-1 / 20)
                x = np.where(np.abs(x) > lim * 0.7, np.sign(x) * (lim * 0.7 + (lim - lim * 0.7) * np.tanh((np.abs(x) - lim * 0.7) / (lim - lim * 0.7))), x)
                wavfile.write(tmp, sr, x.astype(np.float32))
                x *= 10 ** ((-16 - lufs(tmp)) / 20)
            x = np.clip(x, -lim, lim)
            os.remove(tmp)
        wavfile.write(f'{dst}/{kind}/{f}', sr, x.astype(np.float32))
