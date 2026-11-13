#!/usr/bin/env bash
# Creates the free, self-signed code-signing certificate used to sign Clippo releases, and prints
# the two values to store as GitHub Actions secrets. Run it once; keep the .p12 somewhere safe.
# Reusing the same certificate for every release is the whole point: a new certificate means
# users have to re-grant Accessibility one more time.
#
# Usage: scripts/mac/create-signing-cert.sh [output-dir]
set -euo pipefail

NAME="Clippo Code Signing"
OUT=${1:-./clippo-signing}
mkdir -p "$OUT"
PASSWORD=$(openssl rand -base64 24)

cat > "$OUT/cert.cnf" <<CNF
[req]
distinguished_name = dn
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
CNF

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout "$OUT/key.pem" -out "$OUT/cert.pem" -config "$OUT/cert.cnf" -extensions ext

# Legacy PBE algorithms so the macOS `security` tool can import the bundle on every macOS version.
openssl pkcs12 -export -inkey "$OUT/key.pem" -in "$OUT/cert.pem" -name "$NAME" \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 \
  -passout "pass:$PASSWORD" -out "$OUT/clippo-signing.p12"
rm "$OUT/key.pem"

echo
echo "Created $OUT/clippo-signing.p12 (identity: \"$NAME\")."
echo "Add these two repository secrets (Settings > Secrets and variables > Actions):"
echo
echo "MAC_SIGNING_CERT_P12:"
base64 < "$OUT/clippo-signing.p12" | tr -d '\n'
echo
echo
echo "MAC_SIGNING_CERT_PASSWORD:"
echo "$PASSWORD"
echo
echo "Or with the GitHub CLI:"
echo "  base64 < $OUT/clippo-signing.p12 | tr -d '\\n' | gh secret set MAC_SIGNING_CERT_P12"
echo "  gh secret set MAC_SIGNING_CERT_PASSWORD --body '$PASSWORD'"
