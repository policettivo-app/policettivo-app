import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'appuntamentimft@gmail.com'
const FREE_LIMIT = 5

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
    .select('id, piano, premium_scadenza, ai_uses')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profErr || !prof) return { error: 'Profilo non trovato', status: 403 }

  let isPremium = false
  if (prof.piano === 'premium') {
    if (!prof.premium_scadenza || new Date(prof.premium_scadenza) > new Date()) {
      isPremium = true
    } else {
      await svc.from('professionals').update({ piano: 'free', premium_scadenza: null }).eq('id', prof.id)
    }
  }

  if (isPremium) return { ok: true }

  // Free user: check ai_uses limit then increment atomically
  const aiUses = prof.ai_uses || 0
  if (aiUses >= FREE_LIMIT) {
    return {
      error: 'Hai esaurito le 5 analisi AI gratuite. Passa a Premium per analisi illimitate.',
      status: 403,
      limitReached: true,
      ai_uses: aiUses
    }
  }

  // Use conditional update to prevent race conditions:
  // only updates if ai_uses hasn't changed since we read it
  const { data: updated } = await svc
    .from('professionals')
    .update({ ai_uses: aiUses + 1 })
    .eq('id', prof.id)
    .eq('ai_uses', aiUses)
    .select('id')

  if (!updated?.length) {
    // Another concurrent request already incremented — recheck
    const { data: fresh } = await svc.from('professionals').select('ai_uses').eq('id', prof.id).maybeSingle()
    if ((fresh?.ai_uses || 0) >= FREE_LIMIT) {
      return {
        error: 'Hai esaurito le 5 analisi AI gratuite. Passa a Premium per analisi illimitate.',
        status: 403,
        limitReached: true,
        ai_uses: fresh.ai_uses
      }
    }
  }

  return { ok: true, ai_uses_new: aiUses + 1 }
}
