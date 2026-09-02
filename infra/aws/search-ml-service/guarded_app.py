import asyncio
import os

from fastapi import Request
from fastapi.responses import JSONResponse

from app import app

ML_INFERENCE_CONCURRENCY = max(1, min(16, int(os.getenv("ML_INFERENCE_CONCURRENCY", "4"))))
ML_INFERENCE_QUEUE_TIMEOUT_MS = max(
    50,
    min(5_000, int(os.getenv("ML_INFERENCE_QUEUE_TIMEOUT_MS", "750"))),
)
ML_INFERENCE_QUEUE_TIMEOUT_SECONDS = ML_INFERENCE_QUEUE_TIMEOUT_MS / 1_000.0

ML_PATHS = {
    "/embed",
    "/rerank",
    "/classify-text",
    "/classify-intent",
    "/classify-image",
    "/image-embed",
    "/translate-to-english",
}

inference_gate = asyncio.Semaphore(ML_INFERENCE_CONCURRENCY)
active_requests = 0
waiting_requests = 0
rejected_requests = 0
peak_active_requests = 0


@app.middleware("http")
async def limit_ml_inference_concurrency(request: Request, call_next):
    global active_requests, waiting_requests, rejected_requests, peak_active_requests

    if request.url.path not in ML_PATHS:
        return await call_next(request)

    waiting_requests += 1
    try:
        await asyncio.wait_for(
            inference_gate.acquire(),
            timeout=ML_INFERENCE_QUEUE_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        rejected_requests += 1
        return JSONResponse(
            status_code=429,
            headers={"Retry-After": "1"},
            content={
                "detail": "search_ml_busy",
                "retryable": True,
                "retry_after_seconds": 1,
            },
        )
    finally:
        waiting_requests = max(0, waiting_requests - 1)

    active_requests += 1
    peak_active_requests = max(peak_active_requests, active_requests)
    try:
        return await call_next(request)
    finally:
        active_requests = max(0, active_requests - 1)
        inference_gate.release()


@app.get("/runtime/concurrency")
def concurrency_status():
    return {
        "ok": True,
        "max_concurrent_inference_requests": ML_INFERENCE_CONCURRENCY,
        "queue_timeout_ms": ML_INFERENCE_QUEUE_TIMEOUT_MS,
        "active": active_requests,
        "waiting": waiting_requests,
        "rejected": rejected_requests,
        "peak_active": peak_active_requests,
    }
