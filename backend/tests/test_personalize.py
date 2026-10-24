"""Phase 11.5: corrections sent from the browser with an upload train a throwaway model per request."""

import base64
import logging
import time

import pytest
from fastapi.testclient import TestClient

import classify as cli
from app.main import MAX_JSON_BYTES, MAX_UPLOAD_BYTES, app
from app.schemas import MAX_LABELS
import pandas as pd

from classifier import personalize
from classifier.personalize import build_request_model, label_key
from classifier.pipeline import MEMORY_ATTR, clean_description, recipient_memory
from test_api import SAMPLE, project_files
from test_phase11 import memory_labels

FAKE_MERCHANT = "QR 9 TOKO CONTOH LAMA"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def json_upload(csv: bytes, labels: list[dict], content_type: str = "text/csv") -> dict:
    return {"file": {"content_type": content_type, "data_b64": base64.b64encode(csv).decode()}, "labels": labels}


def post_json(client, body, **params):
    return client.post("/api/classify", json=body, params=params)


def test_label_key_drops_reference_codes():
    assert label_key("QR 9 TOKO CONTOH LAMA") == label_key("qr 12 toko contoh lama 0310/abc")
    assert label_key("") == ""


def test_exact_label_wins_with_source_label(client):
    csv = f"description,amount\n{FAKE_MERCHANT},25000\nINDOMARET SUDIRMAN,30000\n".encode()
    labels = [{"description": FAKE_MERCHANT, "category": "health", "direction": "DB"}]
    resp = post_json(client, json_upload(csv, labels))
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    assert rows[0]["predicted"] == "health" and rows[0]["source"] == "label"
    assert rows[0]["confidence"] == 1.0 and rows[0]["needs_review"] is False
    # Unlabeled rows still go through the rules.
    assert rows[1]["predicted"] == "groceries" and rows[1]["source"] == "rule"


def test_label_beats_a_rule(client):
    csv = b"description,amount\nKOPI KENANGAN SENAYAN,30000\n"
    labels = [{"description": "KOPI KENANGAN SENAYAN", "category": "entertainment"}]
    rows = post_json(client, json_upload(csv, labels)).json()["rows"]
    assert rows[0]["predicted"] == "entertainment" and rows[0]["source"] == "label"


def test_recipient_memory_from_labels(client):
    # A labeled transfer to IBU CONTOH; a new transfer (other reference) to the same name.
    labels = [{"description": "TRSF E-BANKING DB 0309/FTSCY/WS95051 IBU CONTOH", "category": "savings_transfer",
               "direction": "DB"}]
    csv = b"description,amount\nTRSF E-BANKING DB 2109/FTSCY/WS12345 IBU CONTOH,750000\n"
    rows = post_json(client, json_upload(csv, labels)).json()["rows"]
    assert rows[0]["predicted"] == "savings_transfer"
    assert rows[0]["source"] in ("memory", "label")
    # With a description that does not match the label exactly, only the memory can know it.
    csv = b"description,amount\nTRSF E-BANKING DB 2109/FTSCY/WS12345 BIFAST IBU CONTOH,750000\n"
    rows = post_json(client, json_upload(csv, labels)).json()["rows"]
    assert rows[0]["predicted"] == "savings_transfer" and rows[0]["source"] == "memory"


def test_hint_fills_in_but_stays_flagged(client):
    csv = f"description,amount\n{FAKE_MERCHANT},25000\n".encode()
    labels = [{"description": FAKE_MERCHANT, "category": "eating_out", "hint": True}]
    rows = post_json(client, json_upload(csv, labels)).json()["rows"]
    assert rows[0]["predicted"] == "eating_out" and rows[0]["source"] == "label"
    assert rows[0]["needs_review"] is True and rows[0]["confidence"] < 1.0


def test_no_labels_uses_the_raw_body_model(client):
    csv = f"description,amount\n{FAKE_MERCHANT},25000\n".encode()
    resp = post_json(client, json_upload(csv, []))
    assert resp.status_code == 200
    assert resp.json()["rows"][0]["source"] == "model"


def test_pdf_content_type_accepted(client):
    resp = post_json(client, json_upload(b"not a pdf", [], "application/pdf"))
    assert resp.status_code == 400  # parsed as a PDF, which it is not


# ---- caps and validation ---------------------------------------------------


def test_body_over_12mb_is_413(client):
    resp = client.post("/api/classify", content=b"{" + b" " * MAX_JSON_BYTES + b"}",
                       headers={"Content-Type": "application/json"})
    assert resp.status_code == 413


def test_decoded_file_over_5mb_is_413(client):
    big = b"description\n" + b"x" * MAX_UPLOAD_BYTES
    assert post_json(client, json_upload(big, [])).status_code == 413


