#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Ed25519.h>
#include <mbedtls/base64.h>
#include <mbedtls/md.h>

struct Receipt {
  String deviceId, sessionId, nonce, amount, payer;
  int64_t notBefore = 0, expiresAt = 0;
  String canonical() const {
    return String("AMv1|") + deviceId + "|" + sessionId + "|" + nonce + "|" +
      String((long long)notBefore) + "|" + String((long long)expiresAt) + "|" + amount + "|" + payer;
  }
};

inline bool receiptId(const String &s) {
  if (s.isEmpty() || s.length() > 64) return false;
  for (char c : s) if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9') || c == '_' || c == '-')) return false;
  return true;
}
inline bool decimalDigits(const String &s) {
  if (s.isEmpty()) return false;
  for (char c : s) if (c < '0' || c > '9') return false;
  return true;
}
inline bool receiptNonce(const String &s) {
  if (s.length() != 32) return false;
  for (char c : s) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
  return true;
}
inline bool parseReceipt(JsonVariantConst value, Receipt &r) {
  if (!value.is<JsonObjectConst>()) return false;
  for (const char *key : {"deviceId", "sessionId", "nonce", "amount", "payer"})
    if (!value[key].is<const char *>()) return false;
  if (!value["notBefore"].is<int64_t>() || !value["expiresAt"].is<int64_t>()) return false;
  r.deviceId = value["deviceId"].as<String>(); r.sessionId = value["sessionId"].as<String>();
  r.nonce = value["nonce"].as<String>(); r.amount = value["amount"].as<String>();
  r.payer = value["payer"].as<String>();
  r.notBefore = value["notBefore"].as<int64_t>(); r.expiresAt = value["expiresAt"].as<int64_t>();
  return receiptId(r.deviceId) && receiptId(r.sessionId) && receiptNonce(r.nonce) &&
    decimalDigits(r.amount) && r.payer.startsWith("0.0.") && decimalDigits(r.payer.substring(4)) &&
    r.notBefore >= 0 && r.expiresAt > r.notBefore && r.expiresAt <= 9007199254740991LL;
}
inline bool decodeBase64(const String &text, uint8_t *out, size_t expected) {
  if (text.length() != 4 * ((expected + 2) / 3)) return false;
  size_t size = 0;
  return mbedtls_base64_decode(out, expected, &size,
    reinterpret_cast<const uint8_t *>(text.c_str()), text.length()) == 0 && size == expected;
}

// Same rejection order and 30-second skew as packages/shared/src/receipt.ts.
template<class Seen>
const char *verifyReceipt(const Receipt &r, const String &signature, const String &publicKey,
    const String &ownDevice, int64_t now, bool clockSynced, Seen seen) {
  if (!clockSynced) return "clock";
  uint8_t pub[32], sig[64];
  if (!decodeBase64(publicKey, pub, sizeof pub) || !decodeBase64(signature, sig, sizeof sig)) return "signature";
  const String canonical = r.canonical();
  if (!Ed25519::verify(sig, pub, canonical.c_str(), canonical.length())) return "signature";
  if (r.deviceId != ownDevice) return "device";
  if (now < r.notBefore - 30) return "not_yet_valid";
  if (now > r.expiresAt + 30) return "expired";
  if (seen(r.nonce)) return "replay";
  return nullptr;
}
inline String acknowledgementMac(const String &secret, const Receipt &r, int64_t ts) {
  const String input = r.sessionId + "|" + r.nonce + "|" + String((long long)ts);
  uint8_t digest[32];
  const auto *md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!md || mbedtls_md_hmac(md, reinterpret_cast<const uint8_t *>(secret.c_str()), secret.length(),
      reinterpret_cast<const uint8_t *>(input.c_str()), input.length(), digest) != 0) return "";
  const char hex[] = "0123456789abcdef";
  char result[65];
  for (size_t i = 0; i < sizeof digest; ++i) { result[i * 2] = hex[digest[i] >> 4]; result[i * 2 + 1] = hex[digest[i] & 15]; }
  result[64] = 0;
  return result;
}

// Monotonic deadline: network loss and backwards wall-clock adjustments cannot
// extend a rental. A forward correction to the wall clock can only end it sooner.
struct RelayLease {
  bool active = false;
  String sessionId;
  uint32_t startedMs = 0;
  uint32_t durationMs = 0;
  int64_t expiresAt = 0;
  bool begin(const Receipt &r, int64_t now, uint32_t tick) {
    const int64_t remaining = r.expiresAt - now;
    // Gateway API caps a rental at 240 minutes; leave room for the skew window.
    if (active || remaining <= 0 || remaining > 14430) return false;
    active = true; sessionId = r.sessionId; startedMs = tick;
    durationMs = static_cast<uint32_t>(remaining * 1000); expiresAt = r.expiresAt;
    return true;
  }
  bool expired(int64_t now, uint32_t tick) const {
    return active && (now >= expiresAt || static_cast<uint32_t>(tick - startedMs) >= durationMs);
  }
  void stop() { active = false; sessionId = ""; }
};
