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
    case 'delete-user':        return handleDeleteUser(svc, req, res)
    case 'list-invites':       return handleListInvites(svc, req, res)
    case 'create-invite':      return handleCreateInvite(svc, req, res)
    case 'delete-invite':      return handleDeleteInvite(svc, req, res)
    case 'professionalStats':  return handleProfessionalStats(svc, req, res)
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
