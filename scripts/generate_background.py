from __future__ import annotations

from pathlib import Path
from random import Random

from PIL import Image, ImageChops, ImageDraw, ImageFilter


WIDTH = 2560
HEIGHT = 1440
OUTPUT = Path(r"C:\Users\18403\Desktop\openclaw-bg-linear-tech.png")
RNG = Random(42)


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def vertical_gradient(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    width, height = size
    top_rgb = hex_rgb(top)
    bottom_rgb = hex_rgb(bottom)
    image = Image.new("RGB", size)
    pixels = image.load()

    for y in range(height):
      t = y / max(height - 1, 1)
      row = tuple(
          round(top_rgb[channel] * (1 - t) + bottom_rgb[channel] * t)
          for channel in range(3)
      )
      for x in range(width):
          pixels[x, y] = row

    return image


def radial_glow(size: tuple[int, int], center: tuple[float, float], radius: float, color: tuple[int, int, int], alpha: int) -> Image.Image:
    width, height = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cx, cy = center
    bbox = (
        int(cx - radius),
        int(cy - radius),
        int(cx + radius),
        int(cy + radius),
    )
    draw.ellipse(bbox, fill=(*color, alpha))
    return layer.filter(ImageFilter.GaussianBlur(radius=radius * 0.28))


def add_grid(layer: Image.Image, spacing: int, color: tuple[int, int, int, int]) -> None:
    draw = ImageDraw.Draw(layer)
    width, height = layer.size
    for x in range(0, width, spacing):
        draw.line((x, 0, x, height), fill=color, width=1)
    for y in range(0, height, spacing):
        draw.line((0, y, width, y), fill=color, width=1)


def add_circuit_traces(layer: Image.Image) -> None:
    draw = ImageDraw.Draw(layer)
    line_color = (165, 177, 206, 36)
    node_color = (110, 122, 188, 92)
    width, height = layer.size

    left_traces = [
        [(120, 270), (280, 270), (280, 220), (420, 220)],
        [(120, 340), (360, 340), (360, 430), (520, 430)],
        [(100, 1010), (260, 1010), (260, 900), (430, 900)],
        [(180, 1160), (340, 1160), (340, 1280), (520, 1280)],
    ]
    right_traces = [
        [(2140, 200), (1940, 200), (1940, 310), (1760, 310)],
        [(2300, 380), (2050, 380), (2050, 500), (1830, 500)],
        [(2280, 980), (2060, 980), (2060, 860), (1840, 860)],
        [(2150, 1180), (1960, 1180), (1960, 1260), (1760, 1260)],
    ]

    for trace in left_traces + right_traces:
        draw.line(trace, fill=line_color, width=2, joint="curve")
        for point in trace:
            r = 4
            draw.ellipse((point[0] - r, point[1] - r, point[0] + r, point[1] + r), fill=node_color)

    for x, y, chip_w, chip_h in ((152, 182, 180, 96), (2042, 1086, 220, 108)):
        draw.rounded_rectangle(
            (x, y, x + chip_w, y + chip_h),
            radius=16,
            outline=(180, 190, 222, 44),
            width=2,
            fill=(255, 255, 255, 6),
        )
        pin_gap = chip_h // 6
        for pin_index in range(1, 6):
            py = y + pin_index * pin_gap
            draw.line((x - 18, py, x, py), fill=(180, 190, 222, 40), width=2)
            draw.line((x + chip_w, py, x + chip_w + 18, py), fill=(180, 190, 222, 40), width=2)

    for anchor in ((660, 220), (1840, 310), (520, 900), (1760, 1260)):
        for offset in range(1, 4):
            arc_box = (
                anchor[0] - 42 * offset,
                anchor[1] - 42 * offset,
                anchor[0] + 42 * offset,
                anchor[1] + 42 * offset,
            )
            draw.arc(arc_box, start=290, end=340, fill=(120, 131, 193, 22), width=2)


def add_center_vignette(layer: Image.Image) -> None:
    width, height = layer.size
    mask = Image.new("L", layer.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(
        (
            width * 0.18,
            height * 0.1,
            width * 0.82,
            height * 0.9,
        ),
        fill=220,
    )
    mask = mask.filter(ImageFilter.GaussianBlur(180))
    light = Image.new("RGBA", layer.size, (255, 255, 255, 0))
    light.putalpha(mask)
    light = ImageChops.multiply(light, Image.new("RGBA", layer.size, (120, 128, 170, 90)))
    layer.alpha_composite(light)


def add_fine_noise(image: Image.Image) -> Image.Image:
    noise = Image.new("RGBA", image.size, (0, 0, 0, 0))
    pixels = noise.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            value = 10 + RNG.randint(0, 12)
            alpha = 8 if (x + y) % 11 == 0 else 4
            pixels[x, y] = (value, value, value + 2, alpha)
    return Image.alpha_composite(image, noise)


def main() -> None:
    base = vertical_gradient((WIDTH, HEIGHT), "#090b11", "#0b1020").convert("RGBA")

    for glow in (
        radial_glow((WIDTH, HEIGHT), (WIDTH * 0.2, HEIGHT * 0.22), 420, hex_rgb("#5e6ad2"), 86),
        radial_glow((WIDTH, HEIGHT), (WIDTH * 0.8, HEIGHT * 0.18), 340, hex_rgb("#bac4ff"), 28),
        radial_glow((WIDTH, HEIGHT), (WIDTH * 0.72, HEIGHT * 0.78), 420, hex_rgb("#303c7b"), 70),
    ):
        base.alpha_composite(glow)

    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    add_grid(overlay, 96, (255, 255, 255, 10))
    add_grid(overlay, 24, (255, 255, 255, 4))
    add_circuit_traces(overlay)
    add_center_vignette(overlay)

    composed = Image.alpha_composite(base, overlay)
    composed = add_fine_noise(composed)
    composed = composed.filter(ImageFilter.GaussianBlur(radius=0.3))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    composed.convert("RGB").save(OUTPUT, quality=96)
    print(str(OUTPUT))


if __name__ == "__main__":
    main()
