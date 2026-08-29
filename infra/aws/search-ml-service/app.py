import base64
import hashlib
import io
import math
import os
import threading
import time
from collections import OrderedDict
from typing import Dict, List, Optional

import torch
from fastapi import FastAPI, Header, HTTPException
from langdetect import DetectorFactory, detect_langs
from pydantic import BaseModel, Field
from sentence_transformers import CrossEncoder, SentenceTransformer

EMBEDDING_MODEL = os.getenv("HF_EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
RERANK_MODEL = os.getenv("HF_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L6-v2")
VISION_MODEL = os.getenv("HF_VISION_MODEL", "google/siglip-base-patch16-224")
TRANSLATION_MODEL = os.getenv("HF_TRANSLATION_MODEL", "Helsinki-NLP/opus-mt-mul-en")
AUTH_TOKEN = os.getenv("SEARCH_ML_AUTH_TOKEN", "").strip()
MAX_EMBED_BATCH = max(1, min(128, int(os.getenv("MAX_EMBED_BATCH", "64"))))
MAX_RERANK_DOCUMENTS = max(1, min(128, int(os.getenv("MAX_RERANK_DOCUMENTS", "60"))))
MAX_TEXT_CHARS = max(256, min(12000, int(os.getenv("MAX_TEXT_CHARS", "5000"))))
MAX_CLASSIFY_LABELS = max(4, min(96, int(os.getenv("MAX_CLASSIFY_LABELS", "48"))))
MAX_IMAGE_BYTES = max(100_000, min(5_000_000, int(os.getenv("MAX_IMAGE_BYTES", "3000000"))))
TORCH_THREADS = max(1, int(os.getenv("TORCH_THREADS", "4")))
CACHE_TTL_SECONDS = max(30, min(86400, int(os.getenv("ML_CACHE_TTL_SECONDS", "3600"))))
EMBED_CACHE_SIZE = max(32, min(4096, int(os.getenv("ML_EMBED_CACHE_SIZE", "1024"))))
RERANK_CACHE_SIZE = max(16, min(1024, int(os.getenv("ML_RERANK_CACHE_SIZE", "256"))))
TRANSLATION_CACHE_SIZE = max(16, min(1024, int(os.getenv("ML_TRANSLATION_CACHE_SIZE", "256"))))

DetectorFactory.seed = 0
torch.set_num_threads(TORCH_THREADS)
try:
    torch.set_num_interop_threads(1)
except RuntimeError:
    pass

embedding_model = SentenceTransformer(EMBEDDING_MODEL, device="cpu")
rerank_model = CrossEncoder(RERANK_MODEL, device="cpu")
vision_model = None
vision_processor = None
translation_model = None
translation_tokenizer = None
model_load_lock = threading.Lock()

app = FastAPI(title="TheOutHaven Search ML", version="2.1.0")

INTENT_PROTOTYPES: Dict[str, List[str]] = {
    "restaurant": ["restaurant", "dinner", "lunch", "brunch", "food", "eat", "meal"],
    "activity": ["activity", "something fun", "things to do", "entertainment", "after dinner"],
    "pair": ["dinner then activity", "restaurant and something fun", "complete outing", "date night plan"],
    "romantic": ["romantic", "date night", "intimate", "anniversary", "couples"],
    "upscale": ["upscale", "luxury", "elegant", "fancy", "fine dining"],
    "casual": ["casual", "laid back", "chill", "relaxed"],
    "rooftop": ["rooftop", "skyline view", "roof deck", "views"],
    "hookah": ["hookah", "shisha", "hookah lounge"],
    "bowling": ["bowling", "bowling alley", "bowling lanes"],
    "karaoke": ["karaoke", "singing", "karaoke room"],
    "arcade": ["arcade", "games", "gaming bar"],
    "museum": ["museum", "exhibit", "exhibition"],
    "comedy": ["comedy", "stand up", "comedy club"],
    "live_music": ["live music", "jazz", "concert", "music venue"],
    "sports_watch": ["watch the game", "sports bar", "sports viewing"],
    "late_night": ["late night", "open late", "after midnight"],
    "groups": ["group", "birthday group", "girls night", "friends"],
    "family": ["family", "kids", "family friendly"],
}

PHOTO_LABELS = [
    "plated food",
    "cocktail or drink",
    "restaurant interior",
    "building exterior",
    "rooftop or skyline view",
    "menu or text",
    "logo or graphic",
    "people or crowd",
    "blurry or low quality photo",
]


class TimedLru:
    def __init__(self, max_size: int, ttl_seconds: int):
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self.data = OrderedDict()
        self.lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key):
        now = time.monotonic()
        with self.lock:
            row = self.data.get(key)
            if row is None:
                self.misses += 1
                return None
            expires_at, value = row
            if expires_at <= now:
                self.data.pop(key, None)
                self.misses += 1
                return None
            self.data.move_to_end(key)
            self.hits += 1
            return value

    def set(self, key, value):
        with self.lock:
            self.data[key] = (time.monotonic() + self.ttl_seconds, value)
            self.data.move_to_end(key)
            while len(self.data) > self.max_size:
                self.data.popitem(last=False)

    def stats(self):
        with self.lock:
            return {"size": len(self.data), "hits": self.hits, "misses": self.misses}


