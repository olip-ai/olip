// /try/: "Try OLIP", a browser-only guided simulation of one OLIP 0.1 handoff.
// FICTIONAL SIMULATION. NO REAL LAWYER IS CONTACTED. Nothing leaves this page: no network requests,
// no storage, no cookies. All data comes from the published fictional examples bundled at build time.
import React, {useEffect, useMemo, useRef, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import statusMachine from '@site/protocol/spec/status-machine.json';
import discoveryEx from '@site/protocol/examples/02-discovery-plain-english.json';
import noMatchEx from '@site/protocol/examples/03-discovery-no-match.json';
import identityEx from '@site/protocol/examples/04-identity-verified.json';
import casebriefEx from '@site/protocol/examples/07-casebrief.json';
import previewEx from '@site/protocol/examples/08-handoff-preview.json';
import cardEx from '@site/protocol/examples-0.2/24-intake-capability-card.json';
import {createSimulation, FIELD_CATALOG, SIM_LABEL} from '../try/engine.mjs';
import styles from './try.module.css';

const SPEC = '/spec/0.1/';
const STEPS = [
  {key: 'discover', title: 'Discover', clause: '#51-professional-identity-and-licensing-evidence-professional-identityjson', sec: '5.1'},
  {key: 'evidence', title: 'Check evidence', clause: '#52-intake-policy-and-eligibility-intake-policyjson', sec: '5.1 and 5.2'},
  {key: 'casebrief', title: 'CaseBrief', clause: '#53-casebrief-casebriefjson', sec: '5.3'},
  {key: 'recipient', title: 'One recipient', clause: '#54-consent-and-authorization-handoff-previewjson-authorizationjson', sec: '5.4'},
  {key: 'fields', title: 'Choose fields', clause: '#54-consent-and-authorization-handoff-previewjson-authorizationjson', sec: '5.4'},
  {key: 'approve', title: 'Person approves', clause: '#54-consent-and-authorization-handoff-previewjson-authorizationjson', sec: '5.4'},
  {key: 'handoff', title: 'Handoff', clause: '#55-secure-transfer-handoffjson-receiptjson', sec: '5.5'},
  {key: 'status', title: 'Status and receipt', clause: '#56-outcome-status-status-machinejson-status-eventjson', sec: '5.6'},
  {key: 'cancel', title: 'Withdraw', clause: '#55-secure-transfer-handoffjson-receiptjson', sec: '5.5'},
];
const DEFAULT_FIELDS = ['summary', 'client.name', 'client.email', 'location.jurisdiction', 'matter.code', 'key_dates'];
const STATE_ORDER = ['draft', 'approved', 'recorded', 'queued', 'sent', 'delivered', 'acknowledged', 'responded'];

function newSim() {
  return createSimulation({statusMachine, discovery: discoveryEx.example, noMatch: noMatchEx.example,
    casebrief: casebriefEx.example, notices: previewEx.example.notices});
}

function Banner() {
  return <p className={styles.banner} role="note"><strong>{SIM_LABEL}</strong> Every person, firm and license here is made up. Nothing you do on this page leaves your browser.</p>;
}

function Json({title, value, schema}) {
  return (
    <details className={styles.json}>
      <summary>{title}{schema ? <> · <span className={styles.muted}>shape of <a href={`/spec/0.1/schemas/${schema}.json`}>{schema}.json</a></span></> : null}</summary>
      <pre tabIndex={0}>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function Outcome({r}) {
  if (!r) return null;
  if (r.ok === false) {
    return (
      <div className={styles.err} role="alert">
        <p><strong>Refused: <code>{r.error.code}</code></strong></p>
        <p>{r.error.message}</p>
        <Json title="OLIP error response" value={r.document} schema="error" />
      </div>
    );
  }
  return null;
}

function Timeline({handoff}) {
  if (!handoff) return null;
  const reached = new Set(handoff.events.map((e) => e.to_state).concat('draft'));
  const terminalBad = ['failed', 'cancelled'].includes(handoff.state);
  return (
    <ol className={styles.timeline} aria-label="Handoff status so far">
      {STATE_ORDER.map((st) => (
        <li key={st} className={reached.has(st) ? styles.reached : styles.notReached} aria-current={handoff.state === st ? 'step' : undefined}>
          <code>{st}</code>
          <span className={styles.meaning}>{statusMachine.states[st].meaning}</span>
        </li>
      ))}
      {terminalBad ? (
        <li className={styles.badState} aria-current="step"><code>{handoff.state}</code><span className={styles.meaning}>{statusMachine.states[handoff.state].meaning}</span></li>
      ) : null}
    </ol>
  );
}

export default function Try() {
  const [sim, setSim] = useState(newSim);
  const [step, setStep] = useState(0);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [announce, setAnnounce] = useState('');
  const [result, setResult] = useState(null);
  const [query, setQuery] = useState({jurisdiction: '', matter: 'housing.landlord_tenant'});
  const [discovery, setDiscovery] = useState(null);
  const [recipient, setRecipient] = useState(null);
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [summary, setSummary] = useState(casebriefEx.example.summary);
  const [verify, setVerify] = useState(null);
  const [forged, setForged] = useState(null);
  const [cancelInfo, setCancelInfo] = useState(null);
  const [cryptoNote, setCryptoNote] = useState(null);
  const headingRef = useRef(null);
  const s = sim.state;

  // Move focus to the step heading when the step changes (not on first load, so the page opens at the top banner).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (headingRef.current) headingRef.current.focus();
  }, [step]);

  const say = (text) => setAnnounce(text);
  const reset = () => {
    setSim(newSim()); setStep(0); setResult(null); setDiscovery(null); setRecipient(null); setFields(DEFAULT_FIELDS);
    setSummary(casebriefEx.example.summary); setVerify(null); setForged(null); setCancelInfo(null); setCryptoNote(null);
    say('Simulation reset. Back at step 1.');
  };
  const go = (n) => { setResult(null); setStep(n); say(`Step ${n + 1} of ${STEPS.length}: ${STEPS[n].title}.`); };
  const run = async (fn, okText) => {
    const r = await fn();
    setResult(r && r.ok === false ? r : null);
    say(r && r.ok === false ? `Refused with ${r.error.code}. ${r.error.message}` : okText || 'Done.');
    rerender();
    return r;
  };

  const candidates = discovery?.results || [];
  const chosen = s.candidates.find((c) => c.id === recipient);
  const handoff = s.handoff;

  const canNext = useMemo(() => ({
    0: !!discovery && candidates.length > 0,
    1: true,
    2: true,
    3: !!recipient,
    4: !!s.preview,
    5: !!s.authorization,
    6: !!handoff,
    7: true,
    8: false,
  }), [discovery, candidates.length, recipient, s.preview, s.authorization, handoff]);

  const current = STEPS[step];

  return (
    <Layout title="Try OLIP: a fictional simulation" description="A browser-only guided simulation of one OLIP handoff with fictional data. No account, no network requests, no real lawyer contacted.">
      <main className={`container margin-vert--lg ${styles.wrap}`}>
        <Banner />
        <h1>Try OLIP</h1>
        <p className={styles.lead}>
          Walk through one OLIP handoff in about two minutes (a target; it has not been timed with outside users). You play the person and see what the AI agent, the host and the fictional firm may and may not do.
          It follows the <Link to={SPEC}>OLIP 0.1 draft</Link> and its published <Link to="/spec/status-machine/">status machine</Link>. For real code, use the <Link to="/docs/quickstart/">quickstart</Link>.
        </p>

        <nav aria-label="Simulation steps">
          <ol className={styles.stepper}>
            {STEPS.map((st, i) => (
              <li key={st.key} className={i === step ? styles.stepOn : i < step ? styles.stepDone : ''} aria-current={i === step ? 'step' : undefined}>
                <span className={styles.stepNum}>{i + 1}</span> {st.title}
              </li>
            ))}
          </ol>
        </nav>

        <div aria-live="polite" role="status" className={styles.live}>{announce}</div>

        <section className={styles.panel} aria-labelledby="stepTitle">
          <h2 id="stepTitle" tabIndex={-1} ref={headingRef}>Step {step + 1}. {current.title}</h2>

          {step === 0 && (
            <>
              <p>An AI agent asks an OLIP endpoint who is listed for a problem and place. Pick a state and search the fictional listing.</p>
              <div className={styles.row}>
                <label htmlFor="jur">State</label>
                <select id="jur" value={query.jurisdiction} onChange={(e) => setQuery({...query, jurisdiction: e.target.value})}>
                  <option value="">Any state</option>
                  <option value="US-CA">California (fictional listings)</option>
                  <option value="US-NY">New York (fictional listings)</option>
                  <option value="US-WY">Wyoming (shows the no-match path)</option>
                </select>
                <button type="button" className="button button--primary" onClick={() => run(async () => { const d = sim.discover(query); setDiscovery(d); setRecipient(null); return d; },
                  'Search done.')}>Search</button>
              </div>
              {discovery && candidates.length === 0 && (
                <div className={styles.note}>
                  <p><strong>No match.</strong> {discovery.no_match.message} OLIP never fills an empty result with someone who does not fit.</p>
                  <ul>{discovery.legal_aid_options.map((o) => <li key={o.name}>{o.name} ({o.cost}). Link shown in a real result: <code>{o.url}</code></li>)}</ul>
                  <p>Choose another state to continue.</p>
                </div>
              )}
              {candidates.length > 0 && (
                <>
                  <p className={styles.muted}>{discovery.ordering.disclosure} (<code>paid_influence: {String(discovery.ordering.paid_influence)}</code>)</p>
                  <ul className={styles.cards}>
                    {candidates.map((c) => (
                      <li key={c.id} className={styles.card}>
                        <strong>{c.display_name}</strong><br />{c.firm.name}<br />
                        <span className={styles.muted}>License {c.licenses.map((l) => `${l.license_id} (${l.jurisdiction})`).join(', ')} · intake endpoint: {c.intake_endpoint_status}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {discovery ? <Json title="Discovery response" value={discovery} schema="discovery-response" /> : null}
            </>
          )}

          {step === 1 && (
            <>
              <p>Before anyone is contacted, the agent can read how each fact is known. OLIP keeps an official-source check, a firm's own statement and an index entry apart, each with a source and a date. A license record check is not an endorsement and says nothing about competence.</p>
              <ul>
                {(identityEx.example.professional?.licenses || []).map((l) => (
                  <li key={l.license_id}><code>{l.verification?.level}</code>: license {l.license_id} ({l.jurisdiction}) listed as {l.status?.value} by {l.authority}, checked {String(l.verification?.checked_at).slice(0, 10)}.</li>
                ))}
              </ul>
              <p>OLIP 0.2 adds an optional <strong>intake capability card</strong>: what the firm says it accepts, in which languages, and how it can be reached, each item labeled as firm-reported or copied from an official record.</p>
              <Json title="Professional identity and evidence (fictional)" value={identityEx.example} schema="professional-identity-response" />
              <Json title="Intake capability card, OLIP 0.2 (fictional)" value={cardEx.example} />
            </>
          )}

          {step === 2 && (
            <>
              <p>The CaseBrief is the person's own short summary. It is untrusted user-supplied data: a receiving system must never treat it as instructions. Edit the summary if you like, but use made-up words only. The demo refuses real-looking emails, phone numbers and web addresses.</p>
              <label htmlFor="summary" className={styles.label}>Summary (fictional)</label>
              <textarea id="summary" className={styles.area} value={summary} maxLength={600} onChange={(e) => setSummary(e.target.value)} />
              <button type="button" className="button button--secondary" onClick={() => run(async () => sim.editCaseBrief({summary}), 'CaseBrief saved as a new revision.')}>Save CaseBrief</button>
              <p className={styles.muted}>Revision {s.casebrief.revision}. Other fields (name, email, dates) are fixed fictional values.</p>
              <Json title="CaseBrief" value={s.casebrief} schema="casebrief" />
            </>
          )}

          {step === 3 && (
            <>
              <p>OLIP sends to exactly one named recipient the person chose. Pick one. Try the "two recipients" button to see the refusal.</p>
              <fieldset className={styles.fieldset}>
                <legend>Recipient</legend>
                {candidates.map((c) => (
                  <label key={c.id} className={styles.choice}>
                    <input type="radio" name="recipient" value={c.id} checked={recipient === c.id} onChange={() => { setRecipient(c.id); say(`${c.display_name} chosen.`); }} />
                    {' '}{c.display_name}, {c.firm.name}{c.intake_endpoint_status !== 'active' ? ' (intake endpoint offline: shows the failure path)' : ''}
                  </label>
                ))}
              </fieldset>
              <button type="button" className="button button--outline button--danger" onClick={() => run(() => sim.createPreview({recipient_ids: candidates.slice(0, 2).map((c) => c.id), field_paths: fields}))}>
                Agent tries to send to two recipients
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <p>Choose exactly which fields go to {chosen?.display_name}. Everything else is withheld and listed as withheld. Then build the preview: the host computes a <strong>consent digest</strong>, a SHA-256 fingerprint of the recipient, the exact values, the purpose and the notices.</p>
              <fieldset className={styles.fieldset}>
                <legend>Fields to share</legend>
                {FIELD_CATALOG.map((f) => (
                  <label key={f.path} className={styles.choice}>
                    <input type="checkbox" checked={fields.includes(f.path)} onChange={(e) => setFields(e.target.checked ? [...fields, f.path] : fields.filter((x) => x !== f.path))} />
                    {' '}{f.label} <code>{f.path}</code>
                  </label>
                ))}
              </fieldset>
              <button type="button" className="button button--primary" onClick={() => run(() => sim.createPreview({recipient_ids: [recipient], field_paths: fields}), 'Preview built and consent digest computed.')}>Build the preview</button>
              {s.preview && (
                <div className={styles.note}>
                  <p><strong>Recipient:</strong> {s.preview.recipient.display_name} only.</p>
                  <p><strong>Shared:</strong> {s.preview.shared_fields.map((f) => f.path).join(', ')}</p>
                  <p><strong>Withheld:</strong> {s.preview.withheld_fields.join(', ') || 'nothing'}</p>
                  <p><strong>Consent digest (computed in your browser):</strong> <code className={styles.wrapText}>{s.preview.consent_digest}</code></p>
                  <ul>{s.preview.notices.map((n) => <li key={n.id}>{n.text}</li>)}</ul>
                  <Json title="Handoff preview" value={s.preview} schema="handoff-preview" />
                </div>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <p>Only the person can approve, on a page the agent cannot complete alone. In OLIP 0.1 that is the host's own page with a one-time code sent to the person. Here the approval page is simulated.</p>
              <div className={styles.approve}>
                <p><strong>Simulated approval page</strong>: send the {s.preview?.shared_fields.length} listed fields to {s.preview?.recipient.display_name}? Approval code ends in <code>{s.preview?.consent_digest.slice(-8)}</code>.</p>
                <button type="button" className="button button--primary" onClick={() => run(() => sim.approve({source: 'user'}), 'You approved. The approval is single-use and expires in 30 minutes.')}>I approve (as the person)</button>{' '}
                <button type="button" className="button button--outline button--danger" onClick={() => run(() => sim.approve({source: 'client'}))}>AI agent approves for itself</button>
              </div>
              {s.authorization ? <Json title="Authorization" value={s.authorization} schema="authorization" /> : null}
            </>
          )}

          {step === 6 && (
            <>
              <p>The agent submits the approved handoff. The host recomputes the digest from the CaseBrief as it is now, so any change after approval is caught. Try the tampering buttons first, then submit for real.</p>
              <div className={styles.btnRow}>
                <button type="button" className="button button--outline button--danger" disabled={!!handoff} onClick={() => run(() => sim.submit({consent_digest: 'sha256:' + '0'.repeat(64)}))}>Submit with a wrong digest</button>
                <button type="button" className="button button--outline button--danger" disabled={!!handoff} onClick={() => run(() => sim.submit({extra_fields: ['facts', 'documents']}))}>Add fields the person did not approve</button>
                <button type="button" className="button button--outline button--danger" disabled={!!handoff} onClick={async () => {
                  const r = sim.editCaseBrief({summary: s.casebrief.summary + ' (edited after approval)'});
                  if (r.ok) await run(() => sim.submit());
                  else setResult(r);
                }}>Edit the CaseBrief after approval, then submit</button>
                <button type="button" className="button button--primary" disabled={!!handoff || !s.authorization} onClick={() => run(() => sim.submit(), 'Handoff recorded and queued.')}>Submit the approved handoff</button>
              </div>
              {!s.authorization && !handoff ? <p className={styles.note}>The approval is gone (it went stale). Rebuild the preview in step 5 and approve again in step 6. <button type="button" className="button button--sm button--link" onClick={() => go(4)}>Back to choose fields</button></p> : null}
              {handoff ? <><p>Payload contains only: {Object.keys(handoff.payload).join(', ')}.</p><Timeline handoff={handoff} /><Json title="Handoff" value={handoff} schema="handoff" /></> : null}
            </>
          )}

          {step === 7 && (
            <>
              <p>Each state proves one thing and nothing more. Move it forward one step at a time. Recipient events are signed with a TEST key the fictional firm's system made in your browser a moment ago.</p>
              <Timeline handoff={handoff} />
              <div className={styles.btnRow}>
                <button type="button" className="button button--primary" disabled={!handoff || ['responded', 'failed', 'cancelled'].includes(handoff?.state)} onClick={async () => {
                  const r = await run(() => sim.advance(), 'Status moved one step.');
                  if (r?.ok && sim.state.keys.recipient && !sim.state.keys.recipient.supported) setCryptoNote('This browser cannot make Ed25519 signatures, so receipts and events here are UNSIGNED. Nothing is presented as verified.');
                  rerender(); say(`Status is now ${sim.state.handoff.state}. ${statusMachine.states[sim.state.handoff.state].meaning}`);
                }}>Next status event</button>
                <button type="button" className="button button--outline button--danger" onClick={() => run(() => sim.agentClaimsOutcome())}>AI agent claims "delivered" itself</button>
              </div>
              {cryptoNote ? <p className={styles.err}>{cryptoNote}</p> : null}
              {handoff?.state === 'failed' ? <p className={styles.err}>The fictional firm's endpoint is offline. After {handoff.delivery.max_attempts} attempts the handoff is <code>failed</code>. There is no receipt, so nothing claims it was delivered.</p> : null}
              {handoff?.receipt ? (
                <div className={styles.note}>
                  <p><strong>Receipt</strong> signed with TEST key <code>{handoff.receipt.signature?.kid || 'none (unsigned)'}</code>. It says: "{handoff.receipt.statement}"</p>
                  <div className={styles.btnRow}>
                    <button type="button" className="button button--secondary" onClick={async () => { const v = await sim.verifyReceipt(); setVerify(v); say(v.ok ? 'Receipt verified with the TEST public key.' : `Receipt rejected: ${v.reason}.`); }}>Verify the receipt</button>
                    <button type="button" className="button button--outline button--danger" onClick={async () => { const f = await sim.forgedReceipts(); setForged(f); say(`${f.filter((x) => !x.result.ok).length} of ${f.length} forged receipts rejected.`); }}>Try three forged receipts</button>
                  </div>
                  {verify ? <p className={verify.ok ? styles.ok : styles.bad}>{verify.ok ? 'Valid: the signature checks against the fictional firm\'s TEST public key, and the receipt matches this handoff\'s payload and consent digest.' : `Rejected: ${verify.reason}`}</p> : null}
                  {forged ? <ul>{forged.map((f) => <li key={f.label}>{f.label}: <span className={f.result.ok ? styles.ok : styles.bad}>{f.result.ok ? 'accepted (a bug: please report it)' : `rejected (${f.result.reason})`}</span></li>)}</ul> : null}
                  <Json title="Receipt" value={handoff.receipt} schema="receipt" />
                </div>
              ) : null}
              {handoff?.state === 'responded' ? <p className={styles.note}><strong>None of these states means the firm took the case.</strong> Delivered, acknowledged and responded are not acceptance, and OLIP never creates or reports an attorney-client relationship. <code>engagement.status</code> stays <code>{handoff.engagement.status}</code>.</p> : null}
              {handoff ? <Json title="Status events" value={handoff.events} schema="status-event" /> : null}
            </>
          )}

          {step === 8 && (
            <>
              <p>The person can withdraw at any time before a terminal state. What that means depends on whether anything was already transmitted.</p>
              <button type="button" className="button button--primary" disabled={!handoff || handoff.state === 'cancelled'} onClick={async () => { const r = await run(() => sim.cancel(), 'Withdrawal recorded.'); if (r?.ok) setCancelInfo(r); }}>Withdraw this handoff</button>
              {cancelInfo ? (
                <div className={styles.note}>
                  <p>Effect: <code>{cancelInfo.effect}</code></p>
                  {cancelInfo.limits.length ? <ul>{cancelInfo.limits.map((l) => <li key={l}>{l}</li>)}</ul> : <p>Nothing had left the host.</p>}
                </div>
              ) : null}
              <h3>What you saw</h3>
              <ul>
                <li>One recipient only; bulk is refused.</li>
                <li>Only the person approves; the agent cannot approve, or record outcomes, for itself.</li>
                <li>The approval is bound to the exact content; any change, extra field or wrong digest is refused and nothing is sent.</li>
                <li>Each status proves one thing. Failure is shown as failure. A receipt is checked, not trusted.</li>
                <li>No state means representation. A withdrawn copy may still be kept by the recipient.</li>
              </ul>
              <p>Next: run the real reference endpoint with the <Link to="/docs/quickstart/">quickstart</Link>, or read <Link to="/docs/paths/">pick your path</Link>.</p>
            </>
          )}

          <Outcome r={result} />

          <p className={styles.clause}>Spec clause for this step: <Link to={SPEC + current.clause}>OLIP 0.1, section {current.sec}</Link></p>

          <div className={styles.nav}>
            <button type="button" className="button button--secondary" disabled={step === 0} onClick={() => go(step - 1)}>Back</button>
            <button type="button" className="button button--primary" disabled={!canNext[step]} onClick={() => go(step + 1)}>Next</button>
            <button type="button" className="button button--link" onClick={reset}>Reset</button>
          </div>
        </section>

        <h2>Activity log</h2>
        <ol className={styles.log} aria-label="Activity log">
          {s.log.map((l, i) => <li key={i} className={l.kind === 'error' ? styles.bad : l.kind === 'ok' ? styles.ok : ''}>{l.text}</li>)}
        </ol>
        <Banner />
        <p className={styles.muted}>This simulation runs locally with code and data that ship with this page. It makes no network requests, stores nothing and sets no cookies. It is a teaching aid, not a conformance test, and passing it says nothing about any real system. Source: <code>src/try/engine.mjs</code>, with tests for each path above.</p>
      </main>
    </Layout>
  );
}
