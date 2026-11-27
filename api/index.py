import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from keel.main import app as keel_app

PATH_PARAM = "__keel_path"


async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
    if scope["type"] in ("http", "websocket"):
        params = parse_qsl(scope.get("query_string", b"").decode(), keep_blank_values=True)
        original = next((v for k, v in params if k == PATH_PARAM), None)
        if original is not None:
            path = "/" + original.lstrip("/")
            rest = urlencode([(k, v) for k, v in params if k != PATH_PARAM])
            scope = {**scope, "path": path, "raw_path": path.encode(), "query_string": rest.encode()}
    await keel_app(scope, receive, send)
