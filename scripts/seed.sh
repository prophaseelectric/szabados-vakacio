#!/usr/bin/env bash
# Seeds the three stops from the iCloud calendar into a deployed site.
# Usage: scripts/seed.sh https://<your-site>.azurestaticapps.net
set -euo pipefail
BASE="${1:?site url}"
curl -sS -X POST "$BASE/api/plan/mutate" -H "Content-Type: application/json" -d '[
  {"op":"add","collection":"items","data":{"title":"SeaWorld / Legoland","day":"2026-10-27","order":0,"emoji":"🐬","in":[],"by":"Gordon"}},
  {"op":"add","collection":"items","data":{"title":"La Jolla / Annie'"'"'s Canyon","day":"2026-10-29","order":0,"emoji":"🌊","in":[],"by":"Gordon"}},
  {"op":"add","collection":"items","data":{"title":"Seaport Village / Coronado Island","day":"2026-10-31","order":0,"emoji":"⛵","in":[],"by":"Gordon"}}
]' | head -c 400; echo
