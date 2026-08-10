#!/usr/bin/env node
// Bundle src → bin/vault-mcp.cjs: a single self-contained CommonJS file with all
// deps (gray-matter, zod, MCP SDK) inlined. node:sqlite/node:* stay external
// (built-in). The bundle is COMMITTED so the air-gapped target needs no npm.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await build({
  entryPoints: [path.join(root, "src/index.ts")],
  outfile: path.join(root, "bin/vault-mcp.mjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",              // Node 24 ESM; supports top-level await
  external: ["node:*"],       // built-ins (incl. node:sqlite) resolve at runtime
  // esbuild preserves the entry's shebang; only inject the CJS-interop shim ESM needs
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
console.error("bundled → bin/vault-mcp.mjs");
