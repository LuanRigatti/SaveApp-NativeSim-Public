# shellcheck shell=bash
# Narrow SaveApp capture glue. Recovery, validation, decryption, and export stay
# in the shared Emporio OSLog collector.

saveapp_capture_configure() {
  SAVEAPP_CAPTURE_FILTER_MODE='subsystem'
  SAVEAPP_CAPTURE_SUBSYSTEMS_JSON='[{"match":"prefix","value":"com.luanrigatti.saveapp"}]'
  SAVEAPP_CAPTURE_PREDICATE='subsystem BEGINSWITH "com.luanrigatti.saveapp"'
}

saveapp_capture_preflight() {
  if [ "${SAVEAPP_OSLOG_CAPTURE_ENABLED:-false}" != 'true' ]; then
    echo '::error::SaveApp OSLog capture is not enabled'
    return 1
  fi
  if [ -z "${SAVEAPP_LOG_AGE_RECIPIENT:-}" ] || [[ "$SAVEAPP_LOG_AGE_RECIPIENT" =~ [[:space:]] ]]; then
    echo '::error::SaveApp OSLog capture recipient is missing or malformed'
    return 1
  fi
  if ! command -v age >/dev/null 2>&1; then
    echo '::error::age is unavailable on the NativeSim runner'
    return 1
  fi

  local probe
  probe=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/saveapp-age-probe.XXXXXX") || return 1
  if ! printf 'saveapp-oslog-recipient-preflight' \
    | age -r "$SAVEAPP_LOG_AGE_RECIPIENT" -o "$probe" >/dev/null 2>&1; then
    rm -f "$probe"
    echo '::error::The configured SaveApp OSLog recipient is invalid or unsupported'
    return 1
  fi
  if [ ! -s "$probe" ]; then
    rm -f "$probe"
    echo '::error::SaveApp OSLog encryption preflight produced no ciphertext'
    return 1
  fi
  rm -f "$probe"
}

saveapp_capture_prepare_paths() {
  local capture_root="${RUNNER_TEMP:?}/saveapp-native-sim-oslog-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
  SAVEAPP_CAPTURE_RAW="$capture_root/saveapp-native-sim-oslog.log"
  SAVEAPP_CAPTURE_STDERR="$capture_root/log-stream.stderr"
  SAVEAPP_CAPTURE_ARTIFACT_DIR="${NATIVE_SIM_CAPTURE_ARTIFACT_DIR:-${GITHUB_WORKSPACE:?}/build/saveapp-native-sim-oslogs}"
  SAVEAPP_CAPTURE_FILE="$SAVEAPP_CAPTURE_ARTIFACT_DIR/native-sim-oslog.age"
  SAVEAPP_CAPTURE_MANIFEST="$SAVEAPP_CAPTURE_ARTIFACT_DIR/manifest.json"
  mkdir -p "$capture_root" "$SAVEAPP_CAPTURE_ARTIFACT_DIR"
  rm -f "$SAVEAPP_CAPTURE_RAW" "$SAVEAPP_CAPTURE_STDERR" \
    "$SAVEAPP_CAPTURE_FILE" "$SAVEAPP_CAPTURE_MANIFEST"
}

saveapp_capture_start() {
  saveapp_capture_configure
  if [ -z "${UDID:-}" ] || ! xcrun simctl list devices booted 2>/dev/null | grep -Fq "$UDID"; then
    echo '::error::The configured NativeSim device is not booted; SaveApp OSLog capture was not started'
    return 1
  fi
  saveapp_capture_prepare_paths || return 1

  nohup xcrun simctl spawn "$UDID" log stream \
    --style compact \
    --level debug \
    --predicate "$SAVEAPP_CAPTURE_PREDICATE" \
    </dev/null >"$SAVEAPP_CAPTURE_RAW" 2>"$SAVEAPP_CAPTURE_STDERR" &
  SAVEAPP_LOG_STREAM_PID=$!
  disown "$SAVEAPP_LOG_STREAM_PID" 2>/dev/null || true

  for _ in $(seq 1 12); do
    if ! kill -0 "$SAVEAPP_LOG_STREAM_PID" 2>/dev/null; then
      wait "$SAVEAPP_LOG_STREAM_PID" 2>/dev/null || true
      rm -f "$SAVEAPP_CAPTURE_RAW" "$SAVEAPP_CAPTURE_STDERR"
      echo '::error::simctl log stream exited before SaveApp OSLog capture became active'
      return 1
    fi
    sleep 0.25
  done

  SAVEAPP_CAPTURE_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  {
    echo "pid=$SAVEAPP_LOG_STREAM_PID"
    echo "raw=$SAVEAPP_CAPTURE_RAW"
    echo "stderr=$SAVEAPP_CAPTURE_STDERR"
    echo "started_at=$SAVEAPP_CAPTURE_STARTED_AT"
    echo "filter_mode=$SAVEAPP_CAPTURE_FILTER_MODE"
    echo 'categories=[]'
    echo "subsystems=$SAVEAPP_CAPTURE_SUBSYSTEMS_JSON"
    echo "predicate=$SAVEAPP_CAPTURE_PREDICATE"
    echo "capture_file=$SAVEAPP_CAPTURE_FILE"
    echo "manifest=$SAVEAPP_CAPTURE_MANIFEST"
  } >> "$GITHUB_OUTPUT"
  echo 'SaveApp OSLog capture started for the app-owned subsystem.'
}

