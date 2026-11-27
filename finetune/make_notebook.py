import json
from pathlib import Path

CELLS = [
    (
        "markdown",
        """# Keel router: fine-tune Qwen2.5-1.5B-Instruct for intent + risk classification

Runs on a free Colab T4 (Runtime → Change runtime type → T4 GPU).

1. Add Colab secrets (key icon on the left): `HF_TOKEN` (write access) and optionally `GROQ_API_KEY` for the gpt-oss-120b comparison.
2. Upload `train.jsonl`, `val.jsonl` and `test.jsonl` from `finetune/data/` when the upload cell asks, or set `REPO_URL` to clone them.
3. Run all. Outputs: `results.json`, `RESULTS.md`, confusion matrices, a LoRA adapter, a merged model on the Hub and a GGUF (Q4_K_M) for CPU serving.""",
    ),
    (
        "code",
        """%%capture
!pip install -q unsloth
!pip install -q --no-deps "trl==0.15.2" "peft" "accelerate" "bitsandbytes"
!pip install -q scikit-learn httpx""",
    ),
    (
        "code",
        """import os, json, time, statistics, pathlib
REPO_URL = ""
HF_REPO = "bano1397/keel-router-qwen2.5-1.5b"
BASE = "unsloth/Qwen2.5-1.5B-Instruct"
if REPO_URL:
    !git clone -q {REPO_URL} repo
    DATA = pathlib.Path("repo/finetune/data")
else:
    from google.colab import files
    DATA = pathlib.Path("data"); DATA.mkdir(exist_ok=True)
    for name, content in files.upload().items():
        (DATA / name).write_bytes(content)
load = lambda n: [json.loads(l) for l in open(DATA / f"{n}.jsonl")]
train, val, test = load("train"), load("val"), load("test")
LABELS = ["order_status","refund_request","cancel_order","change_address","product_question","policy_question","complaint","human_request","legal_safety","other"]
print(len(train), len(val), len(test))""",
    ),
    (
        "code",
        """from unsloth import FastLanguageModel
import torch
model, tok = FastLanguageModel.from_pretrained(BASE, max_seq_length=512, load_in_4bit=True)

def parse(out):
    o = out.strip().lower().replace(" ", "_")
    for l in sorted(LABELS, key=len, reverse=True):
        if l in o:
            return l
    return "other"

def predict(m, rows, few_shot=False):
    FastLanguageModel.for_inference(m)
    shots = []
    if few_shot:
        seen = set()
        for r in train:
            if r["label"] not in seen and r["source"] == "synthetic":
                seen.add(r["label"]); shots += [r["messages"][1], r["messages"][2]]
    preds, lats = [], []
    for r in rows:
        msgs = [r["messages"][0]] + shots + [r["messages"][1]]
        ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt").to("cuda")
        torch.cuda.synchronize(); t0 = time.time()
        out = m.generate(input_ids=ids, max_new_tokens=8, do_sample=False, pad_token_id=tok.eos_token_id)
        torch.cuda.synchronize(); lats.append((time.time() - t0) * 1000)
        preds.append(parse(tok.decode(out[0][ids.shape[1]:], skip_special_tokens=True)))
    return preds, lats""",
    ),
    (
        "code",
        """from sklearn.metrics import accuracy_score, f1_score, confusion_matrix
gold = [r["label"] for r in test]
ROUTE = {"order_status":"orders","refund_request":"orders","cancel_order":"orders","change_address":"orders","product_question":"support","policy_question":"support","other":"support","complaint":"escalation","human_request":"escalation","legal_safety":"escalation"}
GPU_USD_PER_HOUR = 0.35
def summarise(name, preds, lats, usd_per_1k=None):
    r = {"model": name, "accuracy": round(100*accuracy_score(gold, preds), 1),
         "macro_f1": round(100*f1_score(gold, preds, average="macro", labels=LABELS, zero_division=0), 1),
         "route_accuracy": round(100*sum(ROUTE[g]==ROUTE[p] for g,p in zip(gold,preds))/len(gold), 1),
         "escalation_recall": round(100*sum(ROUTE[p]=="escalation" for g,p in zip(gold,preds) if ROUTE[g]=="escalation")/sum(ROUTE[g]=="escalation" for g in gold), 1),
         "p50_ms": round(statistics.median(lats)), "p95_ms": round(sorted(lats)[int(.95*len(lats))-1]),
         "usd_per_1k": usd_per_1k if usd_per_1k is not None else round(statistics.mean(lats)/1000/3600*GPU_USD_PER_HOUR*1000, 4),
         "confusion": confusion_matrix(gold, preds, labels=LABELS).tolist()}
    print({k: v for k, v in r.items() if k != "confusion"}); return r
results = []
p, l = predict(model, test); results.append(summarise("Qwen2.5-1.5B base (zero-shot)", p, l))
p, l = predict(model, test, few_shot=True); results.append(summarise("Qwen2.5-1.5B base (10-shot)", p, l))""",
    ),
    (
        "code",
        """from trl import SFTTrainer, SFTConfig
from datasets import Dataset
model = FastLanguageModel.get_peft_model(model, r=16, lora_alpha=32, lora_dropout=0, bias="none",
    target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"], use_gradient_checkpointing="unsloth", random_state=2026)
fmt = lambda rows: Dataset.from_list([{"text": tok.apply_chat_template(r["messages"], tokenize=False)} for r in rows])
trainer = SFTTrainer(model=model, tokenizer=tok, train_dataset=fmt(train), eval_dataset=fmt(val),
    args=SFTConfig(output_dir="out", dataset_text_field="text", max_seq_length=512, per_device_train_batch_size=16,
        gradient_accumulation_steps=1, num_train_epochs=2, learning_rate=2e-4, lr_scheduler_type="cosine", warmup_ratio=0.05,
        logging_steps=20, eval_strategy="epoch", save_strategy="no", fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(), seed=2026, report_to=[]))
t0 = time.time(); stats = trainer.train(); train_minutes = round((time.time()-t0)/60, 1)
print("train minutes", train_minutes, trainer.state.log_history[-1])""",
    ),
    (
        "code",
        """p, l = predict(model, test); results.append(summarise("Qwen2.5-1.5B + LoRA (fine-tuned)", p, l))
tuned_preds = p""",
    ),
    (
        "code",
        """import httpx
from google.colab import userdata
try:
    key = userdata.get("GROQ_API_KEY")
except Exception:
    key = None
if key:
    preds, lats, tin, tout = [], [], 0, 0
    for r in test:
        for attempt in range(6):
            t0 = time.time()
            resp = httpx.post("https://api.groq.com/openai/v1/chat/completions", timeout=60,
                headers={"Authorization": f"Bearer {key}"},
                json={"model": "openai/gpt-oss-120b", "messages": r["messages"][:2], "max_tokens": 300, "temperature": 0, "reasoning_effort": "low"})
            if resp.status_code == 429:
                time.sleep(float(resp.headers.get("retry-after", 5))); continue
            resp.raise_for_status(); break
        lats.append((time.time()-t0)*1000); j = resp.json()
        tin += j["usage"]["prompt_tokens"]; tout += j["usage"]["completion_tokens"]
        preds.append(parse(j["choices"][0]["message"]["content"]))
    usd = round((tin*0.15 + tout*0.60)/1e6/len(test)*1000, 4)
    results.append(summarise("gpt-oss-120b via Groq API", preds, lats, usd))""",
    ),
    (
        "code",
        """meta = {"base": BASE, "train_rows": len(train), "val_rows": len(val), "test_rows": len(test), "epochs": 2, "lora_r": 16,
        "train_minutes": train_minutes, "gpu": torch.cuda.get_device_name(0), "gpu_usd_per_hour_assumption": GPU_USD_PER_HOUR,
        "groq_price_per_mtok": [0.15, 0.60]}
json.dump({"meta": meta, "labels": LABELS, "results": results}, open("results.json", "w"), indent=2)
md = "| Model | Accuracy | Macro-F1 | Route acc. | Escalation recall | p50 | p95 | $ / 1k msgs |\\n|---|---|---|---|---|---|---|---|\\n"
md += "".join(f"| {r['model']} | {r['accuracy']}% | {r['macro_f1']}% | {r['route_accuracy']}% | {r['escalation_recall']}% | {r['p50_ms']} ms | {r['p95_ms']} ms | ${r['usd_per_1k']} |\\n" for r in results)
open("RESULTS.md", "w").write(md); print(md)
import matplotlib.pyplot as plt, numpy as np
for r in results:
    cm = np.array(r["confusion"]); fig, ax = plt.subplots(figsize=(7,6)); ax.imshow(cm, cmap="Greens")
    ax.set_xticks(range(len(LABELS)), LABELS, rotation=60, ha="right"); ax.set_yticks(range(len(LABELS)), LABELS)
    for i in range(len(LABELS)):
        for j in range(len(LABELS)): ax.text(j, i, cm[i,j], ha="center", va="center", fontsize=8)
    ax.set_title(r["model"]); fig.tight_layout(); fig.savefig("cm_" + "".join(c if c.isalnum() else "_" for c in r["model"])[:40] + ".png", dpi=120)""",
    ),
    (
        "code",
        """hf = userdata.get("HF_TOKEN")
model.save_pretrained("keel-router-lora"); tok.save_pretrained("keel-router-lora")
model.push_to_hub_merged(HF_REPO, tok, save_method="merged_16bit", token=hf)
model.push_to_hub_gguf(HF_REPO + "-gguf", tok, quantization_method="q4_k_m", token=hf)
print("pushed", HF_REPO)""",
    ),
    (
        "code",
        """!zip -q -r keel_finetune_outputs.zip results.json RESULTS.md cm_*.png keel-router-lora
files.download("keel_finetune_outputs.zip")""",
    ),
]


def main() -> None:
    nb = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "accelerator": "GPU",
            "colab": {"gpuType": "T4"},
            "kernelspec": {"name": "python3", "display_name": "Python 3"},
        },
        "cells": [],
    }
    for kind, src in CELLS:
        cell = {"cell_type": kind, "metadata": {}, "source": src.splitlines(keepends=True)}
        if kind == "code":
            cell.update({"execution_count": None, "outputs": []})
        nb["cells"].append(cell)
    out = Path(__file__).parent / "keel_router_finetune.ipynb"
    out.write_text(json.dumps(nb, indent=1))
    print("wrote", out)


if __name__ == "__main__":
    main()
