#!/usr/bin/env bash
# نشر جدتنا من الخادم نفسه — يُستدعى عبر مفتاح SSH مقيد (أمر إجباري) من GitHub Actions.
# الأوامر المسموحة فقط:  deploy <sha40>  |  rollback  |  status
# لا يغيّر قاعدة البيانات ولا ينفذ ترحيلات؛ يرفض أي إصدار فيه ترحيل جديد.
# التثبيت والإعداد: infra/deploy/README.md
set -euo pipefail
umask 077

CONFIG=/etc/jdatna/deploy.env
[[ -r "$CONFIG" ]] || { echo "missing $CONFIG" >&2; exit 2; }
# shellcheck source=/dev/null
source "$CONFIG"
: "${REPO_DIR:?}" "${RELEASES_DIR:?}" "${SWITCH_CMD:?}" "${PUBLIC_HEALTH:?}"
BRANCH=${BRANCH:-codex/jdatna-platform}
IMAGE=${IMAGE:-jdatna-application}
VERIFY_CMD=${VERIFY_CMD:-}
STATE_DIR=${STATE_DIR:-/var/lib/jdatna-deploy}
LOG=${LOG:-/var/log/jdatna-deploy.log}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-240}

mkdir -p "$STATE_DIR" "$RELEASES_DIR"
exec > >(tee -a "$LOG") 2>&1
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

exec 8>/run/lock/jdatna-deploy.lock
flock -n 8 || { log "another deploy is running"; exit 3; }

live_version() { curl -fsS --max-time 10 "$PUBLIC_HEALTH" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))'; }

wait_for() {
  local want=$1 deadline=$((SECONDS + HEALTH_TIMEOUT)) got=""
  while ((SECONDS < deadline)); do
    got=$(live_version 2>/dev/null || true)
    [[ "$got" == "$want" ]] && { log "health OK: $got"; return 0; }
    sleep 5
  done
  log "health timeout: wanted $want, got '${got:-none}'"
  return 1
}

switch_to() { log "switch -> $1"; $SWITCH_CMD "$1"; }

backup() {
  local label=$1 before after
  before=$(ls -1t /var/backups/jdatna/jdatna-*.tar.gpg 2>/dev/null | head -1 || true)
  log "backup ($label) start"
  systemctl start jdatna-backup.service
  after=$(ls -1t /var/backups/jdatna/jdatna-*.tar.gpg 2>/dev/null | head -1 || true)
  [[ -n "$after" && "$after" != "$before" ]] || { log "backup ($label) produced no new archive"; return 1; }
  log "backup ($label): $after"
  if [[ -n "$VERIFY_CMD" ]]; then
    log "restore verification ($label)"
    $VERIFY_CMD
  fi
}

guard_up() {
  docker rm -f "jdatna-guard-$1" >/dev/null 2>&1 || true
  docker run -d --name "jdatna-guard-$1" --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --memory 16m --cpus 0.05 --pids-limit 8 \
    --user 10001:10001 --entrypoint sleep "$IMAGE:$1" infinity >/dev/null
  log "image guard up for $1"
}
guard_down() { docker rm -f "jdatna-guard-$1" >/dev/null 2>&1 || true; log "image guard removed for $1"; }

cmd=${SSH_ORIGINAL_COMMAND:-${*:-}}
read -r action arg extra <<<"$cmd" || true
[[ -z "${extra:-}" ]] || { log "rejected command"; exit 2; }

case "$action" in
status)
  log "live: $(live_version || echo unknown)"
  log "previous: $(cat "$STATE_DIR/previous" 2>/dev/null || echo none)"
  ;;

rollback)
  prev=$(cat "$STATE_DIR/previous" 2>/dev/null || true)
  [[ "$prev" =~ ^[0-9a-f]{40}$ ]] || { log "no recorded previous version"; exit 4; }
  docker image inspect "$IMAGE:$prev" >/dev/null || { log "image $IMAGE:$prev is gone"; exit 4; }
  backup pre-rollback
  current=$(live_version)
  switch_to "$IMAGE:$prev"
  wait_for "$prev"
  printf '%s\n' "$current" >"$STATE_DIR/previous"
  log "rolled back to $prev"
  ;;

deploy)
  sha=${arg:-}
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { log "deploy needs a full 40-char commit sha"; exit 2; }
  current=$(live_version)
  [[ "$current" =~ ^[0-9a-f]{40}$ ]] || { log "cannot read live version"; exit 4; }
  [[ "$current" != "$sha" ]] || { log "already live: $sha"; exit 0; }

  log "fetch $BRANCH"
  git -C "$REPO_DIR" fetch --quiet origin "$BRANCH"
  git -C "$REPO_DIR" merge-base --is-ancestor "$sha" "origin/$BRANCH" \
    || { log "$sha is not on $BRANCH"; exit 4; }
  if git -C "$REPO_DIR" cat-file -e "$current^{commit}" 2>/dev/null; then
    if [[ -n "$(git -C "$REPO_DIR" diff --name-only "$current" "$sha" -- migrations)" ]]; then
      log "refused: new migrations since $current — deploy manually with the migrator role"
      exit 5
    fi
  else
    log "refused: live commit $current not found in $REPO_DIR"; exit 5
  fi

  backup pre-deploy

  dir="$RELEASES_DIR/$sha"
  rm -rf -- "$dir.partial"; mkdir -p "$dir.partial"
  git -C "$REPO_DIR" archive "$sha" | tar -x -C "$dir.partial"
  rm -rf -- "$dir"; mv "$dir.partial" "$dir"
  log "source exported to $dir"

  log "build $IMAGE:$sha"
  docker build --pull=false --build-arg SOURCE_COMMIT="$sha" -t "$IMAGE:$sha" "$dir"
  docker image inspect "$IMAGE:$sha" >/dev/null
  docker image inspect "$IMAGE:$current" >/dev/null 2>&1 || log "warning: previous image $IMAGE:$current missing; auto-rollback impossible"
  guard_up "$sha"

  if switch_to "$IMAGE:$sha" && wait_for "$sha"; then
    printf '%s\n' "$current" >"$STATE_DIR/previous"
    guard_down "$sha"
    backup post-deploy || log "warning: post-deploy backup failed; check manually"
    log "DEPLOYED $sha (previous $current)"
  else
    log "deploy failed — rolling back to $current"
    if docker image inspect "$IMAGE:$current" >/dev/null 2>&1; then
      switch_to "$IMAGE:$current" && wait_for "$current" && log "rollback OK"
    fi
    guard_down "$sha"
    exit 6
  fi
  ;;

*)
  log "unknown command"; exit 2 ;;
esac