saveapp_capture_wait_for_probe() {
  local expected_event='event=home.catalog.initialize_started'
  local max_wait_seconds=30

  if [[ ! "${SAVEAPP_LOG_STREAM_PID:-}" =~ ^[0-9]+$ ]] || [ -z "${SAVEAPP_CAPTURE_RAW:-}" ]; then
    echo '::error::SaveApp OSLog capture probe has no active stream or output file'
    return 1
  fi

  for _ in $(seq 1 "$max_wait_seconds"); do
    if ! kill -0 "$SAVEAPP_LOG_STREAM_PID" 2>/dev/null; then
      echo '::error::SaveApp OSLog stream ended before the app-owned startup probe was captured'
      return 1
    fi
    if [ -s "$SAVEAPP_CAPTURE_RAW" ] && grep -Fq "$expected_event" "$SAVEAPP_CAPTURE_RAW"; then
      echo 'SaveApp OSLog capture received the expected app-owned Home initialization event.'
      return 0
    fi
    sleep 1
  done

  echo '::error::SaveApp OSLog capture did not receive the app-owned Home initialization event within the bounded readiness window'
  return 1
}

saveapp_capture_stop_stream() {
  local pid="${SAVEAPP_LOG_STREAM_PID:-}"
  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    echo '::error::SaveApp OSLog capture has no valid stream process id'
    return 1
  fi

  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 50); do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" 2>/dev/null || true
      return 0
    fi
    sleep 0.1
  done

  echo '::warning::SaveApp OSLog stream did not stop after SIGTERM; requesting SIGKILL'
  kill -KILL "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" 2>/dev/null || true
      return 0
    fi
    sleep 0.1
  done

  echo '::error::SaveApp OSLog stream is still running; refusing to encrypt an incomplete capture'
  return 1
}

