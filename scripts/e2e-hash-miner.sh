#!/usr/bin/env bash
set -euo pipefail

# e2e-hash-miner.sh
# End-to-end test for the push-based hash-miner job.
# - Uploads the example miner program to MinIO via presign API
# - Dispatches a job to a chosen worker with entryCommand
# - Waits for completion and verifies the solution

BASE_URL=${CONTROLLER_HTTP:-http://localhost:3000}
ORG_ID=${ORG_ID:-org-1}
JOB_TYPE=${JOB_TYPE:-hash_mining}
VERIFICATION=${VERIFICATION:-BUILTIN_HASH}
SEED=${SEED:-hello-oursgpu}
DIFFICULTY=${DIFFICULTY:-24}
OBJECT_KEY=${OBJECT_KEY:-programs/hash-miner-$(date +%s).js}
PROGRAM_PATH=${PROGRAM_PATH:-./ours-gpu/examples/hash-miner.js}
TIMEOUT_SECS=${TIMEOUT_SECS:-60}
SLEEP_SECS=${SLEEP_SECS:-2}
WORKER_ID=${WORKER_ID:-}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }
}

wait_http() {
  local url=$1; local deadline=$((SECONDS + ${2:-60}))
  while (( SECONDS < deadline )); do
    if curl -fsS "$url" >/dev/null; then return 0; fi
    sleep 1
  done
  echo "Timeout waiting for $url" >&2
  return 1
}

json() { jq -n "$@"; }

main() {
  require_cmd curl
  require_cmd jq

  echo "[1/7] Waiting for controller at $BASE_URL ..."
  wait_http "$BASE_URL/workers" 120

  if [[ -z "$WORKER_ID" ]]; then
    echo "[2/7] Selecting a worker ..."
    WORKER_ID=$(curl -fsS "$BASE_URL/workers" | jq -r '.[0].id // empty') || true
    if [[ -z "$WORKER_ID" ]]; then
      echo "No workers registered yet. Please start a worker and retry." >&2
      exit 1
    fi
  fi
  echo "Using worker: $WORKER_ID"

  echo "[3/7] Presigning upload for $OBJECT_KEY ..."
  PRESIGN=$(curl -fsS -H 'Content-Type: application/json' \
    -d "$(json --arg objectKey "$OBJECT_KEY" '{objectKey:$objectKey}')" \
    "$BASE_URL/jobs/presign")
  PUT_URL=$(printf '%s' "$PRESIGN" | jq -r .url)
  if [[ -z "$PUT_URL" || "$PUT_URL" == null ]]; then
    echo "Failed to get presigned URL" >&2
    echo "$PRESIGN" >&2
    exit 1
  fi

  echo "[4/7] Uploading program $PROGRAM_PATH ..."
  curl -fsS -X PUT --data-binary @"$PROGRAM_PATH" "$PUT_URL" >/dev/null

  echo "[5/7] Dispatching job ..."
  ENTRY_CMD=$(printf 'SEED=%s DIFFICULTY=%s node "$PAYLOAD_PATH"' "$SEED" "$DIFFICULTY")
  DISPATCH=$(json \
    --arg orgId "$ORG_ID" \
    --arg jobType "$JOB_TYPE" \
    --arg objectKey "$OBJECT_KEY" \
    --arg verification "$VERIFICATION" \
    --arg entryCommand "$ENTRY_CMD" \
    --arg workerId "$WORKER_ID" \
    '{orgId:$orgId, jobType:$jobType, objectKey:$objectKey, verification:$verification, entryCommand:$entryCommand, workerId:$workerId}')
  RESP=$(curl -fsS -H 'Content-Type: application/json' -d "$DISPATCH" "$BASE_URL/workers/$WORKER_ID/jobs")
  JOB_ID=$(printf '%s' "$RESP" | jq -r .id)
  if [[ -z "$JOB_ID" || "$JOB_ID" == null ]]; then
    echo "Failed to dispatch job" >&2
    echo "$RESP" >&2
    exit 1
  fi
  echo "Dispatched job: $JOB_ID"

  echo "[6/7] Waiting for job completion (timeout ${TIMEOUT_SECS}s) ..."
  DEADLINE=$((SECONDS + TIMEOUT_SECS))
  STATUS=""
  SOLUTION=""
  METRICS=""
  while (( SECONDS < DEADLINE )); do
    JOB_JSON=$(curl -fsS "$BASE_URL/workers/$WORKER_ID/jobs" | jq -c --arg id "$JOB_ID" '.[] | select(.jobId==$id)') || true
    if [[ -n "$JOB_JSON" ]]; then
      STATUS=$(printf '%s' "$JOB_JSON" | jq -r '.status')
      SOLUTION=$(printf '%s' "$JOB_JSON" | jq -r '.solution // ""')
      METRICS=$(printf '%s' "$JOB_JSON" | jq -r '.metricsJson // "{}"')
      if [[ "$STATUS" == "DONE" || "$STATUS" == "FAILED" ]]; then
        break
      fi
    fi
    sleep "$SLEEP_SECS"
  done

  if [[ "$STATUS" != "DONE" ]]; then
    echo "Job not completed successfully. status=$STATUS" >&2
    echo "Metrics: $METRICS" >&2
    exit 2
  fi

  echo "[7/7] Verifying solution ..."
  NONCE=$(printf '%s' "$SOLUTION" | awk '{print $1}')
  HASH=$(printf '%s' "$SOLUTION" | awk '{print $2}')
  MS=$(printf '%s' "$SOLUTION" | awk '{print $3}')
  if [[ -z "$NONCE" || -z "$HASH" ]]; then
    echo "Unexpected solution format: '$SOLUTION'" >&2
    exit 3
  fi

  # Verify hash and difficulty using Node
  node <<'NODE'
const crypto = require('crypto');
const seed = process.env.SEED;
const nonce = process.env.NONCE;
const expected = process.env.HASH;
const diff = Number(process.env.DIFFICULTY || '20');
function lzBits(hex){
  let bits = 0;
  for (let i = 0; i < hex.length; i++) {
    const n = parseInt(hex[i], 16);
    if (n === 0) { bits += 4; continue; }
    if (n < 2) bits += 3; else if (n < 4) bits += 2; else if (n < 8) bits += 1;
    break;
  }
  return bits;
}
const got = crypto.createHash('sha256').update(String(seed)+String(nonce)).digest('hex');
if (got !== expected) { console.error('Hash mismatch', {got, expected}); process.exit(4); }
const lb = lzBits(got);
if (lb < diff) { console.error('Difficulty not met', {lb, diff}); process.exit(5); }
console.log('OK hash and difficulty met:', {lb, diff});
NODE

  echo "Success!"
  echo "JobId:    $JOB_ID"
  echo "WorkerId: $WORKER_ID"
  echo "Seed:     $SEED"
  echo "Difficulty: $DIFFICULTY"
  echo "Solution: $SOLUTION"
  echo "Metrics:  $METRICS"
}

export SEED DIFFICULTY HASH NONCE
main "$@"
