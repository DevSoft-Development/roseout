/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const shimPath = path.join(process.cwd(), ".tmp-test", "node_modules", "next", "dist", "compiled", "ws.js");
fs.mkdirSync(path.dirname(shimPath), { recursive: true });
fs.writeFileSync(
  shimPath,
  `class WebSocketShim {}\nmodule.exports = WebSocketShim;\nmodule.exports.default = WebSocketShim;\n`,
);
