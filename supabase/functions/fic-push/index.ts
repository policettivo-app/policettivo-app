// fic-push — Blocco 2B: crea la fattura in Fatture in Cloud (FIC).
// marker: fic-push-v1
//
// Chiamata dall'app (fattura.html) con il JWT dell'utente.
// Impostazione dashboard Supabase: "Verify JWT" = ON (nessun callback esterno).
//
// Flusso:
//  1) verifica il JWT utente -> uid
//  2) legge i token dalla cassaforte fic_connections (service_role)
//  3) rinnova l'access_token se scaduto (oauth/token, grant_type=refresh_token)
//  4) legge le aliquote IVA della company (GET /c/{id}/info/vat_types) e mappa
//     i codici IVA di Policettivo sugli id vat_type di FIC
//  5) POST /c/{id}/issued_documents SENZA numero -> il numero lo assegna FIC
//  6) restituisce numero/id FIC (l'app salva il record e genera il PDF)
//
// Le risposte di errore "gestite" tornano con HTTP 200 e { ok:false, code, ... }
// cosi' l'app puo' mostrare un messaggio chiaro.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FIC_API = "https://api-v2.fattureincloud.it";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "method", message: "Metodo non consentito" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const FIC_CLIENT_ID = Deno.env.get("FIC_CLIENT_ID")!;
  const FIC_CLIENT_SECRET = Deno.env.get("FIC_CLIENT_SECRET")!;

  // 1) auth utente
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ ok: false, code: "auth", message: "Non autenticato" }, 401);

  const asUser = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, code: "auth", message: "Sessione non valida" }, 401);
  const uid = userData.user.id;
  const body = await req.json().catch(() => ({} as any));

  // 2) token FIC dalla cassaforte (service_role)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: conn, error: connErr } = await admin
    .from("fic_connections").select("*").eq("professional_user_id", uid).maybeSingle();
  if (connErr) return json({ ok: false, code: "db", message: "Errore lettura connessione FIC" });
  if (!conn) return json({ ok: false, code: "not_connected", message: "Account Fatture in Cloud non collegato" });

  let accessToken: string = conn.access_token;
  const companyId = conn.company_id;

  // 3) refresh se scaduto (o in scadenza entro 60s)
  const expMs = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (!expMs || expMs - Date.now() < 60000) {
    const rt = await fetch(`${FIC_API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: FIC_CLIENT_ID,
        client_secret: FIC_CLIENT_SECRET,
        refresh_token: conn.refresh_token,
      }),
    });
    if (!rt.ok) {
      const t = await rt.text();
      return json({ ok: false, code: "token", message: "Rinnovo del collegamento FIC non riuscito. Riprova a collegare l'account dal Profilo.", detail: t });
    }
    const tok = await rt.json();
    accessToken = tok.access_token;
    const newExp = new Date(Date.now() + ((Number(tok.expires_in) || 3600) * 1000)).toISOString();
    await admin.from("fic_connections").update({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || conn.refresh_token,
      token_expires_at: newExp,
    }).eq("professional_user_id", uid);
  }

  const ficHeaders = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  // 4) aliquote IVA della company -> mappa codice Policettivo -> id vat_type FIC
  const vtRes = await fetch(`${FIC_API}/c/${companyId}/info/vat_types`, { headers: ficHeaders });
  if (!vtRes.ok) {
    const t = await vtRes.text();
    return json({ ok: false, code: "vat_read", message: "Impossibile leggere le aliquote IVA da Fatture in Cloud", detail: t });
  }
  const vtBody = await vtRes.json();
  const vatTypes: any[] = Array.isArray(vtBody?.data) ? vtBody.data : [];

  // Azione dedicata: restituisce l'elenco aliquote (per l'abbinamento nel Profilo). Non crea nulla.
  if (body?.action === "vat_types") {
    return json({
      ok: true,
      aliquote_fic: vatTypes.map((v: any) => ({
        id: v.id,
        value: v.value,
        natura: String(v.ei_type ?? v.eiType ?? ""),
        descrizione: String(v.description ?? ""),
        disattivata: (v.is_disabled ?? v.isDisabled) === true,
      })),
    });
  }

  // Abbinamento scelto dal professionista (professionals.fic_vat_map): codice Policettivo -> id vat_type FIC.
  let vatMap: Record<string, number> = {};
  {
    const { data: profRow } = await admin.from("professionals").select("fic_vat_map").eq("user_id", uid).maybeSingle();
    if (profRow && profRow.fic_vat_map && typeof profRow.fic_vat_map === "object") vatMap = profRow.fic_vat_map as any;
  }

  const nat = (v: any) => String(v?.ei_type ?? v?.eiType ?? "").toUpperCase();
  const disabled = (v: any) => (v?.is_disabled ?? v?.isDisabled) === true;
  const txt = (v: any) => (String(v?.description ?? "") + " " + String(v?.notes ?? "")).toLowerCase();

  function findVatId(code: string, rate: number, natura: string | null): number | null {
    let m: any = null;
    // 1) abbinamento esplicito scelto dal professionista (fonte di verita')
    if (vatMap && vatMap[code] != null) {
      const id = Number(vatMap[code]);
      if (vatTypes.some((v) => Number(v.id) === id)) return id;
    }
    if (rate > 0) {
      m = vatTypes.find((v) => Number(v.value) === rate && !disabled(v))
       || vatTypes.find((v) => Number(v.value) === rate);
      return m ? Number(m.id) : null;
    }
    // aliquote a 0%: esente / non imponibile / forfettario.
    // Tollerante: molti account FIC hanno l'esente art.10 SENZA la natura impostata,
    // quindi si abbina anche per descrizione ("Esente art. 10" / "esente").
    const zeros = vatTypes.filter((v) => Number(v.value) === 0);
    const active = zeros.filter((v) => !disabled(v));
    const pool = active.length ? active : zeros;
    const pick = (pred: (v: any) => boolean) => pool.find(pred);
    const has10 = (v: any) => /art\.?\s*10|(^|[^0-9])10([^0-9]|$)/.test(txt(v));
    const hasEsente = (v: any) => /esent/.test(txt(v));
    if (code === "ESENTE10") {
      m = pick((v) => nat(v).startsWith("N4") && has10(v))
       || pick((v) => nat(v).startsWith("N4"))
       || pick((v) => has10(v))
       || pick((v) => hasEsente(v));
      return m ? Number(m.id) : null;
    }
    if (code === "FORF") {
      m = pick((v) => nat(v).toUpperCase().startsWith("N2"))
       || pick((v) => /forfett/.test(txt(v)));
      return m ? Number(m.id) : null;
    }
    const wantN = String(natura || "").toUpperCase();
    m = pick((v) => nat(v).startsWith(wantN)) || pool[0];
    return m ? Number(m.id) : null;
  }

  // 5) items_list dai dati dell'app
  const righe: any[] = Array.isArray(body?.righe) ? body.righe : [];
  if (!righe.length) return json({ ok: false, code: "empty", message: "Nessuna voce da inviare" });

  const items: any[] = [];
  const mancanti = new Set<string>();
  for (const r of righe) {
    const rate = Number(r.aliquota) || 0;
    const vid = findVatId(String(r.iva_code || ""), rate, r.natura || null);
    if (vid == null) { mancanti.add(String(r.iva_label || r.iva_code || "?")); continue; }
    items.push({
      name: String(r.descrizione || "Prestazione"),
      qty: Number(r.quantita) || 1,
      net_price: Number(r.prezzo_unitario) || 0,
      vat: { id: vid },
    });
  }
  // Modalita' PROVA: verifica l'abbinamento delle aliquote SENZA creare nulla su FIC.
  if (body?.prova === true) {
    return json({
      ok: mancanti.size === 0,
      prova: true,
      code: mancanti.size ? "vat_mapping" : undefined,
      missing: Array.from(mancanti),
      mappate: items.map((it) => ({ name: it.name, vat_id: it.vat.id, net_price: it.net_price })),
      aliquote_fic: vatTypes.map((v: any) => ({
        id: v.id,
        value: v.value,
        natura: String(v.ei_type ?? v.eiType ?? ""),
        descrizione: String(v.description ?? ""),
        disattivata: (v.is_disabled ?? v.isDisabled) === true,
      })),
      message: mancanti.size
        ? "Prova: alcune righe non trovano l'aliquota giusta in FIC (vedi elenco). NESSUNA fattura creata."
        : "Prova riuscita: tutte le righe si abbinano alle aliquote di FIC. NESSUNA fattura creata.",
    });
  }

  if (mancanti.size) {
    return json({ ok: false, code: "vat_mapping", missing: Array.from(mancanti),
      message: "In Fatture in Cloud mancano alcune aliquote IVA. Configurale in FIC e riprova." });
  }

  // 6) entity cliente
  const c = body?.cliente || {};
  const entity: any = {
    name: ((String(c.cognome || "") + " " + String(c.nome || "")).trim()) || "Cliente",
    tax_code: (String(c.codice_fiscale || "").toUpperCase()) || null,
    address_street: c.indirizzo || null,
    address_postal_code: c.cap || null,
    address_city: c.citta || null,
  };

  // 7) crea il documento (senza number -> FIC assegna la numerazione)
  // nc-v1: 'credit_note' quando l'app sta emettendo una nota di credito.
  // Il riferimento alla fattura stornata va nell'oggetto visibile, cosi' resta
  // stampato anche sul PDF prodotto da Fatture in Cloud.
  const isNotaCredito = String(body?.tipo_doc || "") === "nota_credito";
  const docPayload: any = {
    data: {
      type: isNotaCredito ? "credit_note" : "invoice",
      entity,
      e_invoice: false, // sanitaria/privato: niente SDI (invio a TS poi da FIC)
      items_list: items,
    },
  };
  if (isNotaCredito) {
    const rif = body?.rif_fattura || {};
    const rifNum = String(rif.numero || "").trim();
    const rifData = String(rif.data || "").trim();
    if (rifNum) {
      docPayload.data.visible_subject =
        "Storno della fattura n. " + rifNum +
        (rifData ? (" del " + rifData.split("-").reverse().join("/")) : "");
    }
  }
  if (body?.data_emissione) docPayload.data.date = String(body.data_emissione);
  if (Number(body?.bollo) > 0) docPayload.data.stamp_duty = Number(body.bollo);

  const crRes = await fetch(`${FIC_API}/c/${companyId}/issued_documents`, {
    method: "POST", headers: ficHeaders, body: JSON.stringify(docPayload),
  });
  const crText = await crRes.text();
  if (!crRes.ok) {
    return json({ ok: false, code: "fic_error",
      message: (isNotaCredito
        ? "Creazione della nota di credito su Fatture in Cloud non riuscita"
        : "Creazione della fattura su Fatture in Cloud non riuscita"),
      detail: crText });
  }
  let crBody: any = {};
  try { crBody = JSON.parse(crText); } catch { crBody = {}; }
  const d = crBody?.data || {};
  const number = (d.number != null) ? d.number : null;
  const numeration = (d.numeration != null) ? String(d.numeration) : "";
  const anno = String(body?.data_emissione || "").substring(0, 4);
  const display = (number != null)
    ? ((anno ? (anno + "/" + number) : String(number)) + (numeration ? (" " + numeration) : "")).trim()
    : "";

  return json({
    ok: true,
    fic_document_id: (d.id != null) ? String(d.id) : "",
    fic_number: number,
    fic_numeration: numeration,
    fic_numero: display,
  });
});