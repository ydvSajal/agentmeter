"""Generate firmware tests directly from the shared Node contract vector (no private key embedded)."""
import hashlib
import hmac
import json
from pathlib import Path

Import("env")
project = Path(env.subst("$PROJECT_DIR"))
source = project.parent.parent / "packages" / "shared" / "test-vectors" / "receipt.json"
vectors = json.loads(source.read_text(encoding="utf-8"))
out = project / ".pio" / "generated"
out.mkdir(parents=True, exist_ok=True)
lines = ["#pragma once", "struct ReceiptVector { const char *name, *json, *sig, *device; int64_t now; bool seen; const char *expect; };",
         "static const char *VECTOR_PUBLIC_KEY = " + json.dumps(vectors["publicKeyBase64"]) + ";",
         "static const ReceiptVector RECEIPT_VECTORS[] = {"]
for case in vectors["cases"]:
    _, device, session, nonce, start, expiry, amount, payer = case["canonical"].split("|")
    receipt = dict(deviceId=device, sessionId=session, nonce=nonce, notBefore=int(start), expiresAt=int(expiry), amount=amount, payer=payer)
    values = [json.dumps(case["name"]), json.dumps(json.dumps(receipt, separators=(",", ":"))),
              json.dumps(case["sigBase64"]), json.dumps(case["deviceId"]), str(case["now"]),
              "true" if case["usedNonces"] else "false", json.dumps(case["expect"])]
    lines.append("  {" + ", ".join(values) + "},")
lines.append("};")
message = "s_0001|00112233445566778899aabbccddeeff|1789000100"
mac = hmac.new(b"test-device-secret", message.encode(), hashlib.sha256).hexdigest()
lines.append("static const char *VECTOR_ACK_MAC = " + json.dumps(mac) + ";")
content = "\n".join(lines) + "\n"
target = out / "receipt-vectors.h"
if not target.exists() or target.read_text(encoding="utf-8") != content:
    target.write_text(content, encoding="utf-8")
env.Append(CPPPATH=[str(out)])
