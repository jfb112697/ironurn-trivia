"""Allow ``python -m pipeline`` from the data/ directory."""
from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
