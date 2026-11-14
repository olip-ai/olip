// FICTIONAL TEST DATA ONLY (OLIP 3.0-draft). Everything here is invented. The 2.0-draft fixtures are reused unchanged.
import * as V2FX from "../../v2-draft/reference/fixtures.mjs";
import { encryptionKey } from "./lib/core.mjs";

export const { CONSUMERS, AGENT_CLIENTS, FIRMS, CASEBRIEF, RELAY_OPERATOR } = V2FX;
// The host operator's administrative credential (test-only value). Never available to any model tool.
export const OPERATOR = { operator_id: "op_test_neutral_relay", secret: "test-only-operator-secret" };
// Each fictional assistant's capsule-encryption key. The private half stays with that assistant (here: the test).
export const ASSISTANT_ENCRYPTION_KEYS = Object.fromEntries(Object.keys(AGENT_CLIENTS).map((id) => [id, encryptionKey(`assistant/${id}`)]));
export const SCREEN_FIELDS = ["prospective_client.name", "adverse_parties", "matter.category", "matter.jurisdiction"];
