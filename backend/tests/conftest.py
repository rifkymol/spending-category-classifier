import sys
from pathlib import Path

# Make `classifier` and the `classify` CLI module importable from any working directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