embed_cache = TimedLru(EMBED_CACHE_SIZE, CACHE_TTL_SECONDS)
rerank_cache = TimedLru(RERANK_CACHE_SIZE, CACHE_TTL_SECONDS)
translation_cache = TimedLru(TRANSLATION_CACHE_SIZE, CACHE_TTL_SECONDS)


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


class TextClassifyRequest(BaseModel):
    text: str = Field(min_length=1)
    labels: List[str] = Field(min_length=1)
    top_n: Optional[int] = None
    min_score: float = 0.0


class IntentClassifyRequest(BaseModel):
    text: str = Field(min_length=1)


class ImageClassifyRequest(BaseModel):
    image_base64: str = Field(min_length=8)


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


def require_auth(authorization: Optional[str]) -> None:
    if not AUTH_TOKEN:
        raise HTTPException(status_code=503, detail="search_ml_auth_token_not_configured")
    expected = f"Bearer {AUTH_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


def clean_text(value: str) -> str:
    return " ".join(str(value or "").split())[:MAX_TEXT_CHARS]


def sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, value))))


def cosine_rows(query_vector, label_vectors):
    query = torch.as_tensor(query_vector, dtype=torch.float32)
    labels = torch.as_tensor(label_vectors, dtype=torch.float32)
    query = torch.nn.functional.normalize(query, p=2, dim=0)
    labels = torch.nn.functional.normalize(labels, p=2, dim=1)
    return torch.mv(labels, query).cpu().tolist()


def stable_key(*parts: str) -> str:
    return hashlib.sha256("\n\x1f\n".join(parts).encode("utf-8")).hexdigest()


def encode_texts(texts: List[str], normalize: bool = True):
    vectors = [None] * len(texts)
    missing_indexes = []
    missing_texts = []
    for index, text in enumerate(texts):
        key = stable_key(EMBEDDING_MODEL, "1" if normalize else "0", text)
        cached = embed_cache.get(key)
        if cached is not None:
            vectors[index] = cached
        else:
            missing_indexes.append(index)
            missing_texts.append(text)
    if missing_texts:
        fresh = embedding_model.encode(
            missing_texts,
            batch_size=min(32, len(missing_texts)),
            normalize_embeddings=normalize,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        for index, vector in zip(missing_indexes, fresh):
            serial = vector.astype(float).tolist()
            vectors[index] = serial
            embed_cache.set(stable_key(EMBEDDING_MODEL, "1" if normalize else "0", texts[index]), serial)
    return vectors


def classify_text_internal(text: str, labels: List[str]):
    cleaned = clean_text(text)
    clean_labels = [clean_text(label) for label in labels if clean_text(label)]
    if not cleaned or not clean_labels:
        return []
    if len(clean_labels) > MAX_CLASSIFY_LABELS:
        raise HTTPException(status_code=400, detail=f"classification_labels_exceed_{MAX_CLASSIFY_LABELS}")
    vectors = encode_texts([cleaned] + clean_labels, normalize=True)
    similarities = cosine_rows(vectors[0], vectors[1:])
    rows = [
        {"label": label, "score": max(0.0, min(1.0, (float(score) + 1.0) / 2.0))}
        for label, score in zip(clean_labels, similarities)
    ]
    rows.sort(key=lambda row: row["score"], reverse=True)
    return rows


def ensure_vision_model():
    global vision_model, vision_processor
    if vision_model is not None and vision_processor is not None:
        return vision_model, vision_processor
    with model_load_lock:
        if vision_model is not None and vision_processor is not None:
            return vision_model, vision_processor
        from transformers import AutoModel, AutoProcessor
        vision_processor = AutoProcessor.from_pretrained(VISION_MODEL)
        vision_model = AutoModel.from_pretrained(VISION_MODEL)
        vision_model.eval()
    return vision_model, vision_processor


def ensure_translation_model():
    global translation_model, translation_tokenizer
    if translation_model is not None and translation_tokenizer is not None:
        return translation_model, translation_tokenizer
    with model_load_lock:
        if translation_model is not None and translation_tokenizer is not None:
            return translation_model, translation_tokenizer
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        translation_tokenizer = AutoTokenizer.from_pretrained(TRANSLATION_MODEL)
        translation_model = AutoModelForSeq2SeqLM.from_pretrained(TRANSLATION_MODEL)
        translation_model.eval()
    return translation_model, translation_tokenizer


def decode_image(image_base64: str):
    try:
        raw = base64.b64decode(image_base64, validate=True)
    except Exception as error:
        raise HTTPException(status_code=400, detail="invalid_image_base64") from error
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="image_size_invalid")
    try:
        from PIL import Image
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as error:
        raise HTTPException(status_code=400, detail="invalid_image") from error


