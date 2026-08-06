#!/usr/bin/env python3
"""Prepare the chanter fingering diagrams for the web.

Takes the scanned charts, trims the surrounding paper, flattens them to clean
black-on-white line art and writes small indexed PNGs.

    python3 tools/make-fingerings.py ~/Downloads
"""
import os
import sys
from PIL import Image, ImageOps

SOURCES = [
    ("low-g.jpg", "low-g"),
    ("low-a.jpg", "low-a"),
    ("B.jpg", "b"),
    ("C.jpg", "c"),
    ("D.jpg", "d"),
    ("E.jpg", "e"),
    ("F.jpg", "f"),
    ("high-G.jpg", "high-g"),
    ("high-A.jpg", "high-a"),
]

TARGET_H = 640      # tall enough to stay crisp on a retina card
MARGIN = 14
THRESHOLD = 150     # scans are grey-ish; anything darker is ink


def main(src_dir, out_dir="fingerings"):
    os.makedirs(out_dir, exist_ok=True)
    for src, name in SOURCES:
        path = os.path.join(src_dir, src)
        im = ImageOps.grayscale(Image.open(path))

        # flatten the scan to pure black and white
        bw = im.point(lambda p: 0 if p < THRESHOLD else 255, mode="L")

        # trim the paper around the drawing
        ink = ImageOps.invert(bw)
        box = ink.getbbox()
        if box:
            l, t, r, b = box
            l, t = max(0, l - MARGIN), max(0, t - MARGIN)
            r, b = min(bw.width, r + MARGIN), min(bw.height, b + MARGIN)
            bw = bw.crop((l, t, r, b))

        # scale to a consistent height
        w = round(bw.width * TARGET_H / bw.height)
        bw = bw.resize((w, TARGET_H), Image.LANCZOS)

        bw.convert("P", palette=Image.ADAPTIVE, colors=16).save(
            os.path.join(out_dir, name + ".png"), optimize=True
        )
        size = os.path.getsize(os.path.join(out_dir, name + ".png"))
        print(f"{name:8} {bw.width}x{bw.height}  {size/1024:.1f} KB")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads"))
