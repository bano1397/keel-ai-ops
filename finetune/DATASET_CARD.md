# Dataset card: Keel router intents

**Task:** single-label classification of a customer message into 10 intents. The Router maps intents to agents: order_status, refund_request, cancel_order and change_address go to Orders; product_question, policy_question and other go to Support; complaint, human_request and legal_safety go to Escalation.

**Sources**
- **Bitext customer-support dataset:** `bitext/Bitext-customer-support-llm-chatbot-training-dataset`, licence CDLA-Sharing-1.0. 21 of its 27 intents are mapped to our labels (see `BITEXT_MAP` in `build_dataset.py`). Placeholders such as `{{Order Number}}` are replaced with Hearth & Field order ids. The raw data is not redistributed: `build_dataset.py` downloads it.
- **Synthetic UK e-commerce messages:** generated from templates with UK places, postcodes, products and order ids. They cover the labels Bitext lacks (`product_question`, `legal_safety`) and UK-specific phrasing.

**Splits (seed 2026)**
- train 2,205 · val 244 · test 232.
- The test set is 10 held-out Bitext rows per mapped label plus up to 20 messages per label from a separate set of templates. None of those templates are used in training.
- Any training row whose normalised text matches a test row is removed, so there is no exact leakage. Bitext contains many paraphrases of each intent, so Bitext test rows are close in style to training rows. The held-out synthetic templates are the harder transfer test.

**Known limits:** English only. The synthetic data is template-based, so real customer messages are messier. Sarcasm and messages with several intents are under-represented.

Rebuild:

    python finetune/build_dataset.py --bitext bitext.jsonl
