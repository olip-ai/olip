// FICTIONAL TEST DATA ONLY. Every person, firm, license number, address and source below is invented.
// Domains use the reserved .test top-level domain so nothing here can reach a real inbox or website.
// License numbers start with TEST- and do not exist in any official registry.

const now = "2026-11-06T12:00:00-08:00";

const verified = (jurisdiction, license_id, data_as_of) => ({
  jurisdiction,
  authority: `Fictional ${jurisdiction} licensing registry (test data)`,
  license_id,
  status: { value: "active", status: "official_source_checked", as_of: data_as_of },
  verification: {
    level: "official_source_checked",
    checked_at: data_as_of,
    freshness_days: 120,
    source: {
      name: `Fictional ${jurisdiction} licensing registry (test data)`,
      url: `https://registry.example.test/${jurisdiction}/${license_id}`,
      data_as_of,
      retrieved_at: data_as_of,
      evidence_sha256: "sha256:" + "0".repeat(63) + "1",
    },
  },
  display_statement: `Checked against the fictional ${jurisdiction} registry on ${data_as_of.slice(0, 10)}: listed as active. This is a record check, not an endorsement.`,
});

const indexed = (jurisdiction, license_id, copied_on) => ({
  jurisdiction,
  authority: `Fictional ${jurisdiction} licensing registry (test data)`,
  license_id,
  status: { value: "active", status: "indexed_unverified", as_of: copied_on },
  verification: {
    level: "indexed",
    checked_at: null,
    freshness_days: 120,
    source: {
      name: "Fictional bulk dataset (test data)",
      url: "https://dataset.example.test/lawyers.csv",
      data_as_of: copied_on,
      retrieved_at: copied_on,
      evidence_sha256: null,
    },
  },
  display_statement: `Copied from a public dataset on ${copied_on.slice(0, 10)}. Not checked against the official source.`,
});

const area = (code, label) => ({ code, label, sali: { iri: null, status: "unmapped_pending_review" } });
export const TAXONOMY = [
  area("housing.landlord_tenant", "Landlord and tenant"),
  area("employment.wrongful_termination", "Wrongful termination"),
  area("employment.wage_and_hour", "Unpaid wages"),
  area("family.divorce", "Divorce"),
  area("consumer.lemon_law", "Vehicle defects (lemon law)"),
];
const A = Object.fromEntries(TAXONOMY.map((t) => [t.code, t]));

const base = (o) => ({ olip_version: "0.1", type: "individual_lawyer", fictional: true, commercial: { paid_placement: false, affects_order: false }, extensions: {}, ...o });

