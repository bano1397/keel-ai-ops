import hashlib
import json
import statistics
import sys
import time
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))

from keel.config import settings

LABELS = [
    "order_status",
    "refund_request",
    "cancel_order",
    "change_address",
    "product_question",
    "policy_question",
    "complaint",
    "human_request",
    "legal_safety",
    "other",
]
ROUTE = {
    "order_status": "orders",
    "refund_request": "orders",
    "cancel_order": "orders",
    "change_address": "orders",
    "product_question": "support",
    "policy_question": "support",
    "other": "support",
    "complaint": "escalation",
    "human_request": "escalation",
    "legal_safety": "escalation",
}
MODEL = sys.argv[1] if len(sys.argv) > 1 else "openai/gpt-oss-120b"
PRICES = {"openai/gpt-oss-120b": (0.15, 0.60), "qwen/qwen3.8-27b": (0.80, 4.00)}
PRICE = PRICES[MODEL]
EFFORT = "none" if MODEL.startswith("qwen") else "low"


def parse(out: str) -> str:
    o = out.strip().lower().replace(" ", "_")
    return next((label for label in sorted(LABELS, key=len, reverse=True) if label in o), "other")


def main() -> None:
    path = HERE / "data" / "test.jsonl"
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    key = settings().groq_api_key
    preds, lats, tin, tout = [], [], 0, 0
    for r in rows:
        for _ in range(8):
            t0 = time.perf_counter()
            try:
                resp = httpx.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {key}"},
                    json={
                        "model": MODEL,
                        "messages": r["messages"][:2],
                        "max_tokens": 300,
                        "temperature": 0,
                        "reasoning_effort": EFFORT,
                    },
                    timeout=60,
                )
            except httpx.TransportError:
                time.sleep(5)
                continue
            if resp.status_code == 429:
                time.sleep(min(20.0, float(resp.headers.get("retry-after", "3"))))
                continue
            resp.raise_for_status()
            break
        lats.append((time.perf_counter() - t0) * 1000)
        data = resp.json()
        tin += data["usage"]["prompt_tokens"]
        tout += data["usage"]["completion_tokens"]
        preds.append(parse(data["choices"][0]["message"]["content"] or ""))
        if len(preds) % 20 == 0:
            print(f"{len(preds)}/{len(rows)}", flush=True)
    gold = [r["label"] for r in rows]
    acc = sum(g == p for g, p in zip(gold, preds, strict=True)) / len(gold)
    f1s = []
    for label in LABELS:
        tp = sum(g == label and p == label for g, p in zip(gold, preds, strict=True))
        fp = sum(g != label and p == label for g, p in zip(gold, preds, strict=True))
        fn = sum(g == label and p != label for g, p in zip(gold, preds, strict=True))
        pr, rc = (tp / (tp + fp) if tp + fp else 0), (tp / (tp + fn) if tp + fn else 0)
        f1s.append(2 * pr * rc / (pr + rc) if pr + rc else 0)
    esc = [p for g, p in zip(gold, preds, strict=True) if ROUTE[g] == "escalation"]
    lats.sort()
    result = {
        "model": f"{MODEL} via Groq API",
        "accuracy": round(100 * acc, 1),
        "macro_f1": round(100 * sum(f1s) / len(f1s), 1),
        "route_accuracy": round(
            100 * sum(ROUTE[g] == ROUTE[p] for g, p in zip(gold, preds, strict=True)) / len(gold), 1
        ),
        "escalation_recall": round(100 * sum(ROUTE[p] == "escalation" for p in esc) / len(esc), 1),
        "p50_ms": round(statistics.median(lats)),
        "p95_ms": round(lats[int(0.95 * len(lats)) - 1]),
        "usd_per_1k": round((tin * PRICE[0] + tout * PRICE[1]) / 1e6 / len(rows) * 1000, 4),
        "test_sha256": sha,
        "tokens_in": tin,
        "tokens_out": tout,
    }
    (HERE / f"results_api_{MODEL.split('/')[-1]}.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
