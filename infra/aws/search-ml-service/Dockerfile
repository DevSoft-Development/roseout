FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/huggingface \
    TRANSFORMERS_CACHE=/opt/huggingface \
    PORT=8080

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.12.1 \
    && python -m pip install -r requirements.txt \
    && python - <<'PY'
import torch
assert torch.version.cuda is None, f"Expected CPU-only PyTorch, found CUDA {torch.version.cuda}"
print(f"CPU-only PyTorch ready: {torch.__version__}")
PY

ARG HF_EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
ARG HF_RERANK_MODEL=cross-encoder/ms-marco-MiniLM-L6-v2
ENV HF_EMBEDDING_MODEL=${HF_EMBEDDING_MODEL} \
    HF_RERANK_MODEL=${HF_RERANK_MODEL}

RUN python - <<'PY'
from sentence_transformers import CrossEncoder, SentenceTransformer
import os
SentenceTransformer(os.environ["HF_EMBEDDING_MODEL"], device="cpu")
CrossEncoder(os.environ["HF_RERANK_MODEL"], device="cpu")
PY

COPY app.py ./app.py

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3)"

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
