#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SRC="$ROOT_DIR/contracts/out/JobManager.sol/JobManager.json"
DST_DIR="$ROOT_DIR/ours-gpu/libs/shared/abi"
DST="$DST_DIR/JobManager.json"

if [ ! -f "$SRC" ]; then
  echo "ABI artifact not found at $SRC. Run 'forge build' first." >&2
  exit 1
fi

mkdir -p "$DST_DIR"
cp "$SRC" "$DST"
echo "Copied ABI -> $DST"

