#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
#  BACKUP POLICETTIVO — doppio clic, una volta al mese.  (backup-v1)
#
#  Salva sul disco cifrato «Backup-Policettivo»:
#    • il DATABASE completo (tabelle e dati dell'app: pazienti, visite,
#      sedute, diario, fatture, consensi, account…) in un file .dump
#      con la data: ogni mese un file nuovo, i vecchi restano;
#    • tutti i FILE (foto, video, referti, PDF, loghi) nella cartella
#      «file»: si scaricano solo quelli che mancano (i file dell'app non
#      cambiano mai dopo il caricamento, prendono un nome nuovo).
#
#  Le chiavi NON stanno qui: stanno in ~/.policettivo-backup (solo tuo,
#  permessi 600). Alla prima volta lo script te le chiede.
#  Niente viene modificato su Supabase: lo script LEGGE soltanto.
#
#  Per riaprire un backup: vedi LEGGIMI.txt sul disco.
# ═══════════════════════════════════════════════════════════════════════

DISCO="${BACKUP_DISCO:-/Volumes/Backup-Policettivo}"
CHIAVI="${BACKUP_CHIAVI:-$HOME/.policettivo-backup}"
PGBIN="${BACKUP_PGBIN:-/Applications/Postgres.app/Contents/Versions/latest/bin}"

rosso() { printf '\n\033[1;31m%s\033[0m\n' "$*"; }
verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
passo() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
fine()  { echo; read -r -p "Premi Invio per chiudere questa finestra." _; exit "${1:-0}"; }

echo "═══════════════════════════════════════════"
echo "   BACKUP POLICETTIVO — $(date '+%d/%m/%Y %H:%M')"
echo "═══════════════════════════════════════════"

# ── 1. controlli prima di cominciare ──────────────────────────────────
if [ ! -d "$DISCO" ]; then
  rosso "Il disco «Backup-Policettivo» non è collegato (o non è sbloccato)."
  echo "Collegalo, inserisci la sua password e rilancia questo file."
  fine 1
fi
if [ ! -x "$PGBIN/pg_dump" ]; then
  rosso "Manca Postgres.app."
  echo "Scaricalo da https://postgresapp.com, trascinalo in Applicazioni, aprilo una volta, poi rilancia."
  fine 1
