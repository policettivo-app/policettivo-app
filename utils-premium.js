const _ADMIN_EMAIL = 'appuntamentimft@gmail.com'

window.policettivoCheckPremium = async function (supabase, userId, userEmail) {
  const { data: prof, error: profErr } = await supabase
    .from('professionals')
    .select('id, piano, premium_scadenza')
    .eq('user_id', userId)
    .maybeSingle()
  if (profErr) console.error('[policettivoCheckPremium] errore query professionals:', profErr)

  if (userEmail === _ADMIN_EMAIL) {
    window.isPremium = true
    return { isPremium: true, piano: 'premium', profId: prof?.id || null }
  }

  if (!prof) {
    window.isPremium = false
    return { isPremium: false, piano: 'free', profId: null }
  }

  let isPremium = false

  if (prof.piano === 'premium') {
    if (!prof.premium_scadenza) {
      isPremium = true
    } else {
      const scadenza = new Date(prof.premium_scadenza)
      if (scadenza > new Date()) {
        isPremium = true
      } else {
        await supabase
          .from('professionals')
          .update({ piano: 'free', premium_scadenza: null })
          .eq('id', prof.id)
        isPremium = false
      }
    }
  }

  window.isPremium = isPremium
  return { isPremium, piano: isPremium ? 'premium' : 'free', profId: prof.id }
}

/* pol-lock-inject-v1 — carica il blocco schermo per inattività su ogni pagina
   che include questo file, senza doverlo aggiungere a mano una per una.
   Se il professionista non ha impostato un PIN, pol-lock.js si spegne da solo.

   ⚠️ Il ';' qui sotto NON e' un vezzo: utils-premium.js non usa i punti e virgola,
   quindi senza di esso questa IIFE si incolla alla riga precedente e diventa una
   CHIAMATA a quella funzione. E' successo davvero il 29 ago: policettivoCheckPremium
   e' diventata una Promise invece di una funzione e la dashboard e' morta. */
;(function () {
  if (window.__polLockInject) return;
  window.__polLockInject = true;
  var s = document.createElement('script');
  s.src = 'js/pol-lock.js';
  s.async = true;
  (document.head || document.documentElement).appendChild(s);
})();
