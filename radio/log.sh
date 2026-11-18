#!/bin/bash
# Ημερολόγιο εκτελέσεων: προσθέτει ή ενημερώνει (ίδιο "id") μια εγγραφή στο log.json του release «radio-log».
# Το διαβάζει η διαχείριση, ώστε να φαίνεται τι έγινε χωρίς να ανοίγεις το GitHub.
#   radio/log.sh '<json>'
entry=$1
gh release view radio-log >/dev/null 2>&1 || gh release create radio-log --latest=false \
  --title "Ραδιόφωνο — ημερολόγιο" --notes "Ημερολόγιο εκτελέσεων της ηχογράφησης (το διαβάζει η διαχείριση)." >/dev/null || exit 0
tmp=$(mktemp -d)
# Αν το ημερολόγιο υπάρχει αλλά δεν κατέβηκε (προσωρινό σφάλμα), ΔΕΝ ανεβαίνει νέο: αλλιώς θα έσβηνε το ιστορικό.
for i in 1 2 3; do gh release download radio-log -p log.json -D "$tmp" --clobber 2>/dev/null && break; sleep $((i * 3)); done
if [ ! -s "$tmp/log.json" ]; then
  if gh release view radio-log --json assets --jq '.assets[].name' 2>/dev/null | grep -qx log.json; then exit 0; fi
  echo '[]' > "$tmp/log.json"
fi
if jq -c --argjson e "$entry" '[$e] + [ .[] | select(.id != $e.id) ] | .[:300]' "$tmp/log.json" > "$tmp/new.json" 2>/dev/null; then
  mv "$tmp/new.json" "$tmp/log.json"
else
  jq -c -n --argjson e "$entry" '[$e]' > "$tmp/log.json" || exit 0
fi
gh release upload radio-log "$tmp/log.json" --clobber >/dev/null || true
exit 0
