#!/usr/bin/env python3
import argparse
import json
import math
import os
import random
from pathlib import Path

import torch
from sentence_transformers import CrossEncoder
from torch.utils.data import DataLoader, Dataset


class PairDataset(Dataset):
    def __init__(self, rows):
        self.examples = []
        for row in rows:
            query = str(row.get("query") or "").strip()
            positive = str(row.get("positive_document") or "").strip()
            negative = str(row.get("negative_document") or "").strip()
            weight = float(row.get("signal_weight") or 1.0)
            if not query or not positive or not negative:
                continue
            self.examples.append((query, positive, 1.0, weight))
            self.examples.append((query, negative, 0.0, weight))

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, index):
        return self.examples[index]


def load_rows(path: str):
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise ValueError("training dataset must be a JSON array")
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--base-model", default="cross-encoder/ms-marco-MiniLM-L6-v2")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(max(1, int(os.getenv("TORCH_THREADS", "4"))))

    rows = [row for row in load_rows(args.dataset) if row.get("split") == "train" and row.get("review_status", "approved") == "approved"]
    if not rows:
        raise SystemExit("no approved train examples")
    dataset = PairDataset(rows)
    if not len(dataset):
        raise SystemExit("no valid train pairs")

    model = CrossEncoder(args.base_model, num_labels=1, device="cpu", max_length=args.max_length)
    optimizer = torch.optim.AdamW(model.model.parameters(), lr=args.learning_rate)
    loss_fn = torch.nn.BCEWithLogitsLoss(reduction="none")

    def collate(batch):
        queries, documents, labels, weights = zip(*batch)
        encoded = model.tokenizer(
            list(queries),
            list(documents),
            padding=True,
            truncation=True,
            max_length=args.max_length,
            return_tensors="pt",
        )
        return encoded, torch.tensor(labels, dtype=torch.float32), torch.tensor(weights, dtype=torch.float32)

    generator = torch.Generator().manual_seed(args.seed)
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, collate_fn=collate, generator=generator)
    model.model.train()
    total_steps = max(1, args.epochs * len(loader))
    completed = 0
    running_loss = 0.0

    for epoch in range(args.epochs):
        for encoded, labels, weights in loader:
            optimizer.zero_grad(set_to_none=True)
            outputs = model.model(**encoded)
            logits = outputs.logits.reshape(-1)
            losses = loss_fn(logits, labels)
            loss = (losses * weights).sum() / weights.sum().clamp_min(1.0)
            if not torch.isfinite(loss):
                raise RuntimeError("non-finite reranker training loss")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.model.parameters(), 1.0)
            optimizer.step()
            completed += 1
            running_loss += float(loss.detach().cpu())
            if completed % 25 == 0 or completed == total_steps:
                print(json.dumps({"step": completed, "steps": total_steps, "loss": round(running_loss / completed, 6)}))

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    model.save(str(output))
    metadata = {
        "base_model": args.base_model,
        "training_examples": len(rows),
        "training_pairs": len(dataset),
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.learning_rate,
        "max_length": args.max_length,
        "seed": args.seed,
        "average_loss": running_loss / max(1, completed),
    }
    with open(output / "theouthaven-training.json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2, sort_keys=True)
    print(json.dumps({"ok": True, **metadata}))


if __name__ == "__main__":
    main()
