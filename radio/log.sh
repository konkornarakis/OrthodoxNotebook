#!/bin/bash
# Ημερολόγιο εκτελέσεων: προσθέτει ή ενημερώνει (ίδιο "id") μια εγγραφή στο log.json του release «radio-log».
# Το διαβάζει η διαχείριση, ώστε να φαίνεται τι έγινε χωρίς να ανοίγεις το GitHub.
#   radio/log.sh '<json>'
entry=$1
gh release view radio-log >/dev/null 2>&1 || gh release create radio-log --latest=false \
  --title "Ραδιόφωνο — ημερολόγιο" --notes "Ημερολόγιο εκτελέσεων της ηχογράφησης (το διαβάζει η διαχείριση)." >/dev/null || exit 0
tmp=$(mktemp -d)
gh release download radio-log -p log.json -D "$tmp" 2>/dev/null || echo '[]' > "$tmp/log.json"
if jq -c --argjson e "$entry" '[$e] + [ .[] | select(.id != $e.id) ] | .[:300]' "$tmp/log.json" > "$tmp/new.json" 2>/dev/null; then
  mv "$tmp/new.json" "$tmp/log.json"
else
  jq -c -n --argjson e "$entry" '[$e]' > "$tmp/log.json" || exit 0
fi
gh release upload radio-log "$tmp/log.json" --clobber >/dev/null || true
exit 0
