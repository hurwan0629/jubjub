#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BBox Labeler - 사람이 직접 클래스와 bbox(사각형 박스)를 그리는 라벨링 프로그램.

실행: 같은 폴더의 run-windows.bat / run-mac.command / run-linux.sh 를 더블클릭하세요.
필요: Python 3.8 이상(tkinter 포함), Pillow(없으면 처음 실행할 때 자동 설치를 물어봅니다).
사용법은 프로그램 안의 [도움말] > [사용 설명서] (F1) 에 있습니다.
"""

import colorsys
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback

try:
    import tkinter as tk
    import tkinter.font as tkfont
    from tkinter import filedialog, messagebox, simpledialog, ttk
except ImportError:  # pragma: no cover - 환경 문제 안내용
    sys.stderr.write(
        "tkinter 를 찾을 수 없습니다.\n"
        "- Windows/Mac: https://www.python.org/downloads/ 의 공식 Python 을 설치하세요.\n"
        "- Mac(Homebrew): brew install python-tk\n"
        "- Linux: sudo apt install python3-tk\n"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# 기본 상수
# ---------------------------------------------------------------------------
APP_NAME = "BBox Labeler"
APP_VERSION = "1.0.0"
APP_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_PATH = os.environ.get("BBOX_LABELER_SETTINGS") or os.path.join(APP_DIR, "settings.json")
LOG_PATH = os.path.join(APP_DIR, "error.log")

IS_WIN = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff")
YAML_CLASS_FILES = ("data.yaml", "data.yml", "dataset.yaml")
TXT_CLASS_FILES = ("classes.txt", "obj.names")
COCO_FILES = ("annotations.json", "_annotations.coco.json", "instances.json", "coco.json")
STATE_DIRNAME = ".bbox_labeler"
SPLIT_NAMES = ("train", "val", "valid", "test")

INCLUDE_LABELED = "labeled_or_reviewed"
INCLUDE_REVIEWED = "reviewed"
INCLUDE_ALL = "all"

FILTERS = ("전체", "확인 안 한 이미지", "확인한 이미지", "박스가 있는 이미지", "박스가 없는 이미지")

# 한/영 키가 한글 상태일 때 눌린 글자를 영문 키로 바꿔 줍니다 (두벌식).
HANGUL_KEYS = {
    "ㅂ": "q", "ㅈ": "w", "ㄷ": "e", "ㄱ": "r", "ㅅ": "t", "ㅛ": "y", "ㅕ": "u", "ㅑ": "i",
    "ㅐ": "o", "ㅔ": "p", "ㅁ": "a", "ㄴ": "s", "ㅇ": "d", "ㄹ": "f", "ㅎ": "g", "ㅗ": "h",
    "ㅓ": "j", "ㅏ": "k", "ㅣ": "l", "ㅋ": "z", "ㅌ": "x", "ㅊ": "c", "ㅍ": "v", "ㅠ": "b",
    "ㅜ": "n", "ㅡ": "m",
}

DEFAULT_SETTINGS = {
    "export_format": "yolo",          # 기본 내보내기 형식: yolo | coco
    "export_include": INCLUDE_LABELED,
    "copy_images_on_export": True,    # COCO 내보내기 때 이미지 복사 여부 (YOLO 는 항상 복사)
    "export_dir": "",                 # 비어 있으면 <데이터 폴더>/export
    "autosave": True,
    "ask_class_after_draw": False,
    "show_names": True,
    "show_crosshair": True,
    "line_width": 2,
    "last_dataset": "",
    "recent": [],
    "geometry": "",
    "first_run_done": False,
}

# Pillow 는 실행 중에 불러옵니다 (없으면 설치를 제안).
Image = ImageOps = ImageTk = None


# ---------------------------------------------------------------------------
# 공통 도우미
# ---------------------------------------------------------------------------
def log_error(text):
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write("\n[%s] v%s\n%s\n" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), APP_VERSION, text))
    except OSError:
        pass


def natural_key(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def atomic_write_text(path, text):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    os.replace(tmp, path)


def load_settings():
    s = dict(DEFAULT_SETTINGS)
    try:
        with open(SETTINGS_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            for k, v in data.items():
                if k in s:
                    s[k] = v
    except (OSError, ValueError):
        pass
    return s


def save_settings(s):
    try:
        atomic_write_text(SETTINGS_PATH, json.dumps(s, ensure_ascii=False, indent=2))
    except OSError as e:
        log_error("settings save failed: %s" % e)


def class_color(i):
    if i < 0:
        return "#9e9e9e"
    h = (i * 0.618033988749895 + 0.08) % 1.0
    r, g, b = colorsys.hsv_to_rgb(h, 0.78, 0.98)
    return "#%02x%02x%02x" % (int(r * 255), int(g * 255), int(b * 255))


def text_color_for(hex_color):
    r, g, b = (int(hex_color[i:i + 2], 16) / 255.0 for i in (1, 3, 5))
    return "#000000" if (0.299 * r + 0.587 * g + 0.114 * b) > 0.6 else "#ffffff"


def open_in_file_manager(path):
    try:
        if IS_WIN:
            os.startfile(path)  # type: ignore[attr-defined]
        elif IS_MAC:
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
    except Exception as e:  # noqa: BLE001
        messagebox.showerror(APP_NAME, "폴더를 열 수 없어요.\n%s\n\n%s" % (path, e))


def unique_path(path):
    if not os.path.exists(path):
        return path
    stem, ext = os.path.splitext(path)
    n = 1
    while os.path.exists("%s_%d%s" % (stem, n, ext)):
        n += 1
    return "%s_%d%s" % (stem, n, ext)


def is_image_file(name):
    return os.path.splitext(name)[1].lower() in IMAGE_EXTS


def image_size(path):
    """EXIF 회전을 반영한 (너비, 높이). YOLO 학습 때 읽히는 기준과 같습니다."""
    with Image.open(path) as im:
        w, h = im.size
        try:
            orientation = im.getexif().get(0x0112)
        except Exception:  # noqa: BLE001
            orientation = None
    if orientation in (5, 6, 7, 8):
        w, h = h, w
    return w, h


def center_on(win, parent):
    win.update_idletasks()
    try:
        pw, ph = parent.winfo_width(), parent.winfo_height()
        px, py = parent.winfo_rootx(), parent.winfo_rooty()
    except tk.TclError:
        pw = ph = px = py = 0
    w, h = win.winfo_reqwidth(), win.winfo_reqheight()
    if pw < 50:
        pw, ph = win.winfo_screenwidth(), win.winfo_screenheight()
        px = py = 0
    x = px + max(0, (pw - w) // 2)
    y = py + max(0, (ph - h) // 3)
    win.geometry("+%d+%d" % (x, y))


# ---------------------------------------------------------------------------
# Pillow 준비 (없으면 자동 설치 제안)
# ---------------------------------------------------------------------------
def _import_pillow():
    global Image, ImageOps, ImageTk
    from PIL import Image as _Image, ImageOps as _ImageOps, ImageTk as _ImageTk
    Image, ImageOps, ImageTk = _Image, _ImageOps, _ImageTk
    Image.MAX_IMAGE_PIXELS = 400_000_000


def _console_python():
    exe = sys.executable or "python"
    base = os.path.basename(exe)
    if base.lower().startswith("pythonw"):
        cand = os.path.join(os.path.dirname(exe), "python" + base[len("pythonw"):])
        if os.path.exists(cand):
            return cand
    return exe


def ensure_pillow(root):
    try:
        _import_pillow()
        return True
    except ImportError:
        pass
    if not messagebox.askyesno(
        APP_NAME,
        "이미지를 여는 데 필요한 구성요소(Pillow)가 설치되어 있지 않아요.\n\n"
        "지금 자동으로 설치할까요? (인터넷 연결 필요, 보통 1분 이내)",
    ):
        return False

    win = tk.Toplevel(root)
    win.title(APP_NAME)
    ttk.Label(win, text="Pillow 를 설치하고 있어요. 잠시만 기다려 주세요...", padding=20).pack()
    bar = ttk.Progressbar(win, mode="indeterminate", length=280)
    bar.pack(padx=20, pady=(0, 20))
    bar.start(12)
    center_on(win, root)

    result = {"done": False, "ok": False, "out": ""}

    def work():
        exe = _console_python()
        in_venv = sys.prefix != getattr(sys, "base_prefix", sys.prefix)
        cmds = [[exe, "-m", "pip", "install", "pillow"]]
        if not in_venv:
            cmds.append([exe, "-m", "pip", "install", "--user", "pillow"])
        flags = 0x08000000 if IS_WIN else 0  # CREATE_NO_WINDOW
        for cmd in cmds:
            try:
                p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   stdin=subprocess.DEVNULL, creationflags=flags, timeout=900)
                result["out"] += p.stdout.decode("utf-8", "replace")
                if p.returncode == 0:
                    result["ok"] = True
                    break
            except Exception as e:  # noqa: BLE001
                result["out"] += "\n%s" % e
        result["done"] = True

    threading.Thread(target=work, daemon=True).start()
    while not result["done"]:
        root.update()
        time.sleep(0.05)
    win.destroy()

    if result["ok"]:
        try:
            import importlib
            import site
            importlib.invalidate_caches()
            user_site = site.getusersitepackages()
            if user_site and user_site not in sys.path:
                sys.path.append(user_site)
            _import_pillow()
            return True
        except Exception:  # noqa: BLE001
            messagebox.showinfo(APP_NAME, "설치가 끝났어요. 프로그램을 한 번 껐다가 다시 켜 주세요.")
            return False
    log_error("pip install pillow failed:\n" + result["out"])
    messagebox.showerror(
        APP_NAME,
        "Pillow 자동 설치에 실패했어요.\n\n"
        "명령 프롬프트(터미널)에서 아래 한 줄을 직접 실행한 뒤 다시 켜 주세요.\n\n"
        "    python -m pip install pillow\n\n"
        "자세한 내용: %s" % LOG_PATH,
    )
    return False


# ---------------------------------------------------------------------------
# 클래스 파일 읽기
# ---------------------------------------------------------------------------
def _strip_yaml_comment(line):
    quote = None
    for i, ch in enumerate(line):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "'\"":
            quote = ch
        elif ch == "#" and (i == 0 or line[i - 1] in " \t"):
            return line[:i]
    return line


def _unquote(s):
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "'\"":
        s = s[1:-1]
    return s


def _names_dict_to_list(d):
    if not d:
        return []
    n = max(d) + 1
    return [str(d.get(i, "class%d" % i)) for i in range(n)]


def parse_yaml_names(text):
    """PyYAML 이 없을 때 쓰는 간단한 names 파서."""
    lines = text.splitlines()
    for i, raw in enumerate(lines):
        line = _strip_yaml_comment(raw)
        m = re.match(r"^names\s*:\s*(.*)$", line)
        if not m:
            continue
        rest = m.group(1).strip()
        if rest.startswith("[") or rest.startswith("{"):
            close = "]" if rest.startswith("[") else "}"
            buf, j = rest, i
            while close not in buf and j + 1 < len(lines):
                j += 1
                buf += " " + _strip_yaml_comment(lines[j]).strip()
            inner = buf[1:buf.rindex(close)] if close in buf else buf[1:]
            items = re.findall(r"""\s*("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,]+)\s*(?:,|$)""", inner)
            items = [x for x in items if x.strip()]
            if close == "]":
                return [_unquote(x) for x in items]
            d = {}
            for it in items:
                mm = re.match(r"^\s*(\d+)\s*:\s*(.*)$", it)
                if mm:
                    d[int(mm.group(1))] = _unquote(mm.group(2))
            return _names_dict_to_list(d)
        if rest:
            return None
        lst, d = [], {}
        for raw2 in lines[i + 1:]:
            l2 = _strip_yaml_comment(raw2)
            s = l2.strip()
            if not s:
                continue
            if not raw2[:1].isspace() and not s.startswith("-"):
                break
            if s.startswith("-"):
                lst.append(_unquote(s[1:]))
            else:
                mm = re.match(r"^(\d+)\s*:\s*(.*)$", s)
                if not mm:
                    break
                d[int(mm.group(1))] = _unquote(mm.group(2))
        if lst:
            return lst
        if d:
            return _names_dict_to_list(d)
        return None
    return None


def read_names_from_yaml(path):
    with open(path, encoding="utf-8-sig") as f:
        text = f.read()
    try:
        import yaml  # type: ignore
        data = yaml.safe_load(text)
        names = data.get("names") if isinstance(data, dict) else None
        if isinstance(names, dict):
            return _names_dict_to_list({int(k): v for k, v in names.items()})
        if isinstance(names, list):
            return [str(n) for n in names]
        return None
    except ImportError:
        return parse_yaml_names(text)
    except Exception:  # noqa: BLE001 - yaml 문법 오류 등은 간단 파서로 다시 시도
        return parse_yaml_names(text)


def read_names_from_txt(path):
    with open(path, encoding="utf-8-sig") as f:
        return [ln.strip() for ln in f if ln.strip()]


