# Versioning and compatibility (DRAFT)

- Semantic versions for the spec (MAJOR.MINOR.PATCH). Schemas live under `/0.1/schemas/` per minor line.
- **0.x**: may change incompatibly; each change is recorded in `DECISION-LOG.md` with a migration note.
- **From 1.0**: minor releases only add optional members, new error codes, new extensions or new states with a documented mapping to existing ones. Removals or meaning changes need a new major version and at least 12 months of overlap.
- **Must-ignore**: receivers ignore unknown members and keep unknown `extensions`.
- **Negotiation**: clients send `OLIP-Version`; endpoints list `supported_versions` in the manifest and refuse unsupported majors with `OLIP_VERSION_UNSUPPORTED`.
- **Status machine**: transitions are never relaxed in a minor release. New states must map to an existing state for older clients.
- **Conformance suite** is versioned with the spec; a result always names the suite version.
