# Profile typography

`manrope-latin.woff2` is a local subset of **Manrope 4.505**, designed by the Manrope Project Authors and licensed under the [SIL Open Font License 1.1](OFL.txt).

- Source: [Google Fonts / Manrope](https://github.com/google/fonts/tree/c30b221beb0c1da59d563feb91ec8656a1fa972a/ofl/manrope), pinned at commit `c30b221beb0c1da59d563feb91ec8656a1fa972a`.
- Original file: [`Manrope[wght].ttf`](https://github.com/google/fonts/blob/c30b221beb0c1da59d563feb91ec8656a1fa972a/ofl/manrope/Manrope%5Bwght%5D.ttf).
- Retained variable weight range: **400–800**, default **400**.
- Retained characters: printable ASCII, Turkish letters `ÇĞİÖŞÜçğıöşü`, curly quotes, en/em dashes, ellipsis, copyright, bullets, minus, and the four cardinal arrows.
- The font does **not** contain the diagonal arrow `↗`. Draw that icon with SVG paths rather than relying on a fallback font.

The generator embeds this 17,488-byte WOFF2 directly in the SVG. Profile artwork therefore has no font CDN dependency, including when GitHub displays it as an image. The original copyright and license are retained in `OFL.txt` and in the font's name table.

## Reproduce the subset

FontTools and Brotli are required only when regenerating this font asset. The normal profile build does not need either package.

```sh
python -m pip install fonttools brotli
curl -fsSL 'https://raw.githubusercontent.com/google/fonts/c30b221beb0c1da59d563feb91ec8656a1fa972a/ofl/manrope/Manrope%5Bwght%5D.ttf' -o /tmp/profile-manrope.ttf
fonttools varLib.instancer /tmp/profile-manrope.ttf wght=400:400:800 --update-name-table --no-recalc-timestamp --output /tmp/profile-manrope-400-800.ttf
pyftsubset /tmp/profile-manrope-400-800.ttf --unicodes='U+0020-007E,U+00A0,U+00A9,U+00B7,U+00C7,U+00D6,U+00DC,U+00E7,U+00F6,U+00FC,U+011E-011F,U+0130-0131,U+015E-015F,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2190-2193,U+2212' --flavor=woff2 --layout-features='*' --name-IDs='*' --no-recalc-timestamp --output-file=assets/fonts/manrope-latin.woff2
```
