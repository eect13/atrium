"""Rasterize a crisp Atrium mark into PNG/ICO sizes."""
from pathlib import Path
from math import cos, sin, pi

try:
    from PIL import Image, ImageDraw
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT_TAURI = ROOT / "src-tauri" / "icons"
OUT_PUB = ROOT / "public"
OUT_TAURI.mkdir(parents=True, exist_ok=True)
OUT_PUB.mkdir(parents=True, exist_ok=True)

# Mark paths in 32x32 viewBox (from atrium-mark.tsx)
# We'll draw a filled rounded tile + chevron + ring at high res.

def draw_mark(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # dark tile
    r = max(4, size // 8)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=(18, 18, 20, 255))
    # scale 32 viewBox -> inner pad
    pad = size * 0.14
    s = (size - 2 * pad) / 32.0
    def xy(x, y):
        return pad + x * s, pad + y * s
    # ring as two ellipses (evenodd)
    # ring ellipse outer 13.5 x 4.7 at cy=16, inner 11 x 2.25
    cx, cy = xy(16, 16)
    # chevron: M16 4.4 26.8 27.6h-5.3L16 12.4 10.5 27.6H5.2Z
    chev = [xy(16, 4.4), xy(26.8, 27.6), xy(21.5, 27.6), xy(16, 12.4), xy(10.5, 27.6), xy(5.2, 27.6)]
    d.polygon(chev, fill=(245, 245, 247, 255))
    # thin ring
    for t in range(0, 360, 2):
        rad = t * pi / 180
        # skip, draw ellipse outline
    ox, oy = 13.5 * s, 4.7 * s
    ix, iy = 11 * s, 2.25 * s
    # draw ring as thick ellipse
    bbox = [cx - ox, cy - oy, cx + ox, cy + oy]
    d.ellipse(bbox, outline=(245, 245, 247, 255), width=max(2, int(size * 0.035)))
    return img

def save_png(img: Image.Image, path: Path):
    img.save(path, "PNG")
    print("wrote", path, path.stat().st_size)

sizes = {
    32: OUT_TAURI / "32x32.png",
    64: OUT_TAURI / "64x64.png",
    128: OUT_TAURI / "128x128.png",
    256: OUT_TAURI / "128x128@2x.png",
    512: OUT_TAURI / "icon.png",
}
for sz, path in sizes.items():
    save_png(draw_mark(sz), path)

# public PWA
save_png(draw_mark(192), OUT_PUB / "icon-192.png")
save_png(draw_mark(512), OUT_PUB / "icon-512.png")
save_png(draw_mark(180), OUT_PUB / "apple-touch-icon.png")

# multi-size ICO (Windows)
ico_sizes = [16, 24, 32, 48, 64, 128, 256]
frames = [draw_mark(s) for s in ico_sizes]
frames[0].save(OUT_TAURI / "icon.ico", format="ICO", sizes=[(s, s) for s in ico_sizes], append_images=frames[1:])
print("wrote ico", (OUT_TAURI / "icon.ico").stat().st_size)
