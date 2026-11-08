#!/bin/bash
# BBox Labeler launcher for Linux - double-click (Run) or: bash run-linux.sh
cd "$(dirname "$0")" || exit 1

notify() {
    if command -v zenity >/dev/null 2>&1; then
        zenity --error --title="BBox Labeler" --text="$1" 2>/dev/null
    else
        echo "$1"
        read -r -p "Enter 를 누르면 닫혀요..." _
    fi
}

if command -v python3 >/dev/null 2>&1; then
    PY=python3
elif command -v python >/dev/null 2>&1; then
    PY=python
else
    notify "Python 3 가 필요해요. (예: sudo apt install python3 python3-tk)"
    exit 1
fi

if ! "$PY" -c "import tkinter" >/dev/null 2>&1; then
    notify "tkinter 가 없어요. 터미널에서 sudo apt install python3-tk 를 실행해 주세요."
    exit 1
fi

exec "$PY" bbox_labeler.py