fi
VER=$("$PGBIN/pg_dump" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
if [ "${VER:-0}" -lt 17 ]; then
  rosso "Postgres.app è alla versione $VER: per il database di Policettivo serve la 17 o più nuova."
  echo "Aggiorna Postgres.app (scaricalo di nuovo da postgresapp.com) e rilancia."
  fine 1
fi
for p in curl; do command -v "$p" >/dev/null || { rosso "Manca il programma $p."; fine 1; }; done

# ── 2. le chiavi (solo la prima volta) ────────────────────────────────
if [ ! -f "$CHIAVI" ]; then
  passo "Prima volta: servono due chiavi da Supabase (restano SOLO su questo Mac)."
  echo
  echo "1) Indirizzo del database — Supabase → pulsante «Connect» → «Direct» → «Session pooler»."
  echo "   Copia la riga che comincia con postgresql:// (anche con [YOUR-PASSWORD] dentro)."
  read -r -p "   Incollala qui e premi Invio: " URL_DB
  URL_DB="$(printf '%s' "$URL_DB" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  case "$URL_DB" in *YOUR-PASSWORD*)
    read -r -s -p "   Ora la PASSWORD del database (non si vede mentre scrivi) e premi Invio: " PW_DB; echo
    PW_DB="$(printf '%s' "$PW_DB" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"   # niente spazi incollati per sbaglio
    PW_COD=""; LC_ALL=C
    for (( i=0; i<${#PW_DB}; i++ )); do c="${PW_DB:i:1}"
      case "$c" in [a-zA-Z0-9._~-]) PW_COD="$PW_COD$c" ;; *) PW_COD="$PW_COD$(printf '%%%02X' "'$c")" ;; esac
    done
    URL_DB="${URL_DB/\[YOUR-PASSWORD\]/$PW_COD}"
  ;; esac
  echo
  echo "2) Chiave di servizio — Supabase → Project Settings → API Keys → «secret» (o service_role)."
  read -r -s -p "   Incollala qui (non si vede mentre scrivi) e premi Invio: " CHIAVE_SRV
  echo
  case "$URL_DB" in postgres://*|postgresql://*) ;; *) rosso "L'indirizzo deve cominciare con postgresql://"; fine 1;; esac
  case "$URL_DB" in *YOUR-PASSWORD*) rosso "Hai lasciato [YOUR-PASSWORD]: mettici la password vera."; fine 1;; esac
  [ -n "$CHIAVE_SRV" ] || { rosso "Chiave di servizio vuota."; fine 1; }
  umask 077
  {
    printf 'URL_DB=%q\n' "$URL_DB"
    printf 'CHIAVE_SRV=%q\n' "$CHIAVE_SRV"
    printf 'URL_API=%q\n' "${BACKUP_URL_API:-https://kazlnoikvwdqwvxtigej.supabase.co}"
  } > "$CHIAVI"
  chmod 600 "$CHIAVI"
  verde "Chiavi salvate in $CHIAVI (solo il tuo utente può leggerle)."
fi
# shellcheck disable=SC1090
. "$CHIAVI"

QUANDO=$(date '+%Y-%m-%d_%H%M')
DEST="$DISCO/database"
FILE_DIR="$DISCO/file"
REG="$DISCO/registro-backup.txt"
mkdir -p "$DEST" "$FILE_DIR" || { rosso "Non riesco a scrivere sul disco."; fine 1; }

# ── 3. il database ────────────────────────────────────────────────────
passo "1/3 · Copio il database…"
DUMP="$DEST/policettivo_$QUANDO.dump"
# public = i dati dell'app; auth = gli account (email, accessi); storage = l'elenco dei file
SOLO_PUBLIC=""; DB_OK=1
if ! "$PGBIN/pg_dump" "$URL_DB" --format=custom --no-owner --no-privileges \
       --schema=public --schema=auth --schema=storage --file="$DUMP.parziale" 2> "$DEST/ultimo-errore.txt"; then
  # se gli account o l'elenco file non si possono leggere, si salvano almeno TUTTI i dati dell'app
  if grep -qi "permission denied" "$DEST/ultimo-errore.txt" && "$PGBIN/pg_dump" "$URL_DB" --format=custom --no-owner --no-privileges \
       --schema=public --file="$DUMP.parziale" 2>> "$DEST/ultimo-errore.txt"; then
    SOLO_PUBLIC=" (solo i dati dell'app: account ed elenco file non leggibili con questa chiave)"
  else
    DB_OK=0
  fi
fi
if [ "$DB_OK" -ne 1 ] || [ ! -s "$DUMP.parziale" ]; then
  rosso "Copia del database NON riuscita. Il motivo:"
  tail -5 "$DEST/ultimo-errore.txt"
  echo
  CHI=$(printf '%s' "$URL_DB" | sed -E 's#^postgres(ql)?://([^:@/]+).*@([^:/?]+).*#utente \2 · server \3#')
  echo "   (collegamento usato: $CHI)"
  if grep -qi "password authentication failed" "$DEST/ultimo-errore.txt"; then
    rm -f "$CHIAVI"
    echo
    echo "La PASSWORD del database non è stata accettata. Ho cancellato le chiavi salvate:"
    echo "rilancia questo file e te le richiede. Controlla che:"
    echo "  • l'utente sia postgres.kazlnoikvwdqwvxtigej (riga del «Session pooler»);"
    echo "  • la password sia quella NUOVA (se l'hai appena cambiata, aspetta 2-3 minuti)."
  elif grep -qi "Tenant or user not found" "$DEST/ultimo-errore.txt"; then
    rm -f "$CHIAVI"
    echo
    echo "La riga non è quella del «Session pooler». Ho cancellato le chiavi salvate: rilancia e incolla quella giusta."
  fi
  rm -f "$DUMP.parziale"
  fine 1
fi
mv "$DUMP.parziale" "$DUMP"
rm -f "$DEST/ultimo-errore.txt"
TABELLE=$("$PGBIN/pg_restore" --list "$DUMP" | grep -c ' TABLE DATA ')
verde "   Database salvato: $(du -h "$DUMP" | cut -f1 | tr -d ' ') · $TABELLE tabelle con dati$SOLO_PUBLIC"

# ── 4. i file ─────────────────────────────────────────────────────────
passo "2/3 · Leggo l'elenco dei file…"
ELENCO="$DISCO/.elenco-file.tsv"
if ! "$PGBIN/psql" "$URL_DB" -X -A -t -F $'\t' -c \
     "select bucket_id, name, coalesce((metadata->>'size')::bigint, -1) from storage.objects where name is not null and name not like '%/.emptyFolderPlaceholder' order by bucket_id, name" \
     > "$ELENCO" 2> "$DISCO/.errore-elenco.txt"; then
  rosso "Non riesco a leggere l'elenco dei file:"; tail -3 "$DISCO/.errore-elenco.txt"; fine 1
fi
rm -f "$DISCO/.errore-elenco.txt"
TOT=$(grep -c . "$ELENCO" || true)
echo "   $TOT file in Supabase."

codifica() {  # ogni pezzo del percorso, come lo vuole l'indirizzo web
  local s="$1" out="" c i
  LC_ALL=C
  for (( i=0; i<${#s}; i++ )); do
    c="${s:i:1}"
    case "$c" in [a-zA-Z0-9.~_/-]) out="$out$c" ;; *) out="$out$(printf '%%%02X' "'$c")" ;; esac
  done
  printf '%s' "$out"
}

passo "3/3 · Scarico i file che mancano…"
# la chiave va in tutti e due i posti (come fa la libreria ufficiale): solo in «apikey» il server dei file rispondeva 400
# QUALE MODO ACCETTA IL SERVER DEI FILE: si prova sul primo file, nei due modi possibili.
#  · solo «apikey»: è il modo delle chiavi nuove (sb_secret_…), il server la traduce da sé;
#  · «apikey» + «Authorization»: il modo delle chiavi vecchie (eyJ…).
# (con la chiave nuova anche in Authorization il server risponde «Invalid Compact JWS»)
AUT=()
IFS=$'\t' read -r B0 N0 _ < "$ELENCO"
PROVA="$DISCO/.prova-file"
C1=$(curl -sS -o "$PROVA" -w '%{http_code}' -H "apikey: $CHIAVE_SRV" "$URL_API/storage/v1/object/authenticated/$B0/$(codifica "$N0")" 2>/dev/null)
R1=$(head -c 160 "$PROVA" 2>/dev/null | tr -d '\n')
if [ "$C1" != "200" ]; then
  C2=$(curl -sS -o "$PROVA" -w '%{http_code}' -H "apikey: $CHIAVE_SRV" -H "Authorization: Bearer $CHIAVE_SRV" "$URL_API/storage/v1/object/authenticated/$B0/$(codifica "$N0")" 2>/dev/null)
  R2=$(head -c 160 "$PROVA" 2>/dev/null | tr -d '\n')
  if [ "$C2" = "200" ]; then AUT=(-H "Authorization: Bearer $CHIAVE_SRV")
  elif case "$CHIAVE_SRV" in eyJ*) false;; *) true;; esac; then
    # Il server dei file di questo progetto vuole una chiave in formato JWT (eyJ…): le chiavi
    # nuove sb_secret_ non le accetta. Si chiede UNA volta la chiave «service_role» (legacy).
    echo
    echo "   Il server dei file vuole la chiave nel formato vecchio. Supabase → Project Settings → API Keys"
    echo "   → scheda «Legacy API Keys» → «service_role» → Reveal → copia (comincia con eyJ)."
    read -r -s -p "   Incollala qui (non si vede) e premi Invio: " CHIAVE_JWT; echo
    CHIAVE_JWT="$(printf '%s' "$CHIAVE_JWT" | tr -d '\r[:space:]')"
    C3=$(curl -sS -o "$PROVA" -w '%{http_code}' -H "apikey: $CHIAVE_JWT" -H "Authorization: Bearer $CHIAVE_JWT" "$URL_API/storage/v1/object/authenticated/$B0/$(codifica "$N0")" 2>/dev/null)
    if [ "$C3" = "200" ]; then
      CHIAVE_SRV="$CHIAVE_JWT"; AUT=(-H "Authorization: Bearer $CHIAVE_SRV")
      sed -i '' -e '/^CHIAVE_SRV=/d' "$CHIAVI" 2>/dev/null || sed -i -e '/^CHIAVE_SRV=/d' "$CHIAVI"
      printf 'CHIAVE_SRV=%q\n' "$CHIAVE_SRV" >> "$CHIAVI"; chmod 600 "$CHIAVI"
      verde "   Chiave accettata e salvata: dalla prossima volta non te la chiedo più."
    else
      rosso "   Neanche questa è accettata: $C3 $(head -c 160 "$PROVA" 2>/dev/null | tr -d '\n')"
    fi
  else
    rosso "   Il server dei file non accetta la chiave in nessuno dei due modi:"
    echo "   A) $C1 $R1"
    echo "   B) $C2 $R2"
  fi
