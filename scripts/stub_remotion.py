"""Stub Remotion pour les tests : simule `remotion render ...` en écrivant un MP4 factice.

Usage (remplace TIKTOK_REMOTION_BIN) :
    stub_remotion.py render <entry> <composition> <out.mp4> --props <props.json>
"""
from __future__ import annotations

import sys
from pathlib import Path

def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] != "render" or len(args) < 4:
        print("usage: stub_remotion.py render <entry> <composition> <out.mp4> [--props file]", file=sys.stderr)
        return 2

    out_path = Path(args[3])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Petit fichier MP4 factice (entête + padding) — suffit pour valider la pipeline
    out_path.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 2048)
    print(f"STUB REMOTION: rendu factice écrit dans {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
