# -*- coding: utf-8 -*-
"""화면(JavaScript)에서 window.pywebview.api.<이름>(...) 으로 부르는 기능들.

pywebview 는 호출마다 별도 스레드에서 실행하므로, 데이터 폴더를 건드리는 부분은 잠금(lock)으로 감쌉니다.
밑줄(_)로 시작하는 이름은 화면에 노출되지 않습니다.
"""

import functools
import json
import os
import subprocess
import sys
import threading
import traceback

import core
import sample

DEFAULT_SETTINGS = {
    "theme": "system",                 # system | dark | light
    "export_format": "yolo",           # 기본 내보내기 형식
    "export_include": core.INCLUDE_LABELED,
    "copy_images_on_export": True,
    "export_dir": "",
    "ask_class_after_draw": False,
    "show_names": True,
    "show_crosshair": True,
    "line_width": 2,
    "fill_opacity": 0.14,
    "recent": [],
    "last_dataset": "",
    "first_run_done": False,
    "tour_done": False,
    "window": {"width": 0, "height": 0, "maximized": True},
}


def app_home():
    base = os.environ.get("JUPJUP_HOME")
    if not base:
        if os.name == "nt":
            base = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "JupJupLabeler")
        else:
            base = os.path.join(os.path.expanduser("~"), ".config", "jupjup-labeler")
    os.makedirs(base, exist_ok=True)
    return base


def log_error(text):
    try:
        import datetime
        with open(os.path.join(app_home(), "error.log"), "a", encoding="utf-8") as f:
            f.write("\n[%s] v%s\n%s\n" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), core.APP_VERSION, text))
    except OSError:
        pass


def _ok(**data):
    data["ok"] = True
    return data


def _err(message, **data):
    data.update(ok=False, error=str(message))
    return data


def _guard(fn):
    """예상하지 못한 오류도 화면에 메시지로 돌려주고 error.log 에 남깁니다."""
    @functools.wraps(fn)
    def wrapper(self, *args, **kwargs):
        try:
            return fn(self, *args, **kwargs)
        except core.DatasetError as e:
            return _err(e)
        except Exception as e:  # noqa: BLE001
            log_error("%s%r\n%s" % (fn.__name__, args, traceback.format_exc()))
            return _err("예상하지 못한 오류가 났어요: %s" % e)
    return wrapper


