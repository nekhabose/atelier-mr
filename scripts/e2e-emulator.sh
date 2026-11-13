#!/bin/bash
# Atelier end-to-end journey in the IWSDK emulator, driven with emulated
# controller input (ray + trigger). Prints PASS/FAIL per step.
#
# Usage (dev server running: npm run dev):
#   npx @iwsdk/cli xr enter --input-json '{}'
#   bash scripts/e2e-emulator.sh
cd "$(dirname "$0")/.." || exit 1
C="node node_modules/@iwsdk/cli/dist/cli.js"
tgt() { $C xr list-targets --input-json "{}" 2>&1 | tr -d "\n " | grep -oE "\"name\":\"$1\"[^}]*}" | head -1 | grep -oE "\"x\":[-0-9.e]*,\"y\":[-0-9.e]*,\"z\":[-0-9.e]*"; }
click() { local T; T=$(tgt "$1"); if [ -z "$T" ]; then echo "no target $1"; return; fi
  $C xr set-transform --input-json "{\"device\":\"controller-right\",\"position\":{\"x\":0,\"y\":1.3,\"z\":-0.2}}" >/dev/null 2>&1
  $C xr look-at --input-json "{\"device\":\"controller-right\",\"target\":{$T}}" >/dev/null 2>&1; sleep 0.35
  $C xr select --input-json "{\"device\":\"controller-right\",\"duration\":0.2}" >/dev/null 2>&1; sleep 0.7; }
eid() { $C ecs find --input-json "{\"namePattern\":\"$1\",\"limit\":1}" 2>&1 | grep -o "\"entityIndex\": *[0-9]*" | grep -o "[0-9]*$"; }
uitext() { $C ui inspect --input-json "{\"entityIndex\":$1,\"selector\":\"#$2\"}" 2>&1 | grep -m1 "\"text\"" | sed "s/^ *//"; }
AP=$(eid "^Atelier Panel$"); CP=$(eid "^Closet Panel$")
pass=0; fail=0
check() { # panel id expected-substring label
  local got; got=$(uitext "$1" "$2")
  if echo "$got" | grep -qF -- "$3"; then echo "PASS $4"; pass=$((pass+1)); else echo "FAIL $4 :: $got"; fail=$((fail+1)); fi; }
drag() { # pin, dy
  local T; T=$(tgt "$1")
  $C xr set-transform --input-json '{"device":"controller-right","position":{"x":0.15,"y":1.2,"z":-0.3}}' >/dev/null 2>&1
  $C xr look-at --input-json "{\"device\":\"controller-right\",\"target\":{$T}}" >/dev/null 2>&1; sleep 0.4
  $C xr set-select-value --input-json '{"device":"controller-right","value":1}' >/dev/null 2>&1; sleep 0.4
  $C xr set-transform --input-json "{\"device\":\"controller-right\",\"position\":{\"x\":0.15,\"y\":$(echo "1.2 + $2" | bc),\"z\":-0.3}}" >/dev/null 2>&1; sleep 0.6
  $C xr set-select-value --input-json '{"device":"controller-right","value":0}' >/dev/null 2>&1; sleep 0.6; }

click rack-tab-designer; click rack-look-boardroom;          check $AP look-name "Boardroom" "wear a designer look"
drag pin-hem -0.12;                 check $AP hint "Nice cut" "tailor with the hem pin"
click swatch-bordeaux-velvet;       check $AP hint "Bordeaux Velvet on the" "apply a fabric to one garment"
click undo-button;                  check $AP hint "Undo" "undo the fabric"
click redo-button;                  check $AP hint "Redo" "redo the fabric"
click turn-button;                  check $AP hint "Turning" "turn the form without reaching"
click reset-button;                 check $AP look-note "Reset to how it first" "reset the look"
click undo-button;                  check $AP look-note "Undone" "undo the reset"
click save-look-button;             check $CP closet-note "Saved" "save look to lookbook"
                                    check $CP lb-0 "Boardroom" "lookbook chip shows the look"
click stylist-button;               check $CP closet-title "Where are you headed" "open stylist"
click occ-interview; click wx-cold; click mood-classic
click style-button; sleep 2;        check $CP closet-eyebrow "PREVIEW 1 OF" "stylist previews option 1"
                                    check $CP closet-eyebrow "ON-DEVICE" "no key -> on-device fallback"
                                    check $CP stylist-meta "Weighed" "stylist shows what it considered"
click next-button;                  check $CP closet-eyebrow "PREVIEW 2 OF" "next idea cycles alternatives"
click wx-warm; sleep 2;             check $CP closet-eyebrow "PREVIEW 1 OF" "changing weather re-plans"
click refine-warmer; sleep 2;       check $CP closet-eyebrow "REFINED" "refine warmer edits the preview"
                                    check $CP stylist-tip "Warmer" "refine explains what changed"
click revert-button;                check $AP look-name "Boardroom" "undo restores pre-stylist outfit"
                                    check $CP closet-note "Undone" "undo message"
click style-button; sleep 2; click keep-button
                                    check $CP closet-note "Kept" "keep the proposal"
click today-button;                 check $CP streak-title "Today is logged" "wear today logs OOTD"
click lb-1;                         check $AP look-note "From your lookbook" "restore a saved look"
click rack-tab-boutique; sleep 1;   check $CP closet-eyebrow "BOUTIQUE" "open the boutique"
                                    check $CP closet-note "start with the" "boutique stylist recommends a piece"
click shop-1; sleep 1;              check $CP closet-eyebrow "STUDIO NORD" "switch boutique"
click boutique-sn-blouse; sleep 2;  check $AP look-name "Ivory Silk Blouse" "try a boutique piece on the form"
                                    check $CP verdict-stat "outfits" "verdict counts new outfits"
                                    check $CP verdict-sub "per outfit" "verdict shows cost per outfit"
click boutique-back; sleep 1;       check $CP closet-eyebrow "MY CLOSET" "leave the boutique"
echo "RESULT pass=$pass fail=$fail"
