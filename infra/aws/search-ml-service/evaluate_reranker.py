#!/usr/bin/env python3
import argparse
import json
import math
from pathlib import Path

from sentence_transformers import CrossEncoder


def load_rows(path: str, split: str):
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return [
        row for row in payload
        if row.get("split") == split
        and row.get("review_status", "approved") == "approved"
        and str(row.get("query") or "").strip()
        and str(row.get("positive_document") or "").strip()
        and str(row.get("negative_document") or "").strip()
    ]


def metrics(model: CrossEncoder, rows, batch_size: int):
    pairs = []
    for row in rows:
        query = str(row["query"])
        pairs.append((query, str(row["positive_document"])))
        pairs.append((query, str(row["negative_document"])))
    scores = model.predict(pairs, batch_size=batch_size, show_progress_bar=False)
    top1 = 0.0
    mrr = 0.0
    ndcg = 0.0
    margin = 0.0
    for index, row in enumerate(rows):
        positive = float(scores[index * 2])
        negative = float(scores[index * 2 + 1])
        rank = 1 if positive >= negative else 2
        top1 += 1.0 if rank == 1 else 0.0
        mrr += 1.0 / rank
        ndcg += 1.0 / math.log2(rank + 1)
        margin += positive - negative
    count = max(1, len(rows))
    return {
        "examples": len(rows),
        "top1": top1 / count,
        "mrr": mrr / count,
        "ndcg_at_2": ndcg / count,
        "mean_margin": margin / count,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--base-model", default="cross-encoder/ms-marco-MiniLM-L6-v2")
    parser.add_argument("--split", default="validation")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--output", required=True)
    parser.add_argument("--min-ndcg-lift", type=float, default=0.005)
    args = parser.parse_args()

    rows = load_rows(args.dataset, args.split)
    if not rows:
        raise SystemExit(f"no approved {args.split} examples")

    baseline = CrossEncoder(args.base_model, device="cpu")
    candidate = CrossEncoder(args.candidate, device="cpu")
    baseline_metrics = metrics(baseline, rows, args.batch_size)
    candidate_metrics = metrics(candidate, rows, args.batch_size)
    ndcg_lift = candidate_metrics["ndcg_at_2"] - baseline_metrics["ndcg_at_2"]
    mrr_lift = candidate_metrics["mrr"] - baseline_metrics["mrr"]
    top1_lift = candidate_metrics["top1"] - baseline_metrics["top1"]
    promote = (
        candidate_metrics["top1"] >= baseline_metrics["top1"]
        and candidate_metrics["mrr"] >= baseline_metrics["mrr"]
        and ndcg_lift >= args.min_ndcg_lift
    )
    result = {
        "promote": promote,
        "split": args.split,
        "baseline": baseline_metrics,
        "candidate": candidate_metrics,
        "lift": {"top1": top1_lift, "mrr": mrr_lift, "ndcg_at_2": ndcg_lift},
        "thresholds": {"min_ndcg_lift": args.min_ndcg_lift, "no_top1_regression": True, "no_mrr_regression": True},
    }
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2, sort_keys=True)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
