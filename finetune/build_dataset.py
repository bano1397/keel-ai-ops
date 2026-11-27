import argparse
import json
import random
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "data"
SEED = 2026

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
    "You classify customer messages for Hearth & Field, a UK homeware shop. "
    "Reply with exactly one label from: " + ", ".join(LABELS) + "."
)

BITEXT_MAP = {
    "track_order": "order_status",
    "delivery_period": "order_status",
    "get_refund": "refund_request",
    "track_refund": "refund_request",
    "cancel_order": "cancel_order",
    "change_shipping_address": "change_address",
    "set_up_shipping_address": "change_address",
    "check_refund_policy": "policy_question",
    "delivery_options": "policy_question",
    "check_payment_methods": "policy_question",
    "check_cancellation_fee": "policy_question",
    "complaint": "complaint",
    "contact_human_agent": "human_request",
    "contact_customer_service": "human_request",
    "create_account": "other",
    "edit_account": "other",
    "recover_password": "other",
    "newsletter_subscription": "other",
    "review": "other",
    "check_invoice": "other",
    "get_invoice": "other",
}

FILL = {
    "order": [f"HF-{n}" for n in range(204100, 204990, 37)],
    "product": [
        "oak bed frame",
        "linen duvet cover",
        "goose down pillow",
        "brass table lamp",
        "velvet sofa",
        "wool rug",
        "copper kettle",
        "stoneware dinner set",
        "blackout curtains",
        "pocket sprung mattress",
        "bentwood chair",
        "arched mirror",
        "towel bale",
        "extendable dining table",
    ],
    "place": ["Leeds", "Glasgow", "Cardiff", "Belfast", "Inverness", "Jersey", "the Isle of Wight", "Truro"],
    "addr": [
        "14 Mill Lane, York YO1 7HB",
        "3 Station Road, Bath BA1 1SU",
        "22 Queen Street, Cardiff CF10 2BU",
        "9 Castle Wynd, Inverness IV2 3EB",
    ],
    "issue": ["broken", "damaged", "faulty", "scratched", "the wrong colour", "missing a leg"],
    "harm": [
        "caught fire",
        "gave my son an electric shock",
        "collapsed and injured my mum",
        "started smoking",
        "burned my hand",
    ],
    "topic": [
        "returns",
        "refunds",
        "delivery",
        "Klarna",
        "gift cards",
        "the price promise",
        "warranty",
        "student discount",
        "NHS discount",
        "trade accounts",
        "home assembly",
        "Hearth Rewards points",
    ],
}

TRAIN_TEMPLATES = {
    "order_status": [
        "where is my order {order}",
        "Has {order} been dispatched yet?",
        "Any update on {order}? It's been a week",
        "tracking for {order} hasn't moved since Monday",
        "when will {order} arrive?",
        "is my {product} on its way? order {order}",
    ],
    "refund_request": [
        "I'd like a refund for {order}, the {product} arrived {issue}",
        "can I get my money back on {order}",
        "please refund {order}",
        "{order} came {issue}, refund please",
        "has my refund for {order} gone through?",
    ],
    "cancel_order": [
        "please cancel {order}",
        "I need to cancel my order {order}",
        "cancel {order} I ordered by mistake",
        "can you stop {order} before it ships?",
    ],
    "change_address": [
        "change the delivery address on {order} to {addr}",
        "I've moved, can {order} go to {addr}?",
        "wrong postcode on {order}, should be {addr}",
    ],
    "product_question": [
        "is the {product} in stock?",
        "how much is the {product}?",
        "what size is the {product}?",
        "is the {product} machine washable?",
        "does the {product} come assembled?",
        "what colours does the {product} come in?",
    ],
    "policy_question": [
        "how do {topic} work?",
        "what's your policy on {topic}?",
        "do you deliver to {place}?",
        "how long do I have to return something?",
        "can I pay with Klarna?",
        "how much is next day delivery?",
        "do you offer {topic}?",
    ],
    "complaint": [
        "this is the third time my order is late, absolutely fed up",
        "your service is a joke",
        "worst shopping experience I've ever had",
        "I'm so angry, nobody replies to my emails",
        "disgusting customer service, sort it out",
    ],
    "human_request": [
        "can I speak to a real person",
        "put me through to a human please",
        "I want to talk to a manager",
        "stop the bot, get me an agent",
    ],
    "legal_safety": [
        "my solicitor will be in touch about {order}",
        "I'm filing a chargeback with my bank",
        "the {product} {harm}",
        "I'm reporting you to Trading Standards",
        "someone used my card to order {order}, this is fraud",
    ],
    "other": [
        "what's the weather like in {place}",
        "who is your CEO?",
        "do you sell garden sheds?",
        "can you recommend a plumber",
        "tell me a joke",
        "how do I reset my password?",
    ],
}

