/** Docs sidebar for /docs */
module.exports = {
  docs: [
    'intro',
    'quickstart',
    {
      type: 'category', label: 'Pick your path', collapsed: false,
      link: {type: 'doc', id: 'paths/index'},
      items: ['paths/ai-agent-developers', 'paths/law-firms', 'paths/legal-tech-vendors', 'paths/read-only-discovery'],
    },
    {
      type: 'category', label: 'Foundations', collapsed: false,
      items: ['foundations/architecture', 'foundations/actors-and-trust', 'foundations/non-goals-and-limitations', 'foundations/glossary'],
    },
    {
      type: 'category', label: 'The six modules', collapsed: false,
      link: {type: 'doc', id: 'modules/index'},
      items: [
        'modules/professional-evidence',
        'modules/intake-eligibility',
        'modules/casebrief',
        'modules/consent-and-authorization',
        'modules/authenticated-delivery',
        'modules/status-lifecycle',
      ],
    },
    {
      type: 'category', label: 'Implementing OLIP', collapsed: false,
      items: [
        'implementing/independent-implementation',
        'implementing/recovery-and-no-match',
        'implementing/errors',
        'implementing/interoperability',
        'implementing/olip-over-mcp',
        'implementing/privacy-and-security',
        'implementing/conformance-checklist',
      ],
    },
    {
      type: 'category', label: 'Context', collapsed: false,
      items: ['context/legal-and-ethical-boundaries', 'context/for-law-firms', 'context/faq'],
    },
    {
      type: 'category', label: 'Contributing', collapsed: false,
      items: [
        'contributing/report-an-error',
        'contributing/propose-a-change',
        'contributing/self-test',
        'contributing/publish-results',
        'contributing/independent-implementation-invitation',
        'contributing/security-review-scope',
        'contributing/troubleshooting',
      ],
    },
  ],
};
