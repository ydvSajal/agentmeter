"""Refresh the public GTS Root R4 trust anchor from Google's HTTPS repository."""
import json
import ssl
import urllib.request
from pathlib import Path

url = "https://pki.goog/repo/certs/gtsr4.pem"
pem = urllib.request.urlopen(url, timeout=20).read().decode("ascii")
if not pem.startswith("-----BEGIN CERTIFICATE-----"):
    raise ValueError("Expected a PEM certificate")
ssl.PEM_cert_to_DER_cert(pem)
target = Path(__file__).resolve().parent.parent / "src" / "gateway-ca.h"
target.write_text(
    "#pragma once\n// Google Trust Services Root R4. Public trust anchor for Render's observed WE1 chain.\n"
    "// Source: " + url + "\nstatic const char GATEWAY_ROOT_CA[] = " + json.dumps(pem) + ";\n",
    encoding="utf-8",
)
print("Saved public GTS Root R4 trust anchor")