def test_too_many_labels_is_422(client):
    labels = [{"description": "A", "category": "health"}] * (MAX_LABELS + 1)
    assert post_json(client, json_upload(b"description\nA\n", labels)).status_code == 422


@pytest.mark.parametrize(
    "label",
    [
        {"description": "SECRET MERCHANT XYZ", "category": "not_a_category"},
        {"description": "SECRET MERCHANT XYZ " * 20, "category": "health"},
        {"description": "SECRET MERCHANT XYZ", "category": "health", "direction": "SIDEWAYS"},
        {"description": "SECRET MERCHANT XYZ", "category": "health", "amount": 987654},
    ],
)
def test_invalid_label_is_422_without_echo(client, label):
    resp = post_json(client, json_upload(b"description\nSECRET ROW TEXT\n", [label]))
    assert resp.status_code == 422
    for secret in ("SECRET", "not_a_category", "SIDEWAYS", "987654"):
        assert secret not in resp.text


def test_bad_base64_is_400(client):
    body = {"file": {"content_type": "text/csv", "data_b64": "!!not base64!!"}, "labels": []}
    resp = post_json(client, body)
    assert resp.status_code == 400 and "not base64" not in resp.text


def test_wrong_file_type_is_422(client):
    assert post_json(client, json_upload(b"description\nA\n", [], "text/plain")).status_code == 422


# ---- privacy ---------------------------------------------------------------


def test_json_upload_with_labels_writes_no_files(client, isolated_tmp):
    sample = SAMPLE.read_bytes()
    header, body = sample.split(b"\n", 1)
    big = header + b"\n" + body * 300  # over 1 MB as JSON
    labels = [{"description": f"TOKO CONTOH {chr(65 + i % 26)}{chr(65 + i // 26 % 26)}", "category": "shopping"}
              for i in range(500)]
    before = project_files()
    resp = post_json(client, json_upload(big, labels))
    assert resp.status_code == 200
    assert project_files() - before == set()
    assert list(isolated_tmp.iterdir()) == []


def test_logs_hold_no_label_text(client, caplog):
    caplog.set_level(logging.DEBUG)
    labels = [{"description": "TOKO RAHASIA SEKALI", "category": "health"},
              {"description": "TRSF E-BANKING DB 0309/FTSCY/WS1 PAK RAHASIA", "category": "people_transfer"}]
    resp = post_json(client, json_upload(b"description,amount\nTOKO RAHASIA SEKALI,123456\n", labels))
    assert resp.status_code == 200
    post_json(client, json_upload(b"description\nX\n", [{"description": "TOKO RAHASIA SEKALI", "category": "bad"}]))
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "POST /api/classify 200" in text and "labels=2" in text  # the logger did run
    assert "RAHASIA" not in text.upper() and "123456" not in text


def test_request_model_is_not_cached(client):
    csv = f"description,amount\n{FAKE_MERCHANT} SEJAHTERA,25000\n".encode()
    near = f"{FAKE_MERCHANT} SEJAHTERA"
    first = post_json(client, json_upload(csv, [{"description": near, "category": "health"}])).json()["rows"][0]
    second = post_json(client, json_upload(csv, [{"description": near, "category": "housing"}])).json()["rows"][0]
    assert (first["predicted"], second["predicted"]) == ("health", "housing")
    # And without labels the shared model is unchanged.
    third = post_json(client, json_upload(csv, [])).json()["rows"][0]
    assert third["source"] == "model"
    # The model learned from labels too, not only the exact match: a similar description follows them.
    similar = f"description\n{FAKE_MERCHANT} SEJAHTERA ABADI\n".encode()
    labels = [{"description": f"{FAKE_MERCHANT} SEJAHTERA {c}", "category": "housing"} for c in "ABCDEFGH"]
    row = post_json(client, json_upload(similar, labels)).json()["rows"][0]
    assert row["source"] == "model" and row["predicted"] == "housing"


def test_model_path_still_used_without_labels(tmp_path, monkeypatch):
    model_path = tmp_path / "personal.joblib"
    assert cli.main(["train", str(memory_labels(tmp_path / "labels.csv")), "--model", str(model_path)]) == 0
    monkeypatch.setenv("MODEL_PATH", str(model_path))
    saved = app.state.model, app.state.model_kind, app.state.sample
    csv = b"description,amount\nTRSF E-BANKING DB 2109/FTSCY/WS9 IBU CONTOH,750000\n"
    try:
        with TestClient(app) as custom:
            assert custom.get("/api/health").json()["model"] == "custom"
            no_labels = post_json(custom, json_upload(csv, [])).json()["rows"][0]
            # Request labels win over MODEL_PATH.
            labels = [{"description": "TRSF E-BANKING DB 0309/FTSCY/WS1 IBU CONTOH", "category": "savings_transfer"}]
            with_labels = post_json(custom, json_upload(csv, labels)).json()["rows"][0]
    finally:
        app.state.model, app.state.model_kind, app.state.sample = saved
    assert no_labels["predicted"] == "people_transfer" and no_labels["source"] == "memory"
    assert with_labels["predicted"] == "savings_transfer"