saveapp_capture_finish() {
  local outcome="${1:-completed}"
  case "$outcome" in
    completed|graceful-stop|cancelled-partial|hold-failed-partial) ;;
    *) echo '::error::Unsupported SaveApp OSLog capture outcome'; return 1 ;;
  esac

  saveapp_capture_configure
  if ! saveapp_capture_stop_stream; then
    rm -f "${SAVEAPP_CAPTURE_RAW:-}" "${SAVEAPP_CAPTURE_STDERR:-}"
    return 1
  fi
  if [ ! -f "${SAVEAPP_CAPTURE_RAW:-}" ]; then
    echo '::error::SaveApp OSLog raw capture is missing; no artifact was created'
    return 1
  fi

  local event_count finish_at ciphertext_sha256
  event_count=$(awk '!/^[[:space:]]*(Filtering the log data using|Timestamp[[:space:]]+Thread|[-=]{3,})/ && NF { records += 1 } END { print records + 0 }' "$SAVEAPP_CAPTURE_RAW")
  finish_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  if ! age -r "$SAVEAPP_LOG_AGE_RECIPIENT" \
    -o "$SAVEAPP_CAPTURE_FILE" "$SAVEAPP_CAPTURE_RAW" >/dev/null 2>&1; then
    rm -f "$SAVEAPP_CAPTURE_FILE" "$SAVEAPP_CAPTURE_MANIFEST" "$SAVEAPP_CAPTURE_RAW" "$SAVEAPP_CAPTURE_STDERR"
    echo '::error::SaveApp OSLog capture could not be encrypted; no artifact was created'
    return 1
  fi
  if [ ! -s "$SAVEAPP_CAPTURE_FILE" ]; then
    rm -f "$SAVEAPP_CAPTURE_FILE" "$SAVEAPP_CAPTURE_MANIFEST" "$SAVEAPP_CAPTURE_RAW" "$SAVEAPP_CAPTURE_STDERR"
    echo '::error::SaveApp OSLog encryption returned an empty ciphertext'
    return 1
  fi

  if ! ciphertext_sha256=$(python3 -c 'import hashlib, sys; f=open(sys.argv[1], "rb"); h=hashlib.sha256(); [h.update(chunk) for chunk in iter(lambda: f.read(1048576), b"")]; print(h.hexdigest())' "$SAVEAPP_CAPTURE_FILE") \
     || [[ ! "$ciphertext_sha256" =~ ^[0-9a-f]{64}$ ]]; then
    rm -f "$SAVEAPP_CAPTURE_FILE" "$SAVEAPP_CAPTURE_MANIFEST" "$SAVEAPP_CAPTURE_RAW" "$SAVEAPP_CAPTURE_STDERR"
    echo '::error::Could not calculate the SaveApp OSLog ciphertext SHA-256'
    return 1
  fi

  if ! SAVEAPP_CAPTURE_SUBSYSTEMS_JSON="$SAVEAPP_CAPTURE_SUBSYSTEMS_JSON" \
    SAVEAPP_CAPTURE_PREDICATE="$SAVEAPP_CAPTURE_PREDICATE" \
    SAVEAPP_CAPTURE_EVENT_COUNT="$event_count" \
    SAVEAPP_CAPTURE_STARTED_AT="${SAVEAPP_CAPTURE_STARTED_AT:?}" \
    SAVEAPP_CAPTURE_FINISHED_AT="$finish_at" \
    SAVEAPP_CAPTURE_OUTCOME="$outcome" \
    SAVEAPP_CAPTURE_CIPHERTEXT_SHA256="$ciphertext_sha256" \
      python3 - "$SAVEAPP_CAPTURE_MANIFEST" >/dev/null 2>&1 <<'PY'
import json
import os
import sys

manifest = {
    "schema_version": 3,
    "repository": os.environ["GITHUB_REPOSITORY"],
    "run_id": os.environ["GITHUB_RUN_ID"],
    "run_attempt": int(os.environ["GITHUB_RUN_ATTEMPT"]),
    "session": os.environ.get("SESSION_ID", ""),
    "commit": os.environ["GITHUB_SHA"],
    "filter_mode": "subsystem",
    "category": None,
    "categories": [],
    "subsystems": json.loads(os.environ["SAVEAPP_CAPTURE_SUBSYSTEMS_JSON"]),
    "predicate": os.environ["SAVEAPP_CAPTURE_PREDICATE"],
    "stream_level": "debug",
    "started_at_utc": os.environ["SAVEAPP_CAPTURE_STARTED_AT"],
    "finished_at_utc": os.environ["SAVEAPP_CAPTURE_FINISHED_AT"],
    "event_count": int(os.environ["SAVEAPP_CAPTURE_EVENT_COUNT"]),
    "capture_outcome": os.environ["SAVEAPP_CAPTURE_OUTCOME"],
    "ciphertext_sha256": os.environ["SAVEAPP_CAPTURE_CIPHERTEXT_SHA256"],
}
with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as manifest_file:
    json.dump(manifest, manifest_file, ensure_ascii=False, indent=2)
    manifest_file.write("\n")
PY
  then
    rm -f "$SAVEAPP_CAPTURE_FILE" "$SAVEAPP_CAPTURE_MANIFEST" "$SAVEAPP_CAPTURE_RAW" "$SAVEAPP_CAPTURE_STDERR"
    echo '::error::Could not write the SaveApp OSLog manifest; no artifact was created'
    return 1
  fi

  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo 'artifact_ready=true' >> "$GITHUB_OUTPUT"
  fi
  rm -f "$SAVEAPP_CAPTURE_RAW" "$SAVEAPP_CAPTURE_STDERR"
  echo "SaveApp OSLog capture finalized with $event_count records."
  if [ "$event_count" -eq 0 ]; then
    echo '::warning::The encrypted SaveApp capture contains no matching OSLog records.'
  fi
}
