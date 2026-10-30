#!/bin/bash
# backup-auto-v1 — lo lancia macOS (launchd, StartOnMount) ogni volta che si collega un disco.
# Se il disco collegato è «Backup-Policettivo» e oggi il backup non è ancora partito,
# apre il Terminale con BACKUP-POLICETTIVO.command (così si vede cosa fa).
D=/Volumes/Backup-Policettivo
sleep 5                                   # il disco cifrato ci mette qualche secondo a sbloccarsi
[ -d "$D" ] || exit 0
OGGI=$(date +%Y-%m-%d)
SEGNO="$HOME/.policettivo-backup-ultimo-avvio"
[ "$(cat "$SEGNO" 2>/dev/null)" = "$OGGI" ] && exit 0
echo "$OGGI" > "$SEGNO"
open -a Terminal "$HOME/Library/Scripts/Policettivo/BACKUP-POLICETTIVO.command"
