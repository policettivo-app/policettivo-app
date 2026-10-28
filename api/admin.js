import { createServiceClient } from './_check-admin-auth.js'
import { randomUUID } from 'node:crypto'

const ADMIN_EMAIL = 'appuntamentimft@gmail.com'
const RUOLI_MEMBRO_VALIDI = ['clinico', 'segreteria', 'amministrazione']
// membri-v1 — azioni che il master puo' fare sui membri del proprio studio
const AZIONI_MEMBRO = ['member-suspend', 'member-restore', 'member-set-role', 'member-reset-password', 'member-delete']
// membri-v2 — dove cercare i dati prodotti da un membro, prima di cancellarlo.
// ⚠️ `professional_id` NON ha lo stesso significato ovunque (lezione #17):
// in patients/therapy_sessions/visits vale professionals.id, in
// fatture/patient_payments/noleggi vale auth.uid() DIRETTO. Sbagliare chiave
// qui vorrebbe dire contare zero righe e cancellare un membro che invece ha
// scritto cartelle e fatture.
const TABELLE_DATI = [
  { tabella: 'patients',         chiave: 'prof' },
  { tabella: 'therapy_sessions', chiave: 'prof' },
  { tabella: 'visits',           chiave: 'prof' },
  { tabella: 'fatture',          chiave: 'uid'  },
  { tabella: 'patient_payments', chiave: 'uid'  },
  { tabella: 'noleggi',          chiave: 'uid'  }
]
const BAN_LUNGO = '876000h'   // 100 anni: la sospensione dura finche' non la togli

