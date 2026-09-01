import { createClient } from '@supabase/supabase-js'

/* ═══════════════════════════════════════════════════════════════════════
   ai-solo-premium-v1 — 1 settembre 2026

   LE FUNZIONI DI INTELLIGENZA ARTIFICIALE SONO RISERVATE AI PREMIUM.
   Prima c'era una prova gratuita (FREE_LIMIT) che scalava `ai_uses`:
   ogni analisi di un account gratuito era una chiamata a pagamento
   verso Anthropic, pagata dallo studio. Adesso l'account free NON puo'
   usare nessuna funzione AI: si nega qui, e si nega una volta sola per
   tutti gli endpoint, perche' tutti passano di qua.

   ⚠️ QUESTA E' LA DIFESA VERA. I controlli nelle pagine servono solo a
   far vedere il messaggio giusto: chiunque puo' chiamare /api/ a mano.

   Si continua a rispondere anche con `limitReached: true` per non
   rompere le pagine gia' in produzione, che su quel campo aprono il
   modale invece di mostrare un errore grezzo. Il campo nuovo, quello
   che conta, e' `premiumRequired`.

   `ai_uses` NON viene piu' incrementato: nessun account free consuma
   crediti, quindi non c'e' piu' niente da contare. La colonna resta
   dov'e' (la legge admin.html) e non si tocca: nessuna migration.
   ═══════════════════════════════════════════════════════════════════ */

const ADMIN_EMAIL = 'appuntamentimft@gmail.com'

const MSG_PREMIUM = 'Le funzioni di intelligenza artificiale sono riservate agli account Premium.'

export async function checkAIAccess(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return { error: 'Token mancante', status: 401 }

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anon.auth.getUser(token)
  if (authErr || !user) return { error: 'Non autenticato', status: 401 }

  if (user.email === ADMIN_EMAIL) return { ok: true }

  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const { data: prof, error: profErr } = await svc
    .from('professionals')
    .select('id, piano, premium_scadenza')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profErr || !prof) return { error: 'Profilo non trovato', status: 403 }

  let isPremium = false
  if (prof.piano === 'premium') {
    if (!prof.premium_scadenza || new Date(prof.premium_scadenza) > new Date()) {
      isPremium = true
    } else {
      // Premium scaduto: si riporta a free una volta sola, qui.
      await svc.from('professionals').update({ piano: 'free', premium_scadenza: null }).eq('id', prof.id)
    }
  }

  if (isPremium) return { ok: true }

  return {
    error: MSG_PREMIUM,
    status: 403,
    premiumRequired: true,
    limitReached: true   // compatibilita' con le pagine gia' pubblicate
  }
}

/* Esportata per i test: dice se una risposta di checkAIAccess e' un
   diniego «serve il Premium» e non un problema di autenticazione. */
export const _test = {
  MSG_PREMIUM,
  isPremiumDenial (esito) {
    return !!esito && esito.ok !== true && esito.status === 403 && esito.premiumRequired === true
  }
}
