// /conformance/: the latest conformance results, generated at build time from the JSON results the suite writes.
import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import C from '@site/src/data/conformance.json';
import R from '@site/src/data/release.json';

const cls = (r) => (r === 'pass' ? 'tested' : r === 'fail' ? 'blocked' : 'notbuilt');
const Res = ({r}) => <span className={`status status--${cls(r)}`}>{String(r).toUpperCase()}</span>;

export default function Conformance() {
  const runs = [['Node reference endpoint', C.runs.node], ['Python second endpoint', C.runs.python]];
  return (
    <Layout title="Conformance results" description="Latest OLIP conformance suite results: pass, fail and skip for every check, by profile, with the suite hash. Sponsor self-test; no independent reproduction yet.">
      <main className="container margin-vert--lg" style={{maxWidth: '64rem'}}>
        <h1>Conformance results</h1>
        <p>
          <strong>Who ran this:</strong> {C.runner}. <strong>Independent reproductions:</strong> {C.independent_reproductions.length === 0 ? 'none yet' : C.independent_reproductions.length}.
          A pass is a technical test result only. It is not a security review, a certification, a license check or legal clearance, and there is no OLIP certification or badge.
        </p>
        <p>
          Suite: <code>{C.suite.file}</code> in the <a href={C.suite.kit}>{R.promoted.label} kit</a>, SHA-256 <code style={{wordBreak: 'break-all'}}>{C.suite.sha256}</code>.
          Reproduce it with the <Link to="/docs/contributing/self-test/">self-test guide</Link>, then <Link to="/docs/contributing/publish-results/">publish your result</Link>.
        </p>

        <h2>Summary by endpoint</h2>
        <div style={{overflowX: 'auto'}}>
          <table>
            <thead><tr><th scope="col">Endpoint</th><th scope="col">OLIP</th><th scope="col">Mode</th><th scope="col">Pass</th><th scope="col">Fail</th><th scope="col">Skip</th><th scope="col">Ran at (UTC)</th><th scope="col">Run time</th></tr></thead>
            <tbody>
              {runs.map(([name, r]) => (
                <tr key={name}><th scope="row">{name}</th><td>{r.olip_version} (+0.2 profile)</td><td><code>{r.mode}</code></td><td>{r.pass}</td><td>{r.fail}</td><td>{r.skip}</td><td>{r.ran_at.replace('T', ' ').slice(0, 19)}</td><td>{r.seconds} s</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Both endpoints were written by the same author, so they do not count as independent implementations.</p>

        <h2>By profile</h2>
        <div style={{overflowX: 'auto'}}>
          <table>
            <thead><tr><th scope="col">Profile</th><th scope="col">Checks</th><th scope="col">Node pass / fail / skip</th><th scope="col">Python pass / fail / skip</th></tr></thead>
            <tbody>
              {C.profiles.map((p) => (
                <tr key={p.profile}><th scope="row"><code>{p.profile}</code></th><td>{p.checks}</td><td>{p.node.pass} / {p.node.fail} / {p.node.skip}</td><td>{p.python.pass} / {p.python.fail} / {p.python.skip}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Every check</h2>
        <div style={{overflowX: 'auto'}}>
          <table>
            <thead><tr><th scope="col">ID</th><th scope="col">Profile</th><th scope="col">Check</th><th scope="col">Node</th><th scope="col">Python</th><th scope="col">Note</th></tr></thead>
            <tbody>
              {C.checks.map((c) => (
                <tr key={c.id}><th scope="row">{c.id}</th><td><code>{c.profile}</code></td><td>{c.name}</td><td><Res r={c.node} /></td><td><Res r={c.python} /></td><td>{c.note || ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Full definitions: <Link to="/docs/implementing/conformance-checklist/">conformance checklist</Link>.</p>
      </main>
    </Layout>
  );
}
