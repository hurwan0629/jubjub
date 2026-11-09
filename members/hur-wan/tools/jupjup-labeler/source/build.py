# -*- coding: utf-8 -*-
"""줍줍 라벨러를 exe 한 개로 묶습니다.

    python build.py            # ../jupjup-labeler.exe 를 만듭니다

필요: requirements.txt 의 패키지 (build.bat 이 임시 가상환경에 알아서 설치합니다)
"""

import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from core import APP_VERSION  # noqa: E402

NAME = "jupjup-labeler"
DIST = os.path.dirname(HERE)          # 결과 exe 는 source/ 의 한 단계 위(도구 폴더)에 놓입니다.

VERSION_INFO = """# UTF-8
VSVersionInfo(
  ffi=FixedFileInfo(filevers=({v}), prodvers=({v}), mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable('041204B0', [
      StringStruct('CompanyName', 'ParkKeeper JupJup'),
      StringStruct('FileDescription', '줍줍 라벨러 - 이미지 bbox 라벨링 도구'),
      StringStruct('FileVersion', '{s}'),
      StringStruct('InternalName', '{n}'),
      StringStruct('OriginalFilename', '{n}.exe'),
      StringStruct('ProductName', '줍줍 라벨러 (JupJup Labeler)'),
      StringStruct('ProductVersion', '{s}')])]),
    VarFileInfo([VarStruct('Translation', [0x0412, 1200])])
  ]
)
"""


def main():
    import PyInstaller.__main__

    work = tempfile.mkdtemp(prefix="jupjup-build-")
    parts = (APP_VERSION.split(".") + ["0", "0", "0", "0"])[:4]
    ver_file = os.path.join(work, "version_info.txt")
    with open(ver_file, "w", encoding="utf-8") as f:
        f.write(VERSION_INFO.format(v=", ".join(parts), s=APP_VERSION, n=NAME))
    sep = os.pathsep
    args = [
        os.path.join(HERE, "main.py"),
        "--noconfirm", "--clean", "--onefile", "--windowed",
        "--name", NAME,
        "--icon", os.path.join(HERE, "assets", "icon.ico"),
        "--version-file", ver_file,
        "--add-data", os.path.join(HERE, "web") + sep + "web",
        "--add-data", os.path.join(HERE, "assets", "icon.ico") + sep + "assets",
        "--splash", os.path.join(HERE, "assets", "splash.png"),   # 압축 푸는 동안 바로 보이는 시작 화면
        "--exclude-module", "numpy", "--exclude-module", "unittest", "--exclude-module", "pydoc",
        "--distpath", DIST,
        "--workpath", os.path.join(work, "build"),
        "--specpath", work,
    ]
    print("PyInstaller", " ".join(args))
    PyInstaller.__main__.run(args)
    shutil.rmtree(work, ignore_errors=True)
    exe = os.path.join(DIST, NAME + ".exe")
    print("\n완료: %s (%.1f MB)" % (exe, os.path.getsize(exe) / 1048576))


if __name__ == "__main__":
    main()
