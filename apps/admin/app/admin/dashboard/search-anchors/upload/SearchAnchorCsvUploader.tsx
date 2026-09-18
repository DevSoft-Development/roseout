"use client";

import { ChangeEvent, DragEvent, useMemo, useState } from "react";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 1000;
const REQUIRED_COLUMNS = [
  "canonical_name",
  "anchor_type",
  "default_radius_miles",
  "max_radius_miles",
  "radius_strategy",
] as const;

const HEADER_ALIASES: Record<string, string> = {
  lat: "latitude",
  latitude_deg: "latitude",
  lng: "longitude",
  lon: "longitude",
  long: "longitude",
  longitude_deg: "longitude",
  name: "canonical_name",
  type: "anchor_type",
  radius: "default_radius_miles",
  max_radius: "max_radius_miles",
  strategy: "radius_strategy",
};

type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

type ApiResult = {
  success: boolean;
  error?: string;
  validated?: number;
  imported?: number;
  enriched?: number;
  attemptedEnrichment?: boolean;
  errors?: Array<{ line: number; message: string }>;
  warnings?: Array<{ line: number; message: string }>;
};

function normalizeHeader(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[normalized] ?? normalized;
}

function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === "," && !quoted) {
      record.push(field.trim());
      field = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      record.push(field.trim());
      field = "";
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      continue;
    }
    field += character;
  }

  record.push(field.trim());
  if (record.some((value) => value.length > 0)) records.push(record);

  const [headers = [], ...rows] = records;
  return { headers: headers.map(normalizeHeader), rows };
}

