# -*- coding: utf-8 -*-
"""줍줍 라벨러 시작점.

화면은 web/ 의 HTML·CSS·JS 로 그리고, 파일 읽기·쓰기는 api.py 가 맡습니다.
exe 로 묶을 때는 build.bat 을 실행하세요.
"""

import os
import sys
import threading
import traceback

from api import Api, app_home, log_error

APP_TITLE = "줍줍 라벨러"
WEBVIEW2_URL = "https://developer.microsoft.com/microsoft-edge/webview2/"


def resource_path(*parts):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, *parts)


def close_splash():
    """exe 로 실행할 때 보이는 시작 화면(PyInstaller splash)을 닫습니다."""
    try:
        import pyi_splash  # type: ignore
        pyi_splash.close()
    except Exception:  # noqa: BLE001 - 개발 실행이나 이미 닫힌 경우
        pass


def message_box(text, title=APP_TITLE, flags=0x40):
    close_splash()
    if os.name == "nt":
        import ctypes
        return ctypes.windll.user32.MessageBoxW(None, text, title, flags | 0x10000)
    sys.stderr.write(text + "\n")
    return 0


def webview2_installed():
    if os.name != "nt":
        return True
    import winreg
    guid = r"{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    keys = [
        (winreg.HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\" + guid),
        (winreg.HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\" + guid),
        (winreg.HKEY_CURRENT_USER, "Software\\Microsoft\\EdgeUpdate\\Clients\\" + guid),
    ]
    for hive, key in keys:
        try:
            with winreg.OpenKey(hive, key) as k:
                pv, _ = winreg.QueryValueEx(k, "pv")
                if pv and pv != "0.0.0.0":
                    return True
        except OSError:
            continue
    return False


def system_prefers_light():
    if os.name != "nt":
        return False
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize") as k:
            return winreg.QueryValueEx(k, "AppsUseLightTheme")[0] == 1
    except OSError:
        return False


def main():
    if not webview2_installed():
        ans = message_box("화면을 그리는 데 필요한 Microsoft Edge WebView2 런타임이 이 PC에 없어요.\n\n"
                          "설치 페이지를 열까요? (무료, 1분 정도)\n설치한 뒤 프로그램을 다시 실행해 주세요.",
                          flags=0x04 | 0x30)
        if ans == 6:
            import webbrowser
            webbrowser.open(WEBVIEW2_URL)
        return

    import webview
    from server import start_server

    api = Api()
    server = start_server(resource_path("web"), api)
    api._server = server
    url = "http://127.0.0.1:%d/app/index.html?t=%s" % (server.port, server.token)

    st = api._settings
    theme = st.get("theme", "system")
    light = theme == "light" or (theme == "system" and system_prefers_light())
    win = st.get("window") or {}
    width, height = int(win.get("width") or 0), int(win.get("height") or 0)
    try:
        scr = webview.screens[0]
        sw, sh = int(scr.width), int(scr.height)
    except Exception:  # noqa: BLE001
        sw, sh = 1600, 900
    if width < 900 or height < 600 or width > sw or height > sh:
        width, height = int(sw * 0.86), int(sh * 0.86)

    window = webview.create_window(
        APP_TITLE, url, js_api=api, width=width, height=height, min_size=(1100, 680),
        background_color="#f5f6f8" if light else "#0b0d12", text_select=False, zoomable=False,
        maximized=bool(win.get("maximized", True)))
    api._window = window
    window.events.shown += close_splash
    window.events.closing += api._on_closing
    window.events.maximized += lambda: api._set_maximized(True)
    window.events.restored += lambda: api._set_maximized(False)

    test_script = os.environ.get("JUPJUP_TEST_SCRIPT")
    if test_script and not getattr(sys, "frozen", False):   # 개발용 자동 테스트 (exe 에서는 꺼짐)
        def run_test():
            window.events.loaded.wait(30)
            with open(test_script, encoding="utf-8") as f:
                code = compile(f.read(), test_script, "exec")
            exec(code, {"window": window, "api": api, "server": server, "webview": webview, "__name__": "__test__"})
        threading.Thread(target=run_test, daemon=True).start()

    # WebView2 작업 폴더는 설정 폴더 안 한 곳만 씁니다 (exe 옆이나 임시 폴더에 쌓이지 않게).
    webview.start(gui="edgechromium", debug=bool(os.environ.get("JUPJUP_DEBUG")), private_mode=True,
                  storage_path=os.path.join(app_home(), "webview"), icon=resource_path("assets", "icon.ico"))


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001
        log_error(traceback.format_exc())
        message_box("프로그램을 시작하지 못했어요.\n\n오류 기록: %s" % os.path.join(app_home(), "error.log"), flags=0x10)
