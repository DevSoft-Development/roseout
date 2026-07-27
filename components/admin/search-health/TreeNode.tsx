"use client";
import { useMemo, useState } from "react";
import {
  copyText,
  formatUnknown,
  isRecord,
  redactSensitive,
} from "@/lib/admin/search-explorer";
export default function TreeNode({
  name,
  value,
  path,
  depth = 0,
  expandSignal = 0,
  collapseSignal = 0,
  search = "",
}: {
  name: string;
  value: unknown;
  path: string;
  depth?: number;
  expandSignal?: number;
  collapseSignal?: number;
  search?: string;
}) {
  const complex = Array.isArray(value) || isRecord(value);
  const [manual, setManual] = useState<boolean | null>(null);
  const expanded =
    collapseSignal > expandSignal
      ? false
      : expandSignal > 0
        ? true
        : (manual ?? depth < 1);
  const children = useMemo(
    () =>
      Array.isArray(value)
        ? value.map((v, i) => [String(i), v] as const)
        : isRecord(value)
          ? Object.entries(value)
          : [],
    [value],
  );
  const match =
    !search ||
    `${path} ${formatUnknown(value)}`
      .toLowerCase()
      .includes(search.toLowerCase());
  if (
    search &&
    !match &&
    !children.some(([k, v]) =>
      `${k} ${formatUnknown(v)}`.toLowerCase().includes(search.toLowerCase()),
    )
  )
    return null;
  return (
    <div className="font-mono text-xs" style={{ paddingLeft: depth ? 12 : 0 }}>
      {complex ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setManual(!expanded)}
          className="flex w-full items-center gap-2 rounded py-1.5 text-left focus-visible:outline-2 focus-visible:outline-rose-400 hover:bg-white/5"
        >
          <span className="text-rose-300">{expanded ? "▾" : "▸"}</span>
          <strong
            className={match && search ? "bg-amber-400/25" : "text-sky-200"}
          >
            {name}
          </strong>
          <span className="text-white/30">
            {Array.isArray(value)
              ? `[${children.length}]`
              : `{${children.length}}`}
          </span>
        </button>
      ) : (
        <div
          className={`group flex items-start gap-2 rounded py-1.5 ${match && search ? "bg-amber-400/15" : ""}`}
        >
          <span className="text-sky-200">{name}:</span>
          <span className="break-all text-white/65">
            {value === null ? "null" : formatUnknown(value)}
          </span>
        </div>
      )}
      {expanded && complex ? (
        <div className="border-l border-white/8">
          {children.map(([key, child]) => (
            <TreeNode
              key={key}
              name={Array.isArray(value) ? `[${key}]` : key}
              value={child}
              path={Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`}
              depth={depth + 1}
              expandSignal={expandSignal}
              collapseSignal={collapseSignal}
              search={search}
            />
          ))}
        </div>
      ) : null}
      <div className="mb-1 flex gap-2 pl-5 text-[10px] text-white/25">
        <button
          onClick={() => void copyText(name)}
          aria-label={`Copy key ${name}`}
          className="hover:text-white"
        >
          key
        </button>
        <button
          onClick={() => void copyText(path)}
          aria-label={`Copy path ${path}`}
          className="hover:text-white"
        >
          path
        </button>
        <button
          onClick={() =>
            void copyText(
              typeof value === "string"
                ? value
                : JSON.stringify(redactSensitive(value), null, 2),
            )
          }
          aria-label={`Copy value ${path}`}
          className="hover:text-white"
        >
          {complex ? "subtree" : "value"}
        </button>
      </div>
    </div>
  );
}
