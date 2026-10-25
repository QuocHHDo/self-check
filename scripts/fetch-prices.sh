#!/usr/bin/env bash
# Downloads the free price sources into $1 (BLS Average Price + CPI food files) and refreshes the USDA ERS
# fruit/vegetable CSVs in data/prices/. BLS asks automated downloads to identify themselves with contact info.
set -euo pipefail
out="${1:?usage: scripts/fetch-prices.sh <dir>}"
mkdir -p "$out"
UA="self-check price refresh (https://github.com/QuocHHDo/self-check; QuocHHDo@users.noreply.github.com)"
get() { # url file — fails loudly with the HTTP status
  code=$(curl -sS -A "$UA" -o "$2" -w "%{http_code}" "$1") || true
  echo "$code $1"
  [ "$code" = "200" ] || { echo "::error::download failed ($code): $1"; head -c 300 "$2" 2>/dev/null; exit 1; }
}
for f in ap.item ap.series ap.data.3.Food; do get "https://download.bls.gov/pub/time.series/ap/$f" "$out/$f"; done
get "https://download.bls.gov/pub/time.series/cu/cu.data.11.USFoodBeverage" "$out/cu.data.11.USFoodBeverage"
# ERS links carry a version query (?v=…), so read them from the data page instead of hard-coding.
page=$(curl -sSL -A "$UA" "https://www.ers.usda.gov/data-products/fruit-and-vegetable-prices" || true)
for kind in fruits vegetables; do
  link=$(printf '%s' "$page" | grep -oiE "href=\"[^\"]*all-${kind}-average-prices-csv-format[^\"]*\"" | head -1 | sed 's/href="//;s/"$//')
  [ -z "$link" ] && { echo "ERS ${kind} CSV link not found; keeping the committed copy"; continue; }
  case "$link" in http*) url="$link";; *) url="https://www.ers.usda.gov$link";; esac
  name=$([ "$kind" = fruits ] && echo ers-fruit-prices.csv || echo ers-vegetable-prices.csv)
  get "$url" "data/prices/$name"
done
ls -la "$out" data/prices
