import logging
import math
import re
import threading
from functools import lru_cache
from typing import Any

from keel import llm
from keel.config import settings

log = logging.getLogger("keel.router")

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
SYSTEM = (
    "You classify customer messages for Hearth & Field, a UK homeware shop. Reply with exactly one label from: "
    + ", ".join(LABELS)
    + "."
)
LLM_GUIDE = (
    "Label meanings: order_status, refund_request, cancel_order and change_address mean the customer wants us to look "
    "up or change one of THEIR existing orders (usually an order number or 'my order'). policy_question means how "
    "delivery, returns, refunds, payments, warranty, discounts or the company work in general, including hypotheticals "
    "like 'if I order on Wednesday when will it arrive'. product_question means price, stock, size or details of a "
    "product we sell. complaint means upset or angry. human_request means they ask for a person. legal_safety means a "
    "legal threat, chargeback, fraud, injury or safety issue. other means anything unrelated to the shop."
)

LEGAL_SAFETY = [
    "solicitor",
    "lawyer",
    "legal action",
    "small claims",
    "court",
    "trading standards",
    "chargeback",
    "ombudsman",
    "fraud",
    "scam",
    "stolen card",
    "unauthorised",
    "hacked",
    "caught fire",
    "fire",
    "smoke",
    "smoking",
    "electric shock",
    "shock",
    "burn",
    "injur",
    "hospital",
    "unsafe",
    "dangerous",
    "data breach",
    "press",
    "bbc",
    "watchdog",
    "compensation",
    "damaged my wall",
    "damaged my floor",
]
HUMAN = [
    "real person",
    "human",
    "speak to someone",
    "talk to someone",
    "manager",
    "supervisor",
    "an agent",
    "someone real",
]
ANGER = [
    "furious",
    "angry",
    "fuming",
    "livid",
    "disgusting",
    "disgraceful",
    "useless",
    "appalling",
    "ridiculous",
    "unacceptable",
    "worst",
    "joke",
    "rubbish",
    "terrible",
    "awful",
    "pathetic",
    "incompetent",
    "fed up",
    "sick of",
    "never again",
    "shocking service",
]
INJECTION = [
    "ignore previous",
    "ignore all previous",
    "ignore your instructions",
    "disregard",
    "system prompt",
    "you are now",
    "developer mode",
    "act as admin",
    "override",
    "jailbreak",
    "as the administrator",
]
VULNERABLE = [
    "bereave",
    "struggling to cope",
    "grieving",
    "passed away",
    "died",
    "can't afford",
    "cannot afford",
    "struggling to pay",
    "disabled",
    "carer",
    "hospital",
    "mental health",
    "suicid",
]
ORDER_ID = re.compile(r"\bHF-\d{6}\b", re.I)


def _has(text: str, words: list[str]) -> list[str]:
    return [w for w in words if re.search(r"\b" + re.escape(w), text)]


def risk_signals(text: str) -> dict:
    t = text.lower()
    shouting = sum(1 for w in text.split() if len(w) > 3 and w.isupper()) >= 3 or text.count("!") >= 3
    return {
        "legal_safety": _has(t, LEGAL_SAFETY),
        "human": _has(t, HUMAN),
        "anger": _has(t, ANGER) + (["shouting"] if shouting else []),
        "injection": _has(t, INJECTION),
        "vulnerable": _has(t, VULNERABLE),
    }


def rule_label(text: str) -> str:
    t = text.lower()
    has_id = bool(ORDER_ID.search(text))
    if re.search(r"\b(refund|money back|reimburse)", t) and (has_id or "my " in t):
        return "refund_request"
    if re.search(r"\bcancel", t) and (has_id or "my order" in t):
        return "cancel_order"
    if re.search(r"\baddress\b|\bpostcode\b|deliver .* to |send .* to ", t) and has_id:
        return "change_address"
    if has_id or re.search(
        r"where('s| is) my|track(ing)? my|my order|my orders|my (recent )?orders|orders do i have|my parcel|"
        r"not (arrived|received)",
        t,
    ):
        return "order_status"
    if re.search(r"\b(in stock|price of|how much is the|dimensions|colours?|sizes? does)\b", t):
        return "product_question"
    return "policy_question"