def language_guess(text: str):
    if len(text) < 4 or not any(char.isalpha() for char in text):
        return "en", 1.0
    try:
        guesses = detect_langs(text)
    except Exception:
        return None, 0.0
    if not guesses:
        return None, 0.0
    return guesses[0].lang, float(guesses[0].prob)


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "theouthaven-search-ml",
        "version": "2.1.0",
        "embedding_model": EMBEDDING_MODEL,
        "rerank_model": RERANK_MODEL,
        "vision_model": VISION_MODEL,
        "translation_model": TRANSLATION_MODEL,
        "embedding_dimensions": int(embedding_model.get_sentence_embedding_dimension() or 0),
        "vision_embedding_dimensions": 768,
        "torch_threads": TORCH_THREADS,
        "capabilities": ["embed", "rerank", "classify_text", "classify_intent", "classify_image", "image_embed", "translate_to_english"],
        "cache": {
            "embed": embed_cache.stats(),
            "rerank": rerank_cache.stats(),
            "translation": translation_cache.stats(),
        },
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
    embeddings = encode_texts(texts, normalize=request.normalize)
    return {"model": EMBEDDING_MODEL, "dimensions": len(embeddings[0]) if embeddings else 0, "embeddings": embeddings, "embedding": embeddings[0] if len(embeddings) == 1 else None}


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
    top_n = max(1, min(int(request.top_n if request.top_n is not None else len(texts)), len(texts)))
    cache_key = stable_key(RERANK_MODEL, query, str(top_n), *texts)
    cached = rerank_cache.get(cache_key)
    if cached is not None:
        return {"model": RERANK_MODEL, "results": cached, "cached": True}
    raw_scores = rerank_model.predict([(query, text) for text in texts], batch_size=min(24, len(texts)), show_progress_bar=False)
    rows = [{"index": index, "score": sigmoid(float(raw)), "raw_score": float(raw)} for index, raw in enumerate(raw_scores)]
    rows.sort(key=lambda row: row["score"], reverse=True)
    results = rows[:top_n]
    rerank_cache.set(cache_key, results)
    return {"model": RERANK_MODEL, "results": results, "cached": False}


@app.post("/classify-text")
def classify_text(request: TextClassifyRequest, authorization: Optional[str] = Header(default=None)):
    require_auth(authorization)
    rows = classify_text_internal(request.text, request.labels)
    rows = [row for row in rows if row["score"] >= max(0.0, min(1.0, request.min_score))]
    top_n = max(1, min(int(request.top_n if request.top_n is not None else len(rows) or 1), len(rows) or 1))
    return {"model": EMBEDDING_MODEL, "results": rows[:top_n]}


