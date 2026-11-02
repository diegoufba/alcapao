#!/usr/bin/env python3
"""Codifica os WAV normalizados em .ogg (vorbis) e .mp3. Nos efeitos, o pico decodificado
(que sobe um pouco com a compressão com perdas) é medido e o ganho ajustado para ficar em -3 dBFS.
Uso: encode.py <wav-normalizado> <public/audio>"""
import sys, os, re, subprocess

def run(*a): return subprocess.run(a, capture_output=True, text=True)

def peak(path):
    r = run('ffmpeg', *(['-f', 'mp3'] if path.endswith('.mp3') else []), '-i', path, '-af', 'volumedetect', '-f', 'null', '-')
    return float(re.findall(r'max_volume: (-?[\d.]+) dB', r.stderr)[-1])

src, dst = sys.argv[1:3]
for kind in ('sfx', 'music'):
    os.makedirs(f'{dst}/{kind}', exist_ok=True)
    for f in sorted(os.listdir(f'{src}/{kind}')):
        name = f[:-4]
        for ext, args in (('ogg', ['-c:a', 'libvorbis', '-q:a', '3' if kind == 'sfx' else '4']),
                          ('mp3', ['-c:a', 'libmp3lame', '-b:a', '96k' if kind == 'sfx' else '112k'])):
            out = f'{dst}/{kind}/{name}.{ext}'
            gain = 0.0
            for _ in range(4):
                r = run('ffmpeg', '-y', '-i', f'{src}/{kind}/{f}', '-af', f'volume={gain}dB', *args, out)
                if r.returncode: sys.exit(r.stderr)
                if kind == 'music': break
                p = peak(out)
                if abs(p + 3) <= 0.35: break
                gain -= p + 3
