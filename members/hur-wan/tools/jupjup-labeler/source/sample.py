# -*- coding: utf-8 -*-
"""'예제로 체험하기'용 샘플 데이터 폴더를 만듭니다.

공원 잔디 위에 페트병·캔·종이·포장재가 떨어진 그림을 그려서 images/ 에 저장하고,
일부 이미지에는 일부러 틀린 데가 있는 'AI 자동 라벨'을 넣어 검수 연습을 할 수 있게 합니다.
"""

import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from core import atomic_write_text, unique_path

SS = 2                      # 안티에일리어싱용 슈퍼샘플링 배율
W, H = 1280, 960
CLASSES = ["plastic", "can", "paper", "general"]
LABEL_COLORS = [(34, 197, 94), (239, 68, 68), (59, 130, 246), (234, 179, 8), (168, 85, 247), (20, 184, 166)]


def _s(v):
    return int(round(v * SS))


def _canvas(w, h):
    im = Image.new("RGBA", (_s(w), _s(h)), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def _shade(im, top=0.35, edge=0.28):
    """가로로 누운 원통 느낌: 위쪽은 밝게, 위아래 가장자리는 어둡게."""
    w, h = im.size
    col_l, col_d = Image.new("L", (1, h)), Image.new("L", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        col_l.putpixel((0, y), int(255 * max(0.0, 1 - abs(t - 0.28) / 0.16) * top))
        col_d.putpixel((0, y), int(255 * (abs(t - 0.5) * 2) ** 3 * edge))
    mask = im.getchannel("A")
    for color, col in (((0, 0, 0), col_d), ((255, 255, 255), col_l)):
        layer = Image.new("RGBA", (w, h), color + (0,))
        layer.putalpha(ImageChops.multiply(col.resize((w, h)), mask))
        im.alpha_composite(layer)
    return im


def draw_bottle(rng):
    im, d = _canvas(312, 100)
    o = 4
    body = (205, 232, 246, 215)
    d.rounded_rectangle([_s(o), _s(o), _s(o + 214), _s(o + 92)], radius=_s(30), fill=body)
    d.polygon([(_s(o + 208), _s(o)), (_s(o + 252), _s(o + 28)), (_s(o + 252), _s(o + 64)), (_s(o + 208), _s(o + 92))], fill=body)
    d.rectangle([_s(o + 250), _s(o + 30), _s(o + 272), _s(o + 62)], fill=body)
    cap = rng.choice([(37, 99, 235, 255), (255, 255, 255, 255), (220, 38, 38, 255), (22, 163, 74, 255)])
    d.rounded_rectangle([_s(o + 270), _s(o + 24), _s(o + 300), _s(o + 68)], radius=_s(6), fill=cap)
    for x in (o + 278, o + 286, o + 294):
        d.line([_s(x), _s(o + 26), _s(x), _s(o + 66)], fill=(0, 0, 0, 40), width=_s(1.5))
    lc = rng.choice(LABEL_COLORS) + (255,)
    d.rectangle([_s(o + 70), _s(o), _s(o + 150), _s(o + 92)], fill=lc)
    d.rounded_rectangle([_s(o + 84), _s(o + 30), _s(o + 136), _s(o + 42)], radius=_s(4), fill=(255, 255, 255, 230))
    d.rounded_rectangle([_s(o + 90), _s(o + 50), _s(o + 128), _s(o + 58)], radius=_s(3), fill=(255, 255, 255, 170))
    for x in (o + 24, o + 46, o + 172, o + 192):
        d.line([_s(x), _s(o + 6), _s(x), _s(o + 86)], fill=(255, 255, 255, 90), width=_s(2))
    _shade(im, top=0.45, edge=0.22)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([_s(o + 14), _s(o + 14), _s(o + 200), _s(o + 21)], radius=_s(4), fill=(255, 255, 255, 150))
    return im


def draw_can(rng):
    im, d = _canvas(196, 108)
    o = 4
    main = rng.choice([(220, 38, 38), (22, 101, 52), (30, 64, 175), (24, 24, 27), (234, 88, 12)])
    d.rounded_rectangle([_s(o), _s(o), _s(o + 188), _s(o + 100)], radius=_s(12), fill=main + (255,))
    silver = (196, 201, 208, 255)
    d.rounded_rectangle([_s(o), _s(o + 2), _s(o + 16), _s(o + 98)], radius=_s(8), fill=silver)
    d.rounded_rectangle([_s(o + 172), _s(o + 2), _s(o + 188), _s(o + 98)], radius=_s(8), fill=silver)
    d.line([_s(o + 16), _s(o + 4), _s(o + 16), _s(o + 96)], fill=(120, 125, 132, 255), width=_s(2))
    d.line([_s(o + 172), _s(o + 4), _s(o + 172), _s(o + 96)], fill=(120, 125, 132, 255), width=_s(2))
    d.ellipse([_s(o + 62), _s(o + 24), _s(o + 118), _s(o + 80)], fill=(255, 255, 255, 235))
    d.ellipse([_s(o + 74), _s(o + 36), _s(o + 106), _s(o + 68)], fill=main + (255,))
    d.rectangle([_s(o + 128), _s(o + 38), _s(o + 160), _s(o + 46)], fill=(255, 255, 255, 200))
    d.rectangle([_s(o + 128), _s(o + 54), _s(o + 152), _s(o + 60)], fill=(255, 255, 255, 150))
    return _shade(im, top=0.5, edge=0.4)


def draw_cup(rng):
    im, d = _canvas(184, 142)
    o = 4
    poly = [(_s(o), _s(o + 22)), (_s(o + 160), _s(o)), (_s(o + 160), _s(o + 134)), (_s(o), _s(o + 112))]
    d.polygon(poly, fill=(246, 245, 240, 255))
    band = rng.choice([(146, 64, 14), (21, 128, 61), (190, 18, 60), (30, 58, 138)])
    d.polygon([(_s(o + 52), _s(o + 15)), (_s(o + 110), _s(o + 7)), (_s(o + 110), _s(o + 127)), (_s(o + 52), _s(o + 119))], fill=band + (255,))
    d.ellipse([_s(o + 148), _s(o), _s(o + 176), _s(o + 134)], fill=(232, 230, 222, 255))
    d.ellipse([_s(o + 154), _s(o + 8), _s(o + 172), _s(o + 126)], fill=(196, 192, 182, 255))
    return _shade(im, top=0.3, edge=0.25)


def draw_paper(rng):
    r = 74
    im, d = _canvas(r * 2 + 16, r * 2 + 16)
    c = r + 8
    pts = []
    n = 15
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.12, 0.12)
        rr = r * rng.uniform(0.62, 1.0)
        pts.append((_s(c + rr * math.cos(a)), _s(c + rr * math.sin(a))))
    d.polygon(pts, fill=(244, 241, 232, 255))
    for _ in range(5):
        a = rng.uniform(0, 2 * math.pi)
        cx, cy = c + 0.4 * r * math.cos(a), c + 0.4 * r * math.sin(a)
        tri = [(_s(c), _s(c)), (_s(cx + rng.uniform(-18, 18)), _s(cy + rng.uniform(-18, 18))),
               (_s(c + 0.8 * r * math.cos(a + 0.5)), _s(c + 0.8 * r * math.sin(a + 0.5)))]
        d.polygon(tri, fill=(120, 110, 90, 26))
    for _ in range(5):
        a1 = rng.uniform(0, 2 * math.pi)
        p1 = (_s(c + 0.7 * r * math.cos(a1)), _s(c + 0.7 * r * math.sin(a1)))
        p2 = (_s(c + rng.uniform(-12, 12)), _s(c + rng.uniform(-12, 12)))
        d.line([p1, p2], fill=(160, 152, 134, 80), width=_s(1.5))
    for k in range(4):
        y = c - 30 + k * 14
        d.line([_s(c - 34), _s(y), _s(c + 30), _s(y + 4)], fill=(70, 90, 140, 70), width=_s(2))
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    im.putalpha(Image.composite(im.getchannel("A"), Image.new("L", im.size, 0), mask))
    return im


def draw_wrapper(rng):
    im, d = _canvas(190, 104)
    o = 6
    main = rng.choice([(249, 115, 22), (234, 179, 8), (147, 51, 234), (14, 165, 233)])
    left =[(_s(o + (5 if i % 2 else 0)), _s(o + 4 + i * 11.5)) for i in range(9)]
    right = [(_s(o + 178 - (5 if i % 2 else 0)), _s(o + 96 - i * 11.5)) for i in range(9)]
    d.polygon(left + right, fill=main + (255,))
    d.rectangle([_s(o + 14), _s(o + 4), _s(o + 164), _s(o + 96)], fill=main + (255,))
    for x in (o + 14, o + 164):
        d.line([_s(x), _s(o + 4), _s(x), _s(o + 96)], fill=(255, 255, 255, 120), width=_s(2))
    d.ellipse([_s(o + 60), _s(o + 22), _s(o + 116), _s(o + 78)], fill=(220, 38, 38, 255))
    d.rounded_rectangle([_s(o + 70), _s(o + 42), _s(o + 106), _s(o + 56)], radius=_s(4), fill=(255, 255, 255, 240))
    d.rectangle([_s(o + 124), _s(o + 30), _s(o + 154), _s(o + 38)], fill=(255, 255, 255, 210))
    d.rectangle([_s(o + 124), _s(o + 48), _s(o + 148), _s(o + 54)], fill=(255, 255, 255, 160))
    for _ in range(6):
        x = rng.uniform(o + 18, o + 160)
        d.line([_s(x), _s(o + 6), _s(x + rng.uniform(-14, 14)), _s(o + 94)], fill=(255, 255, 255, 50), width=_s(2))
    return _shade(im, top=0.55, edge=0.35)


DRAWERS = {"plastic": draw_bottle, "can": draw_can, "paper": None, "general": draw_wrapper}


def _object(cls, rng):
    if cls == "paper":
        art = draw_cup(rng) if rng.random() < 0.5 else draw_paper(rng)
    else:
        art = DRAWERS[cls](rng)
    art = art.rotate(rng.uniform(0, 360), resample=Image.BICUBIC, expand=True)
    scale = rng.uniform(0.85, 1.15)
    art = art.resize((max(1, int(art.width / SS * scale)), max(1, int(art.height / SS * scale))), Image.LANCZOS)
    return art


def _grass(rng):
    base = rng.choice([(78, 124, 52), (88, 132, 60), (72, 114, 50), (96, 128, 62)])
    small = Image.new("RGB", (W // 32 + 1, H // 32 + 1))
    px = small.load()
    for y in range(small.height):
        for x in range(small.width):
            v = rng.uniform(-22, 22)
            px[x, y] = (int(base[0] + v * 0.7), int(base[1] + v), int(base[2] + v * 0.5))
    bg = small.resize((W, H), Image.BICUBIC)
    if rng.random() < 0.6:
        dirt = Image.new("RGB", (W, H), rng.choice([(168, 142, 104), (150, 128, 96)]))
        mask = Image.new("L", (W, H), 0)
        md = ImageDraw.Draw(mask)
        x0 = rng.uniform(-200, W * 0.6)
        md.polygon([(x0, -50), (x0 + 360, -50), (x0 + 520, H + 50), (x0 + 120, H + 50)], fill=200)
        mask = mask.filter(ImageFilter.GaussianBlur(40))
        bg = Image.composite(dirt, bg, mask)
    d = ImageDraw.Draw(bg)
    for _ in range(11000):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        a = rng.uniform(0, 2 * math.pi)
        ln = rng.uniform(5, 16)
        g = rng.uniform(-30, 34)
        col = (int(base[0] + g * 0.6), int(base[1] + g), int(base[2] + g * 0.4))
        d.line([(x, y), (x + ln * math.cos(a), y + ln * math.sin(a))], fill=col, width=rng.choice((1, 1, 2)))
    for _ in range(rng.randint(14, 28)):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(6, 14)
        a = rng.uniform(0, 2 * math.pi)
        col = rng.choice([(139, 90, 43), (181, 134, 61), (214, 170, 60), (120, 72, 36), (160, 120, 50)])
        pts = []
        for k in range(14):   # 끝이 뾰족한 잎 모양
            t = 2 * math.pi * k / 14
            ex, ey = r * math.cos(t), 0.42 * r * math.sin(t) * abs(math.sin(t)) ** 0.3
            pts.append((x + ex * math.cos(a) - ey * math.sin(a), y + ex * math.sin(a) + ey * math.cos(a)))
        d.polygon(pts, fill=col)
    return bg.filter(ImageFilter.GaussianBlur(0.5))


def _place(bg, art, boxes, rng):
    ab = art.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    if not ab:
        return None
    bw, bh = ab[2] - ab[0], ab[3] - ab[1]
    for _ in range(60):
        x = rng.uniform(40, W - 40 - bw)
        y = rng.uniform(40, H - 40 - bh)
        box = (x, y, x + bw, y + bh)
        if all(box[2] + 24 < b[0] or b[2] + 24 < box[0] or box[3] + 24 < b[1] or b[3] + 24 < box[1] for b in boxes):
            px, py = int(round(x - ab[0])), int(round(y - ab[1]))
            shadow = Image.new("RGBA", art.size, (0, 0, 0, 0))
            shadow.putalpha(art.getchannel("A").point(lambda v: int(v * 0.5)).filter(ImageFilter.GaussianBlur(7)))
            bg.alpha_composite(shadow, (px + 8, py + 10))
            bg.alpha_composite(art, (px, py))
            return (px + ab[0], py + ab[1], px + ab[2], py + ab[3])
    return None


def _yolo(cls, box):
    x1, y1, x2, y2 = box
    return "%d %.6f %.6f %.6f %.6f" % (cls, (x1 + x2) / 2 / W, (y1 + y2) / 2 / H, (x2 - x1) / W, (y2 - y1) / H)


README = """줍줍 라벨러 예제 데이터

이 폴더는 '예제로 체험하기'로 만든 연습용 데이터예요. 마음껏 그리고 지워 보세요.

- images/        공원 바닥 그림 6장
- labels/        YOLO 라벨 (park_04 ~ park_06 에는 'AI 자동 라벨'이 들어 있어요)
- classes.txt    클래스 목록 (plastic, can, paper, general)

park_04 는 맞는 라벨, park_05 는 클래스가 틀린 박스와 헐렁한 박스,
park_06 은 빠진 물체와 잘못 잡힌 박스가 있어요. 찾아서 고쳐 보세요!
"""


def documents_dir():
    if os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes
            buf = ctypes.create_unicode_buffer(wintypes.MAX_PATH)
            if ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buf) == 0 and os.path.isdir(buf.value):
                return buf.value
        except Exception:  # noqa: BLE001
            pass
    p = os.path.join(os.path.expanduser("~"), "Documents")
    return p if os.path.isdir(p) else os.path.expanduser("~")


def make_sample_dataset(parent=None, seed=7):
    parent = parent or documents_dir()
    root = unique_path(os.path.join(parent, "줍줍 라벨러 예제"))
    os.makedirs(os.path.join(root, "images"))
    os.makedirs(os.path.join(root, "labels"))
    atomic_write_text(os.path.join(root, "classes.txt"), "\n".join(CLASSES) + "\n")
    atomic_write_text(os.path.join(root, "README.txt"), README)
    rng = random.Random(seed)
    plans = [
        ["plastic", "can"],
        ["plastic", "paper", "general"],
        ["can", "paper", "plastic"],
        ["plastic", "can", "general"],
        ["can", "plastic", "paper"],
        ["general", "plastic", "can"],
    ]
    for i, plan in enumerate(plans, start=1):
        bg = _grass(rng).convert("RGBA")
        placed = []
        for cls in plan:
            box = _place(bg, _object(cls, rng), [b for _, b in placed], rng)
            if box:
                placed.append((CLASSES.index(cls), box))
        name = "park_%02d" % i
        bg.convert("RGB").save(os.path.join(root, "images", name + ".jpg"), quality=90)
        lines = []
        if i == 4:      # 정답 그대로
            lines = [_yolo(c, b) for c, b in placed]
        elif i == 5:    # 첫 박스는 클래스가 틀리고, 둘째 박스는 헐렁함
            for k, (c, b) in enumerate(placed):
                if k == 0:
                    c = (c + 1) % len(CLASSES)
                if k == 1:
                    x1, y1, x2, y2 = b
                    pw, ph = (x2 - x1) * 0.18, (y2 - y1) * 0.18
                    b = (max(0, x1 - pw), max(0, y1 - ph), min(W, x2 + pw * 1.6), min(H, y2 + ph * 1.4))
                lines.append(_yolo(c, b))
        elif i == 6:    # 하나 빠지고, 엉뚱한 곳에 박스 하나
            for k, (c, b) in enumerate(placed):
                if k != 1:
                    lines.append(_yolo(c, b))
            lines.append(_yolo(1, (60, H - 200, 190, H - 90)))
        if lines:
            atomic_write_text(os.path.join(root, "labels", name + ".txt"), "\n".join(lines) + "\n")
    return root
