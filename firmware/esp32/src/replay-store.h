#pragma once
#include <Preferences.h>
#include "receipt.h"

// One atomic NVS blob persists the last 32 nonces across reset/power loss.
// A receipt is never acknowledged or acted on unless its nonce was persisted.
class ReplayStore {
  struct Record { uint32_t next = 0; char nonces[32][33] = {}; } record;
  Preferences storage;
  bool ready = false;
public:
  bool begin(const char *name = "am-receipts") {
    if (!storage.begin(name, false)) return false;
    const size_t stored = storage.getBytesLength("ring");
    if (stored && (stored != sizeof record || storage.getBytes("ring", &record, sizeof record) != sizeof record)) return false;
    if (record.next >= 32) return false;
    for (const auto &nonce : record.nonces) {
      if (nonce[32] != 0 || (nonce[0] && !receiptNonce(String(nonce)))) return false;
    }
    return ready = true;
  }
  bool contains(const String &nonce) const {
    for (const auto &stored : record.nonces) if (nonce == stored) return true;
    return false;
  }
  bool remember(const String &nonce) {
    if (!ready || contains(nonce) || !receiptNonce(nonce)) return false;
    Record updated = record;
    nonce.toCharArray(updated.nonces[updated.next], 33);
    updated.next = (updated.next + 1) % 32;
    if (storage.putBytes("ring", &updated, sizeof updated) != sizeof updated) { ready = false; return false; }
    record = updated;
    return true;
  }
};
