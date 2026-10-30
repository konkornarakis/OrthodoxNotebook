#!/bin/bash
# Γράφει το πρόγραμμα της βραδιάς στο κείμενο του release, σε μία γραμμή <!--program:{...}-->.
#   radio/update-program.sh <tag> <ΕΕΕΕ-ΜΜ-ΗΗ>
# Αν η σελίδα δεν διαβαστεί, αφήνει ό,τι υπήρχε (η ηχογράφηση δεν επηρεάζεται).
TAG=$1 DAY=$2
dir=$(dirname "$0")
page=$(mktemp)
curl -sSL --max-time 30 -A "Mozilla/5.0" "https://www.peradio.com/evdomadiaio-programma/" -o "$page" || { echo "::warning::Το πρόγραμμα δεν κατέβηκε"; exit 0; }
json=$(node "$dir/program.js" "$page" "$DAY") || { echo "::warning::Το πρόγραμμα δεν διαβάστηκε"; exit 0; }
notes=$(gh release view "$TAG" --json body --jq .body | sed '/^<!--program:/d')
printf '%s\n<!--program:%s-->\n' "$notes" "$json" > "$page.md"
gh release edit "$TAG" --notes-file "$page.md" >/dev/null && echo "Πρόγραμμα $DAY: ενημερώθηκε"
exit 0
