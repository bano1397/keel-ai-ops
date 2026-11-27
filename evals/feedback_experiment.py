import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))
sys.path.insert(0, str(HERE.parent))

from evals.run import run

CATEGORIES = ["policy_answerable", "product_question", "unanswerable"]


def apply_feedback() -> dict:
    from keel import feedback
    from keel.pipeline import handle

    batch = [json.loads(line) for line in (HERE / "feedback_batch.jsonl").read_text().splitlines() if line.strip()]
    for item in batch:
        r = handle("web", item["customer_email"], item["message"], deliver=False)
        if item["action"] == "edit":
            feedback.record(r["message_id"], "edit", "reviewer@keel.demo", item["corrected"], item.get("reason"))
        else:
            feedback.record(r["message_id"], "reject", "reviewer@keel.demo", None, item["reason"])
    proposal = feedback.propose_rules("support", "admin@keel.demo")
    if "id" in proposal:
        feedback.activate(proposal["id"])
    return {"items": len(batch), "rules": proposal.get("rules")}


def main() -> None:
    before = run(label="before feedback", categories=CATEGORIES, verbose=False)
    applied = apply_feedback()
    after = run(label="after feedback", categories=CATEGORIES, verbose=False, reset=False)
    out = {"categories": CATEGORIES, "before": before, "feedback": applied, "after": after}
    (HERE / "reports" / "feedback_experiment.json").write_text(json.dumps(out, indent=1, default=str))
    rows = ["| | Score | " + " | ".join(k for k in before["breakdown"] if not k.startswith("cat:")) + " |"]
    rows.append("|---" * (len(rows[0].split("|")) - 2) + "|")
    for name, s in (("Before", before), ("After", after)):
        rows.append(
            f"| {name} | {100 * s['score']:.1f}% | "
            + " | ".join(f"{100 * v['score']:.1f}%" for k, v in s["breakdown"].items() if not k.startswith("cat:"))
            + " |"
        )
    md = "\n".join(
        [
            "# Feedback experiment",
            "",
            f"Cases: {before['cases']} ({', '.join(CATEGORIES)}). "
            f"Feedback batch: {applied['items']} reviewer actions on paraphrased questions (not eval cases).",
            "",
            *rows,
            "",
            "Activated rules:",
            "",
            applied.get("rules") or "(none)",
        ]
    )
    (HERE / "reports" / "feedback_experiment.md").write_text(md + "\n")
    print(md)


if __name__ == "__main__":
    main()
