import math
import os
from typing import List, Optional

import torch
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import CrossEncoder, SentenceTransformer

EMBEDDING_MODEL = os.getenv("HF_EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
RERANK_MODEL = os.getenv("HF_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L6-v2")
AUTH_TOKEN = os.getenv("SEARCH_ML_AUTH_TOKEN", "").strip()
MAX_EMBED_BATCH = max(1, min(128, int(os.getenv("MAX_EMBED_BATCH", "64"))))
MAX_RERANK_DOCUMENTS = max(1, min(128, int(os.getenv("MAX_RERANK_DOCUMENTS", "60"))))
MAX_TEXT_CHARS = max(256, min(12000, int(os.getenv("MAX_TEXT_CHARS", "5000"))))
TORCH_THREADS = max(1, int(os.getenv("TORCH_THREADS", "2")))

torch.set_num_threads(TORCH_THREADS)

embedding_model = SentenceTransformer(EMBEDDING_MODEL, device="cpu")
rerank_model = CrossEncoder(RERANK_MODEL, device="cpu")

app = FastAPI(title="TheOutHaven Search ML", version="1.0.0")


class EmbedRequest(BaseModel):
    input: Optional[str] = None
    inputs: Optional[List[str]] = None
    model: Optional[str] = None
    normalize: bool = True


class RerankRequest(BaseModel):
    query: str = Field(min_length=1)
    texts: List[str] = Field(min_length=1)
    model: Optional[str] = None
    top_n: Optional[int] = None


def require_auth(authorization: Optional[str]) -> None:
    if not AUTH_TOKEN:
        raise HTTPException(status_code=503, detail="search_ml_auth_token_not_configured")
    expected = f"Bearer {AUTH_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


def clean_text(value: str) -> str:
    return " ".join(str(value or "").split())[:MAX_TEXT_CHARS]


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "theouthaven-search-ml",
        "embedding_model": EMBEDDING_MODEL,
        "rerank_model": RERANK_MODEL,
        "embedding_dimensions": int(embedding_model.get_sentence_embedding_dimension() or 0),
    }


@app.post("/embed")
def embed(request: EmbedRequest, authorization: Optional[str] = Header(default=None)):
    require_auth(authorization)
    raw_inputs = request.inputs if request.inputs is not None else ([request.input] if request.input else [])
    texts = [clean_text(text) for text in raw_inputs if text and clean_text(text)]
    if not texts:
        raise HTTPException(status_code=400, detail="input_required")
    if len(texts) > MAX_EMBED_BATCH:
        raise HTTPException(status_code=400, detail=f"embedding_batch_exceeds_{MAX_EMBED_BATCH}")

    vectors = embedding_model.encode(
        texts,
        batch_size=min(32, len(texts)),
        normalize_embeddings=request.normalize,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    embeddings = [vector.astype(float).tolist() for vector in vectors]
    return {
        "model": EMBEDDING_MODEL,
        "dimensions": len(embeddings[0]) if embeddings else 0,
        "embeddings": embeddings,
        "embedding": embeddings[0] if len(embeddings) == 1 else None,
    }


@app.post("/rerank")
def rerank(request: RerankRequest, authorization: Optional[str] = Header(default=None)):
    require_auth(authorization)
    query = clean_text(request.query)
    texts = [clean_text(text) for text in request.texts]
    if not query:
        raise HTTPException(status_code=400, detail="query_required")
    if not texts:
        raise HTTPException(status_code=400, detail="texts_required")
    if len(texts) > MAX_RERANK_DOCUMENTS:
        raise HTTPException(status_code=400, detail=f"rerank_batch_exceeds_{MAX_RERANK_DOCUMENTS}")

    pairs = [(query, text) for text in texts]
    raw_scores = rerank_model.predict(pairs, batch_size=min(32, len(pairs)), show_progress_bar=False)
    rows = []
    for index, raw in enumerate(raw_scores):
        raw_score = float(raw)
        score = 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, raw_score))))
        rows.append({"index": index, "score": score, "raw_score": raw_score})

    rows.sort(key=lambda row: row["score"], reverse=True)
    top_n = request.top_n if request.top_n is not None else len(rows)
    top_n = max(1, min(int(top_n), len(rows)))
    return {
        "model": RERANK_MODEL,
        "results": rows[:top_n],
    }
