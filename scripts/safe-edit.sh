#!/usr/bin/env bash
# scripts/safe-edit.sh — heredoc-backed file edits that bypass the Cowork
# mount's Edit-tool truncation cap.
#
# The Edit tool in this Cowork mount caps writes at the target file's previous
# on-disk size, silently dropping the tail. Bash + Python writes in a single
# syscall, which the cap doesn't apply to. This script wraps that pattern.
#
# Usage:
#   bash scripts/safe-edit.sh <file> --replace <old_file> <new_file>
#       Replace exactly one occurrence of <old_file>'s contents with
#       <new_file>'s contents in <file>. Errors if <old_file> isn't unique.
#
#   bash scripts/safe-edit.sh <file> --rewrite <new_file>
#       Rewrite the entire file with <new_file>'s contents. Use for new
#       files, wholesale section restorations, or when the change spans most
#       of the file.
#
# Both modes write atomically via temp file + rename, and run `node --check`
# afterward on .js/.cjs/.mjs files. Exits non-zero on any failure.

set -euo pipefail

if [ $# -lt 2 ]; then
  cat >&2 <<'USAGE'
Usage:
  bash scripts/safe-edit.sh <file> --replace <old_file> <new_file>
  bash scripts/safe-edit.sh <file> --rewrite <new_file>
USAGE
  exit 2
fi

FILE="$1"
MODE="$2"

case "$MODE" in
  --replace)
    OLD_FILE="${3:?old_file required}"
    NEW_FILE="${4:?new_file required}"
    [ -f "$FILE" ]     || { echo "safe-edit: target not found: $FILE" >&2; exit 1; }
    [ -f "$OLD_FILE" ] || { echo "safe-edit: old_file not found: $OLD_FILE" >&2; exit 1; }
    [ -f "$NEW_FILE" ] || { echo "safe-edit: new_file not found: $NEW_FILE" >&2; exit 1; }
    python3 - "$FILE" "$OLD_FILE" "$NEW_FILE" <<'PYEOF'
import sys, os
target, old_path, new_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(target,   'r', encoding='utf-8') as f: src = f.read()
with open(old_path, 'r', encoding='utf-8') as f: old = f.read()
with open(new_path, 'r', encoding='utf-8') as f: new = f.read()
count = src.count(old)
if count == 0:
    print(f"safe-edit: old_str not found in {target}", file=sys.stderr); sys.exit(1)
if count > 1:
    print(f"safe-edit: old_str matches {count} times in {target} (must be unique; expand context)", file=sys.stderr); sys.exit(1)
out = src.replace(old, new, 1)
tmp = target + '.safeedit.tmp'
with open(tmp, 'w', encoding='utf-8', newline='') as f: f.write(out)
os.replace(tmp, target)
print(f"safe-edit: {target} replace ok ({len(src)} -> {len(out)} bytes)")
PYEOF
    ;;
  --rewrite)
    NEW_FILE="${3:?new_file required}"
    [ -f "$NEW_FILE" ] || { echo "safe-edit: new_file not found: $NEW_FILE" >&2; exit 1; }
    python3 - "$FILE" "$NEW_FILE" <<'PYEOF'
import sys, os
target, new_path = sys.argv[1], sys.argv[2]
with open(new_path, 'r', encoding='utf-8') as f: new = f.read()
prev = 0
if os.path.exists(target):
    with open(target, 'r', encoding='utf-8') as f: prev = len(f.read())
tmp = target + '.safeedit.tmp'
with open(tmp, 'w', encoding='utf-8', newline='') as f: f.write(new)
os.replace(tmp, target)
print(f"safe-edit: {target} rewrite ok ({prev} -> {len(new)} bytes)")
PYEOF
    ;;
  *)
    echo "safe-edit: unknown mode '$MODE' (use --replace or --rewrite)" >&2
    exit 2
    ;;
esac

# Post-write syntax check on JS/CJS/MJS
case "$FILE" in
  *.js|*.cjs|*.mjs)
    if command -v node >/dev/null 2>&1; then
      if ! node --check "$FILE" 2>/dev/null; then
        echo "safe-edit: WARNING node --check failed on $FILE" >&2
        echo "          the write went through but the result has a syntax error." >&2
        exit 3
      fi
      echo "safe-edit: node --check ok"
    fi
    ;;
esac