async function getAuthUser(req, res) {
  if (req.headers['x-preview-mode'] === '1') {
    res.status(403).json({ error: 'Non autorizzato: modalità anteprima' }); return null
  }
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) { res.status(401).json({ error: 'Token mancante' }); return null }
  const { createClient } = await import('@supabase/supabase-js')
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error } = await anon.auth.getUser(token)
  if (error || !user) { res.status(401).json({ error: 'Token non valido' }); return null }
  return user
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await getAuthUser(req, res)
  if (!user) return

  const { action } = req.body || {}
  if (!action) return res.status(400).json({ error: 'action richiesta' })

  const svc = await createServiceClient()

  const isPlatformAdmin = user.email === ADMIN_EMAIL

  // Eccezione: 'create-invite' è accessibile anche a un professionista
  // con ruolo='master', ma SOLO per il proprio studio e per ruoli membro validi.
  if (action === 'create-invite' && !isPlatformAdmin) {
    const { studio_id: bodyStudioId, invitato_da: bodyInvitatoDa, ruolo: bodyRuolo } = req.body || {}
    if (!bodyStudioId || !bodyInvitatoDa) {
      return res.status(403).json({ error: 'Non autorizzato: studio_id e invitato_da obbligatori' })
    }
    if (!bodyRuolo || !RUOLI_MEMBRO_VALIDI.includes(bodyRuolo)) {
      return res.status(400).json({ error: 'ruolo non valido: ammessi ' + RUOLI_MEMBRO_VALIDI.join(', ') })
    }
    const { data: mioProf, error: profErr } = await svc
      .from('professionals')
      .select('id, studio_id, ruolo, piano, premium_scadenza')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profErr || !mioProf) return res.status(403).json({ error: 'Non autorizzato: professionista non trovato' })
    if (mioProf.ruolo !== 'master') return res.status(403).json({ error: 'Non autorizzato: solo il master dello studio' })
    if (mioProf.studio_id !== bodyStudioId || mioProf.id !== bodyInvitatoDa) {
      return res.status(403).json({ error: 'Non autorizzato: studio_id o invitato_da non corrispondono' })
    }
    const isPremium = mioProf.piano === 'premium' && (!mioProf.premium_scadenza || new Date(mioProf.premium_scadenza) > new Date())
    if (!isPremium) {
      return res.status(402).json({ error: 'Il multi-utente richiede il piano Premium', code: 'PREMIUM_REQUIRED' })
    }
    return handleCreateInvite(svc, req, res)
  }

  // ── membri-v1 ────────────────────────────────────────────────────────────
  // Il master del proprio studio puo' gestire i SUOI membri: sospendere,
  // riattivare, cambiare ruolo, mandare il reset password.
  // Sta qui dentro e non in un file nuovo apposta: api/ e' a 12/12 funzioni
  // serverless, un file in piu' sfonderebbe il limite del piano.
  // NON esiste un'azione «imposta la password di un altro»: se il master
  // potesse farlo, «modificato dalla segretaria» nel registro non
  // significherebbe piu' niente. Si manda un'email di reimpostazione.
  // ⚠️ NIENTE `&& !isPlatformAdmin` qui: Giuliano è insieme master del suo
  // studio E amministratore della piattaforma, quindi con quella condizione il
  // suo caso saltava questo ramo e finiva nel `default` dello switch
  // («action sconosciuta»). Le azioni sui membri passano SEMPRE di qui: i
  // controlli sotto (master + stesso studio) valgono per chiunque, admin
  // compreso. Per intervenire su un altro studio c'è il pannello admin.
  if (AZIONI_MEMBRO.includes(action)) {
    const { membro_id: membroId } = req.body || {}
    if (!membroId) return res.status(400).json({ error: 'membro_id obbligatorio' })

    const { data: mioProf, error: e1 } = await svc
      .from('professionals').select('id, studio_id, ruolo').eq('user_id', user.id).maybeSingle()
    if (e1 || !mioProf) return res.status(403).json({ error: 'Non autorizzato: professionista non trovato' })
    if (mioProf.ruolo !== 'master') return res.status(403).json({ error: 'Non autorizzato: solo il master dello studio' })
    if (!mioProf.studio_id) return res.status(403).json({ error: 'Non autorizzato: nessuno studio' })
    if (membroId === mioProf.id) return res.status(400).json({ error: 'Non puoi applicare questa azione a te stesso' })

    const { data: membro, error: e2 } = await svc
      .from('professionals').select('id, user_id, studio_id, ruolo, attivo').eq('id', membroId).maybeSingle()
    if (e2 || !membro) return res.status(404).json({ error: 'Membro non trovato' })
    // Il controllo che conta: dev'essere del MIO studio.
    if (membro.studio_id !== mioProf.studio_id) return res.status(403).json({ error: 'Non autorizzato: membro di un altro studio' })
    if (membro.ruolo === 'master') return res.status(403).json({ error: 'Un master non si tocca da qui' })

    return handleAzioneMembro(svc, action, membro, req, res)
  }

  // Tutte le altre action: solo admin piattaforma
  if (!isPlatformAdmin) return res.status(403).json({ error: 'Non autorizzato' })

  switch (action) {
    case 'list-user-emails':   return handleListUserEmails(svc, req, res)
    case 'update-piano':       return handleUpdatePiano(svc, req, res)
    case 'update-profile':     return handleUpdateProfile(svc, req, res)
    case 'update-email':       return handleUpdateEmail(svc, req, res)   // email-prof-v1
    case 'delete-user':        return handleDeleteUser(svc, req, res)
    case 'list-invites':       return handleListInvites(svc, req, res)
    case 'create-invite':      return handleCreateInvite(svc, req, res)
    case 'delete-invite':      return handleDeleteInvite(svc, req, res)
    case 'professionalStats':  return handleProfessionalStats(svc, req, res)
    case 'panoramica':         return handlePanoramica(svc, req, res)        // admin-panoramica-v1
    case 'mfa-reset':          return handleMfaReset(svc, req, res)       // due-fattori-v1
    default:                   return res.status(400).json({ error: 'action sconosciuta: ' + action })
  }
}

// ── list-user-emails ─────────────────────────────────────────────────────────
async function handleListUserEmails(svc, req, res) {
  const { data, error } = await svc.auth.admin.listUsers({ perPage: 1000 })
  if (error) return res.status(500).json({ error: error.message })

  const emails = {}
  ;(data.users || []).forEach(u => { emails[u.id] = u.email || '' })
  return res.status(200).json({ emails })
}

// ── update-piano ─────────────────────────────────────────────────────────────
async function handleUpdatePiano(svc, req, res) {
  const { profId, piano, premiumScadenza } = req.body
  if (!profId || !piano) return res.status(400).json({ error: 'profId e piano obbligatori' })

  const upd = { piano }
  if (piano === 'premium' && premiumScadenza) upd.premium_scadenza = premiumScadenza
  if (piano === 'free') upd.premium_scadenza = null

  const { error } = await svc.from('professionals').update(upd).eq('id', profId)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}

