"""Convert the MOLA MEGDR 4 px/deg topography grid into web textures for the globe.

Input:  data-src/megt90n000cb.img  (PDS Geosciences Node, MGS MOLA MEGDR, public domain)
        1440 x 720, MSB int16, metres relative to the areoid, lon 0..360 E from the left edge.
Output: public/globe/mola_height.png  8-bit grayscale height (for displacementMap)
        public/globe/mola_normal.png  tangent-space normal map (for normalMap)

Both outputs are rolled so longitude 0 sits at the image centre, matching mars_4k.jpg.

Usage: python3 -I scripts/mola_to_png.py data-src/megt90n000cb.img public/globe
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 1440, 720


def main(src: str, out_dir: str) -> None:
    z = np.fromfile(src, dtype=">i2").astype(np.float32).reshape(H, W)
    z = np.roll(z, W // 2, axis=1)  # lon 0 at centre (texture convention)
    print(f"elevation range: {z.min():.0f} .. {z.max():.0f} m")

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Height: clip the extreme peaks a little so the global relief keeps contrast.
    lo, hi = np.percentile(z, 0.1), np.percentile(z, 99.95)
    h = np.clip((z - lo) / (hi - lo), 0, 1)
    Image.fromarray((h * 255).round().astype(np.uint8), "L").resize((W * 2, H * 2), Image.BICUBIC).save(out / "mola_height.png", optimize=True)

    # Normals from the real gradients (metres per metre), exaggerated for legibility.
    R = 3389.5e3
    dx_m = 2 * np.pi * R / W * np.cos(np.deg2rad(np.linspace(89.875, -89.875, H)))[:, None]
    dy_m = np.pi * R / H
    gx = (np.roll(z, -1, axis=1) - np.roll(z, 1, axis=1)) / (2 * np.maximum(dx_m, 1e3))
    gy = (np.roll(z, 1, axis=0) - np.roll(z, -1, axis=0)) / (2 * dy_m)  # +y = north (up in texture)
    gy[0], gy[-1] = 0, 0
    ex = 25.0
    n = np.dstack([-gx * ex, -gy * ex, np.ones_like(z)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    rgb = ((n * 0.5 + 0.5) * 255).round().astype(np.uint8)
    Image.fromarray(rgb, "RGB").resize((W * 2, H * 2), Image.BICUBIC).save(out / "mola_normal.png", optimize=True)
    print("wrote", out / "mola_height.png", out / "mola_normal.png")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
