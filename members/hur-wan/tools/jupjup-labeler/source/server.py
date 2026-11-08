# -*- coding: utf-8 -*-
"""127.0.0.1 전용 작은 HTTP 서버.

- /app/...                          화면(HTML/CSS/JS/글꼴)
- /img/<token>/<gen>/<rel>          데이터 폴더의 원본 이미지 (TIFF 는 PNG 로 바꿔서)
- /thumb/<token>/<gen>/<rel>        목록용 썸네일

token 은 실행할 때마다 새로 만들어서, 다른 프로그램이 이 서버로 파일을 읽지 못하게 합니다.
"""

import email.utils
import io
import mimetypes
import os
import secrets
import threading
import urllib.parse
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageOps

from core import BROWSER_EXTS

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".bmp": "image/bmp",
    ".woff2": "font/woff2", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
}
THUMB_SIZE = 192


class _Cache(object):
    def __init__(self, limit):
        self.limit, self.data, self.lock = limit, OrderedDict(), threading.Lock()

    def get(self, key):
        with self.lock:
            v = self.data.get(key)
            if v is not None:
                self.data.move_to_end(key)
            return v

    def put(self, key, value):
        with self.lock:
            self.data[key] = value
            self.data.move_to_end(key)
            while len(self.data) > self.limit:
                self.data.popitem(last=False)


class AppServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, web_dir, api):
        ThreadingHTTPServer.__init__(self, ("127.0.0.1", 0), Handler)
        self.web_dir = os.path.realpath(web_dir)
        self.api = api
        self.token = secrets.token_urlsafe(16)
        self.thumbs = _Cache(4000)
        self.converted = _Cache(6)

    @property
    def port(self):
        return self.server_address[1]


class Handler(BaseHTTPRequestHandler):
    server_version = "JupJupLabeler"
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # 콘솔 출력 끄기
        pass

    # ----- 응답 도우미 -----
    def _send(self, code, body=b"", ctype="text/plain; charset=utf-8", headers=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _not_found(self):
        self._send(404, b"not found")

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        try:
            path = urllib.parse.urlsplit(self.path).path
            parts = path.split("/")
            if len(parts) >= 3 and parts[1] == "app":
                return self._static("/".join(parts[2:]))
            if len(parts) >= 5 and parts[1] in ("img", "thumb"):
                if not secrets.compare_digest(parts[2], self.server.token):
                    return self._send(403, b"forbidden")
                return self._image(parts[1], parts[3], urllib.parse.unquote("/".join(parts[4:])))
            if path in ("/", ""):
                return self._send(302, b"", headers={"Location": "/app/index.html"})
            return self._not_found()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    # ----- 화면 파일 -----
    def _static(self, rel):
        rel = urllib.parse.unquote(rel) or "index.html"
        full = os.path.realpath(os.path.join(self.server.web_dir, *rel.split("/")))
        if not full.startswith(self.server.web_dir + os.sep) or not os.path.isfile(full):
            return self._not_found()
        with open(full, "rb") as f:
            body = f.read()
        ext = os.path.splitext(full)[1].lower()
        ctype = CONTENT_TYPES.get(ext) or mimetypes.guess_type(full)[0] or "application/octet-stream"
        self._send(200, body, ctype, {"Cache-Control": "no-cache"})

    # ----- 데이터 이미지 -----
    def _image(self, kind, gen, rel):
        ds, cur_gen = self.server.api._current()
        if ds is None or gen != str(cur_gen):
            return self._not_found()
        full = os.path.realpath(ds.image_path(rel))
        root = os.path.realpath(ds.images_dir)
        if not full.startswith(root + os.sep) or not os.path.isfile(full):
            return self._not_found()
        st = os.stat(full)
        last_mod = email.utils.formatdate(st.st_mtime, usegmt=True)
        if self.headers.get("If-Modified-Since") == last_mod:
            self.send_response(304)
            self.send_header("Last-Modified", last_mod)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        hdr = {"Last-Modified": last_mod, "Cache-Control": "private, max-age=86400"}
        ext = os.path.splitext(full)[1].lower()
        if kind == "thumb":
            key = (full, st.st_mtime_ns, st.st_size)
            body = self.server.thumbs.get(key)
            if body is None:
                body = _make_thumb(full)
                self.server.thumbs.put(key, body)
            return self._send(200, body, "image/jpeg", hdr)
        if ext in BROWSER_EXTS:
            with open(full, "rb") as f:
                body = f.read()
            return self._send(200, body, CONTENT_TYPES.get(ext, "application/octet-stream"), hdr)
        key = (full, st.st_mtime_ns, st.st_size)
        body = self.server.converted.get(key)
        if body is None:
            with Image.open(full) as im:
                im = ImageOps.exif_transpose(im)
                if im.mode not in ("RGB", "RGBA", "L"):
                    im = im.convert("RGBA")
                buf = io.BytesIO()
                im.save(buf, "PNG", compress_level=1)
                body = buf.getvalue()
            self.server.converted.put(key, body)
        self._send(200, body, "image/png", hdr)


def _make_thumb(path):
    with Image.open(path) as im:
        try:
            im.draft("RGB", (THUMB_SIZE * 2, THUMB_SIZE * 2))
        except Exception:  # noqa: BLE001
            pass
        im = ImageOps.exif_transpose(im)
        if im.mode != "RGB":
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (30, 33, 40))
            bg.paste(im, mask=im.getchannel("A"))
            im = bg
        im.thumbnail((THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=82)
        return buf.getvalue()


def start_server(web_dir, api):
    srv = AppServer(web_dir, api)
    t = threading.Thread(target=srv.serve_forever, name="jupjup-http", daemon=True)
    t.start()
    return srv
