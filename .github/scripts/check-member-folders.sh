#!/usr/bin/env bash
# 사용법: check-member-folders.sh <PR 작성자 GitHub ID> <CODEOWNERS 파일> <변경 파일 목록>
# members/<폴더>/ 아래 파일이 바뀌었는데 작성자가 그 폴더 주인이 아니면 실패(exit 1).
set -euo pipefail

author=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
codeowners=$2
changed=$3

fail=0
while IFS= read -r file || [ -n "$file" ]; do
  case "$file" in
    members/*/*) ;;
    *) continue ;;   # 공용 폴더, members/README.md 는 검사 안 함
  esac

  folder=$(printf '%s' "$file" | cut -d/ -f2)
  owners=$(awk -v dir="/members/$folder/" '
    $1 == dir {
      for (i = 2; i <= NF; i++) {
        if ($i ~ /^#/) break
        sub(/^@/, "", $i)
        print tolower($i)
      }
    }' "$codeowners")

  if [ -z "$owners" ]; then
    echo "::error file=$file::members/$folder/ 는 CODEOWNERS에 등록되지 않은 개인 폴더입니다."
    fail=1
  elif ! printf '%s\n' "$owners" | grep -qxF "$author"; then
    echo "::error file=$file::members/$folder/ 는 $(printf '%s' "$owners" | sed 's/^/@/' | paste -sd, -) 의 개인 폴더입니다. (@$1 는 수정할 수 없음)"
    fail=1
  fi
done < "$changed"

if [ "$fail" -eq 0 ]; then
  echo "OK: 개인 폴더 규칙 위반 없음"
fi
exit "$fail"