class Api(object):
    def __init__(self):
        self._window = None
        self._server = None
        self._lock = threading.RLock()
        self._ds = None
        self._gen = 0
        self._home = app_home()
        self._settings_path = os.path.join(self._home, "settings.json")
        self._settings = self._load_settings()
        self._export = None

    # ----- 내부 -----
    def _load_settings(self):
        s = json.loads(json.dumps(DEFAULT_SETTINGS))
        try:
            with open(self._settings_path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                for k, v in data.items():
                    if k in s:
                        s[k] = v
        except (OSError, ValueError):
            pass
        return s

    def _save_settings(self):
        try:
            core.atomic_write_text(self._settings_path, json.dumps(self._settings, ensure_ascii=False, indent=2))
        except OSError as e:
            log_error("settings save failed: %s" % e)

    def _current(self):
        return self._ds, self._gen

    def _need_ds(self):
        if self._ds is None:
            raise core.DatasetError("먼저 데이터 폴더를 열어 주세요.")
        return self._ds

    def _summary(self):
        ds = self._ds
        return {
            "root": ds.root, "name": ds.name, "gen": self._gen,
            "class_names": ds.class_names, "class_source": ds.class_source,
            "coco": os.path.basename(ds.coco_path) if ds.coco_path else None,
            "warnings": ds.warnings, "last": ds.last,
            "images": [[r, ds.counts.get(r), r in ds.reviewed] for r in ds.images],
            "images_dir": ds.images_dir, "labels_dir": ds.labels_dir,
        }

    def _remember(self, root):
        recent = [p for p in self._settings.get("recent", []) if os.path.normcase(p) != os.path.normcase(root)]
        self._settings["recent"] = [root] + recent[:7]
        self._settings["last_dataset"] = root
        self._save_settings()

    def _dialog(self, kind, directory="", multiple=False, file_types=()):
        res = self._window.create_file_dialog(kind, directory=directory or "", allow_multiple=multiple,
                                              file_types=tuple(file_types))
        if not res:
            return []
        return [res] if isinstance(res, str) else list(res)

    def _on_closing(self):
        if self._export and not self._export["finished"]:
            self._export["cancel"].set()
        with self._lock:      # 저장 중이던 작업이 끝날 때까지 기다림
            try:
                w = self._window
                if w is not None and not self._settings["window"].get("maximized"):
                    self._settings["window"].update(width=int(w.width), height=int(w.height))
            except Exception:  # noqa: BLE001
                pass
            self._save_settings()
        return True

    def _set_maximized(self, flag):
        self._settings["window"]["maximized"] = bool(flag)

    # ----- 시작 / 설정 -----
    @_guard
    def boot(self):
        recent = [{"path": p, "name": os.path.basename(p.rstrip("\\/")) or p, "exists": os.path.isdir(p)}
                  for p in self._settings.get("recent", [])]
        return _ok(version=core.APP_VERSION, settings=self._settings, recent=recent,
                   token=self._server.token if self._server else "", home=self._home,
                   frozen=bool(getattr(sys, "frozen", False)))

    @_guard
    def save_settings(self, patch):
        for k, v in (patch or {}).items():
            if k in DEFAULT_SETTINGS and k not in ("window", "recent"):
                self._settings[k] = v
        self._save_settings()
        return _ok(settings=self._settings)

    @_guard
    def forget_recent(self, path):
        self._settings["recent"] = [p for p in self._settings.get("recent", []) if p != path]
        self._save_settings()
        return _ok()

    # ----- 파일 선택 -----
    @_guard
    def pick_folder(self, initial=""):
        import webview
        init = initial or (os.path.dirname(self._settings.get("last_dataset") or "") or os.path.expanduser("~"))
        paths = self._dialog(webview.FileDialog.FOLDER, init if os.path.isdir(init) else "")
        return _ok(path=paths[0] if paths else None)

    @_guard
    def pick_images(self):
        import webview
        types = ("이미지 (*.jpg;*.jpeg;*.png;*.bmp;*.webp;*.tif;*.tiff)", "모든 파일 (*.*)")
        paths = self._dialog(webview.FileDialog.OPEN, "", True, types)
        return _ok(paths=paths)

    # ----- 데이터 폴더 -----
    @_guard
    def inspect(self, path):
        return _ok(**core.inspect_folder(path))

    @_guard
    def fix_flat(self, path):
        return _ok(moved=core.fix_flat_folder(path))

    @_guard
    def make_images_dir(self, path):
        os.makedirs(os.path.join(path, "images"), exist_ok=True)
        return _ok()

    @_guard
    def write_classes(self, path, names):
        core.write_classes(path, names)
        return _ok()

    @_guard
    def create_dataset(self, parent, name, names):
        return _ok(path=core.create_dataset(parent, name, names))

    @_guard
    def make_sample(self):
        return _ok(path=sample.make_sample_dataset())

    @_guard
    def open_dataset(self, path):
        info = core.inspect_folder(path)
        if info["status"] != "ok":
            return _ok(**info)
        ds = core.Dataset(info["root"])
        ds.load()
        with self._lock:
            self._ds = ds
            self._gen += 1
            self._remember(ds.root)
            return _ok(status="ok", dataset=self._summary())

    @_guard
    def reload(self):
        ds = self._need_ds()
        return self.open_dataset(ds.root)

    # ----- 라벨 -----
    @_guard
    def load_labels(self, rel):
        ds = self._need_ds()
        return _ok(**ds.read_labels(rel))

    @_guard
    def save_labels(self, rel, entries):
        with self._lock:
            ds = self._need_ds()
            n = ds.save_labels(rel, entries or [])
            return _ok(count=n, path=os.path.relpath(ds.label_path(rel), ds.root).replace(os.sep, "/"))

    @_guard
    def set_reviewed(self, rel, flag):
        with self._lock:
            ds = self._need_ds()
            if flag:
                ds.reviewed.add(rel)
            else:
                ds.reviewed.discard(rel)
            ds.save_state()
            return _ok(reviewed=len(ds.reviewed))

    @_guard
    def set_last(self, rel):
        with self._lock:
            ds = self._need_ds()
            if rel in ds.counts:
                ds.last = rel
                ds.save_state()
        return _ok()

    @_guard
    def add_images(self, paths):
        ds = self._need_ds()
        n = core.copy_images_into(ds.root, paths or [])
        res = self.open_dataset(ds.root)
        res["added"] = n
        return res

    @_guard
    def add_image_folder(self, folder):
        ds = self._need_ds()
        n = core.copy_images_into(ds.root, core.list_images_recursive(folder))
        res = self.open_dataset(ds.root)
        res["added"] = n
        return res

    # ----- 내보내기 -----
    @_guard
    def default_export_dir(self):
        ds = self._need_ds()
        return _ok(path=self._settings.get("export_dir") or os.path.join(ds.root, "export"))

    @_guard
    def export_start(self, fmt, include, copy_images, out_parent):
        ds = self._need_ds()
        if self._export and not self._export["finished"]:
            return _err("이미 내보내는 중이에요.")
        if fmt not in ("yolo", "coco"):
            return _err("알 수 없는 형식이에요: %s" % fmt)
        out_parent = (out_parent or "").strip() or os.path.join(ds.root, "export")
        os.makedirs(out_parent, exist_ok=True)
        default_out = os.path.join(ds.root, "export")
        self._settings.update(export_format=fmt, export_include=include, copy_images_on_export=bool(copy_images),
                              export_dir="" if os.path.normcase(out_parent) == os.path.normcase(default_out) else out_parent)
        self._save_settings()
        st = {"done": 0, "total": 1, "finished": False, "error": None, "result": None, "cancel": threading.Event()}
        self._export = st

        def progress(d, t):
            st["done"], st["total"] = d, max(1, t)

        def work():
            try:
                out, summary = core.export_dataset(ds, fmt, out_parent, include, bool(copy_images), progress, st["cancel"])
                st["result"] = {"path": out, "summary": summary}
            except core.ExportCancelled:
                st["error"] = "내보내기를 취소했어요."
            except core.DatasetError as e:
                st["error"] = str(e)
            except Exception as e:  # noqa: BLE001
                log_error(traceback.format_exc())
                st["error"] = "내보내기 중 오류가 났어요: %s" % e
            finally:
                st["finished"] = True

        threading.Thread(target=work, daemon=True).start()
        return _ok()

    @_guard
    def export_status(self):
        st = self._export
        if not st:
            return _ok(finished=True, done=0, total=0, error=None, result=None)
        return _ok(done=st["done"], total=st["total"], finished=st["finished"], error=st["error"], result=st["result"])

    @_guard
    def export_cancel(self):
        if self._export:
            self._export["cancel"].set()
        return _ok()

    # ----- 기타 -----
    @_guard
    def open_path(self, path):
        if not path or not os.path.exists(path):
            return _err("경로가 없어요: %s" % path)
        if os.name == "nt":
            os.startfile(path)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
        return _ok()

    def log_js(self, message):
        log_error("[화면] %s" % message)
        return True
