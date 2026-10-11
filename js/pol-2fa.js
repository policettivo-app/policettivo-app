/* js/pol-2fa.js — due-fattori-v1 (11 ottobre 2026)
 *
 * IL SECONDO FATTORE DI ACCESSO (codice a 6 cifre da un'app di autenticazione)
 * E «ESCI DAGLI ALTRI DISPOSITIVI», IN UN FILE SOLO.
 *
 * Usa le funzioni di Supabase Auth (MFA TOTP): qui non si calcola nessun
 * codice e non si conserva nessun segreto.
 *
 * COME SI COMPORTA
 *   - È FACOLTATIVO (decisione 1A dell'11 ottobre): chi non lo attiva dal
 *     proprio profilo non vede nessuna differenza, né all'accesso né altrove.
 *   - Chi lo attiva: dopo la password, login.html chiede il codice.
 *   - Dal profilo si può disattivare (serve un codice valido) e si possono
 *     chiudere gli altri dispositivi collegati (decisione 2A).
 *
 * COSA NON È — da non raccontare diversamente
 *   In questa prima versione il codice lo chiede LA PAGINA di accesso. Il
 *   database non lo pretende ancora: una persona esperta che conosce la
 *   password può aggirare la richiesta. La protezione piena arriva quando
 *   anche le regole del database chiederanno il livello «aal2» (blocco a parte).
 *
 * SI TORNA INDIETRO
 *   Tolto questo file e ripristinate login.html / profilo.html (git tag
 *   pre-due-fattori-v1), tutti entrano come prima con la sola password, anche
 *   chi aveva attivato il codice: nessuno resta chiuso fuori.
 *
 * ⚠️ NIENTE rete propria, NIENTE dati dei pazienti qui dentro.
 */
