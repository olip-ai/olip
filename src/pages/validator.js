import React, {useEffect, useMemo, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import files from '@site/src/data/spec-files.json';
import validators from '@site/src/data/validators-0.1.js';
import styles from './validator.module.css';

// Every fictional 0.1 example, bundled at build time (webpack require.context).
const EXAMPLES = (() => {
  const ctx = require.context('@site/protocol/examples', false, /\.json$/);
  return Object.fromEntries(ctx.keys().map((k) => [k, ctx(k)]));
})();

// OLIP canonical JSON (spec section 4): keys sorted by UTF-16 code unit, no whitespace, integers only.
function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('OLIP canonical JSON allows integers only');
    return String(value);
  }
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalize(v === undefined ? null : v)).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  throw new Error('Unsupported value in canonical JSON');
}
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function consentDigest(pv) {
  const fields = [...pv.shared_fields].map((f) => ({path: f.path, value: f.value}))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const obj = {
    olip_version: pv.olip_version || '0.1', recipient_id: pv.recipient?.professional_id ?? pv.recipient_id,
    casebrief_id: pv.casebrief_id, casebrief_revision: pv.casebrief_revision, purpose: pv.purpose, mode: pv.mode,
    shared_fields: fields, notice_version: pv.notice_version,
  };
  const canon = canonicalize(obj);
  return {canon, digest: 'sha256:' + (await sha256Hex(canon))};
}

// Validators are precompiled at build time (scripts/sync-spec.mjs), because the site's Content-Security-Policy
// does not allow compiling code in the browser. Examples are bundled too, so this page makes no requests.
const examples = Object.fromEntries(Object.entries(EXAMPLES).map(([k, v]) => [k.replace(/^.*\//, ''), v]));
const getValidator = (name) => validators[name.replace(/-/g, '_')];

export default function Validator() {
  const ajv = true; const error = null;
  const [schema, setSchema] = useState('casebrief');
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [digestText, setDigestText] = useState('');
  const [digestResult, setDigestResult] = useState(null);

  const loadExample = (file) => {
    const j = examples[file];
    setSchema(j.schema);
    setText(JSON.stringify(j.example, null, 2));
    setResult(null);
  };
  const loadPreviewExample = () => {
    const j = examples['08-handoff-preview.json'];
    setDigestText(JSON.stringify(j.example, null, 2));
    setDigestResult(null);
  };

  const run = () => {
    if (!ajv) return;
    let obj;
    try { obj = JSON.parse(text); } catch (e) { setResult({ok: false, parse: true, errors: [String(e.message)]}); return; }
    const v = getValidator(schema);
    const ok = v(obj);
    setResult({ok, errors: ok ? [] : v.errors.map((er) => `${er.instancePath || '(root)'} ${er.message}${er.params && er.params.allowedValues ? ': ' + er.params.allowedValues.join(', ') : ''}`)});
  };
  const runDigest = async () => {
    let pv;
    try { pv = JSON.parse(digestText); } catch (e) { setDigestResult({error: String(e.message)}); return; }
    if (!pv || !Array.isArray(pv.shared_fields)) { setDigestResult({error: 'This does not look like a handoff preview: shared_fields is missing.'}); return; }
    try {
      const {canon, digest} = await consentDigest(pv);
      setDigestResult({canon, digest, given: pv.consent_digest || null, match: pv.consent_digest ? pv.consent_digest === digest : null});
    } catch (e) { setDigestResult({error: String(e.message)}); }
  };

  const schemaOptions = useMemo(() => files.schemas.filter((s) => s.name !== 'common'), []);

  return (
    <Layout title="Schema validator" description="Validate OLIP 0.1 JSON payloads against the published JSON Schemas and compute a consent digest, entirely in your browser.">
      <main className="container margin-vert--lg">
        <h1>Schema validator</h1>
        <p>
          Check any OLIP 0.1 object against the published <Link to="/spec/downloads/#json-schemas">JSON Schemas</Link>. Everything runs in your browser: nothing you paste is sent anywhere.
          Use fictional data only.
        </p>
        {error && <div className="alert alert--danger" role="alert">Could not load the schemas: {error}</div>}

        <section aria-labelledby="validate" className={styles.panel}>
          <Heading as="h2" id="validate">Validate a payload</Heading>
          <div className={styles.controls}>
            <label htmlFor="schemaSel">Schema</label>
            <select id="schemaSel" value={schema} onChange={(e) => { setSchema(e.target.value); setResult(null); }}>
              {schemaOptions.map((s) => <option key={s.name} value={s.name}>{s.name}.json ({s.title})</option>)}
            </select>
            <label htmlFor="exampleSel">Load a fictional example</label>
            <select id="exampleSel" defaultValue="" onChange={(e) => e.target.value && loadExample(e.target.value)}>
              <option value="">Choose…</option>
              {files.examples.map((x) => <option key={x.file} value={x.file}>{x.file}</option>)}
            </select>
          </div>
          <label htmlFor="payload" className={styles.label}>JSON payload</label>
          <textarea id="payload" className={styles.area} value={text} spellCheck={false}
            onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder='{"olip_version": "0.1", ...}' />
          <button type="button" className="button button--primary" onClick={run} disabled={!ajv || !text.trim()}>
            {ajv ? 'Validate' : 'Loading schemas…'}
          </button>
          <div aria-live="polite" className={styles.result}>
            {result && result.ok && <p className={styles.ok}>Valid against {schema}.json (OLIP 0.1).</p>}
            {result && !result.ok && (
              <div className={styles.bad}>
                <p>{result.parse ? 'Not valid JSON.' : `Not valid against ${schema}.json:`}</p>
                <ul>{result.errors.map((er, i) => <li key={i}><code>{er}</code></li>)}</ul>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="consent-digest" className={styles.panel}>
          <Heading as="h2" id="consent-digest">Compute a consent digest</Heading>
          <p>
            Paste a handoff preview. The digest is <code>sha256</code> over the canonical JSON of the version, recipient, CaseBrief id and revision, purpose, mode, shared fields sorted by path, and notice version (<Link to="/docs/modules/consent-and-authorization/">how it works</Link>).
          </p>
          <button type="button" className="button button--secondary button--sm margin-bottom--sm" onClick={loadPreviewExample}>Load the fictional preview example</button>
          <label htmlFor="preview" className={styles.label}>Handoff preview JSON</label>
          <textarea id="preview" className={styles.area} value={digestText} spellCheck={false}
            onChange={(e) => { setDigestText(e.target.value); setDigestResult(null); }} />
          <button type="button" className="button button--primary" onClick={runDigest} disabled={!digestText.trim()}>Compute digest</button>
          <div aria-live="polite" className={styles.result}>
            {digestResult?.error && <p className={styles.badText}>{digestResult.error}</p>}
            {digestResult?.digest && (
              <div>
                <p>Computed: <code className={styles.wrap}>{digestResult.digest}</code></p>
                {digestResult.match === true && <p className={styles.ok}>Matches the preview's consent_digest.</p>}
                {digestResult.match === false && <p className={styles.badText}>Does not match the preview's consent_digest ({digestResult.given}). Something changed after the digest was made.</p>}
                <details><summary>Canonical JSON that was hashed</summary><pre className={styles.pre}>{digestResult.canon}</pre></details>
              </div>
            )}
          </div>
        </section>
      </main>
    </Layout>
  );
}
