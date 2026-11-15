#!/bin/bash
# Random input: 80 looks and selects (a quarter of them drags) at random
# interactable targets in XR, stopping if the session ends; then the health
# log (errors caught by the safety nets) and the frame rate.
#   npx @iwsdk/cli xr enter; bash scripts/check-monkey.sh
cd "$(dirname "$0")/.."
C="node node_modules/@iwsdk/cli/dist/cli.js"
names=$($C xr list-targets --input-json '{}' 2>&1 | tr -d '\n ' | /usr/bin/grep -oE '"name":"[a-z][a-z0-9-]*","position":\{[^}]*\}' | sed -E 's/"name":"([^"]*)","position":\{(.*)\}/\1|\2/' | /usr/bin/grep -vE 'exit-button|share-button')
count=$(echo "$names" | wc -l | tr -d ' ')
echo "targets: $count"
RANDOM=42
for i in $(seq 1 80); do
  line=$(echo "$names" | sed -n "$((RANDOM % count + 1))p")
  pos=${line#*|}
  $C xr set-transform --input-json '{"device":"controller-right","position":{"x":0,"y":1.3,"z":-0.2}}' >/dev/null 2>&1
  $C xr look-at --input-json "{\"device\":\"controller-right\",\"target\":{$pos}}" >/dev/null 2>&1
  if [ $((RANDOM % 4)) -eq 0 ]; then
    # A drag: hold, move, release.
    $C xr set-select-value --input-json '{"device":"controller-right","value":1}' >/dev/null 2>&1
    $C xr set-transform --input-json "{\"device\":\"controller-right\",\"position\":{\"x\":0.$((RANDOM % 4)),\"y\":1.$((RANDOM % 5)),\"z\":-0.3}}" >/dev/null 2>&1
    $C xr set-select-value --input-json '{"device":"controller-right","value":0}' >/dev/null 2>&1
  else
    $C xr select --input-json '{"device":"controller-right","duration":0.1}' >/dev/null 2>&1
  fi
  if ! $C xr status 2>&1 | grep -q '"sessionActive": true'; then echo "session ended after action $i on: ${line%%|*}"; break; fi
done
echo "after 80 random actions:"
$C browser run scripts/health.mjs 2>&1 | tr -d '\n' | /usr/bin/grep -oE '"result": *\{.*\}, *"script"' | sed 's/, *"script"//; s/  */ /g'