// ── update-profile ───────────────────────────────────────────────────────────
async function handleUpdateProfile(svc, req, res) {
  const { profileId, nome, cognome, telefono } = req.body
  if (!profileId) return res.status(400).json({ error: 'profileId obbligatorio' })

  const { error } = await svc.from('profiles').update({ nome, cognome, telefono }).eq('id', profileId)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}

// ── update-email (email-prof-v1, 8 ott 2026) ─────────────────────────────────
// Chiesto da Giuliano: se un professionista ha sbagliato l'email, il reset
// password gli arriva all'indirizzo sbagliato e non c'è via d'uscita. Solo
// l'amministratore può cambiarla (il controllo sta nel server, sopra), e la
// cambia DOVE CONTA: nell'account di accesso (Supabase Auth, con la chiave di
// servizio). La password resta la stessa. Se la tabella professionals ha anche
// lei una colonna email, si allinea; se non ce l'ha, non è un errore.
export function validaEmail(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase()
  if (!e) return { ok: false, motivo: 'Scrivi la nuova email.' }
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { ok: false, motivo: 'Questa non sembra un’email valida: ' + e }
  return { ok: true, email: e }
}
async function handleUpdateEmail(svc, req, res) {
  const { userId, email } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId obbligatorio' })
  const v = validaEmail(email)
  if (!v.ok) return res.status(400).json({ error: v.motivo })
  if (v.email === ADMIN_EMAIL) return res.status(400).json({ error: 'Questa è l’email dell’amministratore: non si assegna a un professionista.' })

  const { data: prima, error: e0 } = await svc.auth.admin.getUserById(userId)
  if (e0 || !prima || !prima.user) return res.status(404).json({ error: 'Account non trovato' })
  const vecchia = (prima.user.email || '').toLowerCase()
  if (vecchia === ADMIN_EMAIL) return res.status(403).json({ error: 'L’email dell’amministratore non si cambia da qui.' })
  if (vecchia === v.email) return res.status(200).json({ ok: true, email: v.email, invariata: true })

  const { error: e1 } = await svc.auth.admin.updateUserById(userId, { email: v.email, email_confirm: true })
  if (e1) {
    const m = String(e1.message || '')
    if (/already|registered|exists|duplicate/i.test(m)) return res.status(409).json({ error: 'Esiste già un account con l’email ' + v.email + '.' })
    return res.status(500).json({ error: 'Non riesco a cambiare l’email: ' + m })
  }
  // la copia nella tabella professionals, se c'è (42703 / PGRST204 = la colonna non esiste: va bene così)
  let tabella = 'aggiornata'
  const { error: e2 } = await svc.from('professionals').update({ email: v.email }).eq('user_id', userId)
  if (e2) tabella = (e2.code === '42703' || e2.code === 'PGRST204' || /column/i.test(e2.message || '')) ? 'senza colonna' : 'errore: ' + e2.message
  return res.status(200).json({ ok: true, email: v.email, vecchia: vecchia, tabella: tabella })
}

// ── delete-user ──────────────────────────────────────────────────────────────
async function handleDeleteUser(svc, req, res) {
  const { profId, userId } = req.body
  if (!profId || !userId) return res.status(400).json({ error: 'profId e userId obbligatori' })

  // Blocco preventivo: consensi firmati = prova legale, non cancellabili.
  // Senza questo check la cascata FK su consents.professional_id (SET NULL)
  // viola il CHECK consent_soggetto_ck e GoTrue riporta "Database error deleting user".
  const { count: profConsCount, error: profConsErr } = await svc
    .from('consents').select('id', { count: 'exact', head: true }).eq('professional_id', profId)
  if (profConsErr) return res.status(500).json({ error: 'Errore verifica consensi professionista: ' + profConsErr.message })
  if (profConsCount && profConsCount > 0) {
    return res.status(409).json({ error: 'Impossibile eliminare: ' + profConsCount + ' consenso/i firmato/i collegati al professionista (valore legale). Contatta il supporto per la procedura di archiviazione.' })
  }

  const { data: pats } = await svc.from('patients').select('id').eq('professional_id', profId)
  if (pats && pats.length > 0) {
    const patIds = pats.map(p => p.id)

    const { count: patConsCount, error: patConsErr } = await svc
      .from('consents').select('id', { count: 'exact', head: true }).in('patient_id', patIds)
    if (patConsErr) return res.status(500).json({ error: 'Errore verifica consensi pazienti: ' + patConsErr.message })
    if (patConsCount && patConsCount > 0) {
      return res.status(409).json({ error: 'Impossibile eliminare: ' + patConsCount + ' consenso/i firmato/i collegati ai pazienti del professionista (valore legale). Contatta il supporto per la procedura di archiviazione.' })
    }

    const { data: protos } = await svc.from('patient_protocols').select('id').in('patient_id', patIds)
    if (protos && protos.length > 0) {
      const protoIds = protos.map(p => p.id)
      await svc.from('patient_protocol_exercises').delete().in('patient_protocol_id', protoIds)
      await svc.from('patient_protocols').delete().in('id', protoIds)
    }

    await svc.from('diary_entries').delete().in('patient_id', patIds)
    await svc.from('visite').delete().in('patient_id', patIds)
    await svc.from('exercise_videos').delete().in('patient_id', patIds)
    await svc.from('patients').delete().in('id', patIds)
  }

  await svc.from('professionals').delete().eq('id', profId)
  await svc.from('profiles').delete().eq('id', userId)

  const { error: delErr } = await svc.auth.admin.deleteUser(userId)
  if (delErr) return res.status(500).json({ error: 'Errore eliminazione auth: ' + delErr.message })

  return res.status(200).json({ ok: true })
}

