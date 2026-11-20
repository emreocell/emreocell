"""One-off helper: trace a transparent-background logo PNG into a single-path SVG.

Usage: python scripts/tools/trace-logo.py SOURCE.png assets/brand/NAME.svg [epsilon]
The build only reads the resulting SVG path; nothing here runs in CI.
"""
import sys
import cv2
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
eps = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6
img = cv2.imread(src, cv2.IMREAD_UNCHANGED)
alpha = img[:, :, 3] if img.shape[2] == 4 else (255 - cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
mask = (alpha > 128).astype(np.uint8) * 255
ys, xs = np.where(mask > 0)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
mask = mask[y0:y1, x0:x1]
contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
parts = []
for c in contours:
    c = cv2.approxPolyDP(c, eps, True)[:, 0, :]
    if len(c) < 3:
        continue
    pts = ' L'.join(f'{x} {y}' for x, y in c)
    parts.append(f'M{pts}Z')
w, h = x1 - x0, y1 - y0
d = ''.join(parts)
open(dst, 'w', encoding='utf-8', newline='\n').write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><path fill-rule="evenodd" d="{d}"/></svg>\n')
print(f'{dst}: {w}x{h}, {len(contours)} contours, {len(d)} bytes of path')
