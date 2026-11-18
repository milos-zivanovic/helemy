# branding — the app's logo

[`logo.png`](logo.png) is the master logo: the symbol on a transparent background (1254×1254 PNG). It
is the only source. Every icon the web and mobile apps use is made from it by
[`make_icons.py`](make_icons.py). Don't edit the derived files by hand: change `logo.png` and run the
script again.

## Derived files

```bash
.venv/Scripts/python.exe branding/make_icons.py     # from the repo root (the root .venv has Pillow)
```

The script trims the symbol to its visible part and centres it on a square canvas.

| File | Size | Used for |
|---|---|---|
| `web/public/favicon.png` | 64×64, transparent | Browser tab icon (`<link rel="icon">` in `web/index.html`) |
| `web/public/apple-touch-icon.png` | 180×180, opaque | "Add to Home Screen" on iOS: the symbol on the brand's dark navy (`#0d1143`), because iOS fills transparency with black and rounds the corners itself |
| `web/src/assets/logo.png` | 128×128, transparent | Logo next to the app name in the header (`web/src/components/Brand.tsx`), shown at 32 px (sharp on 2× and 4× screens) |

## Mobile (later)

The Expo app (`mobile/`) will need these, made from the same `logo.png` (add them to the script then):

- **App icon** (`icon` in `app.json`): 1024×1024, **opaque**: the symbol on `#0d1143` with about 15 %
  padding. The App Store rejects icons with transparency, and both iOS and Android apply their own
  rounded mask.
- **Android adaptive icon** (`android.adaptiveIcon`): the transparent symbol as the foreground, inside
  the central safe zone (about 66 % of the canvas, so about 25 % padding), with `backgroundColor`
  `#0d1143`.
- **Splash screen**: the transparent symbol on `#0d1143`.

The logo has fine details (coins, heart, apple). They hold up from about 32 px, but at 16 px (a browser
tab) they blur together. If a simpler mark is ever made (e.g. only the figure with the orbit), it
would suit the favicon better.