class FineTunedRouter:
    def __init__(self, path: str):
        from llama_cpp import Llama

        self.llm = Llama(model_path=path, n_ctx=512, n_threads=4, logits_all=True, verbose=False)
        self.lock = threading.Lock()

    def classify(self, text: str) -> tuple[str, float]:
        with self.lock:
            out: Any = self.llm.create_chat_completion(
                messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": text}],
                max_tokens=6,
                temperature=0,
                logprobs=True,
                top_logprobs=1,
            )
        content = out["choices"][0]["message"]["content"].strip().lower()
        label = next((lbl for lbl in sorted(LABELS, key=len, reverse=True) if lbl in content), "other")
        lp = out["choices"][0].get("logprobs") or {}
        toks = [t.get("logprob", 0.0) for t in (lp.get("content") or [])[:3]]
        conf = math.exp(sum(toks)) if toks else 0.5
        return label, round(conf, 3)


@lru_cache
def finetuned() -> FineTunedRouter | None:
    path = settings().router_gguf_path
    if not path:
        return None
    try:
        return FineTunedRouter(path)
    except Exception as e:
        log.warning("fine-tuned router unavailable: %r", e)
        return None


def classify(text: str, history: str, usage: llm.Usage) -> dict:
    sig = risk_signals(text)
    if sig["injection"]:
        return {
            "label": "legal_safety",
            "route": "escalation",
            "confidence": 1.0,
            "model": "rules",
            "reason": "Prompt-injection attempt: " + ", ".join(sig["injection"]),
            "signals": sig,
        }
    if sig["legal_safety"]:
        return {
            "label": "legal_safety",
            "route": "escalation",
            "confidence": 1.0,
            "model": "rules",
            "reason": "Legal / safety / fraud signal: " + ", ".join(sig["legal_safety"]),
            "signals": sig,
        }
    if sig["human"]:
        return {
            "label": "human_request",
            "route": "escalation",
            "confidence": 1.0,
            "model": "rules",
            "reason": "Customer asked for a person",
            "signals": sig,
        }
    if sig["vulnerable"]:
        return {
            "label": "complaint",
            "route": "escalation",
            "confidence": 0.9,
            "model": "rules",
            "reason": "Possible vulnerable customer: " + ", ".join(sig["vulnerable"]),
            "signals": sig,
        }
    if len(sig["anger"]) >= 2:
        return {
            "label": "complaint",
            "route": "escalation",
            "confidence": 0.95,
            "model": "rules",
            "reason": "Strong anger signals: " + ", ".join(sig["anger"]),
            "signals": sig,
        }

    label, conf, model = None, 0.0, ""
    ft = finetuned()
    if ft:
        label, conf = ft.classify(text)
        model = "keel-router-qwen2.5-1.5b"
    if (not label or conf < settings().router_min_confidence) and llm.available():
        try:
            out = llm.chat_json(
                [
                    {
                        "role": "system",
                        "content": SYSTEM + " " + LLM_GUIDE + ' Return JSON {"label": str, "confidence": number 0-1, '
                        '"reason": "short"}. Use the conversation for context: a follow-up like "yes please" continues the '
                        "previous topic.",
                    },
                    {"role": "user", "content": f"Conversation:\n{history}\n\nNew message: {text}"},
                ],
                usage,
                fast=True,
            )
            if out.get("label") in LABELS:
                prev = f" (fine-tuned router unsure at {conf:.2f})" if model else ""
                label, conf = out["label"], float(out.get("confidence") or 0.7)
                model = settings().groq_fast_model + prev
        except llm.LLMUnavailable:
            pass
    if not label:
        label, conf, model = rule_label(text), 0.6, "offline-rules"
    if sig["vulnerable"] and (sig["anger"] or label in ("complaint", "refund_request")):
        label, model = "complaint", model + " + vulnerability rule"
    return {
        "label": label,
        "route": ROUTE[label],
        "confidence": conf,
        "model": model,
        "reason": f"Classified as {label.replace('_', ' ')}",
        "signals": sig,
    }
