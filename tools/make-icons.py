#!/usr/bin/env python3
"""Generate the PWA icon set: a note on a staff, in the app's colours.

Run from the project root:  python3 tools/make-icons.py
"""
import os
from PIL import Image, ImageDraw

CREAM = (243, 236, 232, 255)
INK = (42, 33, 32, 255)
STAFF = (217, 203, 196, 255)

SS = 4  # supersample factor for smooth edges


def draw_icon(size, maskable=False):
    S = size * SS
    img = Image.new("RGBA", (S, S), CREAM)
    d = ImageDraw.Draw(img)

    # maskable icons get their art pulled into the safe zone (inner 80%)
    art = 0.62 if maskable else 0.80
    pad = S * (1 - art) / 2

    line_w = max(1, int(S * 0.016))
    step = (S * art * 0.42) / 4
    stem_h = step * 3.6
    # centre the whole mark — staff plus the stem rising above it
    staff_top = (S - (step * 4)) / 2 + stem_h * 0.28

    for i in range(5):
        y = staff_top + i * step
        d.line([(pad, y), (S - pad, y)], fill=STAFF, width=line_w)

    # note head sits on the 2nd space, stem up
    cy = staff_top + step * 2.5
    cx = pad + (S - 2 * pad) * 0.56
    rx = S * art * 0.115
    ry = S * art * 0.082

    head = Image.new("RGBA", (int(rx * 2) + 4, int(ry * 2) + 4), (0, 0, 0, 0))
    ImageDraw.Draw(head).ellipse([2, 2, rx * 2, ry * 2], fill=INK)
    head = head.rotate(22, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(head, (int(cx - head.width / 2), int(cy - head.height / 2)))

    stem_w = max(2, int(S * 0.020))
    d.rectangle([cx + rx * 0.58, cy - stem_h, cx + rx * 0.58 + stem_w, cy], fill=INK)

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs("icons", exist_ok=True)
    for size in (192, 512):
        draw_icon(size).save(f"icons/icon-{size}.png")
    for size in (192, 512):
        draw_icon(size, maskable=True).save(f"icons/icon-{size}-maskable.png")
    draw_icon(180).save("icons/apple-touch-icon.png")
    draw_icon(32).save("icons/favicon-32.png")
    print("wrote icons/ ->", sorted(os.listdir("icons")))


if __name__ == "__main__":
    main()
