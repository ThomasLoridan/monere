#!/bin/bash
# Launcher used by the preview panel / IDEs: guarantees Node 22 on PATH
# (installed in ~/.local/node22) then delegates to `npm run dev`.
export PATH="$HOME/.local/node22/bin:$PATH"
cd "$(dirname "$0")/.."
exec npm run dev