;(function (global) {
  'use strict'

  var VERSIONE = 'due-fattori-v1'

  // Le parole a schermo, in un posto solo: le rilegge Giuliano.
  var TESTI = {
    titolo:        '🛡️ Sicurezza dell’accesso',
    spento:        'Oltre alla password puoi chiedere un codice a 6 cifre che cambia ogni 30 secondi e compare solo sul tuo telefono. Così chi scopre la password non entra lo stesso. È facoltativo.',
    cosaServe:     'Ti serve un’app di autenticazione sul telefono (Google Authenticator, Microsoft Authenticator, Authy o simili).',
    attiva:        'Attiva il codice sul telefono',
    passo1:        '1 · Apri l’app di autenticazione sul telefono e inquadra questo riquadro.',
    senzaQr:       'Se non riesci a inquadrarlo, scrivi nell’app questa chiave:',
    riserva:       '⚠️ Prima di confermare, mettiti al sicuro: inquadra lo stesso riquadro anche con un secondo telefono, oppure copia la chiave su un foglio e conservalo. Se perdi il telefono e non hai né l’uno né l’altro, potrà farti rientrare solo l’amministratore di Policettivo.',
    passo2:        '2 · Scrivi qui il codice a 6 cifre che l’app ti mostra adesso.',
    conferma:      'Conferma e attiva',
    annulla:       'Annulla',
    acceso:        '✓ Il codice sul telefono è attivo: a ogni accesso, dopo la password, ti verrà chiesto.',
    disattiva:     'Disattiva il codice',
    perDisattivare:'Per disattivarlo scrivi il codice a 6 cifre che l’app ti mostra adesso.',
    confermaSpegni:'Conferma e disattiva',
    attivato:      'Fatto: da adesso, dopo la password, ti verrà chiesto il codice.',
    disattivato:   'Disattivato: da adesso entri con la sola password.',
    altriTitolo:   'Dispositivi collegati',
    altriTesto:    'Se hai lasciato l’account aperto su un altro telefono, tablet, computer o su una TV, da qui li scolleghi tutti. Questo dispositivo resta collegato.',
    altriBottone:  'Esci da tutti gli altri dispositivi',
    altriChiedi:   'Scollego tutti gli altri dispositivi?\n\nQuesto resta collegato. Gli altri dovranno rifare l’accesso (può volerci fino a un’ora perché si scolleghino del tutto).',
    altriFatto:    'Fatto: gli altri dispositivi dovranno rifare l’accesso (entro un’ora al massimo).',
    codiceCorto:   'Il codice è di 6 cifre.',
    codiceErrato:  'Codice non valido o scaduto: aspetta che l’app ne mostri uno nuovo e riprova.',
    troppi:        'Troppi tentativi: aspetta un minuto e riprova.',
    nonAcceso:     'Il secondo fattore non è acceso per Policettivo: avvisa l’amministratore.',
    errore:        'Non ci sono riuscito: '
  }

  function soloCifre(v) { return String(v == null ? '' : v).replace(/\D/g, '') }
  function codiceValido(v) { return /^\d{6}$/.test(soloCifre(v)) }

  /* Da un errore di Supabase a una frase che si può leggere. */
  function parole(err) {
    var m = String((err && (err.message || err.error_description)) || err || ''), c = String((err && err.code) || ''), s = (err && err.status) || 0
    if (s === 429 || /rate|too many/i.test(m) || /rate_limit/.test(c)) return TESTI.troppi
    if (/invalid totp|invalid code|mfa_verification_failed|challenge.*expired|mfa_challenge_expired/i.test(m + ' ' + c)) return TESTI.codiceErrato
    if (/enroll.*disabled|verify.*disabled|not_enabled/i.test(m + ' ' + c)) return TESTI.nonAcceso
    return TESTI.errore + (m || 'errore sconosciuto')
  }

  /* I fattori TOTP dell'utente: attivi (verificati) e sospesi (iniziati e mai confermati). */
  async function fattori(sb) {
    var r = await sb.auth.mfa.listFactors()
    if (r.error) throw r.error
    var tutti = ((r.data && r.data.all) || []).filter(function (f) { return f && f.factor_type === 'totp' })
    return { attivi: tutti.filter(function (f) { return f.status === 'verified' }),
             sospesi: tutti.filter(function (f) { return f.status !== 'verified' }) }
  }

  /* Dopo la password: questa sessione deve ancora dare il codice? */
  async function serveCodice(sb) {
    var r = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
    if (r.error) throw r.error
    return !!(r.data && r.data.currentLevel !== 'aal2' && r.data.nextLevel === 'aal2')
  }

  /* Comincia l'attivazione: toglie i tentativi lasciati a metà e ne apre uno nuovo. */
  async function avvia(sb) {
    var f = await fattori(sb)
    for (var i = 0; i < f.sospesi.length; i++) { try { await sb.auth.mfa.unenroll({ factorId: f.sospesi[i].id }) } catch (e) {} }
    var r = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Policettivo ' + new Date().toISOString() })
    if (r.error) throw r.error
    return { id: r.data.id, qr: r.data.totp && r.data.totp.qr_code, chiave: r.data.totp && r.data.totp.secret }
  }
  async function abbandona(sb, factorId) { try { await sb.auth.mfa.unenroll({ factorId: factorId }) } catch (e) {} }

  async function provaCodice(sb, factorId, codice) {
    if (!codiceValido(codice)) throw { message: TESTI.codiceCorto, corto: true }
    var r = await sb.auth.mfa.challengeAndVerify({ factorId: factorId, code: soloCifre(codice) })
    if (r.error) throw r.error
    return true
  }
  /* Conferma l'attivazione (il primo codice giusto rende attivo il fattore). */
  function conferma(sb, factorId, codice) { return provaCodice(sb, factorId, codice) }

  /* All'accesso, o prima di disattivare: il codice contro i fattori attivi. */
  async function verifica(sb, codice) {
    if (!codiceValido(codice)) throw { message: TESTI.codiceCorto, corto: true }
    var f = await fattori(sb), ultimo = null
    if (!f.attivi.length) throw { message: 'nessun codice attivo su questo account' }
    for (var i = 0; i < f.attivi.length; i++) {
      try { await provaCodice(sb, f.attivi[i].id, codice); return true } catch (e) { ultimo = e }
    }
    throw ultimo
  }

  /* Disattiva: prima un codice giusto (prova che il telefono c'è), poi si toglie. */
  async function disattiva(sb, codice) {
    await verifica(sb, codice)
    var f = await fattori(sb)
    for (var i = 0; i < f.attivi.length; i++) {
      var r = await sb.auth.mfa.unenroll({ factorId: f.attivi[i].id })
      if (r.error) throw r.error
    }
    return true
  }

  async function esciAltri(sb) {
    var r = await sb.auth.signOut({ scope: 'others' })
    if (r && r.error) throw r.error
    return true
  }

  /* ═══ IL RIQUADRO NEL PROFILO ════════════════════════════════════════
     Si disegna da solo dentro `el`. Qualunque errore resta dentro il
     riquadro: il resto della pagina del profilo non se ne accorge. */
  function el(tag, stile, testo) { var e = document.createElement(tag); if (stile) e.style.cssText = stile; if (testo != null) e.textContent = testo; return e }
  var P = 'font-size:12.5px;color:#444;line-height:1.55;margin:0 0 12px'
  function bottone(testo, tipo) {
    var b = el('button', tipo === 'chiaro'
      ? 'background:#fff;color:#333;border:1.5px solid #ddd;padding:11px 18px;border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;width:100%;margin-top:8px'
      : 'background:#FFD008;color:#000;border:none;padding:13px 18px;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;width:100%;margin-top:6px', testo)
    b.type = 'button'; return b
  }
  function campoCodice() {
    var i = el('input', 'width:100%;box-sizing:border-box;padding:12px;border:1.5px solid #ddd;border-radius:8px;font-family:inherit;font-size:22px;font-weight:700;letter-spacing:6px;text-align:center;color:#000;outline:none;margin:4px 0 4px')
    i.type = 'text'; i.inputMode = 'numeric'; i.autocomplete = 'one-time-code'; i.maxLength = 7; i.placeholder = '••••••'; i.setAttribute('aria-label', 'Codice a 6 cifre')
    return i
  }

  function montaProfilo(sb, radice) {
    if (!radice || !sb || !sb.auth || !sb.auth.mfa) return
    var corpo = el('div'), esito = el('div', 'font-size:12.5px;line-height:1.5;margin-top:10px;min-height:16px')
    esito.id = 'sic-esito'; esito.setAttribute('role', 'status')
    function dico(testo, male) { esito.textContent = testo || ''; esito.style.color = male ? '#c62828' : '#1b7a36' }
    function occupato(b, si) { if (b) { b.disabled = !!si; b.style.opacity = si ? '.6' : '' } }

    function vistaSpento() {
      corpo.textContent = ''
      corpo.appendChild(el('p', P, TESTI.spento)); corpo.appendChild(el('p', P, TESTI.cosaServe))
      var b = bottone(TESTI.attiva); b.id = 'sic-attiva'
      b.onclick = async function () {
        dico(''); occupato(b, true)
        try { vistaQr(await avvia(sb)) } catch (e) { dico(parole(e), true); occupato(b, false) }
      }
      corpo.appendChild(b)
    }
    function vistaQr(dati) {
      corpo.textContent = ''
      corpo.appendChild(el('p', P + ';font-weight:700;color:#000', TESTI.passo1))
      var img = el('img', 'display:block;width:200px;height:200px;max-width:100%;margin:0 auto 12px;background:#fff;border:1px solid #eee;border-radius:8px')
      img.alt = 'Riquadro da inquadrare con l’app di autenticazione'; img.id = 'sic-qr'; if (dati.qr) img.src = dati.qr
      corpo.appendChild(img)
      corpo.appendChild(el('p', P, TESTI.senzaQr))
      var ch = el('div', 'font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:700;background:#f5f5f5;border:1.5px dashed #ccc;border-radius:8px;padding:10px 12px;word-break:break-all;user-select:all;-webkit-user-select:all;margin:0 0 12px', dati.chiave || '')
      ch.id = 'sic-chiave'; corpo.appendChild(ch)
      corpo.appendChild(el('p', 'font-size:12.5px;line-height:1.55;margin:0 0 14px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:10px 12px;color:#5c4500', TESTI.riserva))
      corpo.appendChild(el('p', P + ';font-weight:700;color:#000', TESTI.passo2))
      var c = campoCodice(); c.id = 'sic-codice'; corpo.appendChild(c)
      var ok = bottone(TESTI.conferma); ok.id = 'sic-conferma'
      var no = bottone(TESTI.annulla, 'chiaro'); no.id = 'sic-annulla'
      ok.onclick = async function () {
        dico(''); occupato(ok, true)
        try { await conferma(sb, dati.id, c.value); await disegna(); dico(TESTI.attivato) }
        catch (e) { dico(e && e.corto ? e.message : parole(e), true); occupato(ok, false); c.focus() }
      }
      no.onclick = async function () { occupato(no, true); await abbandona(sb, dati.id); dico(''); await disegna() }
      c.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') ok.click() })
      corpo.appendChild(ok); corpo.appendChild(no)
      try { c.focus() } catch (e) {}
    }
    function vistaAcceso() {
      corpo.textContent = ''
      var si = el('p', P + ';font-weight:700;color:#1b7a36', TESTI.acceso); si.id = 'sic-acceso'; corpo.appendChild(si)
      var b = bottone(TESTI.disattiva, 'chiaro'); b.id = 'sic-disattiva'
      b.onclick = function () {
        dico(''); b.style.display = 'none'
        corpo.appendChild(el('p', P, TESTI.perDisattivare))
        var c = campoCodice(); c.id = 'sic-codice-spegni'; corpo.appendChild(c)
        var ok = bottone(TESTI.confermaSpegni); ok.id = 'sic-conferma-spegni'
        var no = bottone(TESTI.annulla, 'chiaro')
        ok.onclick = async function () {
          dico(''); occupato(ok, true)
          try { await disattiva(sb, c.value); await disegna(); dico(TESTI.disattivato) }
          catch (e) { dico(e && e.corto ? e.message : parole(e), true); occupato(ok, false); c.focus() }
        }
        no.onclick = function () { dico(''); disegna() }
        c.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') ok.click() })
        corpo.appendChild(ok); corpo.appendChild(no)
        try { c.focus() } catch (e) {}
      }
      corpo.appendChild(b)
    }
    async function disegna() {
      try { var f = await fattori(sb); if (f.attivi.length) vistaAcceso(); else vistaSpento() }
      catch (e) { corpo.textContent = ''; corpo.appendChild(el('p', P + ';color:#c62828', parole(e))) }
    }

    radice.textContent = ''
    radice.appendChild(corpo)
    // dispositivi collegati (2A): un pulsante solo
    var altri = el('div', 'border-top:1px solid #eee;margin-top:20px;padding-top:16px')
    altri.appendChild(el('div', 'font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px', TESTI.altriTitolo))
    altri.appendChild(el('p', P, TESTI.altriTesto))
    var ba = bottone(TESTI.altriBottone, 'chiaro'); ba.id = 'sic-altri'
    ba.onclick = async function () {
      if (!global.confirm(TESTI.altriChiedi)) return
      dico(''); occupato(ba, true)
      try { await esciAltri(sb); dico(TESTI.altriFatto) } catch (e) { dico(parole(e), true) }
      occupato(ba, false)
    }
    altri.appendChild(ba)
    radice.appendChild(altri)
    radice.appendChild(esito)
    return disegna()
  }

  global.PolDueFattori = {
    VERSIONE: VERSIONE, TESTI: TESTI,
    soloCifre: soloCifre, codiceValido: codiceValido, parole: parole,
    fattori: fattori, serveCodice: serveCodice, avvia: avvia, abbandona: abbandona,
    conferma: conferma, verifica: verifica, disattiva: disattiva, esciAltri: esciAltri,
    montaProfilo: montaProfilo
  }
})(typeof window !== 'undefined' ? window : globalThis)
