# FastAPI backend. Build from the repo root:
#   docker build -f backend/Dockerfile .
# python:3.13-slim, pinned 2026-10-18. Update: docker pull python:3.13-slim, then
# docker image inspect --format '{{index .RepoDigests 0}}' python:3.13-slim
FROM python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Runtime deps only; pytest and httpx stay out of the image. The lock file pins
# every transitive dependency so builds are reproducible.
COPY backend/requirements-runtime.txt backend/requirements-runtime.lock /app/backend/
RUN pip install -r /app/backend/requirements-runtime.txt -c /app/backend/requirements-runtime.lock

# App code plus the synthetic sample the default model trains on at startup
# (main.py resolves it as /app/data/sample_transactions.csv).
COPY backend/ /app/backend/
COPY data/sample_transactions.csv /app/data/sample_transactions.csv

RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app
USER app

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).status == 200 else 1)"]

# 0.0.0.0 is inside the container only; docker-compose.yml publishes the port
# on the host's 127.0.0.1.
CMD ["uvicorn", "app.main:app", "--app-dir", "/app/backend", "--host", "0.0.0.0", "--port", "8000"]