fi
rm -f "$PROVA"
PRIMO_ERRORE=""
NUOVI=0; GIA=0; ERR=0; N=0; STOP=""
: > "$DISCO/.file-non-scaricati.txt"
while IFS=$'\t' read -r BUCKET NOME DIM; do
  [ -n "$BUCKET" ] || continue
  N=$((N+1))
  F="$FILE_DIR/$BUCKET/$NOME"
  if [ -f "$F" ] && { [ "$DIM" -lt 0 ] || [ "$(wc -c < "$F" | tr -d ' ')" = "$DIM" ]; }; then
    GIA=$((GIA+1)); continue
  fi
  mkdir -p "$(dirname "$F")"
  CODICE=$(curl -sS --retry 2 -o "$F.parziale" -w '%{http_code}' "${AUT[@]}" -H "apikey: $CHIAVE_SRV" \
       "$URL_API/storage/v1/object/authenticated/$BUCKET/$(codifica "$NOME")" 2>>"$DISCO/.file-non-scaricati.txt")
  if [ "$CODICE" = "200" ]; then
    mv "$F.parziale" "$F"; NUOVI=$((NUOVI+1))
  else
    if [ -z "$PRIMO_ERRORE" ]; then
      PRIMO_ERRORE="risposta $CODICE: $(head -c 200 "$F.parziale" 2>/dev/null | tr -d '\n')"
      rosso "   Il primo file non scaricato: $PRIMO_ERRORE"
    fi
    # se i primi 3 NON passano per un motivo di accesso, inutile provare gli altri 2000
    case "$CODICE" in 400|401|403) if [ "$NUOVI" -eq 0 ] && [ "$ERR" -ge 2 ]; then rm -f "$F.parziale"; echo "$BUCKET/$NOME · risposta $CODICE" >> "$DISCO/.file-non-scaricati.txt"; ERR=$((ERR+1)); STOP=1; break; fi ;; esac
    rm -f "$F.parziale"; ERR=$((ERR+1)); echo "$BUCKET/$NOME · risposta $CODICE" >> "$DISCO/.file-non-scaricati.txt"
  fi
  if [ $((N % 25)) -eq 0 ]; then printf '\r   %s di %s…' "$N" "$TOT"; fi
