/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const net = require("node:net");

const publicPort = Number(process.env.PORT || 3000);
const publicHost = process.env.HOSTNAME || "0.0.0.0";
const internalPort = Number(process.env.NEXT_INTERNAL_PORT || 3001);
const internalHost = "127.0.0.1";

process.env.PORT = String(internalPort);
process.env.HOSTNAME = internalHost;

require("./apps/consumer/server.js");

function checkUpstreamReady() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: internalHost, port: internalPort });
    const finish = (ready) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function handleHealth(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, {
      allow: "GET",
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  if (!(await checkUpstreamReady())) {
    const body = Buffer.from(JSON.stringify({ ok: false, reason: "consumer_not_ready" }));
    res.writeHead(503, {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(body.length),
      "cache-control": "no-store, max-age=0",
      connection: "close",
    });
    res.end(body);
    return;
  }

  const payload = {
    ok: true,
    service: "theouthaven-consumer",
    runtime: "azure-container-apps",
    provider: process.env.PLATFORM_RUNTIME_PROVIDER || "azure-consumer",
    regionRole: process.env.PLATFORM_RUNTIME_REGION_ROLE || "primary",
    revision: process.env.PLATFORM_RUNTIME_GIT_SHA || "",
  };
  const body = Buffer.from(JSON.stringify(payload));

  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.length),
    "cache-control": "no-store, max-age=0",
    connection: "close",
    "x-theouthaven-health-revision": payload.revision,
    "x-theouthaven-region-role": payload.regionRole,
  });
  res.end(body);
}

function proxyRequest(req, res) {
  const upstream = http.request(
    {
      host: internalHost,
      port: internalPort,
      method: req.method,
      path: req.url,
      headers: req.headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    if (!res.headersSent) {
      res.writeHead(503, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, max-age=0",
      });
    }
    res.end(JSON.stringify({ error: "consumer_upstream_unavailable", message: error.code || "unknown" }));
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url || "/", "http://localhost").pathname;
  if (path === "/api/health/azure/probe") {
    if (req.method !== "HEAD" && req.method !== "GET") {
      res.writeHead(405, { allow: "GET, HEAD", "content-length": "0", connection: "close" });
      res.end();
      return;
    }
    void checkUpstreamReady().then((ready) => {
      res.writeHead(ready ? 200 : 503, {
        "cache-control": "no-store, max-age=0",
        "content-length": "0",
        connection: "close",
      });
      res.end();
    });
    return;
  }

  if (path === "/api/health/azure") {
    void handleHealth(req, res);
    return;
  }
  proxyRequest(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const upstream = http.request({
    host: internalHost,
    port: internalPort,
    method: req.method,
    path: req.url,
    headers: req.headers,
  });

  upstream.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        Object.entries(upstreamRes.headers)
          .map(([name, value]) => `${name}: ${value}\r\n`)
          .join("") +
        "\r\n",
    );
    if (head.length) upstreamSocket.write(head);
    if (upstreamHead.length) socket.write(upstreamHead);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });

  upstream.on("error", () => socket.destroy());
  upstream.end();
});

server.listen(publicPort, publicHost, () => {
  console.log(`Azure consumer front server listening on http://${publicHost}:${publicPort}; Next.js on http://${internalHost}:${internalPort}`);
});
