import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const endpoint = process.env.WEBSITE_NODE_HEARTBEAT_URL?.trim();
const secret = process.env.WEBSITE_NODE_HEARTBEAT_SECRET?.trim();
const nodeName = process.env.WEBSITE_NODE_NAME?.trim();

if (!endpoint || !secret || !nodeName) {
  throw new Error("WEBSITE_NODE_HEARTBEAT_URL, WEBSITE_NODE_HEARTBEAT_SECRET and WEBSITE_NODE_NAME are required");
}

async function cpuPercent() {
  const first = (await readFile("/proc/stat", "utf8")).split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const second = (await readFile("/proc/stat", "utf8")).split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
  const total1 = first.reduce((sum, value) => sum + value, 0);
  const total2 = second.reduce((sum, value) => sum + value, 0);
  const idle1 = (first[3] || 0) + (first[4] || 0);
  const idle2 = (second[3] || 0) + (second[4] || 0);
  const totalDelta = total2 - total1;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, ((totalDelta - (idle2 - idle1)) / totalDelta) * 100));
}

async function memoryPercent() {
  const text = await readFile("/proc/meminfo", "utf8");
  const values = Object.fromEntries(text.split("\n").filter(Boolean).map((line) => {
    const [key, rest] = line.split(":");
    return [key, Number(rest.trim().split(/\s+/)[0])];
  }));
  const total = values.MemTotal || 0;
  const available = values.MemAvailable || 0;
  if (!total) return 0;
  return Math.max(0, Math.min(100, ((total - available) / total) * 100));
}

async function diskPercent() {
  const { stdout } = await execFileAsync("df", ["-P", "/srv/sites"]);
  const line = stdout.trim().split("\n").at(-1) || "";
  const match = line.match(/(\d+)%\s+\/?.*$/);
  if (!match) throw new Error("disk_metric_unavailable");
  return Number(match[1]);
}

const payload = {
  name: nodeName,
  cpuPercent: Number((await cpuPercent()).toFixed(2)),
  memoryPercent: Number((await memoryPercent()).toFixed(2)),
  diskPercent: Number((await diskPercent()).toFixed(2)),
};

const body = JSON.stringify(payload);
const timestamp = Date.now().toString();
const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-toh-timestamp": timestamp,
    "x-toh-signature": signature,
  },
  body,
  signal: AbortSignal.timeout(10_000),
});

if (!response.ok) {
  const text = await response.text().catch(() => "");
  throw new Error(`heartbeat_failed:${response.status}:${text.slice(0, 200)}`);
}

const result = await response.json();
console.log(JSON.stringify({ ok: true, status: result.status, metrics: payload }));
