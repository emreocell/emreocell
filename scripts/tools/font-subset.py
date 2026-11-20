"""One-off helper: build the small panel font (ASCII text, wght 500-650 only) from the full font.

Usage: python scripts/tools/font-subset.py assets/fonts/manrope-latin.woff2 assets/fonts/manrope-panel.woff2
The many small SVG slices of the profile embed this instead of the full font.
"""
import io
import os
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

src, dst = sys.argv[1], sys.argv[2]
font = instancer.instantiateVariableFont(TTFont(src), {'wght': (500, 650)}, inplace=False)
buf = io.BytesIO()
font.save(buf)
buf.seek(0)
font = TTFont(buf)  # reload: lazily loaded variation tables confuse the subsetter otherwise
chars = ''.join(chr(c) for c in range(32, 127)) + '·—’‘'
options = subset.Options()
options.flavor = 'woff2'
options.layout_features = ['kern']
options.hinting = False
options.notdef_outline = False
options.name_IDs = [0, 1, 2, 3, 4, 6, 13, 14]
sub = subset.Subsetter(options)
sub.populate(text=chars)
sub.subset(font)
font.flavor = 'woff2'
font.save(dst)
print(dst, os.path.getsize(dst), 'bytes')
