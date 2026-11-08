/** Specification sidebar for /spec */
module.exports = {
  spec: [
    'index',
    'status',
    'versions',
    {type: 'category', label: 'OLIP 0.1 (draft)', collapsed: false,
      items: ['olip-0.1', 'security-considerations', 'threat-model', 'status-machine']},
    {type: 'category', label: 'OLIP 0.2 additions (draft)', collapsed: false, items: ['olip-0.2']},
    'downloads',
    'versioning',
    {type: 'category', label: 'Proposals', link: {type: 'doc', id: 'proposals'}, items: ['proposal-p02']},
  ],
};