// ── list-invites ─────────────────────────────────────────────────────────────
async function handleListInvites(svc, req, res) {
  const { data, error } = await svc.from('invites')
    .select('*')
    .eq('usato', false)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ inviti: data || [] })
}

// ── mfa-reset (due-fattori-v1) ───────────────────────────────────────────────
// Toglie a un account il secondo fattore (il codice sul telefono): serve a chi
// ha perso il telefono. Solo l'amministratore della piattaforma arriva fin qui.
// Non tocca password, email né dati: da quel momento si entra con la sola password.
async function handleMfaReset(svc, req, res) {
  const { userId } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId obbligatorio' })
  const { data, error } = await svc.auth.admin.mfa.listFactors({ userId })
  if (error) return res.status(500).json({ error: 'Non riesco a leggere i fattori: ' + (error.message || '') })
  const fattori = (data && data.factors) || []
  let tolti = 0
  for (const f of fattori) {
    const { error: e1 } = await svc.auth.admin.mfa.deleteFactor({ id: f.id, userId })
    if (e1) return res.status(500).json({ error: 'Tolti ' + tolti + ' su ' + fattori.length + ', poi: ' + (e1.message || ''), tolti })
    tolti++
  }
  return res.status(200).json({ ok: true, tolti })
}

// ── create-invite ────────────────────────────────────────────────────────────
async function handleCreateInvite(svc, req, res) {
  const { nome, email, ruolo, studio_id, invitato_da } = req.body
  if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'nome obbligatorio' })

  const token = randomUUID()
  const { data, error } = await svc.from('invites')
    .insert({
      nome: String(nome).trim(),
      email: email || null,
      token,
      ruolo: ruolo || null,
      studio_id: studio_id || null,
      invitato_da: invitato_da || null
    })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ invito: data })
}

