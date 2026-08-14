import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const secret = process.env.WEBSITE_DEPLOY_AGENT_SECRET || "";
const host = process.env.WEBSITE_DEPLOY_AGENT_HOST || "127.0.0.1";
const port = Number(process.env.WEBSITE_DEPLOY_AGENT_PORT || 8787);
const platformDomainSuffix = (process.env.WEBSITE_PLATFORM_DOMAIN_SUFFIX || "theouthaven.com").toLowerCase().replace(/^\.+|\.+$/g, "");
const maxBodyBytes = 5 * 1024 * 1024;

if (!secret) throw new Error("WEBSITE_DEPLOY_AGENT_SECRET is required");

function safeId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
}

function safeDomain(value) {
  return value == null || (typeof value === "string" && /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value));
}

function safeArtifactPath(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("..") && !value.includes("\\");
}

function isPlatformDomain(domain) {
  const value = String(domain || "").toLowerCase();
  return value.endsWith(`.${platformDomainSuffix}`);
}

function verifySignature(timestamp, body, signature) {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed) || Math.abs(Date.now() - parsed) > 5 * 60 * 1000) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature || "")) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function deploy(payload) {
  if (!safeId(payload.websiteId) || !safeId(payload.locationId)) throw new Error("invalid_ids");
  if (!Number.isInteger(payload.version) || payload.version < 1) throw new Error("invalid_version");
  if (payload.sitePath !== `/srv/sites/${payload.locationId}`) throw new Error("invalid_site_path");
  if (!safeDomain(payload.domain)) throw new Error("invalid_domain");
  if (!Array.isArray(payload.files) || payload.files.length < 1 || payload.files.length > 50) throw new Error("invalid_files");

  const siteRoot = `/srv/sites/${payload.locationId}`;
  const releaseRoot = join(siteRoot, "releases", String(payload.version));
  await rm(releaseRoot, { recursive: true, force: true });
  await mkdir(releaseRoot, { recursive: true });

  for (const file of payload.files) {
    if (!safeArtifactPath(file.path) || file.encoding !== "utf8") throw new Error("invalid_artifact_file");
    const target = join(releaseRoot, file.path);
    if (!target.startsWith(`${releaseRoot}/`)) throw new Error("invalid_artifact_target");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, String(file.content || ""), "utf8");
  }

  const nextLink = join(siteRoot, ".current-next");
  const currentLink = join(siteRoot, "current");
  await rm(nextLink, { force: true });
  await symlink(releaseRoot, nextLink);
  await rename(nextLink, currentLink);

  if (payload.domain) {
    const caddyPath = `/etc/caddy/sites/${payload.websiteId}.caddy`;
    const hosts = isPlatformDomain(payload.domain) ? payload.domain : `${payload.domain}, www.${payload.domain}`;
    const config = `${hosts} {\n  root * ${currentLink}\n  encode zstd gzip\n  file_server\n}\n`;
    await writeFile(caddyPath, config, "utf8");
    await execFileAsync("caddy", ["validate", "--config", "/etc/caddy/Caddyfile"]);
    await execFileAsync("systemctl", ["reload", "caddy"]);
  }

  return { ok: true, version: payload.version, currentPath: currentLink };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("ok");
    }
    if (req.method !== "POST" || req.url !== "/v1/deploy") {
      res.writeHead(404).end();
      return;
    }

    const body = await readBody(req);
    const timestamp = req.headers["x-toh-timestamp"];
    const signature = req.headers["x-toh-signature"];
    if (typeof timestamp !== "string" || typeof signature !== "string" || !verifySignature(timestamp, body, signature)) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
    }

    const payload = JSON.parse(body);
    const result = await deploy(payload);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error("website deploy failed", error instanceof Error ? error.message : "unknown_error");
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "deploy_failed" }));
  }
});

server.listen(port, host, () => {
  console.log(`website deploy agent listening on ${host}:${port}`);
});
