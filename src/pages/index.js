import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import styles from './index.module.css';
import R from '@site/src/data/release.json';
import C from '@site/src/data/conformance.json';

function FlowDiagram() {
  // Original illustration: three steps, each a different responsibility.
  return (
    <svg className={styles.flow} viewBox="0 0 960 230" role="img" aria-labelledby="flowTitle flowDesc">
      <title id="flowTitle">The three OLIP steps</title>
      <desc id="flowDesc">
        Step 1 Discover: an AI agent reads professional evidence and intake eligibility. Step 2 Authorize: the person
        approves one named recipient, exact fields and an expiry. Step 3 Connect: an authenticated handoff and truthful
        status receipts.
      </desc>
      <defs>
        <marker id="arrowHead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" className={styles.flowArrowHead} />
        </marker>
      </defs>
      {[
        {x: 20, n: '1', t: 'Discover', a: 'Professional evidence', b: 'Intake eligibility'},
        {x: 340, n: '2', t: 'Authorize', a: 'One named recipient', b: 'Exact fields · expiry'},
        {x: 660, n: '3', t: 'Connect', a: 'Authenticated handoff', b: 'Truthful status receipts'},
      ].map((s) => (
        <g key={s.n} transform={`translate(${s.x},20)`}>
          <rect width="280" height="190" rx="16" className={styles.flowCard} />
          <circle cx="44" cy="46" r="22" className={styles.flowBadge} />
          <text x="44" y="53" textAnchor="middle" className={styles.flowBadgeText}>{s.n}</text>
          <text x="80" y="55" className={styles.flowTitle}>{s.t}</text>
          <line x1="24" y1="86" x2="256" y2="86" className={styles.flowRule} />
          <text x="24" y="122" className={styles.flowLine}>{s.a}</text>
          <text x="24" y="156" className={styles.flowLine}>{s.b}</text>
        </g>
      ))}
      <line x1="304" y1="115" x2="336" y2="115" className={styles.flowArrow} markerEnd="url(#arrowHead)" />
      <line x1="624" y1="115" x2="656" y2="115" className={styles.flowArrow} markerEnd="url(#arrowHead)" />
    </svg>
  );
}

function LayerDiagram() {
  return (
    <svg className={styles.layers} viewBox="0 0 560 300" role="img" aria-labelledby="layerTitle layerDesc">
      <title id="layerTitle">Where OLIP sits</title>
      <desc id="layerDesc">
        OLIP is a legal-intake meaning layer on top of agent protocols (MCP, A2A), which run over HTTPS and OpenAPI,
        secured with OAuth 2.0 and signed receipts.
      </desc>
      <rect x="10" y="10" width="540" height="70" rx="12" className={styles.layerTop} />
      <text x="280" y="42" textAnchor="middle" className={styles.layerTopText}>OLIP: legal-intake meaning</text>
      <text x="280" y="64" textAnchor="middle" className={styles.layerTopSub}>evidence · eligibility · CaseBrief · consent · handoff · status</text>
      <rect x="10" y="95" width="265" height="60" rx="12" className={styles.layer} />
      <text x="142" y="131" textAnchor="middle" className={styles.layerText}>MCP tools (agent side)</text>
      <rect x="285" y="95" width="265" height="60" rx="12" className={styles.layer} />
      <text x="417" y="131" textAnchor="middle" className={styles.layerText}>A2A messages (optional)</text>
      <rect x="10" y="170" width="540" height="55" rx="12" className={styles.layer} />
      <text x="280" y="203" textAnchor="middle" className={styles.layerText}>HTTPS + JSON · OpenAPI 3.1 · JSON Schema 2020-12</text>
      <rect x="10" y="240" width="540" height="50" rx="12" className={styles.layer} />
      <text x="280" y="270" textAnchor="middle" className={styles.layerText}>OAuth 2.0 · JWKS · Ed25519 signed receipts</text>
    </svg>
  );
}

const audiences = [
  {
    title: 'For AI developers',
    body: 'Help a person reach one legal professional they chose, with an approval only that person can give, and status that never overstates what happened. Works from any agent, through MCP, A2A or plain HTTPS.',
    link: '/docs/paths/ai-agent-developers/', cta: 'Path for AI agent developers',
  },
  {
    title: 'For law firms',
    body: 'Publish who you are, how your license can be checked, and which matters you accept, in your own words and with dates. Receive only what the person approved, with a receipt you sign.',
    link: '/docs/paths/law-firms/', cta: 'Path for law firms',
  },
  {
    title: 'For legal software vendors',
    body: 'Add an OLIP endpoint to an intake or practice-management product. Map your existing states to OLIP states conservatively and test with the public conformance suite.',
    link: '/docs/paths/legal-tech-vendors/', cta: 'Path for legal software vendors',
  },
];


