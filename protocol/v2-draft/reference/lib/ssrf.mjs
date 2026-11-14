// Callback URL checks for webhooks (OLIP 2.0-draft). Default policy: https only, no credentials in the URL,
// no IP literals or names that resolve to loopback, private, link-local, metadata, multicast or reserved ranges.
// Redirects are never followed. Every address is re-resolved and re-checked at delivery time (DNS rebinding).
import { lookup } from "node:dns/promises";
import net from "node:net";

const V4_BLOCK = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]];
const ip4 = (s) => s.split(".").reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
const inV4 = (ip, [base, bits]) => bits === 0 || (ip4(ip) >>> (32 - bits)) === (ip4(base) >>> (32 - bits));
export function isBlockedAddress(addr) {
  if (net.isIPv4(addr)) return V4_BLOCK.some((r) => inV4(addr, r));
  if (net.isIPv6(addr)) {
    const a = addr.toLowerCase();
    if (a === "::" || a === "::1") return true;
    const m = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (m) return isBlockedAddress(m[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(a) || a.startsWith("64:ff9b") || a.startsWith("2001:db8");
  }
  return true;
}
// policy.allowLoopbackForTests is ONLY for the fictional local test receiver. A production host must never set it.
export async function checkCallbackUrl(raw, { allowLoopbackForTests = false, resolver = lookup } = {}) {
  let u; try { u = new URL(raw); } catch { return { ok: false, reason: "not_a_url" }; }
  if (u.username || u.password) return { ok: false, reason: "credentials_in_url" };
  const loopTest = allowLoopbackForTests && u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  if (u.protocol !== "https:" && !loopTest) return { ok: false, reason: "https_required" };
  if (u.hash) return { ok: false, reason: "fragment_not_allowed" };
  if (loopTest) return { ok: true, addresses: ["127.0.0.1"], test_only: true };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return isBlockedAddress(host) ? { ok: false, reason: "blocked_address" } : { ok: true, addresses: [host] };
  if (/(^|\.)(localhost|internal|local|localdomain)$/i.test(host) || host === "metadata.google.internal") return { ok: false, reason: "blocked_hostname" };
  let addrs; try { addrs = (await resolver(host, { all: true })).map((x) => x.address); } catch { return { ok: false, reason: "dns_resolution_failed" }; }
  if (!addrs.length || addrs.some(isBlockedAddress)) return { ok: false, reason: "resolves_to_blocked_address" };
  return { ok: true, addresses: addrs };
}
