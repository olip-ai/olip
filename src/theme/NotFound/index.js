import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Head from '@docusaurus/Head';

export default function NotFound() {
  return (
    <Layout title="Page not found" description="This page does not exist on olip.ai.">
      <Head><meta name="robots" content="noindex" /></Head>
      <main className="container margin-vert--xl">
        <h1>Page not found</h1>
        <p>There is no page at this address on olip.ai. It may have moved, or the link may be mistyped.</p>
        <ul>
          <li><Link to="/">Home</Link></li>
          <li><Link to="/docs/">Introduction to OLIP</Link></li>
          <li><Link to="/docs/quickstart/">Quickstart</Link></li>
          <li><Link to="/spec/0.1/">Specification 0.1 (draft)</Link></li>
          <li><Link to="/spec/downloads/">Schemas and downloads</Link></li>
          <li><Link to="/search/">Search the documentation</Link></li>
        </ul>
      </main>
    </Layout>
  );
}
