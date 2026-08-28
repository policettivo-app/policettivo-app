// ============================================================================
// Edge Function: fic-oauth  —  Collegamento OAuth2 Fatture in Cloud (Blocco 2A)
// Modello: UN'UNICA "app Policettivo" (Client ID/Secret condivisi lato server).
// Ogni professionista collega il PROPRIO account FIC con 3 clic; i dati restano
// separati (token per-professionista salvati nella cassaforte fic_connections).
//
// ⚠️ IMPOSTA "Verify JWT" = OFF su questa funzione: il callback lo chiama FIC
//    (browser) senza JWT Supabase. L'autenticazione la facciamo noi qui dentro
//    (JWT utente nelle azioni start/disconnect, state firmato nel callback).
//
// SECRET da impostare nel pannello Supabase (Edge Functions → Secrets):
//   FIC_CLIENT_ID      = Client ID dell'app Policettivo (dal pannello FIC)
//   FIC_CLIENT_SECRET  = Client Secret dell'app Policettivo (SEGRETO)
//   FIC_STATE_SECRET   = una stringa casuale lunga a piacere (firma anti-manomissione)
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono già forniti da Supabase.)
//
// Azioni:
//   POST ?action=start       (Bearer JWT utente) -> { authorize_url }
//   POST ?action=disconnect  (Bearer JWT utente) -> { ok:true }
//   GET  ?code=..&state=..    (redirect da FIC)   -> 302 verso <origin>/profilo.html?fic=ok
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FIC_AUTH  = "https://api-v2.fattureincloud.it/oauth/authorize";
const FIC_TOKEN = "https://api-v2.fattureincloud.it/oauth/token";
const FIC_API   = "https://api-v2.fattureincloud.it";

// DEVE combaciare ESATTAMENTE col Redirect URL registrato nel pannello FIC:
const REDIRECT_URI = "https://kazlnoikvwdqwvxtigej.supabase.co/functions/v1/fic-oauth";

// Permessi richiesti a FIC (gestiti qui, il professionista non tocca nulla):
const SCOPES = "entity.clients:a issued_documents.invoices:a settings:r";

// Domini da cui accettiamo il collegamento e verso cui possiamo ri-redirigere:
const ALLOWED_ORIGINS = [
  "https://app.policettivo.it",
  "https://policettivo-app.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY          = Deno.env.get("SUPABASE_ANON_KEY")!;
const CLIENT_ID         = Deno.env.get("FIC_CLIENT_ID")!;
const CLIENT_SECRET     = Deno.env.get("FIC_CLIENT_SECRET")!;
const STATE_SECRET      = Deno.env.get("FIC_STATE_SECRET")!;

// ── util base64url ──────────────────────────────────────────────────────────
function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const enc = new TextEncoder();

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64urlEncode(new Uint8Array(sig));
}

// state = b64url(JSON{uid,ts,origin}) + "." + hmac(...)
async function makeState(uid: string, origin: string): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify({ uid, ts: Date.now(), origin })));
  const sig  = await hmac(body);
  return body + "." + sig;
}
async function readState(state: string): Promise<{ uid: string; origin: string } | null> {
  const dot = state.lastIndexOf(".");
  if (dot < 0) return null;
  const body = state.slice(0, dot);
  const sig  = state.slice(dot + 1);
  if ((await hmac(body)) !== sig) return null;                 // firma non valida
  try {
    const obj = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!obj.uid) return null;
    if (Date.now() - Number(obj.ts) > 15 * 60 * 1000) return null; // scaduto (15 min)
    const origin = ALLOWED_ORIGINS.includes(obj.origin) ? obj.origin : ALLOWED_ORIGINS[0];
    return { uid: obj.uid, origin };
  } catch (_e) { return null; }
}

