"""One-off helper: dump Manrope advance widths per weight so the offline build can measure text.

Usage: python scripts/tools/font-metrics.py assets/fonts/manrope-latin.woff2 assets/fonts/manrope-metrics.json
Advances are in em (1.0 = font size). Kerning is ignored, so measured text must be drawn with
`font-kerning:none`.
"""
import json
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

src, dst = sys.argv[1], sys.argv[2]
out = {}
for weight in (500, 600, 650):
    font = TTFont(src)
    font = instancer.instantiateVariableFont(font, {'wght': weight}, inplace=False)
    upm = font['head'].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font['hmtx']
    out[str(weight)] = {chr(cp): round(hmtx[name][0] / upm, 4) for cp, name in sorted(cmap.items())
                        if cp >= 32 and cp != 127}
json.dump(out, open(dst, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, separators=(',', ':'))
print(dst, {k: len(v) for k, v in out.items()})
