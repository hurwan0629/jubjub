# -*- coding: utf-8 -*-
"""데이터 폴더(images/labels/클래스 파일/COCO) 읽기·쓰기와 YOLO/COCO 내보내기.

BBox Labeler(이전 버전)와 같은 규격·같은 상태 파일(.bbox_labeler/state.json)을 써서
두 프로그램이 같은 데이터 폴더를 번갈아 열어도 작업 기록이 이어집니다.
"""

import datetime
import json
import os
import re
import shutil

from PIL import Image

Image.MAX_IMAGE_PIXELS = 400_000_000

APP_NAME = "줍줍 라벨러"
APP_NAME_EN = "JupJup Labeler"
APP_VERSION = "1.0.0"

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff")
BROWSER_EXTS = (".jpg", ".jpeg", ".png", ".bmp", ".webp")
YAML_CLASS_FILES = ("data.yaml", "data.yml", "dataset.yaml")
TXT_CLASS_FILES = ("classes.txt", "obj.names")
COCO_FILES = ("annotations.json", "_annotations.coco.json", "instances.json", "coco.json")
STATE_DIRNAME = ".bbox_labeler"
SPLIT_NAMES = ("train", "val", "valid", "test")

INCLUDE_LABELED = "labeled_or_reviewed"
INCLUDE_REVIEWED = "reviewed"
INCLUDE_ALL = "all"


class DatasetError(Exception):
    pass


class ExportCancelled(Exception):
    pass


# ---------------------------------------------------------------------------
# 공통 도우미
# ---------------------------------------------------------------------------
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
    """EXIF 회전을 반영한 (너비, 높이). YOLO 학습·브라우저 표시 기준과 같습니다."""
    with Image.open(path) as im:
        w, h = im.size
        try:
            orientation = im.getexif().get(0x0112)
        except Exception:  # noqa: BLE001
            orientation = None
    if orientation in (5, 6, 7, 8):
        w, h = h, w
    return w, h


