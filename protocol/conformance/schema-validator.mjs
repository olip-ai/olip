// Validates OLIP objects against the JSON Schemas in ../schemas (0.1) and ../schemas-0.2 (0.2 additions), draft 2020-12, with Ajv.
// Names: "casebrief" means the 0.1 schema; "0.2/key-binding" means a 0.2 schema.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dirs = [join(here, "../schemas"), join(here, "../schemas-0.2")];
export async function makeValidator() {
  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const { default: addFormats } = await import("ajv-formats");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const dir of dirs) for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) ajv.addSchema(JSON.parse(readFileSync(join(dir, f), "utf8")));
  return (name, obj) => {
    const [ver, n] = name.includes("/") ? name.split("/") : ["0.1", name];
    const v = ajv.getSchema(`https://olip.ai/spec/${ver}/schemas/${n}.json`);
    if (!v) return { ok: false, errors: `no schema ${name}` };
    const ok = v(obj);
    return { ok, errors: ok ? null : ajv.errorsText(v.errors, { separator: "; " }).slice(0, 600) };
  };
}