def read_json(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# 라벨 데이터
# ---------------------------------------------------------------------------
class Box(object):
    """이미지 픽셀 좌표의 박스 (x1, y1) ~ (x2, y2)."""
    __slots__ = ("cls", "x1", "y1", "x2", "y2")

    def __init__(self, cls, x1, y1, x2, y2):
        self.cls, self.x1, self.y1, self.x2, self.y2 = int(cls), float(x1), float(y1), float(x2), float(y2)

    def copy(self):
        return Box(self.cls, self.x1, self.y1, self.x2, self.y2)

    def rect(self):
        return (min(self.x1, self.x2), min(self.y1, self.y2), max(self.x1, self.x2), max(self.y1, self.y2))

    def normalize(self):
        self.x1, self.y1, self.x2, self.y2 = self.rect()

    def area(self):
        x1, y1, x2, y2 = self.rect()
        return (x2 - x1) * (y2 - y1)

    def contains(self, x, y):
        x1, y1, x2, y2 = self.rect()
        return x1 <= x <= x2 and y1 <= y <= y2


class LabelRead(object):
    def __init__(self, entries=None, source=None, bad=0, polygon=False):
        self.entries = entries or []   # [(cls, nx1, ny1, nx2, ny2)] 0~1 비율
        self.source = source           # "txt" | "coco" | None
        self.bad = bad
        self.polygon = polygon


def read_yolo_file(path):
    entries, bad, poly = [], 0, False
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        for line in f:
            parts = line.split()
            if not parts:
                continue
            try:
                nums = [float(p) for p in parts]
            except ValueError:
                bad += 1
                continue
            if any(v != v for v in nums) or nums[0] < 0:
                bad += 1
                continue
            cls, vals = int(nums[0]), nums[1:]
            if len(vals) in (4, 5):        # 박스 (+신뢰도)
                cx, cy, w, h = vals[:4]
                entries.append((cls, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2))
            elif len(vals) >= 6 and len(vals) % 2 == 0:   # 폴리곤 -> 감싸는 박스
                xs, ys = vals[0::2], vals[1::2]
                entries.append((cls, min(xs), min(ys), max(xs), max(ys)))
                poly = True
            else:
                bad += 1
    return entries, bad, poly


def count_label_lines(path):
    n = 0
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        for line in f:
            if line.strip():
                n += 1
    return n


class DatasetError(Exception):
    pass


class Dataset(object):
    """데이터 폴더 하나 (images/, labels/, 클래스 파일, COCO 파일, 작업 상태)."""

    def __init__(self, root):
        self.root = os.path.abspath(root)
        self.name = os.path.basename(self.root.rstrip("\\/")) or self.root
        self.images_dir = os.path.join(self.root, "images")
        self.labels_dir = os.path.join(self.root, "labels")
        self.state_dir = os.path.join(self.root, STATE_DIRNAME)
        self.class_names = []
        self.class_source = ""
        self.coco_cat_ids = None      # 클래스를 COCO 에서 읽었을 때 원래 category id
        self.coco_path = None
        self._coco_data = None
        self.coco_labels = {}         # rel -> [(cls, x1, y1, x2, y2, ref_w, ref_h)] 픽셀
        self.images = []              # images/ 기준 상대 경로 ("train/a.jpg")
        self.counts = {}              # rel -> 박스 수, 라벨 없으면 None
        self.reviewed = set()
        self.last = ""
        self.warnings = []

    # ----- 찾기 -----
    @staticmethod
    def find_class_source(root):
        for n in YAML_CLASS_FILES:
            p = os.path.join(root, n)
            if os.path.isfile(p):
                return "yaml", p
        for n in TXT_CLASS_FILES:
            p = os.path.join(root, n)
            if os.path.isfile(p):
                return "txt", p
        for n in COCO_FILES:
            p = os.path.join(root, n)
            if os.path.isfile(p):
                return "coco", p
        return None, None

    @staticmethod
    def find_coco_file(root):
        for n in COCO_FILES:
            p = os.path.join(root, n)
            if os.path.isfile(p):
                return p
        return None

    # ----- 불러오기 -----
    def load(self):
        if not os.path.isdir(self.images_dir):
            raise DatasetError("'images' 폴더가 없어요.\n%s" % self.images_dir)
        self._load_classes()
        self._scan_images()
        self._load_coco()
        self._load_state()
        self._count_all()

    def _load_classes(self):
        kind, path = self.find_class_source(self.root)
        if kind is None:
            raise DatasetError("클래스 파일(data.yaml, classes.txt, annotations.json)을 찾지 못했어요.")
        try:
            if kind == "yaml":
                names = read_names_from_yaml(path)
            elif kind == "txt":
                names = read_names_from_txt(path)
            else:
                data = read_json(path)
                self._coco_data, self.coco_path = data, path
                cats = sorted(data.get("categories") or [], key=lambda c: c.get("id", 0))
                names = [str(c.get("name", "class%d" % c.get("id", 0))) for c in cats]
                self.coco_cat_ids = [c.get("id") for c in cats]
        except Exception as e:  # noqa: BLE001
            raise DatasetError("클래스 파일을 읽을 수 없어요.\n%s\n\n%s" % (path, e))
        if not names:
            raise DatasetError("클래스 파일에 클래스가 하나도 없어요.\n%s" % path)
        self.class_names = [str(n) for n in names]
        self.class_source = os.path.basename(path)

    def _scan_images(self):
        out = []
        for dirpath, dirnames, filenames in os.walk(self.images_dir):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            for fn in filenames:
                if is_image_file(fn) and not fn.startswith("."):
                    rel = os.path.relpath(os.path.join(dirpath, fn), self.images_dir).replace(os.sep, "/")
                    out.append(rel)
        out.sort(key=natural_key)
        self.images = out
        stems = {}
        for rel in out:
            stems.setdefault(os.path.splitext(rel)[0].lower(), []).append(rel)
        dup = [v for v in stems.values() if len(v) > 1]
        if dup:
            self.warnings.append("확장자만 다른 같은 이름 이미지가 %d쌍 있어요 (예: %s). 라벨 파일이 겹치니 이름을 바꿔 주세요."
                                 % (len(dup), ", ".join(dup[0])))

    def _load_coco(self):
        path = self.coco_path or self.find_coco_file(self.root)
        if not path:
            return
        try:
            data = self._coco_data if self._coco_data is not None else read_json(path)
        except Exception as e:  # noqa: BLE001
            self.warnings.append("COCO 파일을 읽을 수 없어요: %s (%s)" % (os.path.basename(path), e))
            return
        self._coco_data = None
        if not isinstance(data, dict) or not isinstance(data.get("images"), list):
            self.warnings.append("%s 은(는) COCO 형식이 아니라서 건너뛰었어요." % os.path.basename(path))
            return
        self.coco_path = path
        cats = data.get("categories") or []
        if self.coco_cat_ids is not None:
            catmap = {cid: i for i, cid in enumerate(self.coco_cat_ids)}
        else:
            by_name = {n.strip().lower(): i for i, n in enumerate(self.class_names)}
            catmap, missing = {}, []
            for c in cats:
                nm = str(c.get("name", "")).strip()
                idx = by_name.get(nm.lower())
                if idx is None:
                    missing.append(nm)
                else:
                    catmap[c.get("id")] = idx
            if missing:
                self.warnings.append("COCO 카테고리 중 클래스 목록에 없는 이름 %d개는 무시했어요: %s"
                                     % (len(missing), ", ".join(missing[:5])))
        by_rel = {r.lower(): r for r in self.images}
        by_base = {}
        for r in self.images:
            by_base.setdefault(os.path.basename(r).lower(), []).append(r)
        img_map, unmatched = {}, 0
        for im in data["images"]:
            if not isinstance(im, dict):
                continue
            rel = self._match_coco_file(str(im.get("file_name", "")), by_rel, by_base)
            if rel is None:
                unmatched += 1
                continue
            img_map[im.get("id")] = (rel, im.get("width"), im.get("height"))
            self.coco_labels.setdefault(rel, [])
        skipped = 0
        for ann in data.get("annotations") or []:
            info = img_map.get(ann.get("image_id")) if isinstance(ann, dict) else None
            if not info:
                continue
            rel, w, h = info
            bbox = ann.get("bbox")
            idx = catmap.get(ann.get("category_id"))
            if not bbox or len(bbox) < 4 or idx is None:
                skipped += 1
                continue
            try:
                x, y, bw, bh = (float(v) for v in bbox[:4])
            except (TypeError, ValueError):
                skipped += 1
                continue
            self.coco_labels[rel].append((idx, x, y, x + bw, y + bh, w, h))
        if unmatched:
            self.warnings.append("COCO 파일의 이미지 %d개는 images 폴더에서 찾지 못해 건너뛰었어요." % unmatched)
        if skipped:
            self.warnings.append("COCO 박스 %d개는 형식이 맞지 않거나 클래스가 없어 건너뛰었어요." % skipped)

    def _match_coco_file(self, fn, by_rel, by_base):
        f = fn.replace("\\", "/").strip()
        while f.startswith("./"):
            f = f[2:]
        cands = [f]
        if os.path.isabs(fn):
            try:
                cands.append(os.path.relpath(fn, self.images_dir).replace(os.sep, "/"))
            except ValueError:
                pass
        if f.lower().startswith("images/"):
            cands.append(f[7:])
        for c in cands:
            r = by_rel.get(c.lower())
            if r:
                return r
        lst = by_base.get(os.path.basename(f).lower())
        if lst and len(lst) == 1:
            return lst[0]
        return None

    def _load_state(self):
        p = os.path.join(self.state_dir, "state.json")
        try:
            data = read_json(p)
        except (OSError, ValueError):
            return
        known = set(self.images)
        self.reviewed = set(r for r in data.get("reviewed", []) if r in known)
        self.last = data.get("last", "") if data.get("last", "") in known else ""

    def save_state(self):
        data = {"version": 1, "reviewed": sorted(self.reviewed, key=natural_key), "last": self.last}
        try:
            atomic_write_text(os.path.join(self.state_dir, "state.json"), json.dumps(data, ensure_ascii=False, indent=1))
        except OSError as e:
            log_error("state save failed: %s" % e)

    def _count_all(self):
        self.counts = {}
        for rel in self.images:
            self.counts[rel] = self._count(rel)

    def _count(self, rel):
        p = self.label_path(rel)
        if os.path.isfile(p):
            try:
                return count_label_lines(p)
            except OSError:
                return 0
        if rel in self.coco_labels:
            return len(self.coco_labels[rel])
        return None

    # ----- 경로 -----
    def image_path(self, rel):
        return os.path.join(self.images_dir, *rel.split("/"))

    def label_path(self, rel):
        stem = os.path.splitext(rel)[0]
        return os.path.join(self.labels_dir, *(stem + ".txt").split("/"))

    def has_label(self, rel):
        return self.counts.get(rel) is not None

    def splits_of(self, rels):
        tops = set()
        for r in rels:
            if "/" not in r:
                return []
            tops.add(r.split("/", 1)[0])
        if not tops or not tops.issubset(SPLIT_NAMES):
            return []
        return [s for s in SPLIT_NAMES if s in tops]

    # ----- 라벨 읽기/쓰기 -----
    def read_labels(self, rel, size=None):
        p = self.label_path(rel)
        if os.path.isfile(p):
            entries, bad, poly = read_yolo_file(p)
            return LabelRead(entries, "txt", bad, poly)
        if rel in self.coco_labels:
            out = []
            for (idx, x1, y1, x2, y2, w, h) in self.coco_labels[rel]:
                if not w or not h:
                    if size is None:
                        size = image_size(self.image_path(rel))
                    w, h = size
                out.append((idx, x1 / float(w), y1 / float(h), x2 / float(w), y2 / float(h)))
            return LabelRead(out, "coco")
        return LabelRead()

    def save_labels(self, rel, boxes, W, H):
        lines = []
        for b in boxes:
            x1, y1, x2, y2 = b.rect()
            x1, x2 = max(0.0, min(W, x1)), max(0.0, min(W, x2))
            y1, y2 = max(0.0, min(H, y1)), max(0.0, min(H, y2))
            if x2 - x1 < 1 or y2 - y1 < 1:
                continue
            lines.append("%d %.6f %.6f %.6f %.6f" % (
                b.cls, (x1 + x2) / 2.0 / W, (y1 + y2) / 2.0 / H, (x2 - x1) / W, (y2 - y1) / H))
        atomic_write_text(self.label_path(rel), "\n".join(lines) + ("\n" if lines else ""))
        self.counts[rel] = len(lines)

    def included(self, rel, include):
        if include == INCLUDE_ALL:
            return True
        if include == INCLUDE_REVIEWED:
            return rel in self.reviewed
        return rel in self.reviewed or self.has_label(rel)


# ---------------------------------------------------------------------------
# 내보내기
# ---------------------------------------------------------------------------
class ExportCancelled(Exception):
    pass


def _clamp01(v):
    return 0.0 if v < 0 else (1.0 if v > 1 else v)


def export_dataset(ds, fmt, out_parent, include, copy_images, progress=None, cancel=None):
    """데이터셋을 YOLO 또는 COCO 로 내보내고 (결과 폴더, 요약 dict) 를 돌려줍니다."""
    selected = [r for r in ds.images if ds.included(r, include)]
    if not selected:
        raise DatasetError("내보낼 이미지가 없어요. '포함할 이미지' 설정을 확인해 주세요.")
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    out = unique_path(os.path.join(out_parent, "%s_%s" % (fmt, stamp)))
    os.makedirs(out)
    nc = len(ds.class_names)
    splits = ds.splits_of(selected)
    summary = {"images": 0, "boxes": 0, "skipped_unknown": 0, "unreadable": 0}
    total = len(selected)

    def step(i):
        if cancel is not None and cancel.is_set():
            raise ExportCancelled()
        if progress:
            progress(i, total)

    if fmt == "yolo":
        for i, rel in enumerate(selected):
            step(i)
            src = ds.image_path(rel)
            dst = os.path.join(out, "images", *rel.split("/"))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            try:
                shutil.copy2(src, dst)
                lab = ds.read_labels(rel)
            except Exception:  # noqa: BLE001
                summary["unreadable"] += 1
                continue
            lines = []
            for (c, x1, y1, x2, y2) in lab.entries:
                if not 0 <= c < nc:
                    summary["skipped_unknown"] += 1
                    continue
                x1, y1, x2, y2 = _clamp01(x1), _clamp01(y1), _clamp01(x2), _clamp01(y2)
                if x2 <= x1 or y2 <= y1:
                    continue
                lines.append("%d %.6f %.6f %.6f %.6f" % (c, (x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1))
            stem = os.path.splitext(rel)[0]
            atomic_write_text(os.path.join(out, "labels", *(stem + ".txt").split("/")),
                              "\n".join(lines) + ("\n" if lines else ""))
            summary["images"] += 1
            summary["boxes"] += len(lines)
        atomic_write_text(os.path.join(out, "classes.txt"), "\n".join(ds.class_names) + "\n")
        atomic_write_text(os.path.join(out, "data.yaml"), _yolo_yaml(out, ds.class_names, splits))
    else:
        cat_ids = ds.coco_cat_ids or list(range(1, nc + 1))
        images, anns = [], []
        for i, rel in enumerate(selected):
            step(i)
            src = ds.image_path(rel)
            try:
                W, H = image_size(src)
                lab = ds.read_labels(rel, size=(W, H))
                if copy_images:
                    dst = os.path.join(out, "images", *rel.split("/"))
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    shutil.copy2(src, dst)
            except Exception:  # noqa: BLE001
                summary["unreadable"] += 1
                continue
            image_id = len(images) + 1
            images.append({"id": image_id, "file_name": rel, "width": W, "height": H})
            for (c, x1, y1, x2, y2) in lab.entries:
                if not 0 <= c < nc:
                    summary["skipped_unknown"] += 1
                    continue
                x1, x2 = _clamp01(x1) * W, _clamp01(x2) * W
                y1, y2 = _clamp01(y1) * H, _clamp01(y2) * H
                bw, bh = x2 - x1, y2 - y1
                if bw <= 0 or bh <= 0:
                    continue
                anns.append({"id": len(anns) + 1, "image_id": image_id, "category_id": cat_ids[c],
                             "bbox": [round(x1, 2), round(y1, 2), round(bw, 2), round(bh, 2)],
                             "area": round(bw * bh, 2), "iscrowd": 0, "segmentation": []})
        cats = [{"id": cat_ids[i], "name": n, "supercategory": ""} for i, n in enumerate(ds.class_names)]
        info = {"description": "Exported by %s %s from %s" % (APP_NAME, APP_VERSION, ds.name),
                "date_created": datetime.datetime.now().isoformat(timespec="seconds"),
                "image_root": "images/" if copy_images else ds.images_dir.replace(os.sep, "/")}

        def write_coco(path, imgs):
            ids = set(im["id"] for im in imgs)
            data = {"info": info, "licenses": [], "images": imgs,
                    "annotations": [a for a in anns if a["image_id"] in ids], "categories": cats}
            atomic_write_text(path, json.dumps(data, ensure_ascii=False, indent=1))

        write_coco(os.path.join(out, "annotations.json"), images)
        for sp in splits:
            write_coco(os.path.join(out, "annotations_%s.json" % sp),
                       [im for im in images if im["file_name"].startswith(sp + "/")])
        atomic_write_text(os.path.join(out, "classes.txt"), "\n".join(ds.class_names) + "\n")
        summary["images"], summary["boxes"] = len(images), len(anns)
    if progress:
        progress(total, total)
    atomic_write_text(os.path.join(out, "export_info.txt"), _export_info(ds, fmt, include, copy_images, summary))
    return out, summary


def _yolo_yaml(out, names, splits):
    lines = [
        "# %s 에서 내보낸 YOLO 데이터셋 (%s)" % (APP_NAME, datetime.datetime.now().strftime("%Y-%m-%d %H:%M")),
        "# 이 폴더를 다른 곳으로 옮기면 아래 path 를 새 위치로 바꿔 주세요.",
        "path: %s" % json.dumps(out.replace(os.sep, "/"), ensure_ascii=False),
    ]
    if "train" in splits:
        val = "images/val" if "val" in splits else ("images/valid" if "valid" in splits else "images/train")
        lines += ["train: images/train", "val: %s" % val]
        if "test" in splits:
            lines.append("test: images/test")
    else:
        lines += ["train: images", "val: images"]
    lines.append("nc: %d" % len(names))
    lines.append("names:")
    for i, n in enumerate(names):
        lines.append("  %d: %s" % (i, json.dumps(n, ensure_ascii=False)))
    return "\n".join(lines) + "\n"


def _export_info(ds, fmt, include, copy_images, s):
    inc = {INCLUDE_LABELED: "라벨이 있거나 확인한 이미지", INCLUDE_REVIEWED: "확인한 이미지만",
           INCLUDE_ALL: "모든 이미지"}.get(include, include)
    lines = [
        "%s %s 내보내기 결과" % (APP_NAME, APP_VERSION),
        "만든 시각: %s" % datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "원본 데이터 폴더: %s" % ds.root,
        "형식: %s" % fmt.upper(),
        "포함한 이미지: %s" % inc,
        "이미지 수: %d" % s["images"],
        "박스 수: %d" % s["boxes"],
        "클래스 (%d개): %s" % (len(ds.class_names), ", ".join(ds.class_names)),
    ]
    if fmt == "coco":
        lines.append("이미지 복사: %s" % ("예 (images/)" if copy_images else "아니요 (원본 images 폴더 기준 file_name)"))
    if s["skipped_unknown"]:
        lines.append("클래스 번호가 범위를 벗어나 뺀 박스: %d" % s["skipped_unknown"])
    if s["unreadable"]:
        lines.append("읽을 수 없어 뺀 이미지: %d" % s["unreadable"])
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# 대화상자
# ---------------------------------------------------------------------------
class Modal(tk.Toplevel):
    def __init__(self, parent, title, resizable=False):
        tk.Toplevel.__init__(self, parent)
        self.withdraw()
        self.title(title)
        self.transient(parent)
        self.resizable(resizable, resizable)
        self.parent = parent
        self.result = None
        self.body = ttk.Frame(self, padding=16)
        self.body.pack(fill="both", expand=True)
        self.protocol("WM_DELETE_WINDOW", self.cancel)
        self.bind("<Escape>", lambda e: self.cancel())

    def show(self):
        center_on(self, self.parent)
        self.deiconify()
        try:
            self.grab_set()
        except tk.TclError:
            pass
        self.focus_set()
        self.wait_window()
        return self.result

    def cancel(self):
        self.result = None
        self.destroy()

    def buttons(self, ok_text="확인", ok=None, cancel_text="취소", grid_row=None):
        row = ttk.Frame(self.body)
        if grid_row is None:
            row.pack(fill="x", pady=(14, 0))
        else:
            row.grid(row=grid_row, column=0, columnspan=3, sticky="ew", pady=(14, 0))
        ttk.Button(row, text=cancel_text, command=self.cancel).pack(side="right")
        b = ttk.Button(row, text=ok_text, command=ok or self.ok)
        b.pack(side="right", padx=(0, 8))
        return row

    def ok(self):
        self.destroy()


class ClassSetupDialog(Modal):
    """클래스 파일이 없을 때 classes.txt 를 만들기 위한 입력창."""

    def __init__(self, parent, folder):
        Modal.__init__(self, parent, "클래스 목록 입력", resizable=True)
        ttk.Label(self.body, justify="left", wraplength=440, text=(
            "이 폴더에서 클래스 정보(data.yaml, classes.txt, annotations.json)를 찾지 못했어요.\n\n"
            "클래스 이름을 한 줄에 하나씩 입력하면 아래 위치에 classes.txt 로 저장해서 사용해요.\n"
            "첫 줄이 0번(단축키 1), 둘째 줄이 1번(단축키 2) 클래스가 됩니다.")).pack(anchor="w")
        ttk.Label(self.body, text=os.path.join(folder, "classes.txt"), style="Muted.TLabel",
                  wraplength=440).pack(anchor="w", pady=(6, 6))
        self.text = tk.Text(self.body, width=40, height=10, undo=True, font="TkTextFont")
        self.text.pack(fill="both", expand=True)
        self.text.insert("1.0", "plastic\ncan\npaper\ngeneral\n")
        self.buttons("classes.txt 만들기")
        self.text.focus_set()

    def ok(self):
        names = [ln.strip() for ln in self.text.get("1.0", "end").splitlines() if ln.strip()]
        if not names:
            messagebox.showwarning(APP_NAME, "클래스를 한 개 이상 입력해 주세요.", parent=self)
            return
        self.result = names
        self.destroy()


class NewDatasetDialog(Modal):
    def __init__(self, parent, initial_dir):
        Modal.__init__(self, parent, "새 데이터 폴더 만들기", resizable=True)
        b = self.body
        ttk.Label(b, text="images/, labels/, classes.txt 가 들어 있는 새 데이터 폴더를 만들어요.",
                  wraplength=460).grid(row=0, column=0, columnspan=3, sticky="w", pady=(0, 10))
        ttk.Label(b, text="만들 위치").grid(row=1, column=0, sticky="w")
        self.var_parent = tk.StringVar(value=initial_dir)
        ttk.Entry(b, textvariable=self.var_parent, width=44).grid(row=1, column=1, sticky="ew", padx=6)
        ttk.Button(b, text="찾아보기", command=self.browse).grid(row=1, column=2)
        ttk.Label(b, text="폴더 이름").grid(row=2, column=0, sticky="w", pady=(8, 0))
        self.var_name = tk.StringVar(value="my-dataset")
        ttk.Entry(b, textvariable=self.var_name, width=44).grid(row=2, column=1, sticky="ew", padx=6, pady=(8, 0))
        ttk.Label(b, text="클래스 목록\n(한 줄에 하나)").grid(row=3, column=0, sticky="nw", pady=(8, 0))
        self.text = tk.Text(b, width=40, height=9, undo=True, font="TkTextFont")
        self.text.grid(row=3, column=1, columnspan=2, sticky="nsew", padx=6, pady=(8, 0))
        self.text.insert("1.0", "plastic\ncan\npaper\ngeneral\n")
        self.var_add = tk.BooleanVar(value=True)
        ttk.Checkbutton(b, text="만든 뒤 바로 이미지 파일 추가하기", variable=self.var_add).grid(
            row=4, column=1, columnspan=2, sticky="w", pady=(8, 0))
        b.columnconfigure(1, weight=1)
        b.rowconfigure(3, weight=1)
        self.buttons("만들기", grid_row=5)

    def browse(self):
        d = filedialog.askdirectory(parent=self, title="새 데이터 폴더를 만들 위치", initialdir=self.var_parent.get() or os.path.expanduser("~"))
        if d:
            self.var_parent.set(d)

    def ok(self):
        parent, name = self.var_parent.get().strip(), self.var_name.get().strip()
        names = [ln.strip() for ln in self.text.get("1.0", "end").splitlines() if ln.strip()]
        if not parent or not os.path.isdir(parent):
            messagebox.showwarning(APP_NAME, "만들 위치(폴더)를 골라 주세요.", parent=self)
            return
        if not name or re.search(r'[\\/:*?"<>|]', name):
            messagebox.showwarning(APP_NAME, "폴더 이름에 \\ / : * ? \" < > | 는 쓸 수 없어요.", parent=self)
            return
        if not names:
            messagebox.showwarning(APP_NAME, "클래스를 한 개 이상 입력해 주세요.", parent=self)
            return
        path = os.path.join(parent, name)
        if os.path.exists(path) and os.listdir(path):
            messagebox.showwarning(APP_NAME, "같은 이름의 폴더가 이미 있고 비어 있지 않아요.\n다른 이름을 써 주세요.\n\n%s" % path, parent=self)
            return
        try:
            os.makedirs(os.path.join(path, "images"), exist_ok=True)
            os.makedirs(os.path.join(path, "labels"), exist_ok=True)
            atomic_write_text(os.path.join(path, "classes.txt"), "\n".join(names) + "\n")
        except OSError as e:
            messagebox.showerror(APP_NAME, "폴더를 만들 수 없어요.\n%s" % e, parent=self)
            return
        self.result = (path, self.var_add.get())
        self.destroy()


class ClassPicker(Modal):
    """클래스를 검색해서 고르는 작은 창."""

    def __init__(self, parent, names, current, x=None, y=None):
        Modal.__init__(self, parent, "클래스 선택", resizable=True)
        self.names = names
        self.pos = (x, y)
        ttk.Label(self.body, text="검색하거나 목록에서 고른 뒤 Enter", style="Muted.TLabel").pack(anchor="w")
        self.var = tk.StringVar()
        self.entry = ttk.Entry(self.body, textvariable=self.var, width=30)
        self.entry.pack(fill="x", pady=(4, 6))
        frame = ttk.Frame(self.body)
        frame.pack(fill="both", expand=True)
        self.lb = tk.Listbox(frame, height=min(14, max(4, len(names))), activestyle="dotbox", exportselection=False)
        sb = ttk.Scrollbar(frame, orient="vertical", command=self.lb.yview)
        self.lb.configure(yscrollcommand=sb.set)
        self.lb.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        self.shown = []
        self.var.trace_add("write", lambda *a: self.refresh())
        self.refresh(select=current)
        self.entry.bind("<Return>", lambda e: self.ok())
        self.entry.bind("<Down>", lambda e: self.move(1))
        self.entry.bind("<Up>", lambda e: self.move(-1))
        self.lb.bind("<Double-Button-1>", lambda e: self.ok())
        self.lb.bind("<Return>", lambda e: self.ok())
        self.buttons("선택")
        self.entry.focus_set()

    def show(self):
        if self.pos[0] is not None:
            self.update_idletasks()
            self.geometry("+%d+%d" % (self.pos[0] + 12, self.pos[1] + 12))
            self.deiconify()
            try:
                self.grab_set()
            except tk.TclError:
                pass
            self.entry.focus_set()
            self.wait_window()
            return self.result
        return Modal.show(self)

    def refresh(self, select=None):
        q = self.var.get().strip().lower()
        self.lb.delete(0, "end")
        self.shown = []
        for i, n in enumerate(self.names):
            label = "%d. %s" % (i + 1, n)
            if q and q not in n.lower() and not str(i + 1).startswith(q):
                continue
            self.shown.append(i)
            self.lb.insert("end", label)
        if self.shown:
            pos = self.shown.index(select) if select in self.shown else 0
            self.lb.selection_set(pos)
            self.lb.activate(pos)
            self.lb.see(pos)

    def move(self, d):
        if not self.shown:
            return "break"
        cur = self.lb.curselection()
        pos = (cur[0] if cur else 0) + d
        pos = max(0, min(len(self.shown) - 1, pos))
        self.lb.selection_clear(0, "end")
        self.lb.selection_set(pos)
        self.lb.activate(pos)
        self.lb.see(pos)
        return "break"

    def ok(self):
        cur = self.lb.curselection()
        if cur and cur[0] < len(self.shown):
            self.result = self.shown[cur[0]]
        self.destroy()


class SettingsDialog(Modal):
    def __init__(self, parent, settings):
        Modal.__init__(self, parent, "설정")
        self.s = settings
        b = self.body
        box = ttk.LabelFrame(b, text="내보내기 기본 형식", padding=10)
        box.pack(fill="x")
        self.var_fmt = tk.StringVar(value=settings["export_format"])
        ttk.Radiobutton(box, text="YOLO (txt) - 기본, Ultralytics 학습용", value="yolo", variable=self.var_fmt).pack(anchor="w")
        ttk.Radiobutton(box, text="COCO (json)", value="coco", variable=self.var_fmt).pack(anchor="w")

        box2 = ttk.LabelFrame(b, text="작업", padding=10)
        box2.pack(fill="x", pady=(10, 0))
        self.vars = {}
        for key, text in (
            ("autosave", "다른 이미지로 넘어갈 때 자동 저장"),
            ("ask_class_after_draw", "박스를 그린 뒤 클래스 선택창 띄우기 (클래스가 많을 때 편해요)"),
        ):
            v = tk.BooleanVar(value=bool(settings[key]))
            self.vars[key] = v
            ttk.Checkbutton(box2, text=text, variable=v).pack(anchor="w")

        box3 = ttk.LabelFrame(b, text="화면", padding=10)
        box3.pack(fill="x", pady=(10, 0))
        for key, text in (
            ("show_names", "박스 위에 클래스 이름 표시"),
            ("show_crosshair", "마우스 위치에 십자 안내선 표시"),
        ):
            v = tk.BooleanVar(value=bool(settings[key]))
            self.vars[key] = v
            ttk.Checkbutton(box3, text=text, variable=v).pack(anchor="w")
        row = ttk.Frame(box3)
        row.pack(anchor="w", pady=(6, 0))
        ttk.Label(row, text="박스 선 두께").pack(side="left")
        self.var_lw = tk.IntVar(value=int(settings.get("line_width", 2)))
        tk.Spinbox(row, from_=1, to=6, width=4, textvariable=self.var_lw).pack(side="left", padx=6)
        self.buttons("저장")

    def ok(self):
        self.s["export_format"] = self.var_fmt.get()
        for k, v in self.vars.items():
            self.s[k] = bool(v.get())
        try:
            self.s["line_width"] = max(1, min(6, int(self.var_lw.get())))
        except (tk.TclError, ValueError):
            pass
        self.result = True
        self.destroy()


class ExportDialog(Modal):
    def __init__(self, app):
        Modal.__init__(self, app.root, "내보내기")
        self.app = app
        ds, s = app.ds, app.settings
        b = self.body
        box = ttk.LabelFrame(b, text="형식", padding=10)
        box.pack(fill="x")
        self.var_fmt = tk.StringVar(value=s["export_format"])
        ttk.Radiobutton(box, text="YOLO (txt)  - images/, labels/, data.yaml. Ultralytics 로 바로 학습",
                        value="yolo", variable=self.var_fmt, command=self.update_state).pack(anchor="w")
        ttk.Radiobutton(box, text="COCO (json) - annotations.json, bbox=[x, y, 너비, 높이] 픽셀",
                        value="coco", variable=self.var_fmt, command=self.update_state).pack(anchor="w")
        self.chk_copy_var = tk.BooleanVar(value=bool(s["copy_images_on_export"]))
        self.chk_copy = ttk.Checkbutton(box, text="이미지 파일도 함께 복사 (COCO)", variable=self.chk_copy_var)
        self.chk_copy.pack(anchor="w", padx=(22, 0), pady=(4, 0))

        box2 = ttk.LabelFrame(b, text="포함할 이미지", padding=10)
        box2.pack(fill="x", pady=(10, 0))
        self.var_inc = tk.StringVar(value=s["export_include"])
        for val, text in (
            (INCLUDE_LABELED, "라벨이 있거나 확인(✔)한 이미지  (추천)"),
            (INCLUDE_REVIEWED, "사람이 확인(✔)한 이미지만"),
            (INCLUDE_ALL, "모든 이미지 (라벨 없는 이미지는 배경으로)"),
        ):
            n = sum(1 for r in ds.images if ds.included(r, val))
            ttk.Radiobutton(box2, text="%s  -  %d장" % (text, n), value=val, variable=self.var_inc).pack(anchor="w")

        box3 = ttk.LabelFrame(b, text="저장 위치 (이 안에 yolo_날짜_시간 폴더가 새로 생겨요)", padding=10)
        box3.pack(fill="x", pady=(10, 0))
        self.var_out = tk.StringVar(value=s.get("export_dir") or os.path.join(ds.root, "export"))
        row = ttk.Frame(box3)
        row.pack(fill="x")
        ttk.Entry(row, textvariable=self.var_out, width=52).pack(side="left", fill="x", expand=True)
        ttk.Button(row, text="찾아보기", command=self.browse).pack(side="left", padx=(6, 0))

        self.bar = ttk.Progressbar(b, mode="determinate", length=420)
        self.bar.pack(fill="x", pady=(14, 2))
        self.lbl = ttk.Label(b, text="", style="Muted.TLabel")
        self.lbl.pack(anchor="w")

        row = ttk.Frame(b)
        row.pack(fill="x", pady=(10, 0))
        self.btn_close = ttk.Button(row, text="닫기", command=self.cancel)
        self.btn_close.pack(side="right")
        self.btn_run = ttk.Button(row, text="내보내기", command=self.run)
        self.btn_run.pack(side="right", padx=(0, 8))
        self.worker = None
        self.cancel_ev = threading.Event()
        self.state = {}
        self.update_state()

    def update_state(self):
        self.chk_copy.configure(state="normal" if self.var_fmt.get() == "coco" else "disabled")

    def browse(self):
        d = filedialog.askdirectory(parent=self, title="내보낼 위치", initialdir=self.var_out.get() or self.app.ds.root)
        if d:
            self.var_out.set(d)

    def cancel(self):
        if self.worker and self.worker.is_alive():
            self.cancel_ev.set()
            self.lbl.configure(text="취소하는 중...")
            return
        Modal.cancel(self)

    def run(self):
        out_parent = self.var_out.get().strip()
        if not out_parent:
            messagebox.showwarning(APP_NAME, "저장 위치를 정해 주세요.", parent=self)
            return
        try:
            os.makedirs(out_parent, exist_ok=True)
        except OSError as e:
            messagebox.showerror(APP_NAME, "저장 위치를 만들 수 없어요.\n%s" % e, parent=self)
            return
        if not self.app.save_current(mark_reviewed=False):
            return
        s = self.app.settings
        s["export_format"] = self.var_fmt.get()
        s["export_include"] = self.var_inc.get()
        s["copy_images_on_export"] = bool(self.chk_copy_var.get())
        default_out = os.path.join(self.app.ds.root, "export")
        s["export_dir"] = "" if os.path.normcase(os.path.abspath(out_parent)) == os.path.normcase(default_out) else out_parent
        save_settings(s)
        self.btn_run.configure(state="disabled")
        self.btn_close.configure(text="취소")
        self.state = {"done": 0, "total": 1, "finished": False, "error": None, "result": None}
        fmt, inc, copy_img = self.var_fmt.get(), self.var_inc.get(), bool(self.chk_copy_var.get())
        ds = self.app.ds

        def prog(d, t):
            self.state["done"], self.state["total"] = d, max(1, t)

        def work():
            try:
                self.state["result"] = export_dataset(ds, fmt, out_parent, inc, copy_img, prog, self.cancel_ev)
            except ExportCancelled:
                self.state["error"] = "취소했어요."
            except DatasetError as e:
                self.state["error"] = str(e)
            except Exception as e:  # noqa: BLE001
                log_error(traceback.format_exc())
                self.state["error"] = "내보내기 중 오류가 났어요.\n%s\n\n자세한 내용: %s" % (e, LOG_PATH)
            finally:
                self.state["finished"] = True

        self.worker = threading.Thread(target=work, daemon=True)
        self.worker.start()
        self.poll()

    def poll(self):
        st = self.state
        self.bar.configure(maximum=st["total"], value=st["done"])
        self.lbl.configure(text="%d / %d" % (st["done"], st["total"]))
        if not st["finished"]:
            self.after(100, self.poll)
            return
        self.btn_run.configure(state="normal")
        self.btn_close.configure(text="닫기")
        if st["error"]:
            self.lbl.configure(text=st["error"].splitlines()[0])
            messagebox.showwarning(APP_NAME, st["error"], parent=self)
            return
        out, summary = st["result"]
        msg = "내보내기를 마쳤어요.\n\n%s\n\n이미지 %d장, 박스 %d개" % (out, summary["images"], summary["boxes"])
        if summary["skipped_unknown"]:
            msg += "\n클래스 번호가 범위를 벗어나 뺀 박스: %d개" % summary["skipped_unknown"]
        if summary["unreadable"]:
            msg += "\n읽을 수 없어 뺀 이미지: %d장" % summary["unreadable"]
        self.lbl.configure(text="완료: %s" % out)
        self.app.set_status("내보내기 완료: %s" % out)
        if messagebox.askyesno(APP_NAME, msg + "\n\n결과 폴더를 열까요?", parent=self):
            open_in_file_manager(out)


# ---------------------------------------------------------------------------
# 도움말
# ---------------------------------------------------------------------------
MOD = "Cmd" if IS_MAC else "Ctrl"

HELP_PAGES = [
    ("시작하기", """# 처음 사용하기
BBox Labeler 는 이미지 위에 사각형 박스(bbox)를 그리고 클래스를 붙이는 프로그램이에요.
작업 결과는 YOLO 형식으로 자동 저장되고, 필요하면 COCO 형식으로 내보낼 수 있어요.

## 1. 데이터 폴더 열기
- 준비해 둔 폴더가 있다면: **[파일] > [데이터 폴더 열기]** (MOD+O)
- 처음부터 시작한다면: **[파일] > [새 데이터 폴더 만들기]** 에서 폴더 이름과 클래스 목록을 쓰고 이미지를 추가하세요.
- 폴더 모양은 **[폴더 규격]** 탭에 있어요.

## 2. 클래스 고르고 박스 그리기
- 오른쪽 **[클래스]** 목록에서 클래스를 클릭하거나 숫자키 **1~9, 0** 을 누르세요.
- 이미지 위에서 마우스 왼쪽 버튼을 누른 채 끌면 박스가 그려져요.
- 박스를 클릭하면 선택되고, 끌어서 옮기거나 테두리를 끌어서 크기를 바꿀 수 있어요.

## 3. 다음 이미지로
- **D** 또는 **→** : 다음 이미지,  **A** 또는 **←** : 이전 이미지
- 넘어갈 때 자동으로 저장돼요. (설정에서 끌 수 있어요)
- 한 번 보고 넘어간 이미지는 왼쪽 목록에 **✔** 표시가 붙어요.

## 4. 내보내기
- 작업이 끝나면 **[파일] > [내보내기]** (MOD+E) 로 YOLO 또는 COCO 데이터셋을 만들어요.

> 다음에 프로그램을 켜면 마지막으로 열었던 폴더와 이미지가 자동으로 열려요.
> 이 설명서는 언제든 F1 또는 [도움말] 메뉴로 다시 볼 수 있어요.
"""),
    ("폴더 규격", """# 데이터 폴더 규격
프로그램에서는 "데이터 폴더" 하나를 열어요. 데이터 폴더는 아래처럼 생겼어요.

| my-dataset/              <- 이 폴더를 열어요
| ├─ images/               <- (필수) 이미지
| │   ├─ a.jpg
| │   └─ train/, val/ ...  <- 하위 폴더도 돼요
| ├─ labels/               <- (선택) YOLO 라벨. 없으면 자동 생성
| ├─ classes.txt           <- 클래스 정보 (아래 중 하나)
| ├─ data.yaml
| └─ annotations.json      <- (선택) COCO 라벨

> images 폴더 자체를 골라도 그 위 폴더를 데이터 폴더로 알아서 써요.
> images 폴더 없이 이미지만 들어 있는 폴더를 고르면, images 폴더로 옮겨서 쓸지 물어봐요.

## 이미지
- 지원 형식: jpg, jpeg, png, bmp, webp, tif, tiff
- images 폴더 안의 하위 폴더까지 모두 읽어요.
- 휴대폰 사진의 회전 정보(EXIF)를 반영해서 보여주고, 좌표도 회전된 기준으로 저장해요. (YOLO 학습 때와 같은 기준)

## 클래스 정보
아래 순서로 찾아서 **처음 찾은 파일 하나만** 써요.
1. **data.yaml** (또는 data.yml, dataset.yaml) 의 names
| names:
|   0: plastic
|   1: can
2. **classes.txt** (또는 obj.names) - 한 줄에 클래스 하나, 첫 줄이 0번
| plastic
| can
3. **annotations.json** 의 categories (COCO) - id 가 작은 것부터 0, 1, 2 ... 번이 돼요

- 클래스 파일이 하나도 없으면, 폴더를 열 때 클래스 이름을 물어보고 classes.txt 를 만들어 줘요.
- 프로그램은 클래스 파일을 고치지 않아요. 클래스를 바꾸려면 파일을 직접 고친 뒤 **[파일] > [다시 읽기]** (F5).

## 라벨 (박스)
이미지마다 아래 순서로 라벨을 찾아요.
1. **labels/** 의 같은 이름 .txt (YOLO) -  images/train/a.jpg  <->  labels/train/a.txt
2. **annotations.json** (COCO) 안에서 file_name 이 같은 이미지
3. 둘 다 없으면 빈 상태에서 시작

YOLO txt 한 줄이 박스 하나예요:  클래스번호 중심x 중심y 너비 높이  (모두 0~1 비율)
| 0 0.512 0.430 0.210 0.300

- 맨 끝에 신뢰도 값이 붙은 줄(값 6개)도 읽을 수 있어요.
- 폴리곤(세그멘테이션) 라벨은 폴리곤을 감싸는 박스로 바꿔서 보여줘요.
- COCO 파일 이름은 annotations.json, _annotations.coco.json, instances.json, coco.json 중 하나여야 해요.
- COCO 라벨은 카테고리 **이름**으로 클래스 목록과 맞춰요. (클래스를 COCO 에서 읽었을 때는 id 로 맞춰요)

## 프로그램이 만드는 파일
- **labels/*.txt** : 작업 결과 (YOLO)
- **.bbox_labeler/state.json** : 확인(✔) 표시와 마지막 위치. 지워도 라벨은 그대로예요.
- **export/** : 내보내기 결과
"""),
    ("그리기·고치기", """# 박스 그리기와 고치기
## 그리기
- 빈 곳에서 마우스 왼쪽 버튼을 누른 채 끌면 **현재 클래스**로 박스가 만들어져요.
- 다른 박스 안에서 시작해도, 끌면 새 박스가 그려져요.
- **MOD 를 누른 채 끌면** 어디서든 항상 새 박스를 그려요.
- 그린 직후 클래스 선택창이 뜨게 하려면 **[설정] > [박스를 그린 뒤 클래스 선택창 띄우기]**. 클래스가 많을 때 편해요.

## 선택
- 박스를 클릭하면 선택돼요. (굵은 테두리 + 흰 점)
- 박스가 겹쳐 있으면 같은 곳을 다시 클릭할 때마다 다음 박스가 선택돼요.
- 오른쪽 **[이 이미지의 박스]** 목록에서 골라도 되고, **Tab** 으로 차례대로 고를 수도 있어요.
- **Esc** : 선택 해제

## 고치기
- 옮기기: 선택한 박스 안쪽을 끌기
- 크기 바꾸기: 선택한 박스의 테두리나 모서리를 끌기
- 클래스 바꾸기: 박스를 선택하고 숫자키 / 오른쪽 클래스 목록 클릭 / 박스에서 오른쪽 클릭
- 지우기: **Delete** 또는 **Backspace**
- 되돌리기 **MOD+Z**, 다시 실행 **MOD+Y**

> 박스를 선택한 상태에서 클래스를 고르면 그 박스의 클래스가 바뀌어요. 다음에 그릴 클래스만 바꾸려면 먼저 Esc 로 선택을 풀어 주세요.

## 화면
- 마우스 휠: 확대 / 축소 (마우스 위치 기준)
- 가운데 버튼을 누른 채 끌기, 또는 **Space** 를 누른 채 끌기: 화면 옮기기
- **F**: 화면에 맞추기,  **H**: 박스 잠깐 숨기기

## 복사와 붙여넣기
- **MOD+C**: 선택한 박스 복사 (선택이 없으면 모든 박스)
- **MOD+V**: 붙여넣기 (다른 이미지에서도 같은 위치에)
- **MOD+Shift+V**: 바로 앞 이미지의 박스를 모두 가져오기. 연속 사진이나 영상 프레임에 편해요.
"""),
    ("단축키", """# 단축키
## 이미지 이동
- **D**, **→** : 다음 이미지
- **A**, **←** : 이전 이미지
- **N** : 아직 확인 안 한 다음 이미지
- **MOD+G** : 번호로 이동
- 왼쪽 목록에서 위/아래 화살표로 골라도 돼요.

## 박스
- **마우스 끌기** : 박스 그리기 (MOD+끌기: 항상 새로 그리기)
- **1 ~ 9, 0** : 클래스 고르기 (박스를 선택 중이면 그 박스의 클래스를 바꿈)
- **Delete / Backspace** : 선택한 박스 지우기
- **Tab / Shift+Tab** : 다음 / 이전 박스 선택
- **Esc** : 선택 해제, 그리던 박스 취소
- **MOD+Z / MOD+Y** : 되돌리기 / 다시 실행
- **MOD+C / MOD+V** : 박스 복사 / 붙여넣기
- **MOD+Shift+V** : 앞 이미지의 박스 가져오기
- **오른쪽 클릭** : 박스 메뉴 (클래스 바꾸기, 복사, 지우기)

## 화면
- **마우스 휠**, **+ / -** : 확대 / 축소
- **F** : 화면에 맞추기
- **Space + 끌기**, **가운데 버튼 끌기** : 화면 옮기기
- **H** : 박스 숨기기 / 보이기

## 파일
- **MOD+O** : 데이터 폴더 열기
- **MOD+S** : 지금 저장 (박스가 없으면 '물체 없음' 으로 저장)
- **MOD+E** : 내보내기
- **F5** : 클래스·라벨 다시 읽기
- **F1** : 사용 설명서

> 한/영 키가 한글 상태여도 A, D, N 같은 단축키가 동작해요. 혹시 안 되면 영문으로 바꿔 주세요.
"""),
    ("저장·내보내기", """# 저장과 내보내기
## 저장
- 다른 이미지로 넘어갈 때, 다른 폴더를 열 때, 프로그램을 닫을 때 자동으로 저장돼요.
- **MOD+S** 로 바로 저장할 수도 있어요. 박스가 없는 이미지에서 MOD+S 를 누르면 "물체 없음(배경)" 이미지로 빈 라벨 파일이 저장돼요.
- 작업 중 저장 형식은 항상 **YOLO txt** (labels/ 폴더) 이고, 이 파일들이 원본이에요.

## 왼쪽 목록 표시
- **✔** : 사람이 확인한 이미지 (열어 보고 다음으로 넘어가면 표시)
- **◐** : 라벨은 있지만 아직 확인 안 한 이미지 (예: 자동 라벨)
- (빈칸) : 라벨도 없고 확인도 안 한 이미지
- 목록 위 **보기** 상자로 "확인 안 한 이미지" 만 볼 수 있고, 검색 칸으로 파일 이름을 찾을 수 있어요.

## 내보내기 - [파일] > [내보내기] (MOD+E)
형식
- **YOLO (기본)** : images/, labels/, data.yaml, classes.txt 가 들어 있는 폴더. Ultralytics 에 data.yaml 경로만 넘기면 바로 학습할 수 있어요.
- **COCO** : annotations.json (bbox = [왼쪽 x, 위쪽 y, 너비, 높이] 픽셀, category id 는 1부터). 이미지 복사는 고를 수 있어요.

포함할 이미지
- **라벨이 있거나 확인한 이미지 (추천)**
- **확인(✔)한 이미지만** : 자동 라벨 중 사람이 본 것만 쓰고 싶을 때
- **모든 이미지** : 라벨이 없는 이미지는 배경(물체 없음)으로 들어가요

- 결과는 저장 위치 아래 **yolo_날짜_시간/** 또는 **coco_날짜_시간/** 으로 매번 새로 만들어져요. 원본은 바뀌지 않아요.
- images 안이 train/ val/ test/ 로 나뉘어 있으면 data.yaml 에 나눠 적고, COCO 는 annotations_train.json 같은 파일도 함께 만들어요.
- 기본 형식은 **[설정]** 에서 바꿀 수 있어요.
- 클래스 번호가 클래스 개수보다 큰 박스("알 수 없음")는 내보낼 때 빠져요.

> YOLO 결과 폴더를 다른 곳(예: Colab)으로 옮기면 data.yaml 의 path: 줄을 새 위치로 고쳐 주세요.
"""),
    ("자동 라벨 검수", """# 자동 라벨 검수 (SAM, Grounding DINO, LLM 등)
자동으로 만든 라벨을 사람이 빠르게 고치는 방법이에요.

## 1. 자동 라벨을 데이터 폴더에 넣기
- YOLO txt 로 만들었다면: **labels/** 폴더에 이미지와 같은 이름(.txt)으로
- COCO json 으로 만들었다면: 데이터 폴더에 **annotations.json** 이름으로
- 클래스 번호(또는 COCO 카테고리 이름)가 classes.txt / data.yaml 과 맞아야 해요.

## 2. 검수하기
1. 왼쪽 목록 위의 **보기** 를 "확인 안 한 이미지" 로 바꿔요. (◐ 가 자동 라벨만 있는 이미지)
2. 틀린 박스는 고치거나 지우고, 빠진 박스는 새로 그려요.
3. **D** 로 다음 이미지 -> 자동 저장 + ✔ 표시. **N** 은 확인 안 한 다음 이미지로 바로 가요.

## 3. 내보내기
- "확인(✔)한 이미지만" 으로 내보내면 사람이 본 데이터만 모을 수 있어요.

> COCO 에서 읽은 라벨을 고치면 그 이미지는 labels/ 에 YOLO txt 로 저장되고, 그다음부터는 txt 가 먼저 쓰여요. annotations.json 자체는 바뀌지 않아요.
> 신뢰도 값이 붙은 YOLO 줄도 읽지만, 고쳐서 저장하면 신뢰도 없이 5개 값으로 저장돼요.
> 폴리곤 라벨을 고쳐서 저장하면 박스로 바뀌어요. 저장하기 전에 한 번 물어봐요.
"""),
    ("문제 해결", """# 문제 해결
## 단축키가 안 먹어요
- 이미지를 한 번 클릭하면 키 입력이 이미지 화면으로 가요.
- 한/영 키가 한글이어도 대부분 동작하지만, 안 되면 영문으로 바꿔 주세요.

## 클래스가 이상하게 나와요
- 클래스는 data.yaml -> classes.txt -> annotations.json 순서로 찾아요. 다른 파일이 먼저 쓰이고 있을 수 있어요. 오른쪽 클래스 목록 위에 어떤 파일에서 읽었는지 나와요.
- 클래스 파일을 고친 뒤에는 **F5** (다시 읽기).
- **알 수 없음(번호)** 박스는 라벨의 클래스 번호가 클래스 개수보다 큰 경우예요. 저장할 때는 그대로 두지만, 내보낼 때는 빠져요.

## 이름이 같은 이미지
- a.jpg 와 a.png 처럼 확장자만 다른 이미지는 라벨 파일(a.txt)을 같이 쓰게 돼서 문제가 생겨요. 이름을 바꿔 주세요.

## 프로그램이 안 켜져요
- Python 3.8 이상이 필요해요: https://www.python.org/downloads/  (Windows 설치 때 "Add python.exe to PATH" 체크)
- Pillow 가 없으면 처음 켤 때 자동으로 설치할지 물어봐요.
- Mac (Homebrew Python): 터미널에서 brew install python-tk
- Linux: sudo apt install python3-tk
- Mac 에서 run-mac.command 가 안 열리면: 오른쪽 클릭 > 열기. 그래도 안 되면 터미널에서 chmod +x run-mac.command
- 오류 내용은 프로그램 폴더의 **error.log** 에 남아요.

## 설정 초기화
- 프로그램 폴더의 **settings.json** 을 지우면 처음 상태로 돌아가요.
"""),
]


class HelpWindow(tk.Toplevel):
    def __init__(self, app, page=0):
        tk.Toplevel.__init__(self, app.root)
        self.title("%s 사용 설명서" % APP_NAME)
        ui = app.ui
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        self.geometry("%dx%d" % (min(int(900 * ui), sw - 60), min(int(680 * ui), sh - 100)))
        self.minsize(int(480 * ui), int(360 * ui))
        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=8, pady=8)
        self.nb = nb
        base = app.font.actual()
        fam, size = base["family"], abs(int(base["size"])) or 10
        mono = tkfont.nametofont("TkFixedFont").actual()["family"]
        for title, text in HELP_PAGES:
            frame = ttk.Frame(nb)
            nb.add(frame, text=title)
            t = tk.Text(frame, wrap="word", padx=18, pady=14, relief="flat", bg="#ffffff", fg="#1f2328",
                        font=(fam, size), spacing1=2, spacing3=2, cursor="arrow")
            sb = ttk.Scrollbar(frame, orient="vertical", command=t.yview)
            t.configure(yscrollcommand=sb.set)
            sb.pack(side="right", fill="y")
            t.pack(side="left", fill="both", expand=True)
            t.tag_configure("h1", font=(fam, size + 6, "bold"), spacing3=8, foreground="#0b57d0")
            t.tag_configure("h2", font=(fam, size + 2, "bold"), spacing1=12, spacing3=4)
            t.tag_configure("b", font=(fam, size, "bold"))
            t.tag_configure("code", font=(mono, size), background="#f3f4f6", lmargin1=12, lmargin2=12)
            t.tag_configure("tip", background="#fff7d6", lmargin1=8, lmargin2=8, spacing1=4, spacing3=4)
            t.tag_configure("li", lmargin1=12, lmargin2=28)
            self._render(t, text.replace("MOD", MOD))
            t.configure(state="disabled")
        nb.select(page)
        ttk.Button(self, text="닫기", command=self.destroy).pack(pady=(0, 8))
        self.bind("<Escape>", lambda e: self.destroy())

    @staticmethod
    def _inline(t, text, tags):
        parts = text.split("**")
        for i, part in enumerate(parts):
            if part:
                t.insert("end", part, tags + (("b",) if i % 2 == 1 else ()))

    def _render(self, t, text):
        for line in text.strip("\n").splitlines():
            if line.startswith("# "):
                t.insert("end", line[2:] + "\n", ("h1",))
            elif line.startswith("## "):
                t.insert("end", line[3:] + "\n", ("h2",))
            elif line.startswith("| ") or line == "|":
                t.insert("end", line[2:] + "\n", ("code",))
            elif line.startswith("> "):
                self._inline(t, line[2:], ("tip",))
                t.insert("end", "\n", ("tip",))
            elif line.startswith("- "):
                t.insert("end", "•  ", ("li",))
                self._inline(t, line[2:], ("li",))
                t.insert("end", "\n", ("li",))
            elif re.match(r"^\d+\. ", line):
                self._inline(t, line, ("li",))
                t.insert("end", "\n", ("li",))
            else:
                self._inline(t, line, ())
                t.insert("end", "\n")


# ---------------------------------------------------------------------------
# 메인 화면
# ---------------------------------------------------------------------------
class App(object):
    def __init__(self, root):
        self.root = root
        self.settings = load_settings()
        self.ds = None
        self.index = -1
        self.visible = []
        self.visible_pos = {}
        self.img = None
        self.W = self.H = 0
        self.pyr = {}
        self.boxes = []
        self.selected = None
        self.dirty = False
        self.cur_class = 0
        self.undo_stack = []
        self.redo_stack = []
        self.scale = 1.0
        self.ox = self.oy = 0.0
        self.fit_mode = True
        self.drag = None
        self.space_down = False
        self.mouse = None
        self.hide_boxes = False
        self.clipboard = []
        self.label_source = None
        self.label_had_polygon = False
        self.polygon_policy = None
        self.help_win = None
        self._photo = None
        self._render_pending = False
        self._search_job = None
        self._swatches = []
        self._cursor = ""

        self.ui = max(1.0, root.winfo_fpixels("1i") / 96.0)
        self._setup_fonts()
        self._setup_style()
        self._make_icon()
        self._build_menu()
        self._build_ui()
        self._bind()
        root.title(APP_NAME)
        sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
        root.minsize(min(int(900 * self.ui), sw - 40), min(int(560 * self.ui), sh - 80))
        default_geo = "%dx%d+%d+%d" % (int(sw * 0.9), int(sh * 0.85), int(sw * 0.05), int(sh * 0.04))
        try:
            root.geometry(self.settings.get("geometry") or default_geo)
        except tk.TclError:
            root.geometry(default_geo)
        root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.show_welcome()
        root.after(150, self._startup)

    # ----- 초기화 -----
    def _setup_fonts(self):
        fam = None
        families = set(tkfont.families(self.root))
        for cand in (("Malgun Gothic", "맑은 고딕") if IS_WIN else ("Apple SD Gothic Neo", "AppleGothic") if IS_MAC
                     else ("Noto Sans CJK KR", "NanumGothic", "Noto Sans KR", "UnDotum")):
            if cand in families:
                fam = cand
                break
        size = 13 if IS_MAC else 10
        for name in ("TkDefaultFont", "TkTextFont", "TkMenuFont", "TkHeadingFont", "TkCaptionFont", "TkIconFont", "TkTooltipFont"):
            try:
                f = tkfont.nametofont(name)
                if fam:
                    f.configure(family=fam)
                f.configure(size=size)
            except tk.TclError:
                pass
        self.font = tkfont.nametofont("TkDefaultFont")
        self.font_bold = self.font.copy()
        self.font_bold.configure(weight="bold")
        self.font_big = self.font.copy()
        self.font_big.configure(size=size + 3, weight="bold")
        self.font_title = self.font.copy()
        self.font_title.configure(size=size + 12, weight="bold")
        self.font_label = self.font.copy()
        self.font_label.configure(size=max(8, size - 1), weight="bold")

    def _setup_style(self):
        style = ttk.Style(self.root)
        if not IS_WIN and not IS_MAC and "clam" in style.theme_names():
            style.theme_use("clam")
        rowh = self.font.metrics("linespace") + int(8 * self.ui)
        style.configure("Treeview", rowheight=rowh)
        style.configure("Big.TButton", font=self.font_big, padding=(18, 10))
        style.configure("Tool.TButton", padding=(8, 3))
        style.configure("Muted.TLabel", foreground="#6b7280")
        style.configure("Bold.TLabel", font=self.font_bold)
        style.configure("Title.TLabel", font=self.font_title)

    def _make_icon(self):
        try:
            icon = tk.PhotoImage(width=32, height=32)
            icon.put("#1f6feb", to=(0, 0, 32, 32))
            icon.put("#ffffff", to=(5, 5, 27, 27))
            icon.put("#1f6feb", to=(8, 8, 24, 24))
            icon.put("#ffffff", to=(11, 11, 21, 21))
            icon.put("#f97316", to=(3, 3, 11, 11))
            self.root.iconphoto(True, icon)
            self._icon = icon
        except tk.TclError:
            pass

    def _build_menu(self):
        m = tk.Menu(self.root)
        self.root.config(menu=m)
        f = tk.Menu(m, tearoff=0)
        f.add_command(label="데이터 폴더 열기...", accelerator="%s+O" % MOD, command=self.ask_open_dataset)
        f.add_command(label="새 데이터 폴더 만들기...", command=self.new_dataset)
        self.recent_menu = tk.Menu(f, tearoff=0)
        f.add_cascade(label="최근 연 폴더", menu=self.recent_menu)
        f.add_separator()
        f.add_command(label="이미지 파일 추가...", command=lambda: self.add_images(False))
        f.add_command(label="이미지 폴더째로 추가...", command=lambda: self.add_images(True))
        f.add_separator()
        f.add_command(label="저장", accelerator="%s+S" % MOD, command=self.cmd_save)
        f.add_command(label="내보내기 (YOLO / COCO)...", accelerator="%s+E" % MOD, command=self.open_export)
        f.add_separator()
        f.add_command(label="클래스·라벨 다시 읽기", accelerator="F5", command=self.reload_dataset)
        f.add_command(label="데이터 폴더 열어 보기", command=lambda: self.ds and open_in_file_manager(self.ds.root))
        f.add_separator()
        f.add_command(label="종료", command=self.on_close)
        m.add_cascade(label="파일", menu=f)

        e = tk.Menu(m, tearoff=0)
        e.add_command(label="되돌리기", accelerator="%s+Z" % MOD, command=self.undo)
        e.add_command(label="다시 실행", accelerator="%s+Y" % MOD, command=self.redo)
        e.add_separator()
        e.add_command(label="박스 복사", accelerator="%s+C" % MOD, command=self.copy_boxes)
        e.add_command(label="붙여넣기", accelerator="%s+V" % MOD, command=self.paste)
        e.add_command(label="앞 이미지의 박스 가져오기", accelerator="%s+Shift+V" % MOD, command=self.paste_prev)
        e.add_separator()
        e.add_command(label="선택한 박스 클래스 바꾸기...", command=self.change_class_dialog)
        e.add_command(label="선택한 박스 지우기", accelerator="Delete", command=self.delete_selected)
        e.add_command(label="이 이미지의 박스 모두 지우기", command=self.delete_all)
        m.add_cascade(label="편집", menu=e)

        v = tk.Menu(m, tearoff=0)
        v.add_command(label="화면에 맞추기", accelerator="F", command=self.fit)
        v.add_command(label="확대", accelerator="+", command=lambda: self.zoom_center(1.25))
        v.add_command(label="축소", accelerator="-", command=lambda: self.zoom_center(0.8))
        v.add_command(label="원본 크기 (100%)", command=self.zoom_100)
        v.add_separator()
        v.add_command(label="박스 숨기기 / 보이기", accelerator="H", command=self.toggle_hide)
        m.add_cascade(label="보기", menu=v)

        g = tk.Menu(m, tearoff=0)
        g.add_command(label="이전 이미지", accelerator="A / ←", command=lambda: self.step(-1))
        g.add_command(label="다음 이미지", accelerator="D / →", command=lambda: self.step(1))
        g.add_command(label="확인 안 한 다음 이미지", accelerator="N", command=self.next_unreviewed)
        g.add_command(label="번호로 이동...", accelerator="%s+G" % MOD, command=self.goto_dialog)
        m.add_cascade(label="이동", menu=g)

        s = tk.Menu(m, tearoff=0)
        s.add_command(label="설정...", command=self.open_settings)
        m.add_cascade(label="설정", menu=s)

        h = tk.Menu(m, tearoff=0)
        h.add_command(label="사용 설명서", accelerator="F1", command=self.show_help)
        h.add_command(label="단축키", command=lambda: self.show_help(3))
        h.add_command(label="데이터 폴더 규격", command=lambda: self.show_help(1))
        h.add_separator()
        h.add_command(label="프로그램 정보", command=self.show_about)
        m.add_cascade(label="도움말", menu=h)
        self.rebuild_recent_menu()

    def _build_ui(self):
        root = self.root
        tb = ttk.Frame(root, padding=(6, 4))
        tb.pack(side="top", fill="x")

        zero = max(1, self.font.measure("0"))

        def btn(text, cmd):
            # ttk 버튼의 기본 최소 폭이 넓어서, 글자 길이에 맞춰 폭을 줄입니다.
            b = ttk.Button(tb, text=text, command=cmd, takefocus=0, style="Tool.TButton",
                           width=-(self.font.measure(text) // zero + 1))
            b.pack(side="left", padx=1)
            return b

        btn("폴더 열기", self.ask_open_dataset)
        ttk.Separator(tb, orient="vertical").pack(side="left", fill="y", padx=6)
        btn("◀ 이전 (A)", lambda: self.step(-1))
        btn("다음 (D) ▶", lambda: self.step(1))
        btn("저장", self.cmd_save)
        ttk.Separator(tb, orient="vertical").pack(side="left", fill="y", padx=6)
        btn("화면 맞춤", self.fit)
        btn("내보내기", self.open_export)
        btn("설정", self.open_settings)
        btn("도움말 (F1)", self.show_help)
        ttk.Separator(tb, orient="vertical").pack(side="left", fill="y", padx=6)
        self.lbl_class = tk.Label(tb, text="현재 클래스: -", font=self.font_bold, padx=10, pady=3,
                                  bg="#e5e7eb", fg="#111827", relief="flat")
        self.lbl_class.pack(side="left", padx=4)

        sb = ttk.Frame(root, padding=(8, 3))
        sb.pack(side="bottom", fill="x")
        self.lbl_info = ttk.Label(sb, text="", style="Muted.TLabel")
        self.lbl_info.pack(side="right")
        self.lbl_pos = ttk.Label(sb, text="", style="Bold.TLabel")
        self.lbl_pos.pack(side="right", padx=(0, 16))
        self.lbl_status = ttk.Label(sb, text="")
        self.lbl_status.pack(side="left", fill="x", expand=True)

        paned = ttk.PanedWindow(root, orient="horizontal")
        paned.pack(fill="both", expand=True)
        self.paned = paned

        # 왼쪽: 이미지 목록
        left = ttk.Frame(paned, padding=(6, 4), width=int(270 * self.ui))
        ttk.Label(left, text="이미지 목록", style="Bold.TLabel").pack(anchor="w")
        row = ttk.Frame(left)
        row.pack(fill="x", pady=(4, 2))
        ttk.Label(row, text="보기").pack(side="left")
        self.var_filter = tk.StringVar(value=FILTERS[0])
        cb = ttk.Combobox(row, textvariable=self.var_filter, values=FILTERS, state="readonly", width=16)
        cb.pack(side="left", fill="x", expand=True, padx=(6, 0))
        cb.bind("<<ComboboxSelected>>", lambda e: (self.refresh_image_list(), self.canvas.focus_set()))
        row2 = ttk.Frame(left)
        row2.pack(fill="x", pady=(2, 4))
        ttk.Label(row2, text="검색").pack(side="left")
        self.var_search = tk.StringVar()
        ent = ttk.Entry(row2, textvariable=self.var_search)
        ent.pack(side="left", fill="x", expand=True, padx=(6, 0))
        self.var_search.trace_add("write", lambda *a: self._schedule_search())
        lf = ttk.Frame(left)
        lf.pack(fill="both", expand=True)
        self.tree_img = ttk.Treeview(lf, columns=("st", "name", "n"), show="headings", selectmode="browse")
        self.tree_img.heading("st", text="✔")
        self.tree_img.heading("name", text="파일")
        self.tree_img.heading("n", text="박스")
        self.tree_img.column("st", width=int(30 * self.ui), anchor="center", stretch=False)
        self.tree_img.column("name", width=int(170 * self.ui), anchor="w")
        self.tree_img.column("n", width=int(44 * self.ui), anchor="e", stretch=False)
        self.tree_img.tag_configure("rev", foreground="#1a7f37")
        self.tree_img.tag_configure("auto", foreground="#b45309")
        self.tree_img.tag_configure("none", foreground="#374151")
        ysb = ttk.Scrollbar(lf, orient="vertical", command=self.tree_img.yview)
        self.tree_img.configure(yscrollcommand=ysb.set)
        self.tree_img.pack(side="left", fill="both", expand=True)
        ysb.pack(side="right", fill="y")
        self.tree_img.bind("<<TreeviewSelect>>", self.on_image_select)
        self.lbl_progress = ttk.Label(left, text="", style="Muted.TLabel", justify="left")
        self.lbl_progress.pack(anchor="w", pady=(4, 0))

        # 가운데: 캔버스
        center = ttk.Frame(paned)
        self.canvas = tk.Canvas(center, bg="#262a30", highlightthickness=0, cursor="crosshair", takefocus=1)
        self.canvas.pack(fill="both", expand=True)
        self.center = center

        # 오른쪽: 클래스 / 박스
        right = ttk.Frame(paned, padding=(6, 4), width=int(270 * self.ui))
        ttk.Label(right, text="클래스", style="Bold.TLabel").pack(anchor="w")
        self.lbl_class_src = ttk.Label(right, text="", style="Muted.TLabel", wraplength=int(250 * self.ui))
        self.lbl_class_src.pack(anchor="w")
        cf = ttk.Frame(right)
        cf.pack(fill="both", expand=True, pady=(4, 0))
        self.tree_cls = ttk.Treeview(cf, columns=("key", "n"), selectmode="browse", height=10)
        self.tree_cls.heading("#0", text="이름")
        self.tree_cls.heading("key", text="키")
        self.tree_cls.heading("n", text="박스")
        self.tree_cls.column("#0", width=int(160 * self.ui), anchor="w")
        self.tree_cls.column("key", width=int(34 * self.ui), anchor="center", stretch=False)
        self.tree_cls.column("n", width=int(40 * self.ui), anchor="e", stretch=False)
        csb = ttk.Scrollbar(cf, orient="vertical", command=self.tree_cls.yview)
        self.tree_cls.configure(yscrollcommand=csb.set)
        self.tree_cls.pack(side="left", fill="both", expand=True)
        csb.pack(side="right", fill="y")
        self.tree_cls.bind("<<TreeviewSelect>>", self.on_class_select)
        ttk.Label(right, text="숫자키 1~9, 0 으로도 고를 수 있어요.", style="Muted.TLabel").pack(anchor="w", pady=(2, 0))

        ttk.Separator(right, orient="horizontal").pack(fill="x", pady=8)
        ttk.Label(right, text="이 이미지의 박스", style="Bold.TLabel").pack(anchor="w")
        bf = ttk.Frame(right)
        bf.pack(fill="both", expand=True, pady=(4, 0))
        self.tree_box = ttk.Treeview(bf, columns=("i", "cls", "size"), show="headings", selectmode="browse", height=8)
        self.tree_box.heading("i", text="#")
        self.tree_box.heading("cls", text="클래스")
        self.tree_box.heading("size", text="크기(px)")
        self.tree_box.column("i", width=int(32 * self.ui), anchor="center", stretch=False)
        self.tree_box.column("cls", width=int(120 * self.ui), anchor="w")
        self.tree_box.column("size", width=int(80 * self.ui), anchor="e", stretch=False)
        bsb = ttk.Scrollbar(bf, orient="vertical", command=self.tree_box.yview)
        self.tree_box.configure(yscrollcommand=bsb.set)
        self.tree_box.pack(side="left", fill="both", expand=True)
        bsb.pack(side="right", fill="y")
        self.tree_box.bind("<<TreeviewSelect>>", self.on_box_select)
        self.tree_box.bind("<Double-Button-1>", lambda e: self.change_class_dialog())
        brow = ttk.Frame(right)
        brow.pack(fill="x", pady=(4, 0))
        ttk.Button(brow, text="클래스 바꾸기", command=self.change_class_dialog, takefocus=0).pack(side="left")
        ttk.Button(brow, text="지우기", command=self.delete_selected, takefocus=0).pack(side="left", padx=4)

        ttk.Separator(right, orient="horizontal").pack(fill="x", pady=8)
        ttk.Label(right, style="Muted.TLabel", justify="left", text=(
            "끌기: 박스 그리기   클릭: 선택\n"
            "1~9, 0: 클래스   Del: 지우기\n"
            "A / D: 이전 / 다음   N: 미확인\n"
            "휠: 확대   Space+끌기: 이동\n"
            "%s+Z: 되돌리기   F1: 설명서" % MOD)).pack(anchor="w")

        paned.add(left, weight=0)
        paned.add(center, weight=1)
        paned.add(right, weight=0)

        # 시작 화면
        self.welcome = ttk.Frame(center, padding=30)
        ttk.Label(self.welcome, text=APP_NAME, style="Title.TLabel").pack(pady=(0, 4))
        ttk.Label(self.welcome, text="이미지에 사각형 박스(bbox)와 클래스를 직접 그리는 라벨링 프로그램",
                  style="Muted.TLabel").pack(pady=(0, 18))
        ttk.Button(self.welcome, text="데이터 폴더 열기", style="Big.TButton", command=self.ask_open_dataset,
                   takefocus=0).pack(fill="x", pady=4)
        ttk.Button(self.welcome, text="새 데이터 폴더 만들기", style="Big.TButton", command=self.new_dataset,
                   takefocus=0).pack(fill="x", pady=4)
        ttk.Button(self.welcome, text="사용 설명서 보기", style="Big.TButton", command=self.show_help,
                   takefocus=0).pack(fill="x", pady=4)
        self.welcome_recent = ttk.Frame(self.welcome)
        self.welcome_recent.pack(fill="x", pady=(14, 0))
        ttk.Label(self.welcome, justify="left", style="Muted.TLabel", text=(
            "\n데이터 폴더 모양\n"
            "  my-dataset/\n"
            "   ├─ images/        이미지 (필수)\n"
            "   ├─ labels/        YOLO 라벨 (선택)\n"
            "   └─ classes.txt    클래스 (또는 data.yaml, annotations.json)")).pack(anchor="w")

    def _bind(self):
        c = self.canvas
        c.bind("<ButtonPress-1>", self.on_press)
        c.bind("<B1-Motion>", self.on_drag)
        c.bind("<ButtonRelease-1>", self.on_release)
        c.bind("<Motion>", self.on_motion)
        c.bind("<Leave>", lambda e: (c.delete("cross"), setattr(self, "mouse", None)))
        c.bind("<Configure>", self.on_configure)
        # macOS 는 오른쪽 버튼이 2번, 가운데 버튼이 3번이에요.
        mid, right = (3, 2) if IS_MAC else (2, 3)
        c.bind("<Button-%d>" % mid, self.on_pan_press)
        c.bind("<B%d-Motion>" % mid, self.on_drag)
        c.bind("<ButtonRelease-%d>" % mid, self.on_release)
        c.bind("<Button-%d>" % right, self.on_right_click)
        if IS_MAC:
            c.bind("<Control-Button-1>", self.on_right_click)
        c.bind("<MouseWheel>", self.on_wheel)
        c.bind("<Button-4>", lambda e: self.zoom_at(e.x, e.y, 1.2))
        c.bind("<Button-5>", lambda e: self.zoom_at(e.x, e.y, 1 / 1.2))
        self.root.bind("<KeyPress-space>", self.on_space_down)
        self.root.bind("<KeyRelease-space>", self.on_space_up)
        self.root.bind("<KeyPress>", self.on_key)
        self.root.report_callback_exception = self.on_exception
        self.root.after(300, self._disable_ime)

    def _disable_ime(self):
        """Windows: 캔버스와 목록에서는 한글 입력기를 꺼서 단축키가 바로 먹게 합니다."""
        if not IS_WIN:
            return
        try:
            import ctypes
            imm = ctypes.windll.imm32
            imm.ImmAssociateContext.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
            imm.ImmAssociateContext.restype = ctypes.c_void_p
            for w in (self.canvas, self.tree_img, self.tree_cls, self.tree_box):
                imm.ImmAssociateContext(w.winfo_id(), None)
        except Exception:  # noqa: BLE001
            pass

    def _startup(self):
        last = self.settings.get("last_dataset")
        if last and os.path.isdir(last):
            self.open_dataset(last, quiet=True)
        if not self.settings.get("first_run_done"):
            self.settings["first_run_done"] = True
            save_settings(self.settings)
            self.show_help()
        self.canvas.focus_set()

    def on_exception(self, exc, val, tb):
        text = "".join(traceback.format_exception(exc, val, tb))
        log_error(text)
        messagebox.showerror(APP_NAME, "예상하지 못한 오류가 났어요.\n\n%s\n\n자세한 내용은 아래 파일에 저장했어요.\n%s" % (val, LOG_PATH))

    # ----- 시작 화면 / 상태 표시 -----
    def show_welcome(self):
        for w in self.welcome_recent.winfo_children():
            w.destroy()
        recent = [p for p in self.settings.get("recent", []) if os.path.isdir(p)][:5]
        if recent:
            ttk.Label(self.welcome_recent, text="최근 연 폴더", style="Bold.TLabel").pack(anchor="w")
            for p in recent:
                ttk.Button(self.welcome_recent, text=p, takefocus=0,
                           command=lambda p=p: self.open_dataset(p)).pack(fill="x", pady=1)
        self.welcome.place(relx=0.5, rely=0.5, anchor="center")

    def hide_welcome(self):
        self.welcome.place_forget()

    def set_status(self, text):
        self.lbl_status.configure(text=text)

    def update_title(self):
        if not self.ds:
            self.root.title(APP_NAME)
            return
        rel = self.ds.images[self.index] if 0 <= self.index < len(self.ds.images) else ""
        self.root.title("%s%s - %s - %s" % ("* " if self.dirty else "", rel or "(이미지 없음)", self.ds.name, APP_NAME))
        if rel:
            self.lbl_pos.configure(text="%d / %d   %s" % (self.index + 1, len(self.ds.images), rel))
        else:
            self.lbl_pos.configure(text="")

    def update_info(self):
        if not self.img:
            self.lbl_info.configure(text="")
            return
        txt = "%d×%d px   배율 %d%%" % (self.W, self.H, round(self.scale * 100))
        if self.mouse:
            ix, iy = self.c2i(*self.mouse)
            if 0 <= ix <= self.W and 0 <= iy <= self.H:
                txt += "   x=%d, y=%d" % (ix, iy)
        self.lbl_info.configure(text=txt)

    def update_progress(self):
        if not self.ds:
            self.lbl_progress.configure(text="")
            return
        total = len(self.ds.images)
        rev = len(self.ds.reviewed)
        withbox = sum(1 for c in self.ds.counts.values() if c)
        boxes = sum(c for c in self.ds.counts.values() if c)
        self.lbl_progress.configure(text="확인 %d / %d장\n박스 있는 이미지 %d장 · 박스 %d개" % (rev, total, withbox, boxes))

    def update_class_label(self):
        if not self.ds:
            self.lbl_class.configure(text="현재 클래스: -", bg="#e5e7eb", fg="#111827")
            return
        i = self.cur_class
        color = self.color_for(i)
        self.lbl_class.configure(text="현재 클래스: %d. %s" % (i + 1, self.class_label(i)), bg=color, fg=text_color_for(color))

    def class_label(self, cls):
        if self.ds and 0 <= cls < len(self.ds.class_names):
            return self.ds.class_names[cls]
        return "알 수 없음(%d)" % cls

    def color_for(self, cls):
        if self.ds and 0 <= cls < len(self.ds.class_names):
            return class_color(cls)
        return "#9e9e9e"

    # ----- 데이터 폴더 -----
    def ask_open_dataset(self):
        init = self.settings.get("last_dataset") or os.path.expanduser("~")
        init = os.path.dirname(init) if os.path.isdir(init) else os.path.expanduser("~")
        path = filedialog.askdirectory(parent=self.root, title="데이터 폴더 선택 (images 폴더가 들어 있는 폴더)",
                                       initialdir=init, mustexist=True)
        if path:
            self.open_dataset(path)

    def _fix_missing_images_dir(self, path):
        try:
            files = [f for f in os.listdir(path) if is_image_file(f) and os.path.isfile(os.path.join(path, f))]
        except OSError as e:
            messagebox.showerror(APP_NAME, "폴더를 읽을 수 없어요.\n%s" % e)
            return False
        if files:
            if not messagebox.askyesno(APP_NAME,
                                       "선택한 폴더에 'images' 폴더가 없고, 이미지 %d장이 바로 들어 있어요.\n\n"
                                       "규격에 맞게 'images' 폴더를 만들어 이미지를 옮길까요?\n"
                                       "(이름이 같은 .txt 라벨이 있으면 'labels' 폴더로 함께 옮겨요)\n\n%s" % (len(files), path)):
                return False
            img_dir, lab_dir = os.path.join(path, "images"), os.path.join(path, "labels")
            os.makedirs(img_dir, exist_ok=True)
            moved = 0
            for f in files:
                try:
                    shutil.move(os.path.join(path, f), os.path.join(img_dir, f))
                    moved += 1
                    txt = os.path.splitext(f)[0] + ".txt"
                    if txt.lower() not in TXT_CLASS_FILES and os.path.isfile(os.path.join(path, txt)):
                        os.makedirs(lab_dir, exist_ok=True)
                        shutil.move(os.path.join(path, txt), os.path.join(lab_dir, txt))
                except OSError as e:
                    log_error("move failed: %s" % e)
            self.set_status("이미지 %d장을 images 폴더로 옮겼어요." % moved)
            return True
        if messagebox.askyesno(APP_NAME, "선택한 폴더에 'images' 폴더가 없어요.\n\n"
                                         "이 폴더를 새 데이터 폴더로 쓰도록 'images' 폴더를 만들까요?\n%s" % path):
            os.makedirs(os.path.join(path, "images"), exist_ok=True)
            return True
        return False

    def open_dataset(self, path, quiet=False, keep_rel=None):
        path = os.path.abspath(path)
        if not os.path.isdir(path):
            if not quiet:
                messagebox.showerror(APP_NAME, "폴더가 없어요.\n%s" % path)
            return False
        if os.path.basename(path).lower() == "images" and not os.path.isdir(os.path.join(path, "images")):
            path = os.path.dirname(path)
        if not os.path.isdir(os.path.join(path, "images")):
            if quiet or not self._fix_missing_images_dir(path):
                return False
        kind, _src = Dataset.find_class_source(path)
        if kind is None:
            if quiet:
                return False
            names = ClassSetupDialog(self.root, path).show()
            if not names:
                return False
            try:
                atomic_write_text(os.path.join(path, "classes.txt"), "\n".join(names) + "\n")
            except OSError as e:
                messagebox.showerror(APP_NAME, "classes.txt 를 만들 수 없어요.\n%s" % e)
                return False
        if self.ds is not None and not self.leave_current():
            return False

        self.root.config(cursor="watch")
        self.set_status("불러오는 중... %s" % path)
        self.root.update_idletasks()
        try:
            ds = Dataset(path)
            ds.load()
        except DatasetError as e:
            if not quiet:
                messagebox.showerror(APP_NAME, str(e))
            return False
        except Exception as e:  # noqa: BLE001
            log_error(traceback.format_exc())
            if not quiet:
                messagebox.showerror(APP_NAME, "데이터 폴더를 열 수 없어요.\n%s\n\n자세한 내용: %s" % (e, LOG_PATH))
            return False
        finally:
            self.root.config(cursor="")

        self.ds = ds
        self.index = -1
        self.img = None
        self.boxes = []
        self.selected = None
        self.dirty = False
        self.polygon_policy = None
        self.cur_class = min(self.cur_class, len(ds.class_names) - 1) if keep_rel else 0
        self.settings["last_dataset"] = ds.root
        recent = [p for p in self.settings.get("recent", []) if os.path.normcase(p) != os.path.normcase(ds.root)]
        self.settings["recent"] = [ds.root] + recent[:7]
        save_settings(self.settings)
        self.rebuild_recent_menu()
        self.hide_welcome()
        self.lbl_class_src.configure(text="%s 에서 읽음 (%d개)" % (ds.class_source, len(ds.class_names)))
        self.refresh_class_list()
        self.refresh_image_list()
        self.update_class_label()
        self.update_progress()

        msg = "열었어요: %s  (이미지 %d장, 클래스 %d개)" % (ds.root, len(ds.images), len(ds.class_names))
        if ds.coco_path:
            msg += "  · COCO: %s" % os.path.basename(ds.coco_path)
        self.set_status(msg)
        if ds.warnings and not quiet:
            messagebox.showwarning(APP_NAME, "데이터 폴더를 열었지만 확인할 점이 있어요.\n\n- " + "\n- ".join(ds.warnings))
        elif ds.warnings:
            self.set_status(msg + "  ·  " + ds.warnings[0])

        if not ds.images:
            self.canvas_message("images 폴더에 이미지가 없어요.\n\n[파일] > [이미지 파일 추가] 로 이미지를 넣어 주세요.\n\n%s" % ds.images_dir)
            self.update_title()
            return True
        start = 0
        want = keep_rel or ds.last
        if want in ds.images:
            start = ds.images.index(want)
        else:
            for i, r in enumerate(ds.images):
                if r not in ds.reviewed:
                    start = i
                    break
        self.load_image(start)
        return True

    def reload_dataset(self):
        if not self.ds:
            return
        rel = self.ds.images[self.index] if 0 <= self.index < len(self.ds.images) else None
        if not self.leave_current(mark_reviewed=False):
            return
        self.index = -1
        self.img = None
        self.open_dataset(self.ds.root, keep_rel=rel)

    def new_dataset(self):
        init = os.path.dirname(self.settings.get("last_dataset") or "") or os.path.expanduser("~")
        res = NewDatasetDialog(self.root, init).show()
        if not res:
            return
        path, add = res
        if self.open_dataset(path) and add:
            self.add_images(False)

    def add_images(self, from_folder):
        if not self.ds:
            messagebox.showinfo(APP_NAME, "먼저 데이터 폴더를 열거나 만들어 주세요.")
            return
        if from_folder:
            d = filedialog.askdirectory(parent=self.root, title="추가할 이미지가 있는 폴더 (하위 폴더 포함)")
            if not d:
                return
            files = []
            for dp, dn, fns in os.walk(d):
                dn[:] = [x for x in dn if not x.startswith(".")]
                files += [os.path.join(dp, f) for f in fns if is_image_file(f)]
        else:
            files = filedialog.askopenfilenames(parent=self.root, title="추가할 이미지 파일 (여러 개 선택 가능)",
                                                filetypes=[("이미지", " ".join("*" + e for e in IMAGE_EXTS)), ("모든 파일", "*.*")])
            files = [f for f in files if is_image_file(f)]
        if not files:
            return
        self.root.config(cursor="watch")
        self.root.update_idletasks()
        n = 0
        try:
            os.makedirs(self.ds.images_dir, exist_ok=True)
            for src in files:
                dst = unique_path(os.path.join(self.ds.images_dir, os.path.basename(src)))
                try:
                    if os.path.normcase(os.path.abspath(src)) != os.path.normcase(os.path.abspath(dst)):
                        shutil.copy2(src, dst)
                        n += 1
                except OSError as e:
                    log_error("copy failed: %s -> %s: %s" % (src, dst, e))
        finally:
            self.root.config(cursor="")
        self.reload_dataset()
        self.set_status("이미지 %d장을 images 폴더에 복사했어요." % n)

    def rebuild_recent_menu(self):
        self.recent_menu.delete(0, "end")
        recent = self.settings.get("recent", [])
        if not recent:
            self.recent_menu.add_command(label="(없음)", state="disabled")
        for p in recent:
            self.recent_menu.add_command(label=p, command=lambda p=p: self.open_dataset(p))

    # ----- 목록 -----
    def _schedule_search(self):
        if self._search_job:
            self.root.after_cancel(self._search_job)
        self._search_job = self.root.after(250, self.refresh_image_list)

    def image_status(self, rel):
        if rel in self.ds.reviewed:
            return "✔", "rev"
        if self.ds.has_label(rel):
            return "◐", "auto"
        return "", "none"

    def _passes_filter(self, rel, flt):
        if flt == FILTERS[1]:
            return rel not in self.ds.reviewed
        if flt == FILTERS[2]:
            return rel in self.ds.reviewed
        if flt == FILTERS[3]:
            return bool(self.ds.counts.get(rel))
        if flt == FILTERS[4]:
            return not self.ds.counts.get(rel)
        return True

    def refresh_image_list(self):
        self._search_job = None
        t = self.tree_img
        t.delete(*t.get_children())
        self.visible, self.visible_pos = [], {}
        if not self.ds:
            return
        flt = self.var_filter.get()
        q = self.var_search.get().strip().lower()
        for i, rel in enumerate(self.ds.images):
            if q and q not in rel.lower():
                continue
            if i != self.index and not self._passes_filter(rel, flt):
                continue
            self.visible_pos[i] = len(self.visible)
            self.visible.append(i)
            sym, tag = self.image_status(rel)
            n = self.ds.counts.get(rel)
            t.insert("", "end", iid=str(i), values=(sym, rel, "" if n is None else n), tags=(tag,))
        self.select_list_row()

    def update_list_row(self, i):
        if not self.ds or not self.tree_img.exists(str(i)):
            return
        rel = self.ds.images[i]
        sym, tag = self.image_status(rel)
        n = self.ds.counts.get(rel)
        self.tree_img.item(str(i), values=(sym, rel, "" if n is None else n), tags=(tag,))

    def select_list_row(self):
        iid = str(self.index)
        if self.index >= 0 and self.tree_img.exists(iid):
            if self.tree_img.selection() != (iid,):
                self.tree_img.selection_set(iid)
            self.tree_img.see(iid)

    def on_image_select(self, _e=None):
        sel = self.tree_img.selection()
        if not sel:
            return
        i = int(sel[0])
        if i != self.index:
            if not self.go_to(i):
                self.select_list_row()

    def refresh_class_list(self):
        t = self.tree_cls
        t.delete(*t.get_children())
        self._swatches = []
        if not self.ds:
            return
        sz = int(14 * self.ui)
        for i, name in enumerate(self.ds.class_names):
            img = tk.PhotoImage(width=sz, height=sz)
            img.put(class_color(i), to=(0, 0, sz, sz))
            self._swatches.append(img)
            key = str(i + 1) if i < 9 else ("0" if i == 9 else "")
            t.insert("", "end", iid=str(i), text=" " + name, image=img, values=(key, ""))
        self.sync_class_selection()

    def sync_class_selection(self):
        iid = str(self.cur_class)
        if self.tree_cls.exists(iid) and self.tree_cls.selection() != (iid,):
            self.tree_cls.selection_set(iid)
            self.tree_cls.see(iid)

    def refresh_class_counts(self):
        if not self.ds:
            return
        counts = {}
        for b in self.boxes:
            counts[b.cls] = counts.get(b.cls, 0) + 1
        for i in range(len(self.ds.class_names)):
            self.tree_cls.set(str(i), "n", counts.get(i, ""))

    def on_class_select(self, _e=None):
        sel = self.tree_cls.selection()
        if sel:
            self.set_class(int(sel[0]))

    def refresh_box_list(self):
        t = self.tree_box
        t.delete(*t.get_children())
        for i, b in enumerate(self.boxes):
            x1, y1, x2, y2 = b.rect()
            t.insert("", "end", iid=str(i), values=(i + 1, self.class_label(b.cls), "%d×%d" % (round(x2 - x1), round(y2 - y1))))
        if self.selected is not None and t.exists(str(self.selected)):
            t.selection_set(str(self.selected))
            t.see(str(self.selected))
        self.refresh_class_counts()

    def on_box_select(self, _e=None):
        sel = self.tree_box.selection()
        if sel:
            i = int(sel[0])
            if i != self.selected and i < len(self.boxes):
                self.select(i)

    # ----- 이미지 이동 / 저장 -----
    def save_current(self, mark_reviewed=True, force=False):
        if not self.ds or not (0 <= self.index < len(self.ds.images)) or self.img is None:
            return True
        rel = self.ds.images[self.index]
        if self.dirty or force:
            if self.label_had_polygon and self.label_source == "txt":
                if self.polygon_policy is None:
                    ans = messagebox.askyesno(APP_NAME,
                                              "이 이미지의 라벨 파일에는 폴리곤(세그멘테이션) 좌표가 들어 있어요.\n"
                                              "이 프로그램은 박스만 다루기 때문에, 저장하면 폴리곤이 박스로 바뀌어요.\n\n"
                                              "그래도 저장할까요? (이번 실행 동안 같은 답으로 처리해요)")
                    self.polygon_policy = "save" if ans else "skip"
                if self.polygon_policy == "skip":
                    self.dirty = False
                    self.set_status("폴리곤 라벨이라 저장하지 않고 넘어갔어요.")
                    force = False
            if self.dirty or force:
                try:
                    self.ds.save_labels(rel, self.boxes, self.W, self.H)
                except OSError as e:
                    messagebox.showerror(APP_NAME, "라벨을 저장할 수 없어요.\n%s\n\n%s" % (self.ds.label_path(rel), e))
                    return False
                self.dirty = False
                self.label_source = "txt"
                self.label_had_polygon = False
        if mark_reviewed:
            self.ds.reviewed.add(rel)
        self.ds.last = rel
        self.ds.save_state()
        self.update_list_row(self.index)
        self.update_progress()
        self.update_title()
        return True

    def leave_current(self, mark_reviewed=True):
        if not self.ds or self.img is None:
            return True
        if self.drag:
            self.drag = None
        if self.dirty and not self.settings.get("autosave", True):
            ans = messagebox.askyesnocancel(APP_NAME, "이 이미지에서 바꾼 내용을 저장할까요?")
            if ans is None:
                return False
            if not ans:
                self.dirty = False
        return self.save_current(mark_reviewed=mark_reviewed)

    def go_to(self, index):
        if not self.ds or not self.ds.images:
            return False
        index = max(0, min(len(self.ds.images) - 1, index))
        if index == self.index and self.img is not None:
            return True
        if not self.leave_current():
            return False
        self.load_image(index)
        return True

    def load_image(self, index):
        ds = self.ds
        self.index = index
        rel = ds.images[index]
        self.undo_stack, self.redo_stack = [], []
        self.selected = None
        self.drag = None
        self.boxes = []
        self.dirty = False
        self.label_source = None
        self.label_had_polygon = False
        try:
            im = Image.open(ds.image_path(rel))
            try:
                im = ImageOps.exif_transpose(im)
            except Exception:  # noqa: BLE001
                pass
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGBA").convert("RGB") if im.mode in ("P", "LA", "RGBA", "PA") else im.convert("RGB")
            im.load()
        except Exception as e:  # noqa: BLE001
            self.img = None
            self.pyr = {}
            self.canvas_message("이미지를 열 수 없어요.\n\n%s\n\n%s" % (rel, e))
            self.set_status("이미지를 열 수 없어요: %s" % rel)
            self.refresh_box_list()
            self.update_title()
            self.select_list_row()
            return
        self.img = im
        self.W, self.H = im.size
        self.pyr = {1: im}
        notes = []
        try:
            lr = ds.read_labels(rel, size=(self.W, self.H))
        except Exception as e:  # noqa: BLE001
            lr = LabelRead()
            notes.append("라벨을 읽지 못했어요: %s" % e)
        self.boxes = [Box(c, x1 * self.W, y1 * self.H, x2 * self.W, y2 * self.H) for (c, x1, y1, x2, y2) in lr.entries]
        self.label_source = lr.source
        self.label_had_polygon = lr.polygon
        if lr.source == "coco":
            notes.append("COCO 파일에서 라벨을 불러왔어요")
        if lr.polygon:
            notes.append("폴리곤 라벨을 박스로 바꿔서 보여주고 있어요")
        if lr.bad:
            notes.append("라벨 파일에서 읽을 수 없는 줄 %d개는 건너뛰었어요" % lr.bad)
        unknown = sum(1 for b in self.boxes if not 0 <= b.cls < len(ds.class_names))
        if unknown:
            notes.append("클래스 번호가 범위를 벗어난 박스 %d개 (회색)" % unknown)
        ds.last = rel
        self.canvas.delete("msg")
        self.fit()
        self.refresh_box_list()
        self.update_title()
        self.select_list_row()
        state = "✔ 확인함" if rel in ds.reviewed else ("◐ 라벨 있음 (미확인)" if ds.has_label(rel) else "새 이미지")
        self.set_status("%s  ·  박스 %d개%s" % (state, len(self.boxes), ("  ·  " + "  ·  ".join(notes)) if notes else ""))

    def step(self, d):
        if not self.ds or not self.ds.images:
            return
        if not self.visible:
            self.set_status("목록에 보이는 이미지가 없어요. 보기/검색 조건을 확인해 주세요.")
            return
        if self.index in self.visible_pos:
            pos = self.visible_pos[self.index] + d
        else:
            later = [p for p, i in enumerate(self.visible) if (i > self.index if d > 0 else i < self.index)]
            pos = (later[0] if d > 0 else later[-1]) if later else -1
        if pos < 0 or pos >= len(self.visible):
            self.save_current(mark_reviewed=True)
            self.set_status("목록의 %s 이미지예요." % ("마지막" if d > 0 else "첫"))
            return
        self.go_to(self.visible[pos])

    def next_unreviewed(self):
        if not self.ds or not self.ds.images:
            return
        n = len(self.ds.images)
        for k in range(1, n + 1):
            i = (self.index + k) % n
            if i != self.index and self.ds.images[i] not in self.ds.reviewed:
                self.go_to(i)
                return
        self.save_current()
        messagebox.showinfo(APP_NAME, "모든 이미지를 확인했어요!")

    def goto_dialog(self):
        if not self.ds or not self.ds.images:
            return
        n = len(self.ds.images)
        v = simpledialog.askinteger(APP_NAME, "이동할 이미지 번호 (1 ~ %d)" % n, parent=self.root, minvalue=1, maxvalue=n)
        if v:
            self.go_to(v - 1)
        self.canvas.focus_set()

    def cmd_save(self):
        if not self.ds or self.img is None:
            return
        if self.save_current(mark_reviewed=True, force=True):
            rel = self.ds.images[self.index]
            self.set_status("저장했어요: %s  (박스 %d개)" % (os.path.relpath(self.ds.label_path(rel), self.ds.root),
                                                          self.ds.counts.get(rel) or 0))

    # ----- 편집 -----
    def snapshot(self):
        return ([b.copy() for b in self.boxes], self.selected)

    def push_undo(self):
        self.undo_stack.append(self.snapshot())
        if len(self.undo_stack) > 300:
            self.undo_stack.pop(0)
        self.redo_stack = []

    def _restore(self, snap):
        self.boxes, self.selected = [b.copy() for b in snap[0]], snap[1]
        if self.selected is not None and self.selected >= len(self.boxes):
            self.selected = None
        self.mark_dirty()
        self.render_overlay()
        self.refresh_box_list()

    def undo(self):
        if not self.undo_stack:
            self.set_status("되돌릴 작업이 없어요.")
            return
        self.redo_stack.append(self.snapshot())
        self._restore(self.undo_stack.pop())
        self.set_status("되돌렸어요.")

    def redo(self):
        if not self.redo_stack:
            self.set_status("다시 실행할 작업이 없어요.")
            return
        self.undo_stack.append(self.snapshot())
        self._restore(self.redo_stack.pop())
        self.set_status("다시 실행했어요.")

    def mark_dirty(self):
        if not self.dirty:
            self.dirty = True
            self.update_title()

    def select(self, idx):
        self.selected = idx
        if idx is not None and 0 <= self.boxes[idx].cls < len(self.ds.class_names):
            self.cur_class = self.boxes[idx].cls
            self.update_class_label()
            self.sync_class_selection()
        self.render_overlay()
        t = self.tree_box
        if idx is None:
            if t.selection():
                t.selection_remove(*t.selection())
        elif t.exists(str(idx)):
            t.selection_set(str(idx))
            t.see(str(idx))

    def set_class(self, i):
        if not self.ds:
            return
        if not 0 <= i < len(self.ds.class_names):
            self.set_status("%d번 클래스는 없어요. (클래스 %d개)" % (i + 1, len(self.ds.class_names)))
            return
        self.cur_class = i
        self.update_class_label()
        self.sync_class_selection()
        if self.selected is not None and self.selected < len(self.boxes) and self.boxes[self.selected].cls != i:
            self.push_undo()
            self.boxes[self.selected].cls = i
            self.mark_dirty()
            self.render_overlay()
            self.refresh_box_list()
            self.set_status("선택한 박스의 클래스를 '%s'(으)로 바꿨어요." % self.class_label(i))

    def set_box_class(self, idx, cls):
        if 0 <= idx < len(self.boxes):
            self.select(idx)
            self.set_class(cls)

    def change_class_dialog(self, idx=None):
        if not self.ds:
            return
        idx = self.selected if idx is None else idx
        if idx is None or idx >= len(self.boxes):
            self.set_status("먼저 박스를 선택해 주세요.")
            return
        r = ClassPicker(self.root, self.ds.class_names, self.boxes[idx].cls).show()
        if r is not None:
            self.set_box_class(idx, r)
        self.canvas.focus_set()

    def delete_selected(self):
        if self.selected is None or self.selected >= len(self.boxes):
            self.set_status("지울 박스를 먼저 선택해 주세요.")
            return
        self.push_undo()
        del self.boxes[self.selected]
        self.selected = None
        self.mark_dirty()
        self.render_overlay()
        self.refresh_box_list()
        self.set_status("박스를 지웠어요. (%s+Z 로 되돌리기)" % MOD)

    def delete_all(self):
        if not self.boxes:
            return
        if not messagebox.askyesno(APP_NAME, "이 이미지의 박스 %d개를 모두 지울까요?" % len(self.boxes)):
            return
        self.push_undo()
        self.boxes = []
        self.selected = None
        self.mark_dirty()
        self.render_overlay()
        self.refresh_box_list()

    def copy_boxes(self):
        if self.img is None or not self.boxes:
            self.set_status("복사할 박스가 없어요.")
            return
        src = [self.boxes[self.selected]] if self.selected is not None else self.boxes
        self.clipboard = []
        for b in src:
            x1, y1, x2, y2 = b.rect()
            self.clipboard.append((b.cls, x1 / self.W, y1 / self.H, x2 / self.W, y2 / self.H))
        self.set_status("박스 %d개를 복사했어요." % len(self.clipboard))

    def _add_norm_boxes(self, entries, what):
        if self.img is None:
            return
        if not entries:
            self.set_status("%s 박스가 없어요." % what)
            return
        self.push_undo()
        for (c, x1, y1, x2, y2) in entries:
            self.boxes.append(Box(c, _clamp01(x1) * self.W, _clamp01(y1) * self.H, _clamp01(x2) * self.W, _clamp01(y2) * self.H))
        self.mark_dirty()
        self.select(len(self.boxes) - 1)
        self.refresh_box_list()
        self.set_status("%s 박스 %d개를 넣었어요." % (what, len(entries)))

    def paste(self):
        self._add_norm_boxes(list(self.clipboard), "복사한")

    def paste_prev(self):
        if not self.ds or self.img is None:
            return
        if self.index in self.visible_pos and self.visible_pos[self.index] > 0:
            prev = self.visible[self.visible_pos[self.index] - 1]
        elif self.index > 0:
            prev = self.index - 1
        else:
            self.set_status("앞 이미지가 없어요.")
            return
        try:
            entries = self.ds.read_labels(self.ds.images[prev]).entries
        except Exception as e:  # noqa: BLE001
            self.set_status("앞 이미지 라벨을 읽지 못했어요: %s" % e)
            return
        self._add_norm_boxes(entries, "앞 이미지의")

    def toggle_hide(self):
        self.hide_boxes = not self.hide_boxes
        self.render_overlay()
        self.set_status("박스를 숨겼어요. (H 로 다시 보기)" if self.hide_boxes else "박스를 다시 보여줘요.")

    # ----- 대화상자 -----
    def open_settings(self):
        if SettingsDialog(self.root, self.settings).show():
            save_settings(self.settings)
            self.render_overlay()
            self.set_status("설정을 저장했어요.")
        self.canvas.focus_set()

    def open_export(self):
        if not self.ds:
            messagebox.showinfo(APP_NAME, "먼저 데이터 폴더를 열어 주세요.")
            return
        ExportDialog(self).show()
        self.update_progress()
        self.canvas.focus_set()

    def show_help(self, page=0):
        if self.help_win is not None and self.help_win.winfo_exists():
            self.help_win.nb.select(page)
            self.help_win.lift()
            self.help_win.focus_set()
            return
        self.help_win = HelpWindow(self, page)

    def show_about(self):
        pil = getattr(Image, "__version__", "?") if Image else "-"
        messagebox.showinfo(APP_NAME, "%s %s\n\nPython %s · Tk %s · Pillow %s\n\n설정 파일: %s\n오류 기록: %s" % (
            APP_NAME, APP_VERSION, sys.version.split()[0], self.root.tk.call("info", "patchlevel"), pil,
            SETTINGS_PATH, LOG_PATH))

    # ----- 좌표 / 그리기 -----
    def c2i(self, cx, cy):
        return (cx - self.ox) / self.scale, (cy - self.oy) / self.scale

    def i2c(self, x, y):
        return x * self.scale + self.ox, y * self.scale + self.oy

    def clamp_img(self, x, y):
        return max(0.0, min(float(self.W), x)), max(0.0, min(float(self.H), y))

    def fit_scale(self):
        cw, ch = max(1, self.canvas.winfo_width()), max(1, self.canvas.winfo_height())
        return min(cw / float(self.W), ch / float(self.H)) * 0.97

    def fit(self):
        if self.img is None:
            return
        cw, ch = max(1, self.canvas.winfo_width()), max(1, self.canvas.winfo_height())
        s = self.fit_scale()
        self.scale = s
        self.ox, self.oy = (cw - self.W * s) / 2.0, (ch - self.H * s) / 2.0
        self.fit_mode = True
        self.render()

    def zoom_at(self, cx, cy, factor):
        if self.img is None:
            return
        fs = self.fit_scale()
        new = max(min(fs, 1.0) * 0.25, min(40.0, self.scale * factor))
        ix, iy = self.c2i(cx, cy)
        self.scale = new
        self.ox, self.oy = cx - ix * new, cy - iy * new
        self.fit_mode = False
        self.schedule_render()

    def zoom_center(self, factor):
        self.zoom_at(self.canvas.winfo_width() / 2.0, self.canvas.winfo_height() / 2.0, factor)

    def zoom_100(self):
        if self.img is not None:
            self.zoom_center(1.0 / self.scale)

    def schedule_render(self):
        if not self._render_pending:
            self._render_pending = True
            self.root.after_idle(self.render)

    def _pyramid(self, f):
        if f not in self.pyr:
            try:
                self.pyr[f] = self.img.reduce(f)
            except AttributeError:
                self.pyr[f] = self.img.resize(((self.W + f - 1) // f, (self.H + f - 1) // f), Image.BILINEAR)
        return self.pyr[f]

    def canvas_message(self, text):
        c = self.canvas
        c.delete("all")
        self.update_info()
        c.update_idletasks()
        c.create_text(c.winfo_width() / 2, c.winfo_height() / 2, text=text, fill="#d1d5db",
                      font=self.font_big, justify="center", tags="msg", width=max(200, c.winfo_width() - 80))

    def render(self):
        self._render_pending = False
        c = self.canvas
        c.delete("img")
        if self.img is None:
            c.delete("ov")
            return
        cw, ch = max(1, c.winfo_width()), max(1, c.winfo_height())
        s = self.scale
        ix0, iy0 = max(0.0, -self.ox / s), max(0.0, -self.oy / s)
        ix1, iy1 = min(float(self.W), (cw - self.ox) / s), min(float(self.H), (ch - self.oy) / s)
        if ix1 - ix0 > 0.01 and iy1 - iy0 > 0.01:
            dx0, dy0 = ix0 * s + self.ox, iy0 * s + self.oy
            dw = max(1, int(round((ix1 - ix0) * s)))
            dh = max(1, int(round((iy1 - iy0) * s)))
            f = 1
            while f * 2 <= 1.0 / s and f < 16:
                f *= 2
            src = self._pyramid(f)
            box = (ix0 / f, iy0 / f, min(src.size[0], ix1 / f), min(src.size[1], iy1 / f))
            resample = Image.NEAREST if s >= 3 else Image.BILINEAR
            try:
                part = src.resize((dw, dh), resample, box=box)
            except TypeError:
                part = src.crop(tuple(int(v) for v in box)).resize((dw, dh), resample)
            self._photo = ImageTk.PhotoImage(part)
            c.create_image(int(round(dx0)), int(round(dy0)), image=self._photo, anchor="nw", tags="img")
            c.tag_lower("img")
        self.render_overlay()
        self.update_info()

    def render_overlay(self):
        c = self.canvas
        c.delete("ov")
        if self.img is None:
            return
        lw = max(1, int(self.settings.get("line_width", 2) * self.ui))
        if not self.hide_boxes:
            order = [i for i in range(len(self.boxes)) if i != self.selected]
            if self.selected is not None and self.selected < len(self.boxes):
                order.append(self.selected)
            for i in order:
                b = self.boxes[i]
                x1, y1, x2, y2 = b.rect()
                X1, Y1 = self.i2c(x1, y1)
                X2, Y2 = self.i2c(x2, y2)
                color = self.color_for(b.cls)
                sel = i == self.selected
                if sel:
                    c.create_rectangle(X1 - 1, Y1 - 1, X2 + 1, Y2 + 1, outline="#000000", width=lw + 3, tags="ov")
                c.create_rectangle(X1, Y1, X2, Y2, outline=color, width=lw + (1 if sel else 0), tags="ov")
                if self.settings.get("show_names", True):
                    name = "%d %s" % (i + 1, self.class_label(b.cls))
                    th = self.font_label.metrics("linespace")
                    above = Y1 - th - 2 > 0
                    t = c.create_text(X1 + 3, (Y1 - 2) if above else (Y1 + 2), text=name, anchor="sw" if above else "nw",
                                      fill=text_color_for(color), font=self.font_label, tags="ov")
                    bb = c.bbox(t)
                    r = c.create_rectangle(bb[0] - 3, bb[1] - 1, bb[2] + 3, bb[3] + 1, fill=color, outline=color, tags="ov")
                    c.tag_lower(r, t)
                if sel:
                    hs = 4 * self.ui
                    mx, my = (X1 + X2) / 2.0, (Y1 + Y2) / 2.0
                    for hx, hy in ((X1, Y1), (X2, Y1), (X1, Y2), (X2, Y2), (mx, Y1), (mx, Y2), (X1, my), (X2, my)):
                        c.create_rectangle(hx - hs, hy - hs, hx + hs, hy + hs, fill="#ffffff", outline="#000000", tags="ov")
        d = self.drag
        if d and d.get("mode") == "draw":
            sx, sy = self.i2c(*d["start_img"])
            ex, ey = self.i2c(*d["cur"])
            color = self.color_for(self.cur_class)
            c.create_rectangle(sx, sy, ex, ey, outline=color, width=lw, dash=(6, 3), tags="ov")
            w, h = abs(d["cur"][0] - d["start_img"][0]), abs(d["cur"][1] - d["start_img"][1])
            c.create_text(max(sx, ex) + 6, max(sy, ey) + 6, anchor="nw", text="%d×%d" % (w, h),
                          fill="#ffffff", font=self.font_label, tags="ov")

    def draw_crosshair(self):
        c = self.canvas
        c.delete("cross")
        if (self.img is None or not self.mouse or not self.settings.get("show_crosshair", True)
                or self.space_down or (self.drag and self.drag.get("mode") in ("pan", "move"))):
            return
        x, y = self.mouse
        w, h = c.winfo_width(), c.winfo_height()
        c.create_line(0, y, w, y, fill="#e5e7eb", dash=(4, 4), tags="cross")
        c.create_line(x, 0, x, h, fill="#e5e7eb", dash=(4, 4), tags="cross")

    # ----- 마우스 -----
    def boxes_at(self, ix, iy):
        tol = 3.0 / self.scale
        cands = [i for i, b in enumerate(self.boxes)
                 if b.rect()[0] - tol <= ix <= b.rect()[2] + tol and b.rect()[1] - tol <= iy <= b.rect()[3] + tol]
        cands.sort(key=lambda i: self.boxes[i].area())
        return cands

    def hit_edges(self, idx, cx, cy):
        if idx is None or idx >= len(self.boxes):
            return (False, False, False, False)
        x1, y1, x2, y2 = self.boxes[idx].rect()
        X1, Y1 = self.i2c(x1, y1)
        X2, Y2 = self.i2c(x2, y2)
        tol = 7 * self.ui
        in_y = Y1 - tol <= cy <= Y2 + tol
        in_x = X1 - tol <= cx <= X2 + tol
        l = abs(cx - X1) <= tol and in_y
        r = abs(cx - X2) <= tol and in_y
        t = abs(cy - Y1) <= tol and in_x
        b = abs(cy - Y2) <= tol and in_x
        if l and r:
            l, r = abs(cx - X1) <= abs(cx - X2), abs(cx - X1) > abs(cx - X2)
        if t and b:
            t, b = abs(cy - Y1) <= abs(cy - Y2), abs(cy - Y1) > abs(cy - Y2)
        return (l, t, r, b)

    @staticmethod
    def edge_cursor(edges):
        l, t, r, b = edges
        if (l and t) or (r and b):
            return "top_left_corner" if (l and t) else "bottom_right_corner"
        if (r and t):
            return "top_right_corner"
        if (l and b):
            return "bottom_left_corner"
        if l or r:
            return "sb_h_double_arrow"
        if t or b:
            return "sb_v_double_arrow"
        return ""

    def set_cursor(self, cur):
        if cur != self._cursor:
            self._cursor = cur
            try:
                self.canvas.configure(cursor=cur)
            except tk.TclError:
                self.canvas.configure(cursor="crosshair")

    def on_configure(self, _e):
        if self.img is None:
            if self.canvas.find_withtag("msg"):
                c = self.canvas
                c.coords("msg", c.winfo_width() / 2, c.winfo_height() / 2)
            return
        if self.fit_mode:
            self.fit()
        else:
            self.schedule_render()

    def on_motion(self, e):
        self.mouse = (e.x, e.y)
        if self.img is None:
            return
        cur = "crosshair"
        if self.space_down:
            cur = "fleur"
        elif self.selected is not None and not self.hide_boxes:
            edges = self.hit_edges(self.selected, e.x, e.y)
            if any(edges):
                cur = self.edge_cursor(edges)
            elif self.selected < len(self.boxes) and self.boxes[self.selected].contains(*self.c2i(e.x, e.y)):
                cur = "fleur"
        self.set_cursor(cur)
        self.draw_crosshair()
        self.update_info()

    def on_press(self, e):
        self.canvas.focus_set()
        if self.img is None:
            return
        if self.space_down:
            self.on_pan_press(e)
            return
        ix, iy = self.c2i(e.x, e.y)
        force_draw = bool(e.state & 0x4) or (IS_MAC and bool(e.state & 0x8))
        if not force_draw and not self.hide_boxes and self.selected is not None:
            edges = self.hit_edges(self.selected, e.x, e.y)
            if any(edges):
                self.drag = {"mode": "resize", "idx": self.selected, "edges": edges, "started": False,
                             "orig": self.boxes[self.selected].copy(), "start": (e.x, e.y)}
                return
        cands = [] if (force_draw or self.hide_boxes) else self.boxes_at(ix, iy)
        if self.selected is not None and self.selected in cands:
            self.drag = {"mode": "pending_move", "idx": self.selected, "cands": cands, "start": (e.x, e.y),
                         "start_img": (ix, iy), "orig": self.boxes[self.selected].copy()}
        else:
            self.drag = {"mode": "pending", "cands": cands, "start": (e.x, e.y), "start_img": self.clamp_img(ix, iy)}

    def on_pan_press(self, e):
        self.canvas.focus_set()
        if self.img is None:
            return
        self.drag = {"mode": "pan", "start": (e.x, e.y), "o": (self.ox, self.oy)}
        self.set_cursor("fleur")

    def on_drag(self, e):
        d = self.drag
        if not d or self.img is None:
            return
        self.mouse = (e.x, e.y)
        mode = d["mode"]
        if mode == "pan":
            self.ox = d["o"][0] + e.x - d["start"][0]
            self.oy = d["o"][1] + e.y - d["start"][1]
            self.fit_mode = False
            self.canvas.delete("cross")
            self.schedule_render()
            return
        moved = abs(e.x - d["start"][0]) > 3 or abs(e.y - d["start"][1]) > 3
        if mode == "pending":
            if not moved:
                return
            d["mode"] = mode = "draw"
            d["cur"] = d["start_img"]
            if self.selected is not None:
                self.select(None)
        elif mode == "pending_move":
            if not moved:
                return
            self.push_undo()
            d["mode"] = mode = "move"
        elif mode == "resize" and not d["started"]:
            if not (abs(e.x - d["start"][0]) > 1 or abs(e.y - d["start"][1]) > 1):
                return
            self.push_undo()
            d["started"] = True
        ix, iy = self.c2i(e.x, e.y)
        if mode == "draw":
            d["cur"] = self.clamp_img(ix, iy)
        elif mode == "move":
            o = d["orig"]
            x1, y1, x2, y2 = o.rect()
            dx, dy = ix - d["start_img"][0], iy - d["start_img"][1]
            dx = max(-x1, min(self.W - x2, dx))
            dy = max(-y1, min(self.H - y2, dy))
            b = self.boxes[d["idx"]]
            b.x1, b.y1, b.x2, b.y2 = x1 + dx, y1 + dy, x2 + dx, y2 + dy
            self.mark_dirty()
        elif mode == "resize":
            x1, y1, x2, y2 = d["orig"].rect()
            cx, cy = self.clamp_img(ix, iy)
            l, t, r, bt = d["edges"]
            if l:
                x1 = cx
            if r:
                x2 = cx
            if t:
                y1 = cy
            if bt:
                y2 = cy
            b = self.boxes[d["idx"]]
            b.x1, b.y1, b.x2, b.y2 = x1, y1, x2, y2
            self.mark_dirty()
        self.render_overlay()
        self.draw_crosshair()
        self.update_info()

    def on_release(self, e):
        d, self.drag = self.drag, None
        if not d or self.img is None:
            return
        mode = d["mode"]
        if mode == "pending":
            self.select(d["cands"][0] if d["cands"] else None)
        elif mode == "pending_move":
            cands = d["cands"]
            if len(cands) > 1:
                k = cands.index(d["idx"])
                self.select(cands[(k + 1) % len(cands)])
        elif mode == "draw":
            (x1, y1), (x2, y2) = d["start_img"], d["cur"]
            w, h = abs(x2 - x1), abs(y2 - y1)
            if w * self.scale >= 4 and h * self.scale >= 4 and w >= 1 and h >= 1:
                self.push_undo()
                self.boxes.append(Box(self.cur_class, min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)))
                self.mark_dirty()
                self.refresh_box_list()
                self.select(len(self.boxes) - 1)
                if self.settings.get("ask_class_after_draw"):
                    r = ClassPicker(self.root, self.ds.class_names, self.cur_class, e.x_root, e.y_root).show()
                    if r is not None:
                        self.set_class(r)
                    self.canvas.focus_set()
                self.set_status("'%s' 박스를 추가했어요. (박스 %d개)" % (self.class_label(self.boxes[-1].cls), len(self.boxes)))
            self.render_overlay()
        elif mode in ("move", "resize"):
            b = self.boxes[d["idx"]]
            b.normalize()
            if b.x2 - b.x1 < 1 or b.y2 - b.y1 < 1:
                o = d["orig"]
                b.x1, b.y1, b.x2, b.y2 = o.rect()
            self.render_overlay()
            self.refresh_box_list()
        elif mode == "pan":
            self.set_cursor("crosshair")

    def on_right_click(self, e):
        if self.img is None or not self.ds:
            return
        ix, iy = self.c2i(e.x, e.y)
        cands = self.boxes_at(ix, iy) if not self.hide_boxes else []
        if not cands:
            return
        idx = self.selected if self.selected in cands else cands[0]
        self.select(idx)
        menu = tk.Menu(self.root, tearoff=0)
        sub = tk.Menu(menu, tearoff=0)
        for i, n in enumerate(self.ds.class_names):
            sub.add_command(label="%d. %s" % (i + 1, n), command=lambda i=i: self.set_box_class(idx, i))
        menu.add_cascade(label="클래스 바꾸기", menu=sub)
        menu.add_command(label="클래스 검색해서 바꾸기...", command=lambda: self.change_class_dialog(idx))
        menu.add_command(label="박스 복사", command=self.copy_boxes)
        menu.add_separator()
        menu.add_command(label="박스 지우기", command=self.delete_selected)
        try:
            menu.tk_popup(e.x_root, e.y_root)
        finally:
            menu.grab_release()

    def on_wheel(self, e):
        if self.img is None or not e.delta:
            return
        self.zoom_at(e.x, e.y, 1.2 if e.delta > 0 else 1 / 1.2)

    # ----- 키보드 -----
    def _key_allowed(self, e):
        w = e.widget
        if isinstance(w, str) or not hasattr(w, "winfo_toplevel"):
            return False
        if isinstance(w, (tk.Entry, ttk.Entry, tk.Text, tk.Spinbox, tk.Listbox)):
            return False
        try:
            return w.winfo_toplevel() is self.root
        except (KeyError, tk.TclError):
            return False

    def on_space_down(self, e):
        if not self._key_allowed(e):
            return None
        if not self.space_down:
            self.space_down = True
            self.set_cursor("fleur")
            self.canvas.delete("cross")
        return "break"

    def on_space_up(self, e):
        if self.space_down:
            self.space_down = False
            self.set_cursor("crosshair")
        return None

    def on_key(self, e):
        if not self._key_allowed(e):
            return None
        ks, ch = e.keysym, (e.char or "")
        ctrl = bool(e.state & 0x4) or (IS_MAC and bool(e.state & 0x8))
        shift = bool(e.state & 0x1)
        key = ks.lower() if len(ks) == 1 else ks
        if ch in HANGUL_KEYS:
            key = HANGUL_KEYS[ch]
        elif IS_WIN and 65 <= e.keycode <= 90:
            key = chr(e.keycode).lower()
        elif IS_WIN and 48 <= e.keycode <= 57 and not shift:
            key = chr(e.keycode)
        elif IS_WIN and 96 <= e.keycode <= 105:
            key = chr(e.keycode - 48)

        if ctrl:
            actions = {"z": self.redo if shift else self.undo, "y": self.redo, "s": self.cmd_save,
                       "o": self.ask_open_dataset, "e": self.open_export, "c": self.copy_boxes,
                       "v": self.paste_prev if shift else self.paste, "g": self.goto_dialog}
            act = actions.get(key)
            if act:
                act()
                return "break"
            return None

        if len(key) == 1 and key.isdigit() and not shift:
            self.set_class(9 if key == "0" else int(key) - 1)
            return "break"
        if ks.startswith("KP_") and ks[3:].isdigit():
            n = int(ks[3:])
            self.set_class(9 if n == 0 else n - 1)
            return "break"
        actions = {
            "a": lambda: self.step(-1), "Left": lambda: self.step(-1),
            "d": lambda: self.step(1), "Right": lambda: self.step(1),
            "n": self.next_unreviewed, "f": self.fit, "h": self.toggle_hide,
            "Delete": self.delete_selected, "BackSpace": self.delete_selected,
            "Escape": self.on_escape, "Tab": lambda: self.cycle_box(-1 if shift else 1),
            "ISO_Left_Tab": lambda: self.cycle_box(-1),
            "plus": lambda: self.zoom_center(1.25), "equal": lambda: self.zoom_center(1.25),
            "KP_Add": lambda: self.zoom_center(1.25),
            "minus": lambda: self.zoom_center(0.8), "KP_Subtract": lambda: self.zoom_center(0.8),
            "F1": self.show_help, "F5": self.reload_dataset,
        }
        if IS_WIN and e.keycode == 187:
            key = "plus"
        elif IS_WIN and e.keycode == 189:
            key = "minus"
        act = actions.get(key) or actions.get(ks)
        if act:
            act()
            return "break"
        return None

    def on_escape(self):
        if self.drag and self.drag.get("mode") == "draw":
            self.drag = None
            self.render_overlay()
            return
        self.select(None)

    def cycle_box(self, d):
        if not self.boxes:
            return
        if self.selected is None:
            self.select(0 if d > 0 else len(self.boxes) - 1)
        else:
            self.select((self.selected + d) % len(self.boxes))

    # ----- 종료 -----
    def on_close(self):
        if self.ds and self.img is not None:
            if not self.leave_current(mark_reviewed=self.dirty):
                return
        try:
            self.settings["geometry"] = self.root.geometry()
        except tk.TclError:
            pass
        save_settings(self.settings)
        self.root.destroy()


# ---------------------------------------------------------------------------
# 시작
# ---------------------------------------------------------------------------
def _enable_dpi_awareness():
    if not IS_WIN:
        return
    try:
        import ctypes
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:  # noqa: BLE001
            ctypes.windll.user32.SetProcessDPIAware()
    except Exception:  # noqa: BLE001
        pass


def main():
    _enable_dpi_awareness()
    root = tk.Tk()
    root.withdraw()
    if sys.version_info < (3, 8):
        messagebox.showerror(APP_NAME, "Python 3.8 이상이 필요해요. 지금 버전: %s" % sys.version.split()[0])
        root.destroy()
        return
    if not ensure_pillow(root):
        root.destroy()
        return
    try:
        App(root)
    except Exception:  # noqa: BLE001
        log_error(traceback.format_exc())
        messagebox.showerror(APP_NAME, "프로그램을 시작하지 못했어요.\n\n자세한 내용: %s" % LOG_PATH)
        root.destroy()
        return
    root.deiconify()
    root.mainloop()


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001
        log_error(traceback.format_exc())
        raise
