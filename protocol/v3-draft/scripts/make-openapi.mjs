// Writes openapi/olip-v3-draft.json (OpenAPI 3.1) from the route table, action catalog and schemas.
// Run: node scripts/make-openapi.mjs   (tests/contract.test.mjs fails if the committed file drifts)
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildOpenApi } from "../reference/openapi.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(join(root, "openapi"), { recursive: true });
  writeFileSync(join(root, "openapi", "olip-v3-draft.json"), JSON.stringify(buildOpenApi(), null, 2) + "\n");
  console.log("wrote openapi/olip-v3-draft.json");
}