def test_corrected_label_rows_go_to_reports(client):
    rows = post_json(client, json_upload(f"description,amount\n{FAKE_MERCHANT},25000\n".encode(),
                                         [{"description": FAKE_MERCHANT, "category": "health"}])).json()["rows"]
    assert client.post("/api/report", json={"rows": rows}).status_code == 200
    assert client.post("/api/insights", json={"rows": rows}).status_code == 200


def test_2000_labels_finish_quickly(client):
    labels = [{"description": f"TOKO CONTOH {i:05d} {chr(65 + i % 26)}{chr(65 + i // 26 % 26)} JAYA",
               "category": ["groceries", "shopping", "health", "people_transfer"][i % 4]} for i in range(2000)]
    start = time.perf_counter()
    resp = post_json(client, json_upload(SAMPLE.read_bytes(), labels))
    elapsed = time.perf_counter() - start
    assert resp.status_code == 200
    assert elapsed < 3.0, f"{elapsed:.2f}s"


# ---- hints never train -----------------------------------------------------

HINT_SHOP = "QR 9 WARUNG PETUNJUK SAJA"
HINT_TRANSFER = "TRSF E-BANKING DB 0309/FTSCY/WS7 PAK PETUNJUK"
HINTS = [
    {"description": HINT_SHOP, "category": "eating_out", "direction": "DB", "hint": True},
    {"description": HINT_TRANSFER, "category": "other_transfer", "direction": "DB", "hint": True},
]
BASE = pd.DataFrame({"description": ["INDOMARET A", "KFC B", "PLN C"], "category": ["groceries", "eating_out", "bills"]})


def test_hints_only_keep_the_fallback_model_unchanged():
    fallback = object()  # any object: it must come back as is, never refit
    rm = build_request_model(HINTS, BASE, fallback)
    assert rm.model is fallback and rm.trained_on == 0
    assert rm.exact == {}
    assert set(rm.hints.values()) == {"eating_out", "other_transfer"}


def test_hints_never_enter_training_or_memory(monkeypatch):
    fitted = {}
    real_build = personalize.build_model

    def capturing_build():
        model = real_build()
        real_fit = model.fit

        def fit(X, y, **kwargs):
            fitted["X"], fitted["y"], fitted["kw"] = list(X), list(y), kwargs
            return real_fit(X, y, **kwargs)

        model.fit = fit
        return model

    monkeypatch.setattr(personalize, "build_model", capturing_build)
    confirmed = [
        {"description": "TOKO CONTOH ASLI", "category": "health", "direction": "DB"},
        {"description": "TRSF E-BANKING DB 0109/FTSCY/WS1 IBU CONTOH", "category": "people_transfer", "direction": "DB"},
    ]
    rm = build_request_model(HINTS + confirmed, BASE, fallback_model=None)

    # Training rows: the base plus the two confirmed labels only.
    assert rm.trained_on == 2
    assert len(fitted["X"]) == len(BASE) + 2
    hint_texts = {clean_description(h["description"]) for h in HINTS}
    assert hint_texts.isdisjoint(fitted["X"])
    assert not any("petunjuk" in x for x in fitted["X"])
    # other_transfer appears only in a hint, so no training target may carry it.
    assert "other_transfer" not in fitted["y"]
    assert len(fitted["kw"]["logisticregression__sample_weight"]) == len(fitted["X"])

    # Recipient memory: the confirmed transfer only, never the hinted recipient.
    memory = recipient_memory(rm.model)
    assert memory == {"Ibu Contoh": "people_transfer"} and getattr(rm.model, MEMORY_ATTR) is memory
    # Exact matches hold confirmed labels only; hints sit in their own table.
    assert set(rm.exact.values()) == {"health", "people_transfer"}
    assert {k for k, _ in rm.hints} == {label_key(h["description"]) for h in HINTS}
    assert not ({k for k, _ in rm.exact} & {k for k, _ in rm.hints})


def test_hinted_transfer_row_stays_flagged_not_memory(client):
    # A new transfer to the hinted recipient (other reference): no memory entry, so it is not
    # silently decided; the exact hint match (same text) is flagged for review.
    csv = (
        "description,amount\n"
        f"{HINT_TRANSFER},50000\n"
        "TRSF E-BANKING DB 2109/FTSCY/WS8 BIFAST PAK PETUNJUK,50000\n"
    ).encode()
    rows = post_json(client, json_upload(csv, HINTS)).json()["rows"]
    assert rows[0]["source"] == "label" and rows[0]["needs_review"] is True
    assert rows[1]["source"] != "memory" and rows[1]["source"] != "label"
