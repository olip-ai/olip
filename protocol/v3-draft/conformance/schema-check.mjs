// Loads the published OLIP 3.0-draft schemas (the committed files under schemas/) and checks live responses against them.
// Used by every test file (through tests/helpers.mjs) and by conformance/run.mjs.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ACTION_BY_ID } from "../reference/actions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export function loadSchemas() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true }); addFormats(ajv);
  const dir = join(root, "schemas");
  const files = [...readdirSync(dir).filter((f) => f.endsWith(".json")), ...readdirSync(join(dir, "actions")).map((f) => `actions/${f}`)];
  const byName = {};
  for (const f of files) { const s = JSON.parse(readFileSync(join(dir, f), "utf8")); ajv.addSchema(s); byName[f.replace(/\.schema\.json$|\.json$/, "")] = s.$id; }
  return { ajv, names: Object.keys(byName), get: (n) => ajv.getSchema(byName[n] ?? n) };
}
export function createResponseChecker() {
  const S = loadSchemas();
  const problems = []; let checked = 0;
  function check(actionId, status, body) {
    const name = status >= 400 ? "error" : ACTION_BY_ID[actionId]?.output;
    if (!name) return;
    const v = S.get(name); checked++;
    if (!v(body)) problems.push({ actionId, status, schema: name, errors: v.errors.slice(0, 3).map((e) => `${e.instancePath} ${e.message}`) });
  }
  return { observe: ({ actionId, status, body }) => check(actionId, status, body), check, problems, get checked() { return checked; }, schemas: S };
}
