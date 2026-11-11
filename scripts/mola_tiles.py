"""Cut the MOLA MEGDR 32 px/deg topography into 10° x 10° tiles for the regional view.

Input:  data-src/megt90n000fb.img  (PDS Geosciences Node, MGS MOLA MEGDR, public domain)
        11520 x 5760, MSB int16, metres relative to the areoid, lat 90 → −90 from the top,
        lon 0 → 360 E from the left edge.
        https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg032/
Output: public/mola32/r{row}_c{col}.bin  320 x 320 little-endian int16 (metres)
        row 0..17 = lat 90..−90 in 10° bands (north first)
        col 0..35 = lon −180..180 in 10° bands (west first, scene convention)
        public/mola32/index.json  tile layout

Usage: python3 -I scripts/mola_tiles.py data-src/megt90n000fb.img public/mola32
"""
import json
import sys
from pathlib import Path

import numpy as np

PPD = 32
W, H = 360 * PPD, 180 * PPD
T = 10 * PPD


def main(src: str, out_dir: str) -> None:
    z = np.memmap(src, dtype=">i2", mode="r", shape=(H, W))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    for row in range(18):
        band = np.asarray(z[row * T : (row + 1) * T])
        band = np.roll(band, W // 2, axis=1)  # lon −180 at the left edge
        for col in range(36):
            tile = band[:, col * T : (col + 1) * T].astype("<i2")
            tile.tofile(out / f"r{row}_c{col}.bin")
            n += 1
    (out / "index.json").write_text(json.dumps({"ppd": PPD, "tileDeg": 10, "size": T, "rows": 18, "cols": 36, "dtype": "int16le", "source": "MGS MOLA MEGDR megt90n000fb (PDS)"}))
    print(f"wrote {n} tiles to {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
