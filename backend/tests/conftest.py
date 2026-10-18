import sys
import tempfile
from pathlib import Path

import pytest

# Make `classifier` and the `classify` CLI module importable from any working directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def isolated_tmp(tmp_path, monkeypatch) -> Path:
    """A fresh, empty temp dir for this test only: other processes also write to the system one."""
    tmp = tmp_path / "isolated-temp"
    tmp.mkdir()
    for var in ("TMP", "TEMP", "TMPDIR"):
        monkeypatch.setenv(var, str(tmp))
    monkeypatch.setattr(tempfile, "tempdir", str(tmp))  # restored after the test
    assert tempfile.gettempdir() == str(tmp)
    return tmp
