#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

function env(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function exec(command, args = []) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function serviceState(unit, missing = "unknown") {
  const output = exec("systemctl", ["is-active", unit]);
  if (["active", "inactive", "failed"].includes(output)) return output;
  return output || missing;
}

function metric(command, args) {
  const value = Number(exec(command, args));
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

const nodeName = env("WEBSITE_NODE_NAME");
const endpoint = env("WEBSITE_NODE_HEARTBEAT_URL");
const secret = env("WEBSITE_NODE_HEARTBEAT_SECRET");
const certPath = process.env.WEBSITE_NODE_TLS_CERT?.trim() || "/etc/caddy/certs/theouthaven-fullchain.pem";

const cpuPercent = metric("sh", ["-lc", "LC_ALL=C top -bn2 -d0.2 | awk '/Cpu\\(s\\)/{idle=$8} END{printf \"%.1f\", 100-idle}'"]);
const memoryPercent = metric("sh", ["-lc", "free | awk '/Mem:/{printf \"%.1f\", ($3/$2)*100}'"]);
const diskPercent = metric("sh", ["-lc", "df -P / | awk 'NR==2{gsub(/%/,\"\",$5); print $5}'"]);

let tlsStatus = "missing";
let tlsWildcard = false;
let tlsCertSubject = "";
let tlsCertExpiresAt = null;
let certLastRenewedAt = null;
const checkedAt = new Date().toISOString();

try {
  const subject = exec("openssl", ["x509", "-in", certPath, "-noout", "-subject"]);
  const enddate = exec("openssl", ["x509", "-in", certPath, "-noout", "-enddate"]);
  const sans = exec("openssl", ["x509", "-in", certPath, "-noout", "-ext", "subjectAltName"]);
  const rawExpiry = enddate.replace(/^notAfter=/, "").trim();
  const expiry = new Date(rawExpiry);
  const remainingMs = expiry.getTime() - Date.now();

  tlsCertSubject = subject.replace(/^subject=/, "").trim();
  tlsWildcard = sans.includes("DNS:*.theouthaven.com");
  if (Number.isFinite(expiry.getTime())) {
    tlsCertExpiresAt = expiry.toISOString();
    tlsStatus = remainingMs <= 0 ? "expired" : remainingMs <= 30 * 86400000 ? "expiring" : "healthy";
  } else {
    tlsStatus = "invalid";
  }

  certLastRenewedAt = statSync(certPath).mtime.toISOString();
  readFileSync(certPath);
} catch {
  tlsStatus = "missing";
}

const payload = {
  name: nodeName,
  cpuPercent,
  memoryPercent,
  diskPercent,
  caddyStatus: serviceState("caddy.service"),
  certbotTimerStatus: serviceState("certbot.timer", "missing"),
  tlsStatus,
  tlsWildcard,
  tlsCertSubject,
  tlsCertExpiresAt,
  tlsLastCheckedAt: checkedAt,
  certLastRenewedAt,
};

const body = JSON.stringify(payload);
const timestamp = String(Date.now());
const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-toh-timestamp": timestamp,
    "x-toh-signature": signature,
  },
  body,
});

if (!response.ok) {
  const message = await response.text();
  throw new Error(`Heartbeat failed (${response.status}): ${message}`);
}

console.log(await response.text());