// ── membri-v1: azioni del master sui membri del suo studio ───────────────────
// La sospensione NON si limita a `professionals.attivo`: quel campo non era
// letto da nessuna pagina, quindi da solo non impedirebbe niente (era un
// interruttore scollegato). Il blocco vero e' il BAN dell'utente su Supabase
// Auth: da bannato non fa piu' login e i token in corso smettono di valere.
// `attivo` resta come stato visibile nelle liste.
async function handleAzioneMembro(svc, action, membro, req, res) {
  if (action === 'member-set-role') {
    const { ruolo } = req.body || {}
    if (!RUOLI_MEMBRO_VALIDI.includes(ruolo)) {
      return res.status(400).json({ error: 'ruolo non valido: ammessi ' + RUOLI_MEMBRO_VALIDI.join(', ') })
    }
    const { error } = await svc.from('professionals').update({ ruolo }).eq('id', membro.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true, ruolo })
  }

  if (action === 'member-suspend' || action === 'member-restore') {
    const sospendi = action === 'member-suspend'
    if (membro.user_id) {
      const { error: eBan } = await svc.auth.admin.updateUserById(membro.user_id, {
        ban_duration: sospendi ? BAN_LUNGO : 'none'
      })
      if (eBan) return res.status(500).json({ error: 'Blocco accesso non riuscito: ' + eBan.message })
      if (sospendi) {
        // Le sessioni gia' aperte devono cadere subito, non alla scadenza.
        try { await svc.auth.admin.signOut(membro.user_id, 'global') } catch (_) {}
      }
    }
    const { error } = await svc.from('professionals').update({ attivo: !sospendi }).eq('id', membro.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true, attivo: !sospendi })
  }

  // membri-v2 — cancellazione DEFINITIVA, ma solo di un account che non ha
  // mai prodotto niente (tipicamente una prova fatta male). Se ha prodotto
  // dati il server RIFIUTA: sedute, visite e fatture sono documentazione
  // sanitaria e contabile, e cancellarne l'autore le lascerebbe orfane. In
  // quel caso la risposta giusta è sospendere, non cancellare.
  if (action === 'member-delete') {
    const trovati = []
    for (const t of TABELLE_DATI) {
      const valore = t.chiave === 'prof' ? membro.id : membro.user_id
      if (!valore) continue
      const { count, error } = await svc
        .from(t.tabella)
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', valore)
      if (error) {
        // Nel dubbio non si cancella: meglio un rifiuto che un dato orfano.
        return res.status(500).json({ error: 'Controllo dati non riuscito su ' + t.tabella + ': ' + error.message })
      }
      if (count && count > 0) trovati.push(t.tabella + ' (' + count + ')')
    }
    if (trovati.length) {
      return res.status(409).json({
        error: 'Questo membro ha già prodotto dati (' + trovati.join(', ') + '). ' +
               'Non si cancella: sospendilo, così quello che ha scritto resta e resta attribuito a lui.',
        code: 'HA_DATI'
      })
    }

    // Nessun dato: si può togliere davvero. Prima la riga professionals,
    // poi il profilo, poi l'utente vero e proprio.
    const { error: eProf } = await svc.from('professionals').delete().eq('id', membro.id)
    if (eProf) return res.status(500).json({ error: eProf.message })
    if (membro.user_id) {
      try { await svc.from('profiles').delete().eq('id', membro.user_id) } catch (_) {}
      const { error: eUser } = await svc.auth.admin.deleteUser(membro.user_id)
      if (eUser) {
        return res.status(200).json({
          ok: true,
          avviso: 'Membro rimosso dallo studio, ma l\'utente di accesso non è stato eliminato: ' + eUser.message
        })
      }
    }
    return res.status(200).json({ ok: true })
  }

  if (action === 'member-reset-password') {
    if (!membro.user_id) return res.status(400).json({ error: 'Questo membro non ha ancora completato la registrazione' })
    const { data: u, error: eU } = await svc.auth.admin.getUserById(membro.user_id)
    const email = u && u.user ? u.user.email : null
    if (eU || !email) return res.status(400).json({ error: 'Email del membro non trovata' })
    // Manda l'email di reimpostazione: il master non vede e non sceglie mai
    // la password altrui.
    const { error } = await svc.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://app.policettivo.it/reset-password.html'
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true, email })
  }

  return res.status(400).json({ error: 'azione membro sconosciuta: ' + action })
}

// ── delete-invite ────────────────────────────────────────────────────────────
async function handleDeleteInvite(svc, req, res) {
  const { id } = req.body
  if (!id) return res.status(400).json({ error: 'id obbligatorio' })
  const { error } = await svc.from('invites').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}