export const PROFESSIONALS = [
  base({
    id: "prf_test_alvarez", display_name: "Dana Alvarez (fictional)", family_name: "Alvarez",
    firm: { id: "frm_test_alvarez", name: "Alvarez Tenant Law (fictional)", website: "https://alvarez-law.example.test", phone: "+1-555-0100" },
    licenses: [verified("US-CA", "TEST-CA-100001", "2026-10-30T00:00:00-07:00")],
    claim: { status: "claimed_verified", method: "license_email_code", claimed_at: "2026-10-20T09:00:00-07:00" },
    self_reported: { practice_areas: ["housing.landlord_tenant"], languages: ["en", "es"], service_territory: ["US-CA"] },
    intake_endpoint: { status: "active", topology: "direct", olip_version: "0.1", last_health_check: now },
    _mock: { behavior: "direct_ok", paid_customer: false },
  }),
  base({
    id: "prf_test_brooks", display_name: "Morgan Brooks (fictional)", family_name: "Brooks",
    firm: { id: "frm_test_brooks", name: "Brooks Law Office (fictional)", website: "https://brooks-law.example.test", phone: "+1-555-0101" },
    licenses: [indexed("US-CA", "TEST-CA-100002", "2026-10-02T00:00:00-07:00")],
    claim: { status: "unclaimed", method: null, claimed_at: null },
    self_reported: { practice_areas: [], languages: [], service_territory: [] },
    intake_endpoint: { status: "none", topology: null, olip_version: null, last_health_check: null },
    _mock: { behavior: "no_endpoint", paid_customer: false },
  }),
  base({
    id: "prf_test_chen", display_name: "Riley Chen (fictional)", family_name: "Chen",
    firm: { id: "frm_test_chen", name: "Chen Workers Law (fictional)", website: "https://chen-law.example.test", phone: "+1-555-0102" },
    licenses: [verified("US-NY", "TEST-NY-200001", "2026-10-28T00:00:00-04:00")],
    claim: { status: "claimed_verified", method: "license_email_code", claimed_at: "2026-10-21T10:00:00-04:00" },
    self_reported: { practice_areas: ["employment.wrongful_termination", "housing.landlord_tenant"], languages: ["en"], service_territory: ["US-NY"] },
    intake_endpoint: { status: "active", topology: "relay_email", olip_version: "0.1", last_health_check: now },
    _mock: { behavior: "relay_email", paid_customer: true },
  }),
  base({
    id: "prf_test_okafor", display_name: "Jordan Okafor (fictional)", family_name: "Okafor",
    firm: { id: "frm_test_okafor", name: "Okafor Housing Law (fictional)", website: "https://okafor-law.example.test", phone: "+1-555-0103" },
    licenses: [verified("US-NY", "TEST-NY-200002", "2026-10-28T00:00:00-04:00")],
    claim: { status: "claimed_verified", method: "license_email_code", claimed_at: "2026-10-22T10:00:00-04:00" },
    self_reported: { practice_areas: ["housing.landlord_tenant"], languages: ["en", "yo"], service_territory: ["US-NY"] },
    intake_endpoint: { status: "unhealthy", topology: "relay_webhook", olip_version: "0.1", last_health_check: now },
    _mock: { behavior: "offline", paid_customer: false },
  }),
  base({
    id: "prf_test_reyes", display_name: "Sam Reyes (fictional)", family_name: "Reyes",
    firm: { id: "frm_test_reyes", name: "Reyes Renters Law (fictional)", website: "https://reyes-law.example.test", phone: "+1-555-0104" },
    licenses: [verified("US-CA", "TEST-CA-100003", "2026-10-30T00:00:00-07:00")],
    claim: { status: "claimed_verified", method: "license_email_code", claimed_at: "2026-10-23T09:00:00-07:00" },
    self_reported: { practice_areas: ["housing.landlord_tenant"], languages: ["en"], service_territory: ["US-CA"] },
    intake_endpoint: { status: "active", topology: "direct", olip_version: "0.1", last_health_check: now },
    _mock: { behavior: "gate_no_listing_agreement", paid_customer: true },
  }),
];

const policy = (professional_id, o) => ({
  olip_version: "0.1", professional_id, fictional: true,
  accepting_new_matters: { value: true, status: "self_reported", as_of: "2026-11-01T00:00:00Z" },
  capacity: { value: null, status: "unknown" },
  client_side: ["individual"],
  exclusions: [],
  accessibility: { value: null, status: "not_provided" },
  required_fields: ["summary", "client.name", "client.email", "location.jurisdiction", "matter.code"],
  optional_fields: ["client.phone", "client.preferred_language", "facts", "objectives", "key_dates", "parties", "open_questions", "location.county", "location.city"],
  retention_days: 365,
  deadlines_note: "Sending a request does not stop any legal deadline. If you have a court date, say so.",
  updated_at: "2026-11-01T00:00:00Z",
  stale: false,
  extensions: {},
  ...o,
});

export const POLICIES = {
  prf_test_alvarez: policy("prf_test_alvarez", { jurisdictions: ["US-CA"], matter_types: [A["housing.landlord_tenant"]], client_side: ["tenant"], languages: ["en", "es"],
    delivery: { topology: "direct", receipt: "signed_EdDSA" }, regulatory: { modes_allowed: ["consumer_selected_listing", "direct_firm_intake"], listing_agreement_accepted: true } }),
  prf_test_brooks: policy("prf_test_brooks", { accepting_new_matters: { value: null, status: "unknown" }, jurisdictions: ["US-CA"], matter_types: [], languages: [],
    delivery: { topology: null, receipt: "none" }, regulatory: { modes_allowed: [], listing_agreement_accepted: false }, stale: true }),
  prf_test_chen: policy("prf_test_chen", { jurisdictions: ["US-NY"], matter_types: [A["employment.wrongful_termination"], A["housing.landlord_tenant"]], client_side: ["employee", "tenant"], languages: ["en"],
    delivery: { topology: "relay_email", receipt: "transport_only" }, regulatory: { modes_allowed: ["consumer_selected_listing"], listing_agreement_accepted: true } }),
  prf_test_okafor: policy("prf_test_okafor", { jurisdictions: ["US-NY"], matter_types: [A["housing.landlord_tenant"]], client_side: ["tenant"], languages: ["en", "yo"],
    delivery: { topology: "relay_webhook", receipt: "signed_EdDSA" }, regulatory: { modes_allowed: ["consumer_selected_listing"], listing_agreement_accepted: true } }),
  prf_test_reyes: policy("prf_test_reyes", { jurisdictions: ["US-CA"], matter_types: [A["housing.landlord_tenant"]], client_side: ["tenant"], languages: ["en"],
    delivery: { topology: "direct", receipt: "signed_EdDSA" }, regulatory: { modes_allowed: ["consumer_selected_listing"], listing_agreement_accepted: false } }),
};

