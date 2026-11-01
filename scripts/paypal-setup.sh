#!/usr/bin/env bash
set -Eeuo pipefail
{
cd "$(dirname "$(readlink -f "$0")")/.."
ENV_FILE=".env"
[[ -f "$ENV_FILE" ]] || { echo "✗ .env not found in $(pwd)" >&2; exit 1; }
command -v jq >/dev/null || { echo "✗ jq is required (apt-get install -y jq)" >&2; exit 1; }

get() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
put() {
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"; fi
}

CLIENT_ID="$(get PAYPAL_CLIENT_ID)"
SECRET="$(get PAYPAL_CLIENT_SECRET)"
MODE="$(get PAYPAL_MODE)"; MODE="${MODE:-live}"
DOMAIN_URL="$(get APP_URL)"
PRO_PRICE="$(get PRO_PRICE_USD)"; PRO_PRICE="${PRO_PRICE:-1.99}"
PREMIUM_PRICE="$(get PREMIUM_PRICE_USD)"; PREMIUM_PRICE="${PREMIUM_PRICE:-5.00}"
[[ -n "$CLIENT_ID" && -n "$SECRET" ]] || { echo "✗ Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env first" >&2; exit 1; }
[[ "$DOMAIN_URL" == https://* ]] || { echo "✗ APP_URL must be https:// (PayPal webhooks require HTTPS). Current: $DOMAIN_URL" >&2; exit 1; }

if [[ "$MODE" == "live" ]]; then API="https://api-m.paypal.com"; else API="https://api-m.sandbox.paypal.com"; fi
echo "▸ PayPal mode: $MODE"

TOKEN="$(curl -fsS "$API/v1/oauth2/token" -u "$CLIENT_ID:$SECRET" -d grant_type=client_credentials | jq -r .access_token)" \
  || { echo "✗ PayPal authentication failed — check Client ID / Secret and PAYPAL_MODE ($MODE)" >&2; exit 1; }
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || { echo "✗ PayPal authentication failed" >&2; exit 1; }
echo "  ✓ Authenticated"

call() {
  local method="$1" path="$2" body="${3:-}"
  local out code
  out="$(mktemp)"
  code="$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "$API$path" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Prefer: return=representation" ${body:+-d "$body"})"
  if [[ "$code" -ge 300 ]]; then
    echo "✗ PayPal $method $path → HTTP $code" >&2
    jq -r '.message // .name // .' "$out" >&2 || cat "$out" >&2
    jq -r '.details[]? | "  - \(.issue): \(.description // "")"' "$out" >&2 || true
    rm -f "$out"
    exit 1
  fi
  cat "$out"
  rm -f "$out"
}

PRODUCT_ID="$(get PAYPAL_PRODUCT_ID)"
if [[ -z "$PRODUCT_ID" ]]; then
  PRODUCT_ID="$(call POST /v1/catalogs/products '{"name":"OBSYDIA AI","description":"OBSYDIA AI subscription","type":"SERVICE","category":"SOFTWARE"}' | jq -r .id)"
  put PAYPAL_PRODUCT_ID "$PRODUCT_ID"
fi
echo "  ✓ Product: $PRODUCT_ID"

make_plan() {
  local name="$1" price="$2"
  local body
  body="$(jq -nc --arg pid "$PRODUCT_ID" --arg name "$name" --arg price "$price" '{
    product_id: $pid,
    name: $name,
    description: ($name + " — monthly"),
    status: "ACTIVE",
    billing_cycles: [
      { frequency: { interval_unit: "MONTH", interval_count: 1 }, tenure_type: "TRIAL", sequence: 1, total_cycles: 1,
        pricing_scheme: { fixed_price: { value: $price, currency_code: "USD" } } },
      { frequency: { interval_unit: "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 2, total_cycles: 0,
        pricing_scheme: { fixed_price: { value: $price, currency_code: "USD" } } }
    ],
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: "CANCEL", payment_failure_threshold: 2 }
  }')"
  call POST /v1/billing/plans "$body" | jq -r .id
}

PRO_ID="$(get PAYPAL_PLAN_ID_PRO)"
if [[ -z "$PRO_ID" ]]; then PRO_ID="$(make_plan "OBSYDIA AI Pro" "$PRO_PRICE")"; put PAYPAL_PLAN_ID_PRO "$PRO_ID"; fi
echo "  ✓ Pro plan (\$$PRO_PRICE/month): $PRO_ID"

PREMIUM_ID="$(get PAYPAL_PLAN_ID_PREMIUM)"
if [[ -z "$PREMIUM_ID" ]]; then PREMIUM_ID="$(make_plan "OBSYDIA AI Premium" "$PREMIUM_PRICE")"; put PAYPAL_PLAN_ID_PREMIUM "$PREMIUM_ID"; fi
echo "  ✓ Premium plan (\$$PREMIUM_PRICE/month): $PREMIUM_ID"

HOOK_URL="${DOMAIN_URL%/}/api/webhooks/paypal"
HOOK_ID="$(get PAYPAL_WEBHOOK_ID)"
if [[ -z "$HOOK_ID" ]]; then
  HOOK_ID="$(call GET /v1/notifications/webhooks | jq -r --arg u "$HOOK_URL" '.webhooks[]? | select(.url == $u) | .id' | head -n1)"
fi
if [[ -z "$HOOK_ID" ]]; then
  BODY="$(jq -nc --arg u "$HOOK_URL" '{url: $u, event_types: ([
    "BILLING.SUBSCRIPTION.ACTIVATED","BILLING.SUBSCRIPTION.UPDATED","BILLING.SUBSCRIPTION.RE-ACTIVATED",
    "BILLING.SUBSCRIPTION.SUSPENDED","BILLING.SUBSCRIPTION.CANCELLED","BILLING.SUBSCRIPTION.EXPIRED",
    "BILLING.SUBSCRIPTION.PAYMENT.FAILED","PAYMENT.SALE.COMPLETED","PAYMENT.SALE.REFUNDED"
  ] | map({name: .}))}')"
  HOOK_ID="$(call POST /v1/notifications/webhooks "$BODY" | jq -r .id)"
fi
put PAYPAL_WEBHOOK_ID "$HOOK_ID"
echo "  ✓ Webhook → $HOOK_URL ($HOOK_ID)"

put PAYPAL_MODE "$MODE"
chmod 600 "$ENV_FILE"

echo "▸ Restarting OBSYDIA AI"
docker compose up -d --force-recreate app >/dev/null
for i in $(seq 1 40); do
  if docker compose exec -T app node </dev/null -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo "✓ PayPal is configured and OBSYDIA AI is running"
    exit 0
  fi
  sleep 3
done
echo "✗ The application did not become healthy — check: docker compose logs --tail=60 app" >&2
exit 1
}