export default function SearchAnchorCsvUploader() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  const missingColumns = useMemo(
    () => REQUIRED_COLUMNS.filter((column) => !headers.includes(column)),
    [headers],
  );
  const duplicateHeaders = useMemo(
    () => headers.filter((header, index) => headers.indexOf(header) !== index),
    [headers],
  );
  const latitudeIndex = headers.indexOf("latitude");
  const longitudeIndex = headers.indexOf("longitude");
  const hasCoordinateHeaders = latitudeIndex >= 0 && longitudeIndex >= 0;
  const hasCompleteCoordinates = hasCoordinateHeaders && rows.every((row) => {
    const latitudeText = row[latitudeIndex]?.trim();
    const longitudeText = row[longitudeIndex]?.trim();
    if (!latitudeText || !longitudeText) return false;
    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  });
  const needsEnrichment = !hasCompleteCoordinates;
  const validationReady = Boolean(selectedFile) && rows.length > 0 && missingColumns.length === 0 && duplicateHeaders.length === 0 && !error;

  async function loadFile(file?: File) {
    setError("");
    setHeaders([]);
    setRows([]);
    setSelectedFile(null);
    setResult(null);

    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a CSV file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("The CSV exceeds the 2 MB upload limit.");
      return;
    }

    try {
      const parsed = parseCsv(await file.text());
      if (!parsed.headers.length) {
        setError("The CSV does not contain a header row.");
        return;
      }
      if (parsed.rows.length > MAX_ROWS) {
        setError(`The CSV contains ${parsed.rows.length.toLocaleString()} rows. The limit is ${MAX_ROWS.toLocaleString()}.`);
        return;
      }
      setSelectedFile(file);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
    } catch {
      setError("The CSV could not be read. Confirm that it is a valid UTF-8 CSV file.");
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    void loadFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void loadFile(event.dataTransfer.files?.[0]);
  }

  async function submit(mode: "validate" | "import", enrichMissing: boolean) {
    if (!selectedFile || !validationReady) return;
    setIsSubmitting(true);
    setResult(null);
    setError("");

    try {
      const formData = new FormData();
      formData.set("file", selectedFile);
      formData.set("mode", mode);
      formData.set("enrichMissing", String(enrichMissing));

      const response = await fetch("/api/admin/search-anchors/import", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ApiResult;
      setResult(payload);
      if (!response.ok && payload.error) setError(payload.error);
    } catch {
      setError("The upload request failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div
        className={`rounded-2xl border border-dashed p-8 text-center transition ${isDragging ? "border-red-500 bg-red-950/20" : "border-zinc-700 bg-black"}`}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <p className="font-semibold text-white">Drop an anchor CSV here</p>
        <p className="mt-2 text-sm text-zinc-500">CSV only · 2 MB maximum · 1,000 data rows maximum</p>
        <label className="mt-5 inline-flex cursor-pointer rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-600">
          Choose CSV
          <input className="sr-only" type="file" accept=".csv,text/csv" onChange={handleChange} />
        </label>
      </div>

      {error && <div className="rounded-xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div>}

      {selectedFile && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-zinc-800 bg-black p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">File</p><p className="mt-2 truncate text-sm font-medium text-white">{selectedFile.name}</p></article>
            <article className="rounded-xl border border-zinc-800 bg-black p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">Rows</p><p className="mt-2 text-xl font-semibold text-white">{rows.length.toLocaleString()}</p></article>
            <article className="rounded-xl border border-zinc-800 bg-black p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">Coordinates</p><p className={`mt-2 text-sm font-semibold ${hasCompleteCoordinates ? "text-emerald-300" : "text-amber-300"}`}>{hasCompleteCoordinates ? "Complete" : hasCoordinateHeaders ? "Blank or incomplete — Google enrichment required" : "Google enrichment required"}</p></article>
          </div>

          {missingColumns.length > 0 && <div className="rounded-xl border border-amber-800 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">Missing required columns: {missingColumns.join(", ")}</div>}
          {duplicateHeaders.length > 0 && <div className="rounded-xl border border-amber-800 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">Duplicate mapped columns: {[...new Set(duplicateHeaders)].join(", ")}</div>}

          <div className="flex flex-wrap gap-3">
            <button disabled={!validationReady || isSubmitting} onClick={() => void submit("validate", needsEnrichment)} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "Working..." : "Validate CSV"}</button>
            <button disabled={!validationReady || isSubmitting} onClick={() => void submit("import", needsEnrichment)} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "Working..." : needsEnrichment ? "Enrich & Import" : "Import CSV"}</button>
          </div>

          {result && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${result.success ? "border-emerald-900 bg-emerald-950/20 text-emerald-200" : "border-amber-900 bg-amber-950/20 text-amber-200"}`}>
              <p className="font-semibold">
                {result.imported
                  ? `Imported ${result.imported.toLocaleString()} anchors.`
                  : `Validated ${(result.validated ?? 0).toLocaleString()} rows.`}
              </p>
              {result.attemptedEnrichment && (
                <p className="mt-1">Google enriched {(result.enriched ?? 0).toLocaleString()} of {(result.validated ?? rows.length).toLocaleString()} rows.</p>
              )}
              {!result.success && <p className="mt-1">{result.error || `${result.errors?.length ?? 0} rows need attention before import.`}</p>}
              {result.errors?.slice(0, 10).map((item) => <p key={`${item.line}-${item.message}`} className="mt-1">Line {item.line}: {item.message}</p>)}
              {result.warnings?.slice(0, 10).map((item) => <p key={`${item.line}-${item.message}`} className="mt-1">Warning line {item.line}: {item.message}</p>)}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-zinc-800"><div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-zinc-900 text-zinc-400"><tr>{headers.map((header, index) => <th key={`${header}-${index}`} className="whitespace-nowrap px-3 py-2 font-medium">{header}</th>)}</tr></thead><tbody>{rows.slice(0, 5).map((row, rowIndex) => <tr key={`${rowIndex}-${row.join("|")}`} className="border-t border-zinc-900 text-zinc-300">{headers.map((header, columnIndex) => <td key={`${header}-${columnIndex}`} className="max-w-64 truncate px-3 py-2">{row[columnIndex] ?? ""}</td>)}</tr>)}</tbody></table></div></div>
          <p className="text-xs text-zinc-500">Files with missing or invalid latitude and longitude values can be enriched through Google Places during validation and import. Imported anchors remain pending review.</p>
        </div>
      )}
    </section>
  );
}
