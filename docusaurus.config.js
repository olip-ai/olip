// Site configuration for https://olip.ai (OLIP, Open Legal Intake Protocol).
// Static output only (build/). No analytics, no cookies, no third-party scripts.
const prismThemes = require('./src/prism-themes');
// Single source for version, status, license and adoption facts: src/data/release.json
// (validated against src/data/release.schema.json and cross-checked against the protocol files by tests/release-facts.test.mjs).
const R = require('./src/data/release.json');

const SITE_STATUS = `${R.promoted.label} (optional additions on ${R.base.label}) · proposed, not adopted`;

/** @type {import('@docusaurus/types').Config} */
module.exports = {
  title: 'OLIP',
  tagline: 'Open Legal Intake Protocol. A common language for AI-to-lawyer connections.',
  favicon: 'img/favicon.svg',
  url: 'https://olip.ai',
  baseUrl: '/',
  trailingSlash: true,
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  onDuplicateRoutes: 'throw',
  markdown: {
    format: 'detect',
    hooks: {onBrokenMarkdownLinks: 'throw', onBrokenMarkdownImages: 'throw'},
  },
  i18n: {defaultLocale: 'en', locales: ['en']},
  customFields: {siteStatus: SITE_STATUS, release: R},
  headTags: [
    {tagName: 'link', attributes: {rel: 'alternate', type: 'text/plain', title: 'llms.txt', href: '/llms.txt'}},
    {tagName: 'meta', attributes: {name: 'referrer', content: 'strict-origin-when-cross-origin'}},
  ],
  clientModules: [require.resolve('./src/client/a11y.js')],
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: 'docs',
          routeBasePath: 'docs',
          sidebarPath: require.resolve('./sidebars.js'),
          showLastUpdateTime: false,
          breadcrumbs: true,
        },
        blog: false,
        pages: {},
        theme: {customCss: require.resolve('./src/css/custom.css')},
        sitemap: {changefreq: 'weekly', priority: 0.5, ignorePatterns: ['/search/**']},
      }),
    ],
  ],
  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'spec',
        path: 'spec',
        routeBasePath: 'spec',
        sidebarPath: require.resolve('./sidebarsSpec.js'),
        breadcrumbs: true,
      },
    ],
  ],
  themes: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexDocs: true,
        indexPages: true,
        indexBlog: false,
        docsRouteBasePath: ['docs', 'spec'],
        docsPluginIdForPreferredVersion: 'default',
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        searchBarShortcutHint: true,
      },
    ],
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/olip-social-card.png',
      metadata: [
        {name: 'description', content: 'OLIP (Open Legal Intake Protocol) is a proposed open protocol for authorized, interoperable legal intake of client and case data between AI agents and legal-professional systems, approved by the person for each recipient. ' + `${R.promoted.label}.`},
        {name: 'keywords', content: 'OLIP, Open Legal Intake Protocol, legal intake, AI agents, law firm intake, consent, CaseBrief, JSON Schema, OpenAPI, MCP, A2A'},
      ],
      colorMode: {defaultMode: 'light', respectPrefersColorScheme: true},
      announcementBar: {
        id: `draft-status-${R.promoted.version.replace('.', '-')}`,
        content: `OLIP ${R.promoted.version} is a <strong>draft for review</strong>. It is not an adopted standard, and nothing on this site is legal advice. <a href="/spec/status/">Read the status</a>.`,
        isCloseable: false,
      },
      navbar: {
        title: 'OLIP',
        items: [
          {type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs'},
          {type: 'docSidebar', sidebarId: 'spec', docsPluginId: 'spec', position: 'left', label: 'Specification'},
          {to: '/implementations/', label: 'Implementations', position: 'left'},
          {to: '/community/', label: 'Community', position: 'left'},
          {to: '/governance/', label: 'Governance', position: 'left'},
          {to: '/try/', label: 'Try OLIP', position: 'left'},
          {type: 'html', position: 'right', value: `<a class="olip-version-badge" href="/spec/versions/" title="Versions: ${R.promoted.label} adds optional features to ${R.base.label}">v${R.promoted.version} draft</a>`},
        ],
      },
      footer: {
        style: 'light',
        links: [
          {
            title: 'Protocol',
            items: [
              {label: 'Introduction', to: '/docs/'},
              {label: 'Quickstart', to: '/docs/quickstart/'},
              {label: 'Try OLIP (fictional simulation)', to: '/try/'},
              {label: `Specification ${R.base.version} (draft)`, to: R.base.path},
              {label: `${R.promoted.version} additions (draft)`, to: R.promoted.path},
              {label: 'Versions and compatibility', to: '/spec/versions/'},
              {label: 'Schemas and downloads', to: '/spec/downloads/'},
              {label: 'Changelog', to: '/changelog/'},
            ],
          },
          {
            title: 'Project',
            items: [
              {label: 'Pick your path', to: '/docs/paths/'},
              {label: 'Implementations', to: '/implementations/'},
              {label: 'Conformance results', to: '/conformance/'},
              {label: 'Community', to: '/community/'},
              {label: 'Governance', to: '/governance/'},
              {label: 'Roadmap', to: '/community/#roadmap'},
            ],
          },
          {
            title: 'Policies',
            items: [
              {label: 'Security', to: '/security/'},
              {label: 'Privacy', to: '/privacy/'},
              {label: 'Accessibility', to: '/accessibility/'},
              {label: 'Licensing', to: '/license/'},
              {label: 'Legal notice', to: '/legal/'},
            ],
          },
        ],
        copyright:
          `OLIP was initiated and is initially sponsored by ${R.sponsor.name} The specification is proposed and open to independent contributors. ` +
          `Status: working drafts (${R.base.label} and the optional ${R.promoted.version} additions), not adopted by any standards body, bar or regulator. ` +
          `Licenses granted ${R.licenses.granted_on}: ${R.licenses.specification.spdx} with the OWFa 1.0 patent commitment (specification), ${R.licenses.software.spdx} (software), ${R.licenses.examples.spdx} (fictional examples). ` +
          'Information on this site is technical protocol information, not legal advice. ' +
          `© ${new Date().getFullYear()} ${R.sponsor.name} and OLIP contributors.`,
      },
      prism: {theme: prismThemes.light, darkTheme: prismThemes.dark, additionalLanguages: ['json', 'bash', 'python']},
      tableOfContents: {minHeadingLevel: 2, maxHeadingLevel: 3},
      docs: {sidebar: {hideable: true, autoCollapseCategories: false}},
    }),
};
