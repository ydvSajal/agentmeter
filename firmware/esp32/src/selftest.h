#pragma once
#include "receipt-vectors.h"
#include "receipt.h"
#include "replay-store.h"

static void runReceiptSelfTests() {
  unsigned total = 0, failed = 0;
  auto check = [&](const char *name, bool ok) {
    ++total; if (!ok) ++failed;
    Serial.printf("[selftest] %s %s\n", ok ? "PASS" : "FAIL", name);
  };
  Receipt valid;
  for (const auto &v : RECEIPT_VECTORS) {
    JsonDocument doc;
    Receipt r;
    const bool parsed = !deserializeJson(doc, v.json) && parseReceipt(doc.as<JsonVariantConst>(), r);
    const char *reason = parsed ? verifyReceipt(r, v.sig, VECTOR_PUBLIC_KEY, v.device, v.now, true,
      [&](const String &) { return v.seen; }) : "signature";
    check(v.name, String(reason ? reason : "ok") == v.expect);
    if (String(v.name) == "valid") valid = r;
  }
  const auto &v = RECEIPT_VECTORS[0];
  auto unseen = [](const String &) { return false; };
  check("clock_not_synced", String(verifyReceipt(valid, v.sig, VECTOR_PUBLIC_KEY, v.device, v.now, false, unseen)) == "clock");
  check("missing_public_key", String(verifyReceipt(valid, v.sig, "", v.device, v.now, true, unseen)) == "signature");
  check("truncated_signature", String(verifyReceipt(valid, "bad", VECTOR_PUBLIC_KEY, v.device, v.now, true, unseen)) == "signature");
  check("ack_matches_node_hmac", acknowledgementMac("test-device-secret", valid, v.now) == VECTOR_ACK_MAC);
  JsonDocument malformed;
  deserializeJson(malformed, v.json);
  malformed["amount"] = 100000000;
  Receipt r;
  check("numeric_amount_rejected", !parseReceipt(malformed.as<JsonVariantConst>(), r));
  malformed["amount"] = "100000000"; malformed["notBefore"] = 1789000000.5;
  check("fractional_timestamp_rejected", !parseReceipt(malformed.as<JsonVariantConst>(), r));
  malformed["notBefore"] = valid.notBefore; malformed["sessionId"] = "s|injected";
  check("delimiter_injection_rejected", !parseReceipt(malformed.as<JsonVariantConst>(), r));

  RelayLease lease;
  const uint32_t start = UINT32_MAX - 1000;
  check("lease_starts", lease.begin(valid, v.now, start));
  check("lease_cannot_be_overwritten", !lease.begin(valid, v.now, start));
  check("millis_wrap_before_deadline", !lease.expired(v.now, start + 499999U));
  check("networkless_monotonic_expiry", lease.expired(v.now - 3600, start + 500000U));
  check("wall_clock_forward_expires", lease.expired(valid.expiresAt, start));
  Receipt later = valid; later.sessionId = "renewal"; later.expiresAt = valid.expiresAt + 60;
  check("renewal_rejects_not_later", !lease.extend(valid, v.now, start));
  check("renewal_extends_deadline", lease.extend(later, v.now, start) && lease.expiresAt == later.expiresAt);
  check("renewal_cancel_matches_both", lease.owns("renewal") && lease.owns(valid.sessionId) && !lease.owns("other"));
  lease.stop();
  check("cancel_stops_lease", !lease.active);
  check("renewal_needs_active_lease", !lease.extend(later, v.now, start));
  check("no_relay_time_inside_late_skew", !lease.begin(valid, valid.expiresAt + 20, 0));

  // Dedicated NVS namespace; never erase or fill production replay history.
  Preferences cleanup;
  bool storageOk = cleanup.begin("am-selftest", false);
  if (storageOk) storageOk = cleanup.clear();
  cleanup.end();
  {
    ReplayStore first;
    storageOk = storageOk && first.begin("am-selftest") && first.remember(valid.nonce);
    check("nonce_persisted_before_actuation", storageOk && first.contains(valid.nonce));
    check("duplicate_nonce_rejected", storageOk && !first.remember(valid.nonce));
  }
  {
    ReplayStore rebooted;
    check("replay_survives_store_reopen", storageOk && rebooted.begin("am-selftest") && rebooted.contains(valid.nonce));
  }
  Serial.printf("[selftest] RESULT %u/%u passed; relay OFF\n", total - failed, total);
}