TEST_TEMPLATES = {
    "order_status": [
        "{order} still not here, where's it got to?",
        "could you check the status of {order} for me",
        "my parcel {order} says out for delivery since yesterday",
    ],
    "refund_request": [
        "the {product} is {issue}, I want a refund on {order}",
        "money back for {order} please",
        "returned {order} two weeks ago, where's my refund?",
    ],
    "cancel_order": ["changed my mind, please cancel {order}", "don't send {order}, cancel it"],
    "change_address": ["send {order} to {addr} instead", "update the address for {order} to {addr} please"],
    "product_question": [
        "have you got the {product} in grey?",
        "what are the dimensions of the {product}?",
        "is the {product} back in stock soon?",
    ],
    "policy_question": [
        "can I return opened pillows?",
        "is delivery free over a certain amount?",
        "how long is the warranty on {topic}?",
        "do you ship to {place}?",
    ],
    "complaint": [
        "honestly appalling, I've waited 3 weeks",
        "fuming, the courier threw my parcel over the gate",
        "you lot are useless",
    ],
    "human_request": ["I'd rather speak to someone real", "is there a person I can talk to?"],
    "legal_safety": [
        "the {product} {harm}, I need this dealt with now",
        "I'll be contacting the ombudsman",
        "my lawyer says you're breaching the Consumer Rights Act",
    ],
    "other": ["what time does the football start", "can you write me a poem", "where can I buy paint?"],
}


def fill(t: str, rnd: random.Random) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: rnd.choice(FILL[m.group(1)]), t)


def clean_bitext(text: str, rnd: random.Random) -> str:
    text = re.sub(r"\{\{Order Number\}\}", lambda _: rnd.choice(FILL["order"]), text)
    text = re.sub(r"\{\{[^}]+\}\}", "", text)
    return re.sub(r"\s+", " ", text).strip()


def norm(t: str) -> str:
    return re.sub(r"[^a-z]+", " ", t.lower()).strip()


def row(text: str, label: str, source: str) -> dict:
    return {
        "text": text,
        "label": label,
        "route": ROUTE[label],
        "source": source,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": text},
            {"role": "assistant", "content": label},
        ],
    }


def synth(templates: dict, per_label: int, rnd: random.Random, source: str) -> list[dict]:
    rows = []
    for label, tpls in templates.items():
        seen = set()
        tries = 0
        while len([r for r in rows if r["label"] == label]) < per_label and tries < per_label * 20:
            tries += 1
            t = fill(rnd.choice(tpls), rnd)
            if rnd.random() < 0.25:
                t = t.lower()
            if rnd.random() < 0.15:
                t = t.rstrip("?.!") + rnd.choice(["!!", " pls", " thanks", " asap"])
            if norm(t) in seen:
                continue
            seen.add(norm(t))
            rows.append(row(t, label, source))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bitext", required=True, help="Bitext dataset exported as JSON lines")
    ap.add_argument("--per-label", type=int, default=220)
    a = ap.parse_args()
    rnd = random.Random(SEED)

    by_label: dict[str, list[str]] = {lbl: [] for lbl in LABELS}
    for line in Path(a.bitext).read_text().splitlines():
        r = json.loads(line)
        lbl = BITEXT_MAP.get(r["intent"])
        if lbl:
            by_label[lbl].append(clean_bitext(r["instruction"], rnd))

    bitext_train, bitext_test = [], []
    for lbl, texts in by_label.items():
        uniq = list({norm(t): t for t in texts if len(t) > 6}.values())
        rnd.shuffle(uniq)
        bitext_test += [row(t, lbl, "bitext") for t in uniq[:10]]
        bitext_train += [row(t, lbl, "bitext") for t in uniq[10 : 10 + a.per_label]]

    synth_train = synth(TRAIN_TEMPLATES, 120, rnd, "synthetic")
    synth_test = synth(TEST_TEMPLATES, 20, rnd, "synthetic-heldout")

    train_all = bitext_train + synth_train
    test = bitext_test + synth_test
    test_keys = {norm(r["text"]) for r in test}
    train_all = [r for r in train_all if norm(r["text"]) not in test_keys]
    rnd.shuffle(train_all)
    n_val = len(train_all) // 10
    val, train = train_all[:n_val], train_all[n_val:]

    OUT.mkdir(exist_ok=True)
    for name, rows in (("train", train), ("val", val), ("test", test)):
        with open(OUT / f"{name}.jsonl", "w") as f:
            f.writelines(json.dumps(r) + "\n" for r in rows)

    stats = {
        name: dict(Counter(r["label"] for r in rows)) for name, rows in (("train", train), ("val", val), ("test", test))
    }
    stats["sizes"] = {"train": len(train), "val": len(val), "test": len(test)}
    (OUT / "stats.json").write_text(json.dumps(stats, indent=2))
    print(json.dumps(stats["sizes"]), json.dumps(stats["test"]))


if __name__ == "__main__":
    main()