@app.post("/classify-intent")
def classify_intent(request: IntentClassifyRequest, authorization: Optional[str] = Header(default=None)):
    require_auth(authorization)
    labels = list(INTENT_PROTOTYPES.keys())
    prototype_texts = [f"{label}: {'; '.join(INTENT_PROTOTYPES[label])}" for label in labels]
    rows = classify_text_internal(request.text, prototype_texts)
    score_by_text = {row["label"]: row["score"] for row in rows}
    scores = {label: float(score_by_text.get(prototype_texts[index], 0.0)) for index, label in enumerate(labels)}
    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    pair_score = scores.get("pair", 0.0)
    restaurant_score = max(scores.get("restaurant", 0.0), pair_score)
    activity_score = max(scores.get("activity", 0.0), pair_score)
    activity_types = [label for label in ["hookah", "bowling", "karaoke", "arcade", "museum", "comedy", "live_music", "sports_watch", "rooftop"] if scores.get(label, 0.0) >= 0.70]
    vibes = [label for label in ["romantic", "upscale", "casual", "late_night", "groups", "family"] if scores.get(label, 0.0) >= 0.70]
    confidence = ordered[0][1] if ordered else 0.0
    return {
        "model": EMBEDDING_MODEL,
        "confidence": confidence,
        "needs_restaurant": restaurant_score >= 0.70,
        "needs_activity": activity_score >= 0.70,
        "wants_pairing": pair_score >= 0.70 or (restaurant_score >= 0.72 and activity_score >= 0.72),
        "activity_types": activity_types,
        "vibes": vibes,
        "scores": scores,
    }


@app.post("/classify-image")
def classify_image(request: ImageClassifyRequest, authorization: Optional[str] = Header(default=None)):
    require_auth(authorization)
    image = decode_image(request.image_base64)
    model, processor = ensure_vision_model()
    inputs = processor(text=PHOTO_LABELS, images=image, padding="max_length", return_tensors="pt")
    with torch.inference_mode():
        outputs = model(**inputs)
    logits = outputs.logits_per_image[0]
    probabilities = torch.sigmoid(logits).cpu().tolist()
    rows = [{"label": label, "score": float(score)} for label, score in zip(PHOTO_LABELS, probabilities)]
    rows.sort(key=lambda row: row["score"], reverse=True)
    return {"model": VISION_MODEL, "results": rows}


@app.post("/image-embed")
def image_embed(request: ImageClassifyRequest, authorization: Optional[str] = Header(default=None)):
    require_auth(authorization)
    image = decode_image(request.image_base64)
    model, processor = ensure_vision_model()
    inputs = processor(images=image, return_tensors="pt")
    with torch.inference_mode():
        features = model.get_image_features(**inputs)
        features = torch.nn.functional.normalize(features, p=2, dim=-1)
    vector = features[0].cpu().float().tolist()
    return {"model": VISION_MODEL, "dimensions": len(vector), "embedding": vector}


@app.post("/translate-to-english")
def translate_to_english(request: TranslateRequest, authorization: Optional[str] = Header(default=None)):
    require_auth(authorization)
    text = clean_text(request.text)
    source_language, confidence = language_guess(text)
    if source_language == "en" or confidence < 0.80:
        return {"model": TRANSLATION_MODEL, "text": text, "translated": False, "source_language": source_language, "confidence": confidence}
    cache_key = stable_key(TRANSLATION_MODEL, source_language or "unknown", text)
    cached = translation_cache.get(cache_key)
    if cached is not None:
        return {"model": TRANSLATION_MODEL, "text": cached, "translated": cached != text, "source_language": source_language, "confidence": confidence, "cached": True}
    try:
        model, tokenizer = ensure_translation_model()
        encoded = tokenizer([text], return_tensors="pt", truncation=True, max_length=512)
        with torch.inference_mode():
            generated = model.generate(**encoded, max_new_tokens=256, num_beams=1)
        translated = tokenizer.batch_decode(generated, skip_special_tokens=True)[0].strip()
        if not translated:
            translated = text
    except Exception:
        translated = text
    translation_cache.set(cache_key, translated)
    return {"model": TRANSLATION_MODEL, "text": translated, "translated": translated != text, "source_language": source_language, "confidence": confidence, "cached": False}