// ── professionalStats ────────────────────────────────────────────────────────
// Conta pazienti attivi / sedute (therapy_sessions) / visite (visits) di un
// professionista e ritorna le ultime N di ciascuno con il nome del paziente
// associato. Necessario lato server: le RLS filtrano queste letture per il
// professionista loggato, quindi dal browser (admin) restituirebbero 0 per
// gli altri.
async function handleProfessionalStats(svc, req, res) {
  const { profId } = req.body
  if (!profId) return res.status(400).json({ error: 'profId obbligatorio' })

  const { data: pats, error: patErr } = await svc
    .from('patients')
    .select('id, nome, cognome, created_at')
    .eq('professional_id', profId)
    .eq('stato', 'attivo')
    .order('created_at', { ascending: false })
  if (patErr) return res.status(500).json({ error: 'patients: ' + patErr.message })

  const allPats = pats || []
  const patIds  = allPats.map(p => p.id)
  const patNames = {}
  allPats.forEach(p => { patNames[p.id] = ((p.nome || '') + ' ' + (p.cognome || '')).trim() })

  let sessioni = []
  let visite   = []
  if (patIds.length > 0) {
    const [sRes, vRes] = await Promise.all([
      svc.from('therapy_sessions')
        .select('id, patient_id, data_seduta')
        .in('patient_id', patIds),
      svc.from('visits')
        .select('id, patient_id, data_visita')
        .in('patient_id', patIds)
    ])
    if (sRes.error) return res.status(500).json({ error: 'therapy_sessions: ' + sRes.error.message })
    if (vRes.error) return res.status(500).json({ error: 'visits: ' + vRes.error.message })
    sessioni = sRes.data || []
    visite   = vRes.data || []
  }

  const ultimeSedute = [...sessioni]
    .sort((a, b) => String(b.data_seduta || '').localeCompare(String(a.data_seduta || '')))
    .slice(0, 10)
    .map(s => ({ id: s.id, patient_id: s.patient_id, data: s.data_seduta || '', patient_name: patNames[s.patient_id] || '' }))

  const ultimeVisite = [...visite]
    .sort((a, b) => String(b.data_visita || '').localeCompare(String(a.data_visita || '')))
    .slice(0, 5)
    .map(v => ({ id: v.id, patient_id: v.patient_id, data: v.data_visita || '', patient_name: patNames[v.patient_id] || '' }))

  const ultimiPazienti = allPats.slice(0, 10).map(p => ({
    id: p.id,
    nome: patNames[p.id] || '',
    created_at: p.created_at
  }))

  return res.status(200).json({
    totals: {
      pazienti: allPats.length,
      sessioni: sessioni.length,
      visite:   visite.length
    },
    ultimiPazienti,
    ultimeSedute,
    ultimeVisite
  })
}

