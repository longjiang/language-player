#!/usr/bin/env bash
# SPEC-113 host probe: save -> load -> range -> chunked complete -> delete.
#
# Usage: scripts/probe-user-files.sh   (needs the store key in $USER_FILES_KEY_FILE,
# default ~/.uf.key, and network access to the host)
# Exits 0 only when every check passes.
set -uo pipefail
HOST="https://server.chinesezerotohero.com"
KEY_FILE="${USER_FILES_KEY_FILE:-$HOME/.uf.key}"
KEY="$(tr -d '\n' < "$KEY_FILE")"
K="X-User-Files-Key: $KEY"
U="00000000-0000-0000-0000-000000000001"
F="probe1700000000ab"
N="$F.webm"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
head -c 1024 /dev/urandom > "$TMP/body"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf 'PASS %-38s %s\n' "$1" "$3"; else fail=$((fail+1)); printf 'FAIL %-38s expected %s got %s\n' "$1" "$2" "$3"; fi; }
code() { curl -sS -o "$1" -w '%{http_code}' -m 60 "${@:2}"; }

# clean leftovers from earlier runs
for stale in "$N" "$N.part" probeascii00001.webm probeascii00002.webm probeascii00003.webm probetypehi0001.webm probeascii00001.webm probe1700000000ab.webm; do
  curl -sS -o /dev/null -m 10 -H "$K" -X DELETE "$HOST/delete-user-file.php?user=$U&kind=task_recording&file=$stale"
done

# 1. auth and unreachability
check "wrong key -> 401" 401 "$(code /dev/null -H "X-User-Files-Key: nope" -F "file=@$TMP/body" "$HOST/save-user-file.php?user=$U&kind=task_recording&file=$N")"
check "no key -> 401" 401 "$(code /dev/null "$HOST/save-user-file.php")"
PT=$(code /dev/null "$HOST/zerothero-user-files/$U/task_recording/$N"); case "$PT" in 403|404) PT=blocked;; esac
check "public tree -> blocked" blocked "$PT"

# 2. whole-file save + read
code "$TMP/o1" -H "$K" -F "file=@$TMP/body;type=application/octet-stream" "$HOST/save-user-file.php?user=$U&kind=task_recording&file=$N" >/dev/null
check "save -> OK" OK "$(cat "$TMP/o1")"
curl -sS -m 60 -H "$K" -H "Range: bytes=100-199" -D "$TMP/h" -o "$TMP/range" "$HOST/load-user-file.php?user=$U&kind=task_recording&file=$N"
check "range -> 206" 206 "$(head -1 "$TMP/h" | awk '{print $2}')"
check "range Content-Range" "bytes 100-199/1024" "$(grep -i '^content-range' "$TMP/h" | tr -d '\r' | cut -d' ' -f2-)"
check "range body length" 100 "$(wc -c < "$TMP/range" | tr -d ' ')"
curl -sS -m 60 -H "$K" -o "$TMP/full" "$HOST/load-user-file.php?user=$U&kind=task_recording&file=$N"
check "whole read matches" "$(shasum -a 256 < "$TMP/body" | cut -d' ' -f1)" "$(shasum -a 256 < "$TMP/full" | cut -d' ' -f1)"
check "head -> 200" 200 "$(code /dev/null -H "$K" -I "$HOST/load-user-file.php?user=$U&kind=task_recording&file=$N")"

# 3. chunked assembly
head -c 900 /dev/urandom > "$TMP/cbody"
split -b 450 -d -a 1 "$TMP/cbody" "$TMP/part."
for i in 0 1; do
  code "$TMP/ch$i" -H "$K" -F "file=@$TMP/part.$i;type=application/octet-stream" "$HOST/save-user-file-chunk.php?user=$U&kind=task_recording&file=$N.part&index=$i" >/dev/null
  check "chunk $i -> OK" OK "$(cat "$TMP/ch$i")"
done
code "$TMP/list" -H "$K" "$HOST/list-user-file-chunks.php?user=$U&kind=task_recording&file=$N.part" >/dev/null
check "list chunks" '{"received":[0,1]}' "$(cat "$TMP/list")"
SHA="$(shasum -a 256 < "$TMP/cbody" | cut -d' ' -f1)"
printf '{"user":"%s","kind":"task_recording","file":"%s.part","total":2,"byteSize":900,"sha256":"%s"}' "$U" "$N" "$SHA" > "$TMP/complete.json"
code "$TMP/o2" -H "$K" -H 'Content-Type: application/json' --data-binary @"$TMP/complete.json" "$HOST/complete-user-file.php" >/dev/null
check "complete -> OK" OK "$(cat "$TMP/o2")"
curl -sS -m 60 -H "$K" -o "$TMP/assembled" "$HOST/load-user-file.php?user=$U&kind=task_recording&file=$N.part"
check "assembled matches" "$SHA" "$(shasum -a 256 < "$TMP/assembled" | cut -d' ' -f1)"
printf '{"user":"%s","kind":"task_recording","file":"%s.part","total":2,"byteSize":900,"sha256":"%s"}' "$U" "$N" "$(printf 'a%.0s' {1..64})" > "$TMP/bad.json"
check "complete with bad hash -> 422" 422 "$(code /dev/null -H "$K" -H 'Content-Type: application/json' --data-binary @"$TMP/bad.json" "$HOST/complete-user-file.php")"

# 4. batch + single delete
head -c 32 /dev/urandom > "$TMP/tiny"
code /dev/null -H "$K" -F "file=@$TMP/tiny;type=application/octet-stream" "$HOST/save-user-file.php?user=$U&kind=task_recording&file=$F.tiny" >/dev/null
printf '{"items":[{"user":"%s","kind":"task_recording","file":"%s.tiny"},{"user":"%s","kind":"task_recording","file":"probenothere0001.webm"}]}' "$U" "$F" "$U" > "$TMP/batch.json"
code "$TMP/b" -H "$K" -H 'Content-Type: application/json' --data-binary @"$TMP/batch.json" "$HOST/delete-user-files-batch.php" >/dev/null
check "batch delete" '{"deleted":1,"missing":1,"invalid":0}' "$(cat "$TMP/b")"
code "$TMP/d" -H "$K" -X DELETE "$HOST/delete-user-file.php?user=$U&kind=task_recording&file=$N" >/dev/null
check "delete -> OK" OK "$(cat "$TMP/d")"
check "deleted file -> 404" 404 "$(code /dev/null -H "$K" "$HOST/load-user-file.php?user=$U&kind=task_recording&file=$N")"
curl -sS -o /dev/null -m 10 -H "$K" -X DELETE "$HOST/delete-user-file.php?user=$U&kind=task_recording&file=$N.part"

echo "---"; echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
