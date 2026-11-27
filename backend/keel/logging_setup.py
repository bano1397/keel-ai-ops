import json
import logging
import re
import sys

EMAIL = re.compile(r"([\w.+-])[\w.+-]*@([\w-]+\.[\w.]+)")
PHONE = re.compile(r"\+?44\s?7\d{3}\s?\d{6}|\b07\d{3}\s?\d{6}\b")


def mask(text: str) -> str:
    return PHONE.sub("[phone]", EMAIL.sub(r"\1***@\2", text))


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {"level": record.levelname, "logger": record.name, "msg": mask(record.getMessage())}
        if record.exc_info:
            out["exc"] = mask(self.formatException(record.exc_info))[-2000:]
        return json.dumps(out)


def setup_logging() -> None:
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [h]
    root.setLevel(logging.INFO)
    for noisy in ("httpx", "apscheduler", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
