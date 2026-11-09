#!/bin/bash
# BBox Labeler launcher for macOS - double-click this file in Finder.
# 처음 한 번 "열 수 없음" 이 뜨면: 오른쪽 클릭 > 열기. 그래도 안 되면 터미널에서 chmod +x run-mac.command
cd "$(dirname "$0")" || exit 1

if command -v python3 >/dev/null 2>&1; then
    PY=python3
elif command -v python >/dev/null 2>&1; then
    PY=python
else
    osascript -e 'display alert "BBox Labeler" message "Python 3 가 필요해요. https://www.python.org/downloads/ 에서 설치한 뒤 다시 실행해 주세요."' >/dev/null 2>&1
    open "https://www.python.org/downloads/"
    exit 1
fi

if ! "$PY" -c "import tkinter" >/dev/null 2>&1; then
    osascript -e 'display alert "BBox Labeler" message "tkinter 가 없어요. Homebrew Python 이라면 터미널에서 brew install python-tk 를 실행해 주세요. (python.org 설치판에는 포함되어 있어요)"' >/dev/null 2>&1
    exit 1
fi

exec "$PY" bbox_labeler.py