done < "$ELENCO"
printf '\r   %s di %s.        \n' "$N" "$TOT"
verde "   Nuovi: $NUOVI · già presenti: $GIA"
[ -n "$STOP" ] && rosso "   Mi sono fermato al primo file: la chiave non viene accettata dal server dei file. Rimandami la riga rossa qui sopra."
[ "$ERR" -gt 0 ] && rosso "   Non scaricati: $ERR (elenco in $DISCO/.file-non-scaricati.txt) — rilancia più tardi: riprova solo quelli."

# ── 5. registro e LEGGIMI ─────────────────────────────────────────────
echo "$(date '+%d/%m/%Y %H:%M') · database $(basename "$DUMP") ($TABELLE tabelle) · file: $TOT in Supabase, $NUOVI nuovi, $ERR non scaricati" >> "$REG"
cat > "$DISCO/LEGGIMI.txt" <<'TXT'
BACKUP POLICETTIVO — come è fatto e come si riapre
==================================================
database/policettivo_AAAA-MM-GG_HHMM.dump
    Una copia completa del database per ogni backup (formato pg_dump «custom»).
    Contiene i dati dell'app (schema public), gli account (auth) e l'elenco dei file (storage).
file/<contenitore>/<percorso>
    Tutti i file caricati nell'app (foto, video, referti, loghi), con lo stesso percorso che hanno su Supabase.
registro-backup.txt
    Una riga per ogni backup fatto.

Per CONTROLLARE un backup (senza toccare niente online), con Postgres.app aperto:
    /Applications/Postgres.app/Contents/Versions/latest/bin/pg_restore --list database/<file>.dump
Per RIPRISTINARE in caso di disastro: non farlo da solo. Il ripristino va fatto su un progetto
Supabase nuovo, poi si ricaricano i file della cartella «file» negli stessi contenitori.
TXT

echo
echo "═══════════════════════════════════════════"
if [ "$ERR" -eq 0 ]; then verde "   ✅ BACKUP COMPLETO"; else rosso "   ⚠️ BACKUP FATTO, MA $ERR FILE NON SCARICATI"; fi
echo "   Disco libero: $(df -h "$DISCO" | awk 'NR==2{print $4}')"
echo "═══════════════════════════════════════════"
echo "Ora puoi espellere il disco (clic destro → Espelli) e metterlo al sicuro."
fine 0