def read_json(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# 클래스 파일
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
    """PyYAML 이 없거나 실패했을 때 쓰는 간단한 names 파서."""
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
            s = _strip_yaml_comment(raw2).strip()
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
        return parse_yaml_names(text)
    except Exception:  # noqa: BLE001 - yaml 미설치/문법 오류는 간단 파서로
        return parse_yaml_names(text)


def read_names_from_txt(path):
    with open(path, encoding="utf-8-sig") as f:
        return [ln.strip() for ln in f if ln.strip()]


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


def find_coco_file(root):
    for n in COCO_FILES:
        p = os.path.join(root, n)
        if os.path.isfile(p):
            return p
    return None


# ---------------------------------------------------------------------------
# 라벨
# ---------------------------------------------------------------------------
def read_yolo_file(path):
    """-> (entries[(cls, nx1, ny1, nx2, ny2)], 읽지 못한 줄 수, 폴리곤 포함 여부)"""
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


def _clamp01(v):
    return 0.0 if v < 0 else (1.0 if v > 1 else v)


def yolo_lines(entries, nc=None):
    """정규화 박스 목록 -> YOLO 줄 목록. nc 를 주면 범위 밖 클래스는 뺍니다. (줄, 뺀 수)"""
    lines, skipped = [], 0
    for (c, x1, y1, x2, y2) in entries:
        c = int(c)
        if nc is not None and not 0 <= c < nc:
            skipped += 1
            continue
        x1, x2 = sorted((_clamp01(float(x1)), _clamp01(float(x2))))
        y1, y2 = sorted((_clamp01(float(y1)), _clamp01(float(y2))))
        if x2 - x1 <= 1e-6 or y2 - y1 <= 1e-6:
            continue
        lines.append("%d %.6f %.6f %.6f %.6f" % (c, (x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1))
    return lines, skipped


class Dataset(object):
    """데이터 폴더 하나."""

    def __init__(self, root):
        self.root = os.path.abspath(root)
        self.name = os.path.basename(self.root.rstrip("\\/")) or self.root
        self.images_dir = os.path.join(self.root, "images")
        self.labels_dir = os.path.join(self.root, "labels")
        self.state_dir = os.path.join(self.root, STATE_DIRNAME)
        self.class_names = []
        self.class_source = ""
        self.coco_cat_ids = None
        self.coco_path = None
        self._coco_data = None
        self.coco_labels = {}
        self.images = []
        self.counts = {}
        self.reviewed = set()
        self.last = ""
        self.warnings = []

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
        kind, path = find_class_source(self.root)
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
        path = self.coco_path or find_coco_file(self.root)
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
        try:
            data = read_json(os.path.join(self.state_dir, "state.json"))
        except (OSError, ValueError):
            return
        known = set(self.images)
        self.reviewed = set(r for r in data.get("reviewed", []) if r in known)
        last = data.get("last", "")
        self.last = last if last in known else ""

    def save_state(self):
        data = {"version": 1, "reviewed": sorted(self.reviewed, key=natural_key), "last": self.last}
        atomic_write_text(os.path.join(self.state_dir, "state.json"), json.dumps(data, ensure_ascii=False, indent=1))

    def _count_all(self):
        self.counts = {rel: self._count(rel) for rel in self.images}

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
        """-> dict(entries=[[cls,nx1,ny1,nx2,ny2]...], source, bad, polygon)"""
        p = self.label_path(rel)
        if os.path.isfile(p):
            entries, bad, poly = read_yolo_file(p)
            return {"entries": [list(e) for e in entries], "source": "txt", "bad": bad, "polygon": poly}
        if rel in self.coco_labels:
            out = []
            for (idx, x1, y1, x2, y2, w, h) in self.coco_labels[rel]:
                if not w or not h:
                    if size is None:
                        size = image_size(self.image_path(rel))
                    w, h = size
                out.append([idx, x1 / float(w), y1 / float(h), x2 / float(w), y2 / float(h)])
            return {"entries": out, "source": "coco", "bad": 0, "polygon": False}
        return {"entries": [], "source": None, "bad": 0, "polygon": False}

    def save_labels(self, rel, entries):
        lines, _ = yolo_lines(entries)
        atomic_write_text(self.label_path(rel), "\n".join(lines) + ("\n" if lines else ""))
        self.counts[rel] = len(lines)
        return len(lines)

    def included(self, rel, include):
        if include == INCLUDE_ALL:
            return True
        if include == INCLUDE_REVIEWED:
            return rel in self.reviewed
        return rel in self.reviewed or self.has_label(rel)


# ---------------------------------------------------------------------------
# 데이터 폴더 준비
# ---------------------------------------------------------------------------
def inspect_folder(path):
    """폴더가 규격에 맞는지 보고 다음 할 일을 알려 줍니다."""
    path = os.path.abspath(path)
    if not os.path.isdir(path):
        return {"status": "missing", "root": path}
    if os.path.basename(path).lower() == "images" and not os.path.isdir(os.path.join(path, "images")):
        path = os.path.dirname(path)
    if not os.path.isdir(os.path.join(path, "images")):
        try:
            flat = [f for f in os.listdir(path) if is_image_file(f) and os.path.isfile(os.path.join(path, f))]
        except OSError:
            flat = []
        return {"status": "need_flat_fix" if flat else "need_images_dir", "root": path, "count": len(flat)}
    kind, _src = find_class_source(path)
    if kind is None:
        return {"status": "need_classes", "root": path}
    return {"status": "ok", "root": path}


def fix_flat_folder(path):
    """폴더에 바로 들어 있는 이미지를 images/ 로, 같은 이름 txt 를 labels/ 로 옮깁니다."""
    img_dir, lab_dir = os.path.join(path, "images"), os.path.join(path, "labels")
    os.makedirs(img_dir, exist_ok=True)
    moved = 0
    for f in os.listdir(path):
        src = os.path.join(path, f)
        if not (is_image_file(f) and os.path.isfile(src)):
            continue
        shutil.move(src, os.path.join(img_dir, f))
        moved += 1
        txt = os.path.splitext(f)[0] + ".txt"
        if txt.lower() not in TXT_CLASS_FILES and os.path.isfile(os.path.join(path, txt)):
            os.makedirs(lab_dir, exist_ok=True)
            shutil.move(os.path.join(path, txt), os.path.join(lab_dir, txt))
    return moved


def write_classes(path, names):
    names = [str(n).strip() for n in names if str(n).strip()]
    if not names:
        raise DatasetError("클래스를 한 개 이상 입력해 주세요.")
    atomic_write_text(os.path.join(path, "classes.txt"), "\n".join(names) + "\n")


def create_dataset(parent, name, names):
    name = (name or "").strip()
    if not parent or not os.path.isdir(parent):
        raise DatasetError("만들 위치(폴더)를 골라 주세요.")
    if not name or re.search(r'[\\/:*?"<>|]', name):
        raise DatasetError("폴더 이름에 \\ / : * ? \" < > | 는 쓸 수 없어요.")
    path = os.path.join(parent, name)
    if os.path.exists(path) and os.listdir(path):
        raise DatasetError("같은 이름의 폴더가 이미 있고 비어 있지 않아요. 다른 이름을 써 주세요.\n%s" % path)
    os.makedirs(os.path.join(path, "images"), exist_ok=True)
    os.makedirs(os.path.join(path, "labels"), exist_ok=True)
    write_classes(path, names)
    return path


def copy_images_into(ds_root, files):
    img_dir = os.path.join(ds_root, "images")
    os.makedirs(img_dir, exist_ok=True)
    n = 0
    for src in files:
        if not is_image_file(src) or not os.path.isfile(src):
            continue
        dst = unique_path(os.path.join(img_dir, os.path.basename(src)))
        if os.path.normcase(os.path.abspath(src)) == os.path.normcase(os.path.abspath(dst)):
            continue
        shutil.copy2(src, dst)
        n += 1
    return n


def list_images_recursive(folder):
    out = []
    for dp, dn, fns in os.walk(folder):
        dn[:] = [x for x in dn if not x.startswith(".")]
        out += [os.path.join(dp, f) for f in fns if is_image_file(f)]
    return out


# ---------------------------------------------------------------------------
# 내보내기
# ---------------------------------------------------------------------------
def export_dataset(ds, fmt, out_parent, include, copy_images, progress=None, cancel=None):
    """데이터셋을 YOLO 또는 COCO 로 내보내고 (결과 폴더, 요약) 을 돌려줍니다."""
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
            lines, skipped = yolo_lines(lab["entries"], nc)
            summary["skipped_unknown"] += skipped
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
            for (c, x1, y1, x2, y2) in lab["entries"]:
                if not 0 <= c < nc:
                    summary["skipped_unknown"] += 1
                    continue
                x1, x2 = sorted((_clamp01(x1) * W, _clamp01(x2) * W))
                y1, y2 = sorted((_clamp01(y1) * H, _clamp01(y2) * H))
                bw, bh = x2 - x1, y2 - y1
                if bw <= 0 or bh <= 0:
                    continue
                anns.append({"id": len(anns) + 1, "image_id": image_id, "category_id": cat_ids[c],
                             "bbox": [round(x1, 2), round(y1, 2), round(bw, 2), round(bh, 2)],
                             "area": round(bw * bh, 2), "iscrowd": 0, "segmentation": []})
        cats = [{"id": cat_ids[i], "name": n, "supercategory": ""} for i, n in enumerate(ds.class_names)]
        info = {"description": "Exported by %s %s from %s" % (APP_NAME_EN, APP_VERSION, ds.name),
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
