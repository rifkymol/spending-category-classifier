# Plan: Spending Category Auto-Classifier

Status: Phase 1 (classifier core + CLI under `backend/`) built; awaiting pytest run. This file is the handoff for moving the project to another Claude environment.

> **Direction update:** this is now a self-hosted FastAPI + Next.js web app (see `CLAUDE.md`). The classifier core lives under `backend/`.

## Goal

Predict a spending category for each bank transaction from its text description (for example "GRAB*FOOD" or "SHOPEE"). Handle the obvious merchants with rules, use a local ML model for the rest, and ask the user to review uncertain cases.

## Scope

**In:**
- Read a bank statement exported as CSV
- Clean descriptions
- Keyword rules for known merchants
- Baseline model (TF-IDF with character n-grams, plus logistic regression)
- Confidence threshold that flags uncertain rows for review
- Output CSV with predicted categories and review flags

**Out (for now):**
- Web or mobile UI
- Sentence embeddings (planned as a later comparison)
- Live bank connections or API access
- Anomaly detection on spending

## Decisions to confirm before coding

1. **Category list.** Current draft: food, transport, shopping, bills, transfer. Confirm or change it.
2. **Real bank CSV format.** Need one anonymized sample: column names, date format, and whether amount is signed (debit and credit).
3. **Training labels.** Plan to label about 200 real transactions by hand. Decide who labels and in what tool (a spreadsheet is fine).
4. **Confidence threshold.** Starting value is 0.6. Tune after the first labeled set.

## Phases

1. **Confirm decisions.** Answer the questions above.
2. **Data.** Export 3 to 6 months of statements. Store them in `data/raw/`, which is gitignored. Label about 200 rows.
3. **Baseline.** Build the cleaning function, the rules, and the TF-IDF model. Evaluate with cross-validation on the labeled set.
4. **Compare.** Try sentence embeddings (MiniLM or similar) against the baseline. Keep whichever scores better on held-out rows.
5. **Review loop.** Add a simple way to confirm or fix flagged rows. Save corrections as new labels.
6. **Polish.** Optional UI (Streamlit or CLI prompt), notes on the results.

## Files

| Path | Purpose | State |
|---|---|---|
| `README.md` | Idea overview and approach | Exists |
| `requirements.txt` | Points to `backend/requirements.txt` | Exists |
| `backend/requirements.txt` | `pandas`, `scikit-learn`, `joblib`, `pytest` | Exists |
| `.gitignore` | Keeps statements, predictions, and models (`models/`, `*.joblib`) out of Git | Exists |
| `data/sample_transactions.csv` | 40 synthetic rows for testing, not real data | Exists |
| `backend/classifier/pipeline.py` | Cleaning, word-boundary rules, model, loader, `classify()` (pure, in-memory) | Exists, CLI-checked |
| `backend/classify.py` | CLI: `evaluate`, `train`, `predict` | Exists, runs on the sample |
| `backend/tests/test_pipeline.py` | pytest tests (cleaning, rules, classify, loader, end-to-end) | Exists, not yet run with pytest |
| `PLAN.md` | This file | Exists |

Not yet created: `data/raw/` (real statements), a virtual environment. `src/` was removed after its logic moved into `backend/`.

## Setup for a new environment

1. Copy this whole folder to the new environment.
2. Create a virtual environment: `python -m venv .venv`, then activate it.
3. Install dependencies: `pip install -r requirements.txt`.
4. Run the baseline on the sample data: `python backend/classify.py evaluate data/sample_transactions.csv` (then `train` and `predict`).
5. Expect a rough accuracy number. The sample is synthetic and small, so treat the number as a smoke test only.

## Known gaps to fix

- ~~`src/classify.py` assumes a `category` column exists.~~ Fixed: `predict` works without it.
- ~~`README.md` links to `../ml-project-ideas.md`, which is broken.~~ Fixed: link removed.
- ~~Rules hide the model's real performance.~~ Fixed: `evaluate` reports model-only accuracy on held-out folds, separately from rule coverage and precision.
- ~~No tests yet.~~ Fixed: `backend/tests/test_pipeline.py`.

## Privacy

- Real statements stay local and out of Git.
- Do not send statements to cloud APIs.
- Do not paste real transactions into chat when working in another environment unless the content is anonymized.

## Risks

- **Too few labels.** The model may overfit with about 200 rows. Mitigation: start with rules and review more rows over time.
- **Merchant names change.** Rules can go stale. Mitigation: the review loop feeds new labels back in.
- **Ambiguous descriptions.** Some transfers have no merchant name. Mitigation: flag them for review.

## Open questions

- Do you want income (salary, transfers in) tracked separately from spending?
- Which bank exports do you use, and do they include a category field already?