export default function Home() {
  return (
    <Layout
      title="A common language for AI-to-lawyer connections"
      description={`OLIP, the Open Legal Intake Protocol: a proposed open protocol for authorized, interoperable legal intake of client and case data between AI agents and legal-professional systems, approved by the person for each recipient. ${R.promoted.label}.`}>
      <Head>
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'OLIP: Open Legal Intake Protocol',
            url: 'https://olip.ai/',
            description: 'Documentation and draft specification of OLIP, a proposed open protocol for authorized, interoperable legal intake of client and case data between AI agents and legal-professional systems, approved by the person for each recipient.',
            inLanguage: 'en',
          })}
        </script>
      </Head>
      <header className={styles.hero}>
        <div className="container">
          <p className={styles.eyebrow}>OPEN LEGAL INTAKE PROTOCOL · DRAFT</p>
          <ul className={styles.strip} aria-label="Project status">
            <li><Link to="/spec/versions/">{R.promoted.label}</Link></li>
            <li><Link to="/license/">{R.licenses.status === 'granted' ? 'Open licenses granted' : 'Licenses pending'}</Link></li>
            <li><Link to="/spec/status/">{R.reviews.independent_security_review === 'done' ? 'Independent review done' : 'Independent review pending'}</Link></li>
          </ul>
          <h1 className={styles.h1}>A common language for AI-to-lawyer connections.</h1>
          <p className={styles.sub}>
            An open protocol for authorized, interoperable legal intake of client and case data between AI agents and legal-professional systems, approved by the person for each recipient.
          </p>
          <p className={styles.subDetail}>
            An AI agent finds a lawyer with dated, sourced evidence. The person picks one recipient and approves exactly which facts go. The firm's system signs a receipt, and every status says only what actually happened.
          </p>
          <div className={styles.ctas}>
            <Link className="button button--primary button--lg" to={R.browser_simulation.path}>Try OLIP</Link>
            <Link className="button button--secondary button--outline button--lg" to={R.base.path}>Read the specification</Link>
            {R.repository.url ? <a className="button button--secondary button--outline button--lg" href={R.repository.url}>View on GitHub</a> : null}
          </div>
          <p className={styles.heroNote}>
            Version {R.promoted.version} is a draft for review. It is not an adopted standard and is not legal advice. The demo is a fictional simulation: no real lawyer is contacted.{' '}
            <Link to="/spec/status/">See exactly what exists today</Link>.
          </p>
        </div>
      </header>

      <main>
        <section className={styles.section} aria-labelledby="how">
          <div className="container">
            <h2 id="how" className={styles.h2}>How it works</h2>
            <FlowDiagram />
            <div className={styles.grid3}>
              <div className={styles.step}>
                <h3>1. Discover</h3>
                <p>Who is this professional, and how do we know? OLIP keeps an indexed record, an official-source check and a lawyer's own statement apart, each with a source, a date and its uncertainty. Firms publish the matters, places and languages they accept.</p>
                <Link to="/docs/modules/professional-evidence/">Professional evidence</Link> · <Link to="/docs/modules/intake-eligibility/">Intake eligibility</Link>
              </div>
              <div className={styles.step}>
                <h3>2. Authorize</h3>
                <p>The person reviews a short CaseBrief, picks one named recipient, sees every field that will be shared, and approves on a page the agent cannot complete alone. The approval expires and is bound to a digest of exactly that content.</p>
                <Link to="/docs/modules/casebrief/">CaseBrief</Link> · <Link to="/docs/modules/consent-and-authorization/">Consent and authorization</Link>
              </div>
              <div className={styles.step}>
                <h3>3. Connect</h3>
                <p>An authenticated, idempotent handoff sends only the approved fields. Status moves step by step: recorded, queued, sent, delivered (with a signed receipt), acknowledged, responded. Delivery is never presented as a reply, and a reply is never presented as representation.</p>
                <Link to="/docs/modules/authenticated-delivery/">Delivery</Link> · <Link to="/docs/modules/status-lifecycle/">Status lifecycle</Link>
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.alt}`} aria-labelledby="why">
          <div className="container">
            <div className={styles.split}>
              <div>
                <h2 id="why" className={styles.h2}>Why an open legal intake protocol?</h2>
                <p>People increasingly ask AI assistants for help with a legal problem. Today each assistant, directory and firm intake form invents its own way to describe a lawyer, collect facts, ask for consent and report what happened. The result is repeated forms, vague permission, and status messages that say "sent" when nothing reached anyone.</p>
                <p>OLIP gives every party the same small vocabulary:</p>
                <ul>
                  <li>fewer repeated intake forms, because a person's CaseBrief is portable between systems they authorize;</li>
                  <li>permission that names one recipient, lists the exact fields, and expires;</li>
                  <li>professional evidence that cites its source and date instead of a "verified" badge;</li>
                  <li>delivery states that mean exactly one thing each.</li>
                </ul>
                <p>
                  OLIP does not certify lawyer competence, make legal decisions, create an attorney-client relationship, guarantee representation, or replace professional-responsibility rules. <Link to="/docs/foundations/non-goals-and-limitations/">Non-goals and limits</Link>.
                </p>
              </div>
              <div>
                <h2 className={styles.h2}>A complement to MCP and A2A</h2>
                <LayerDiagram />
                <p className={styles.caption}>
                  OLIP adds legal-intake meaning. It does not replace agent or transport protocols: MCP and A2A bindings and an OpenAPI 3.1 HTTPS binding are part of the draft. <Link to="/docs/implementing/interoperability/">Interoperability</Link>.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="who">
          <div className="container">
            <h2 id="who" className={styles.h2}>Start where you are</h2>
            <div className={styles.grid3}>
              {audiences.map((a) => (
                <div key={a.title} className={styles.card}>
                  <h3>{a.title}</h3>
                  <p>{a.body}</p>
                  <Link to={a.link}>{a.cta}</Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.alt}`} aria-labelledby="open">
          <div className="container">
            <div className={styles.split}>
              <div>
                <h2 id="open" className={styles.h2}>Open by design</h2>
                <ul>
                  <li>Anyone may implement OLIP without paying {R.sponsor.name}, using its software, hosting with it, or holding an account.</li>
                  <li>Discovery order must be disclosed, and payment never changes it (<code>paid_influence: false</code>).</li>
                  <li>Conformance is decided only by a public test suite anyone can run. There is no fee and no certification badge.</li>
                  <li>Self-hosted firm endpoints are a first-class topology, not an exception.</li>
                  <li>OLIP is not a referral marketplace and has no paid ranking.</li>
                </ul>
                <p><Link to="/governance/">Governance and sponsorship</Link> · <Link to="/license/">Licensing (granted {R.licenses.granted_on})</Link></p>
              </div>
              <div>
                <h2 className={styles.h2}>Current status</h2>
                <ul>
                  <li>Specification: {R.base.label} plus the optional {R.promoted.version} additions, not adopted by any standards body.</li>
                  <li>{R.counts.schemas_0_1 + R.counts.schemas_0_2} JSON Schemas, OpenAPI 3.1 and fictional examples, available to download.</li>
                  <li>Conformance: {C.runs.node.pass} of {C.total_checks} checks pass on the Node reference endpoint (sponsor self-test, <Link to="/conformance/">all results</Link>).</li>
                  <li>Independent implementations: {R.adoption.independent_implementations}. Hosted sandbox: not built. Outside security review: not done.</li>
                </ul>
                <p className={styles.caption}>Updated {R.last_reviewed}. <Link to="/spec/status/">Full status table</Link>.</p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="contribute">
          <div className="container">
            <div className={styles.split}>
              <div>
                <h2 id="contribute" className={styles.h2}>How to contribute</h2>
                <p>OLIP needs outside review most of all: implementers, intake vendors, legal-aid groups, security practitioners and lawyers. Read the draft, try the fictional quickstart, and send comments. Every normative change ships with a schema change, a conformance test and an example.</p>
                <p><Link className="button button--primary" to="/community/">Contribute and give feedback</Link></p>
              </div>
              <div className={styles.sponsor}>
                <h2 className={styles.h2}>Sponsorship</h2>
                <p>OLIP was initiated and is initially sponsored by {R.sponsor.name} The specification is proposed and open to independent contributors.</p>
                <p>There is no foundation, outside governing body, standards-body adoption or partner endorsement today. The proposed path to independent governance is published on the <Link to="/governance/">governance page</Link>.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
