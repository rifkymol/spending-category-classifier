# Spending Category Auto-Classifier

Automatically categorize bank transactions from their text descriptions, so you don't have to tag every transaction by hand. The model handles the easy ones, and you only correct the mistakes.

**Status:** Idea, not started
**Difficulty:** Beginner to intermediate
**Estimated time:** About 1 to 2 weekends
**Estimated cost:** $0 (everything runs locally)

## Goal

Predict a category (food, transport, shopping, bills, and so on) for each transaction from its description, such as "GRAB*FOOD" or "SHOPEE", with a review step for uncertain cases.

## Approach

1. **Export data:** 3 to 6 months of transactions as CSV from the bank app.
2. **Clean descriptions:** lowercase, strip reference numbers, dates, and branch codes.
3. **Keyword rules first:** map obvious merchants (GRAB, SHOPEE, and so on) directly. This covers a large share with no ML.
4. **Label about 200 transactions by hand** for the rest.
5. **Baseline model:** TF-IDF plus logistic regression.
6. **Improve:** add sentence embeddings (for example, a MiniLM model) and compare the results.
7. **Confidence threshold:** below a set score, ask the user instead of guessing.
8. **Review screen:** confirm or fix predictions. Each correction becomes new training data.

## Stack

- Python 3.10+
- `pandas` (CSV handling)
- `scikit-learn` (TF-IDF, logistic regression, evaluation)
- `sentence-transformers` (embeddings, optional)
- Simple UI later: Streamlit or a CLI prompt

## Usage

The classifier core and CLI live under `backend/`. Run these from the project root:

```bash
pip install -r requirements.txt
python backend/classify.py evaluate data/sample_transactions.csv   # cross-validated accuracy, rule coverage, review share
python backend/classify.py train data/sample_transactions.csv      # saves backend/models/model.joblib
python backend/classify.py predict data/sample_transactions.csv --out data/predictions.csv
```

`predict` does not need a `category` column. Use `--threshold` (default 0.6) to change when rows are flagged for review. Run the tests with `pytest backend`.

## Privacy

- Bank statements are sensitive. Keep all data and models on your own machine.
- Avoid sending statements to cloud APIs.
- Don't commit real statements to a Git repo. Add the data folder to `.gitignore`.

## Open questions

- Which categories do you want? Keep the list short at first (5 to 8).
- Do you want the classifier to also flag unusual spending?
- Export format: does your bank's CSV have consistent column names?