// ── panoramica (admin-panoramica-v1) ─────────────────────────────────────────
// LE STATISTICHE DEI PROFESSIONISTI, CALCOLATE QUI E NON NEL BROWSER.
// Prima admin.html le contava con la sessione dell'amministratore: le regole di
// accesso (RLS) gli fanno vedere SOLO i pazienti del suo studio, quindi ogni altro
// professionista risultava con 0 pazienti, 0 visite e «ultima attività» = data di
// registrazione (pallino giallo anche se usava l'app ogni giorno). In piu' contava
// le visite dalla tabella `visite`, che non esiste (quelle vere sono in `visits`),
// e i totali in alto si fermavano a 1000 righe (il limite di una lettura).
// Qui si legge con la chiave di servizio, a pagine da 1000, TUTTA la piattaforma.
// Una tabella che non si riesce a leggere non blocca le altre: finisce in `avvisi`.
async function tutteLeRighe(svc, tabella, colonne) {
  const out = []
  for (let da = 0; ; da += 1000) {
    const { data, error } = await svc.from(tabella).select(colonne).range(da, da + 999)
    if (error) throw new Error(tabella + ': ' + error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
    if (da > 200000) break   // freno di sicurezza
  }
  return out
}

async function handlePanoramica(svc, req, res) {
  const avvisi = []
  const prova = async (tabella, colonne) => {
    try { return await tutteLeRighe(svc, tabella, colonne) }
    catch (e) { avvisi.push(String(e.message || e)); return null }
  }
  const [profs, pazienti, visite, sedute, diario, foto, schede, messaggi, inviti] = await Promise.all([
    prova('professionals', 'id, user_id, ruolo, studio_id, created_at'),
    prova('patients', 'id, professional_id, stato, created_at'),
    prova('visits', 'id, patient_id, professional_id, tipo, data_visita, created_at'),
    prova('therapy_sessions', 'id, patient_id, data_seduta'),
    prova('diary_entries', 'id, patient_id, data, created_at'),
    prova('foto_storico', 'id, patient_id, creato_il'),
    prova('scheda_allenamento', 'id, patient_id, visibile_paziente, stato, aggiornato_il'),
    prova('patient_messages', 'id, professional_id, creato_il'),
    prova('invites', 'id, usato')
  ])
  const TEST = [
    ['oscillazione', 'oscillazione_test', 'creato_il'],
    ['test', 'test_sessioni', 'quando'],
    ['squat', 'squat_test', 'quando'],
    ['atr', 'atr_test', 'quando'],
    ['stepping', 'stepping_test', 'quando']
  ]
  const test = await Promise.all(TEST.map(([, tab, quando]) => prova(tab, 'id, professional_id, patient_id, ' + quando)))

  // accessi reali: auth.users (ultimo login, email confermata)
  const utenti = {}
  try {
    for (let page = 1; page < 50; page++) {
      const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      ;(data.users || []).forEach(u => { utenti[u.id] = u })
      if (!data.users || data.users.length < 1000) break
    }
  } catch (e) { avvisi.push('utenti: ' + (e.message || e)) }

  const OGGI = Date.now(), G30 = 30 * 864e5
  const per = {}
  ;(profs || []).forEach(p => {
    const u = utenti[p.user_id] || {}
    per[p.id] = {
      email: u.email || '', ultimo_accesso: u.last_sign_in_at || null, email_confermata: !!u.email_confirmed_at,
      pazienti: 0, pazienti_attivi: 0, ultimo_paziente: null,
      visite: 0, visite_tipo: {}, ultima_visita: null,
      sedute: 0, ultima_seduta: null,
      test: 0, test_tipo: {}, ultimo_test: null,
      foto: 0, ultima_foto: null,
      schede_visibili: 0,
      diario: 0, pazienti_app_30gg: 0, ultimo_uso_app: null,
      messaggi: 0
    }
  })
  const piu = (a, b) => (!a || (b && String(b) > String(a))) ? (b || a) : a
  const profDiPaz = {}
  ;(pazienti || []).forEach(p => {
    profDiPaz[p.id] = p.professional_id
    const s = per[p.professional_id]; if (!s) return
    s.pazienti++
    if (p.stato === 'attivo') s.pazienti_attivi++
    s.ultimo_paziente = piu(s.ultimo_paziente, p.created_at)
  })
  const diChi = r => per[r.professional_id] || per[profDiPaz[r.patient_id]]
  ;(visite || []).forEach(v => {
    const s = diChi(v); if (!s) return
    s.visite++; const k = v.tipo || 'altro'; s.visite_tipo[k] = (s.visite_tipo[k] || 0) + 1
    s.ultima_visita = piu(s.ultima_visita, v.created_at || v.data_visita)
  })
  ;(sedute || []).forEach(x => { const s = per[profDiPaz[x.patient_id]]; if (!s) return; s.sedute++; s.ultima_seduta = piu(s.ultima_seduta, x.data_seduta) })
  ;(foto || []).forEach(x => { const s = per[profDiPaz[x.patient_id]]; if (!s) return; s.foto++; s.ultima_foto = piu(s.ultima_foto, x.creato_il) })
  ;(schede || []).forEach(x => { const s = per[profDiPaz[x.patient_id]]; if (s && x.visibile_paziente && x.stato !== 'archiviata') s.schede_visibili++ })
  ;(messaggi || []).forEach(x => { const s = per[x.professional_id]; if (s) s.messaggi++ })
  const appPaz = {}
  ;(diario || []).forEach(x => {
    const s = per[profDiPaz[x.patient_id]]; if (!s) return
    s.diario++
    const q = x.created_at || x.data
    s.ultimo_uso_app = piu(s.ultimo_uso_app, q)
    if (q && OGGI - new Date(q).getTime() <= G30) { (appPaz[profDiPaz[x.patient_id]] = appPaz[profDiPaz[x.patient_id]] || new Set()).add(x.patient_id) }
  })
  Object.keys(appPaz).forEach(id => { if (per[id]) per[id].pazienti_app_30gg = appPaz[id].size })
  test.forEach((righe, i) => {
    const [nome, , quando] = TEST[i]
    ;(righe || []).forEach(x => {
      const s = diChi(x); if (!s) return
      s.test++; s.test_tipo[nome] = (s.test_tipo[nome] || 0) + 1
      s.ultimo_test = piu(s.ultimo_test, x[quando])
    })
  })
  // ultima attività DEL PROFESSIONISTA: login o qualcosa che ha fatto lui (l'uso dell'app dei pazienti è a parte)
  Object.values(per).forEach(s => {
    s.ultima_attivita = [s.ultimo_accesso, s.ultimo_paziente, s.ultima_visita, s.ultima_seduta, s.ultimo_test, s.ultima_foto].reduce(piu, null)
  })
  return res.status(200).json({
    generato_il: new Date().toISOString(),
    totali: {
      professionisti: (profs || []).length,
      pazienti: (pazienti || []).length,
      visite: (visite || []).length,
      sedute: (sedute || []).length,
      diario: (diario || []).length,
      test: test.reduce((a, r) => a + (r || []).length, 0),
      inviti_pendenti: (inviti || []).filter(i => !i.usato).length
    },
    prof: per,
    avvisi
  })
}
