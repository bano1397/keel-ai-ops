import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from keel.main import app as keel_app

ORIGINAL_PATH_HEADERS = (b"x-original-path", b"x-forwarded-uri", b"x-vercel-original-path", b"x-matched-path")


async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
    if scope["type"] == "http":
        print("keel-scope", scope.get("path"), repr(scope.get("root_path")), flush=True)
    if scope["type"] == "http" and scope.get("path", "").startswith("/api/index"):
        headers = dict(scope.get("headers") or [])
        for name in ORIGINAL_PATH_HEADERS:
            value = headers.get(name)
            if value and not value.decode().startswith("/api/index"):
                parts = urlsplit(value.decode())
                scope = {**scope, "path": parts.path, "raw_path": parts.path.encode()}
                if parts.query:
                    scope["query_string"] = parts.query.encode()
                break
        else:
            print("keel-path-debug", scope.get("path"), sorted(k.decode() for k in headers), flush=True)
    await keel_app(scope, receive, send)