// Jurisdiction policy gates. ILLUSTRATIVE ONLY and pending qualified legal review: they show the mechanism,
// they are not legal conclusions about any state.
export const JURISDICTION_RULES = {
  "US-CA": {
    review_status: "pending_counsel_review",
    modes: {
      consumer_selected_listing: { allowed: true, conditions: ["recipient_listing_agreement_accepted", "user_selected_recipient"] },
      direct_firm_intake: { allowed: true, conditions: ["user_selected_recipient"] },
      referral_service: { allowed: false, reason: "In this illustrative rule set, a referral-service workflow in California needs a certified lawyer referral service. This endpoint is not one." },
      automated_routing: { allowed: false, reason: "The platform may not choose a lawyer for the user in this mode." },
    },
  },
  "US-NY": {
    review_status: "pending_counsel_review",
    modes: {
      consumer_selected_listing: { allowed: true, conditions: ["user_selected_recipient"] },
      direct_firm_intake: { allowed: true, conditions: ["user_selected_recipient"] },
      referral_service: { allowed: false, reason: "No referral-service approval is recorded for this endpoint in this jurisdiction." },
      automated_routing: { allowed: false, reason: "The platform may not choose a lawyer for the user in this mode." },
    },
  },
};

// Legal aid and non-lawyer options returned when nothing fits. Fictional placeholders; a real deployment
// lists real, checked organizations for the user's state.
export const LEGAL_AID = [
  { name: "Fictional Tenant Help Line (test data)", kind: "legal_aid", jurisdictions: ["US-CA", "US-NY"], matter_codes: ["housing.landlord_tenant"], url: "https://tenant-help.example.test", cost: "free" },
  { name: "Fictional Court Self-Help Center (test data)", kind: "court_self_help", jurisdictions: ["*"], matter_codes: ["*"], url: "https://selfhelp.example.test", cost: "free" },
];

// Calling agent platforms (OAuth client credentials) and recipient firm credentials. Test secrets only.
export const CLIENTS = {
  cli_agent_a: { secret: "test-secret-agent-a", name: "Fictional Agent A" },
  cli_agent_b: { secret: "test-secret-agent-b", name: "Fictional Agent B" },
};
export const RECIPIENT_CREDENTIALS = {
  frm_test_alvarez: { secret: "test-secret-firm-alvarez", professional_ids: ["prf_test_alvarez"] },
  frm_test_chen: { secret: "test-secret-firm-chen", professional_ids: ["prf_test_chen"] },
  frm_test_reyes: { secret: "test-secret-firm-reyes", professional_ids: ["prf_test_reyes"] },
};

// Words used by the illustrative plain-English interpreter. Keyword hints only, never a legal conclusion.
export const INTERPRETER_HINTS = [
  { code: "housing.landlord_tenant", words: ["evict", "eviction", "landlord", "lease", "rent", "unlawful detainer", "tenant", "deposit"], side_words: { tenant: ["my landlord", "evict me", "i rent", "tenant", "my apartment"], landlord: ["my tenant", "evict my", "i own the building"] } },
  { code: "employment.wrongful_termination", words: ["fired", "terminated", "let go", "wrongful termination", "laid off"], side_words: { employee: ["i was fired", "my boss", "my employer"] } },
  { code: "employment.wage_and_hour", words: ["unpaid wages", "overtime", "not paid", "paycheck"], side_words: { employee: ["my employer", "my boss"] } },
  { code: "family.divorce", words: ["divorce", "custody", "separation"], side_words: {} },
  { code: "consumer.lemon_law", words: ["lemon", "car keeps breaking", "dealer won't fix"], side_words: {} },
];
export const STATE_WORDS = { "US-CA": ["california", " ca ", "los angeles", "san francisco", "oakland", "san diego"], "US-NY": ["new york", " ny ", "brooklyn", "queens", "bronx"] };
