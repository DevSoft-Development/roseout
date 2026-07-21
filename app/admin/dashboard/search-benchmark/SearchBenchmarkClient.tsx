"use client";

import { useEffect, useMemo, useState } from "react";

type BenchmarkData = {
  queries: Array<any>;
  labels: Array<any>;
  candidates: Array<any>;
  latest_run: any;
  scorecards: Array<any>;
};

const VIOLATIONS = [
  "wrong_domain",
  "wrong_market",
  "too_far",
  "closed_or_unavailable",
  "bad_pair",
  "duplicate",
  "unsafe_or_unpublishable",
];

export default function SearchBenchmarkClient() {
  const [data, setData] = useState<Benchmark