// ── CORS ────────────────────────────────────────────────────────────────────
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}
function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// admin client (service_role) → bypassa la RLS, unico ad accedere alla cassaforte
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ricava l'utente dal JWT che il browser passa in Authorization
async function uidFromJwt(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u.id : null;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");
  const action = url.searchParams.get("action");

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  try {
    // ── START: costruisce l'URL di autorizzazione FIC ───────────────────────
    if (action === "start") {
      const uid = await uidFromJwt(req);
      if (!uid) return json({ error: "non autenticato" }, 401, origin);
      let bodyOrigin = origin || "";
      try { const b = await req.json(); if (b && b.origin) bodyOrigin = b.origin; } catch (_e) { /* no body */ }
      if (!ALLOWED_ORIGINS.includes(bodyOrigin)) bodyOrigin = ALLOWED_ORIGINS[0];

      const state = await makeState(uid, bodyOrigin);
      const authorizeUrl = `${FIC_AUTH}?response_type=code`
        + `&client_id=${encodeURIComponent(CLIENT_ID)}`
        + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
        + `&scope=${encodeURIComponent(SCOPES)}`
        + `&state=${encodeURIComponent(state)}`;
      return json({ authorize_url: authorizeUrl }, 200, origin);
    }

    // ── DISCONNECT: rimuove il collegamento ─────────────────────────────────
    if (action === "disconnect") {
      const uid = await uidFromJwt(req);
      if (!uid) return json({ error: "non autenticato" }, 401, origin);
      await admin.from("fic_connections").delete().eq("professional_user_id", uid);
      await admin.from("professionals")
        .update({ fic_connected: false, fic_company_name: null, fic_connected_at: null })
        .eq("user_id", uid);
      return json({ ok: true }, 200, origin);
    }

    // ── CALLBACK da FIC (GET con code + state) ───────────────────────────────
    const code  = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (code && state) {
      const st = await readState(state);
      if (!st) return new Response("Sessione di collegamento non valida o scaduta. Riprova dal Profilo.", { status: 400 });
      const back = st.origin + "/profilo.html";

      // 1) scambio code -> token
      const tokRes = await fetch(FIC_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          code,
        }),
      });
      if (!tokRes.ok) {
        console.error("[fic-oauth] token error", tokRes.status, await tokRes.text());
        return Response.redirect(back + "?fic=err", 302);
      }
      const tok = await tokRes.json();
      const expiresAt = new Date(Date.now() + (Number(tok.expires_in || 86400) - 60) * 1000).toISOString();

      // 2) recupero azienda (id + ragione sociale)
      let companyId: number | null = null;
      let companyName: string | null = null;
      try {
        const cRes = await fetch(`${FIC_API}/user/companies`, {
          headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" },
        });
        if (cRes.ok) {
          const cj = await cRes.json();
          const list = (cj && cj.data && (cj.data.companies || cj.data.company)) || [];
          const first = Array.isArray(list) ? list[0] : list;
          if (first) { companyId = first.id ?? null; companyName = first.name ?? null; }
        }
      } catch (e) { console.error("[fic-oauth] companies error", e); }

      // 3) salvataggio in cassaforte (upsert) + stato su professionals
      const up = await admin.from("fic_connections").upsert({
        professional_user_id: st.uid,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        token_expires_at: expiresAt,
        company_id: companyId,
        company_name: companyName,
        connected_at: new Date().toISOString(),
      }, { onConflict: "professional_user_id" });
      if (up.error) {
        console.error("[fic-oauth] upsert error", up.error);
        return Response.redirect(back + "?fic=err", 302);
      }
      await admin.from("professionals")
        .update({ fic_connected: true, fic_company_name: companyName, fic_connected_at: new Date().toISOString() })
        .eq("user_id", st.uid);

      return Response.redirect(back + "?fic=ok", 302);
    }

    return json({ error: "richiesta non riconosciuta" }, 400, origin);
  } catch (e) {
    console.error("[fic-oauth] exception", e);
    return json({ error: "errore interno" }, 500, origin);
  }
});