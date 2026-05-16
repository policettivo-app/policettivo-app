;(function () {
  const page = (window.location.pathname.split('/').pop() || 'index.html')
  if (['login.html', 'registrazione.html'].includes(page)) return
  if (document.querySelector('meta[name="hide-bottom-nav"]')?.content === 'true') return

  const SUPABASE_URL = 'https://kazlnoikvwdqwvxtigej.supabase.co'
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthemxub2lrdndkcXd2eHRpZ2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTM1MDEsImV4cCI6MjA5MzEyOTUwMX0.gCclWImW4SnIBcsNfFAW0KNtimEw6iiEiLnXbgC96mE'

  let _sb = null
  let _session = null

  function getClient() {
    if (_sb) return _sb
    if (window.supabase && window.supabase.createClient) {
      _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
      return _sb
    }
    return null
  }

  // ── Inject styles ───────────────────────────────────────

  const style = document.createElement('style')
  style.textContent = `
    #cnav-bar {
      position: fixed; bottom: 0; left: 0; right: 0; height: 54px;
      background: #000; border-top: 1px solid #222;
      display: flex; align-items: stretch;
      z-index: 9000; font-family: 'Montserrat', sans-serif;
    }
    .cnav-btn {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 2px;
      background: none; border: none; color: #fff; cursor: pointer;
      padding: 6px 2px; min-width: 0;
      -webkit-tap-highlight-color: transparent; transition: background 0.15s;
    }
    .cnav-btn:hover, .cnav-btn:active { background: #1a1a1a; }
    .cnav-btn.active { color: #FFD008; }
    .cnav-icon { font-size: 20px; line-height: 1; }
    .cnav-label { font-size: 9px; font-weight: 600; letter-spacing: 0.3px;
                  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                  max-width: 100%; color: inherit; }

    /* overlay backdrop */
    #cnav-overlay {
      display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65);
      z-index: 8999;
    }
    #cnav-overlay.open { display: block; }

    /* modals */
    .cnav-modal {
      display: none; position: fixed; left: 50%; transform: translateX(-50%);
      bottom: 62px; width: min(480px, calc(100vw - 24px));
      background: #fff; border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.25);
      z-index: 9001; overflow: hidden;
      font-family: 'Montserrat', sans-serif;
    }
    .cnav-modal.open { display: block; }
    .cnav-modal-head {
      background: #000; padding: 14px 18px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .cnav-modal-title { color: #fff; font-size: 13px; font-weight: 700; }
    .cnav-modal-close {
      background: none; border: none; color: #888; font-size: 18px;
      cursor: pointer; padding: 0; line-height: 1;
    }
    .cnav-modal-close:hover { color: #fff; }
    .cnav-modal-body { padding: 16px; max-height: 60vh; overflow-y: auto; }

    /* search */
    #cnav-search-input {
      width: 100%; border: 1.5px solid #ddd; border-radius: 8px;
      padding: 10px 14px; font-family: 'Montserrat', sans-serif; font-size: 14px;
      outline: none; color: #000; margin-bottom: 12px; box-sizing: border-box;
    }
    #cnav-search-input:focus { border-color: #FFD008; }
    #cnav-search-results { list-style: none; margin: 0; padding: 0; }
    #cnav-search-results li {
      padding: 10px 12px; border-radius: 8px; cursor: pointer;
      font-size: 13px; color: #000; border: 1px solid #f0f0f0;
      margin-bottom: 6px; transition: background 0.1s;
    }
    #cnav-search-results li:hover { background: #fffdf0; border-color: #FFD008; }
    #cnav-search-empty { font-size: 13px; color: #999; text-align: center; padding: 12px 0; }

    /* profile */
    .cnav-profile-email {
      font-size: 13px; color: #333; font-weight: 600;
      text-align: center; padding: 4px 0 16px; word-break: break-all;
    }
    .cnav-btn-logout {
      width: 100%; padding: 13px; background: #000; border: none;
      border-radius: 10px; color: #fff; font-family: 'Montserrat', sans-serif;
      font-size: 13px; font-weight: 700; cursor: pointer;
    }
    .cnav-btn-logout:hover { background: #222; }

    /* body padding so content isn't hidden under the bar */
    body { padding-bottom: 60px !important; }
  `
  document.head.appendChild(style)

  // ── Inject HTML ─────────────────────────────────────────

  const overlay = document.createElement('div')
  overlay.id = 'cnav-overlay'
  overlay.onclick = closeAll

  const searchModal = document.createElement('div')
  searchModal.className = 'cnav-modal'
  searchModal.id = 'cnav-modal-search'
  searchModal.innerHTML = `
    <div class="cnav-modal-head">
      <span class="cnav-modal-title">🔍 Cerca paziente</span>
      <button class="cnav-modal-close" onclick="cnavCloseAll()">✕</button>
    </div>
    <div class="cnav-modal-body">
      <input id="cnav-search-input" type="search" placeholder="Nome o cognome..." autocomplete="off">
      <ul id="cnav-search-results"></ul>
      <div id="cnav-search-empty" style="display:none">Nessun risultato</div>
    </div>
  `

  const profileModal = document.createElement('div')
  profileModal.className = 'cnav-modal'
  profileModal.id = 'cnav-modal-profile'
  profileModal.innerHTML = `
    <div class="cnav-modal-head">
      <span class="cnav-modal-title">👤 Profilo</span>
      <button class="cnav-modal-close" onclick="cnavCloseAll()">✕</button>
    </div>
    <div class="cnav-modal-body">
      <div class="cnav-profile-email" id="cnav-profile-email">—</div>
      <button class="cnav-btn-logout" onclick="cnavLogout()">Esci dall'account</button>
    </div>
  `

  const bar = document.createElement('nav')
  bar.id = 'cnav-bar'
  bar.innerHTML = `
    <button class="cnav-btn" onclick="cnavGo('dashboard.html')" title="Dashboard">
      <span class="cnav-icon">🏠</span>
      <span class="cnav-label">Dashboard</span>
    </button>
    <button class="cnav-btn" id="cnav-btn-cerca" onclick="cnavToggleSearch()" title="Cerca">
      <span class="cnav-icon">🔍</span>
      <span class="cnav-label">Cerca</span>
    </button>
    <button class="cnav-btn" onclick="cnavGo('dashboard.html')" title="Nuovo paziente">
      <span class="cnav-icon">➕</span>
      <span class="cnav-label">Nuovo paz.</span>
    </button>
    <button class="cnav-btn" id="cnav-btn-seduta" onclick="cnavUltimaSeduta()" title="Ultima seduta">
      <span class="cnav-icon">📋</span>
      <span class="cnav-label">Ultima sed.</span>
    </button>
    <button class="cnav-btn" id="cnav-btn-profilo" onclick="cnavToggleProfilo()" title="Profilo">
      <span class="cnav-icon">👤</span>
      <span class="cnav-label">Profilo</span>
    </button>
  `

  function injectDOM() {
    document.body.appendChild(overlay)
    document.body.appendChild(searchModal)
    document.body.appendChild(profileModal)
    document.body.appendChild(bar)
    markActivePage()
    initSearch()
    loadSession()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectDOM)
  } else {
    injectDOM()
  }

  // ── Active page highlight ───────────────────────────────

  function markActivePage() {
    if (page === 'dashboard.html') {
      bar.querySelector('.cnav-btn').classList.add('active')
    }
  }

  // ── Session ─────────────────────────────────────────────

  async function loadSession() {
    const client = getClient()
    if (!client) return
    const { data } = await client.auth.getSession()
    _session = data.session
    const emailEl = document.getElementById('cnav-profile-email')
    if (emailEl && _session) emailEl.textContent = _session.user.email
  }

  // ── Navigation ──────────────────────────────────────────

  window.cnavGo = function (url) {
    closeAll()
    window.location.href = url
  }

  // ── Search ──────────────────────────────────────────────

  function initSearch() {
    const input = document.getElementById('cnav-search-input')
    if (!input) return
    let debTimer = null
    input.addEventListener('input', () => {
      clearTimeout(debTimer)
      debTimer = setTimeout(() => runSearch(input.value.trim()), 280)
    })
    input.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll() })
  }

  async function runSearch(q) {
    const resultsList = document.getElementById('cnav-search-results')
    const emptyEl     = document.getElementById('cnav-search-empty')
    if (!resultsList) return
    resultsList.innerHTML = ''
    emptyEl.style.display = 'none'
    if (q.length < 2) return

    const client = getClient()
    if (!client) return

    const { data } = await client
      .from('patients')
      .select('id, nome, cognome, problema_principale')
      .or(`nome.ilike.%${q}%,cognome.ilike.%${q}%`)
      .limit(10)

    if (!data || !data.length) { emptyEl.style.display = 'block'; return }

    data.forEach(p => {
      const li = document.createElement('li')
      li.innerHTML = `<strong>${p.nome} ${p.cognome}</strong>${p.problema_principale ? '<br><span style="font-size:11px;color:#999">' + p.problema_principale + '</span>' : ''}`
      li.onclick = () => { closeAll(); window.location.href = 'paziente.html?id=' + p.id }
      resultsList.appendChild(li)
    })
  }

  window.cnavToggleSearch = function () {
    const isOpen = searchModal.classList.contains('open')
    closeAll()
    if (!isOpen) {
      searchModal.classList.add('open')
      overlay.classList.add('open')
      document.getElementById('cnav-btn-cerca')?.classList.add('active')
      setTimeout(() => document.getElementById('cnav-search-input')?.focus(), 100)
    }
  }

  // ── Ultima seduta ────────────────────────────────────────

  window.cnavUltimaSeduta = async function () {
    closeAll()
    const client = getClient()
    if (!client || !_session) return

    const { data: prof } = await client
      .from('professionals')
      .select('id')
      .eq('user_id', _session.user.id)
      .maybeSingle()
    if (!prof) return

    const { data: seduta } = await client
      .from('therapy_sessions')
      .select('patient_id')
      .eq('professional_id', prof.id)
      .order('data_seduta', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (seduta) {
      window.location.href = 'diario.html?pid=' + seduta.patient_id
    } else {
      alert('Nessuna seduta registrata.')
    }
  }

  // ── Profile ──────────────────────────────────────────────

  window.cnavToggleProfilo = function () {
    const isOpen = profileModal.classList.contains('open')
    closeAll()
    if (!isOpen) {
      profileModal.classList.add('open')
      overlay.classList.add('open')
      document.getElementById('cnav-btn-profilo')?.classList.add('active')
    }
  }

  window.cnavLogout = async function () {
    const client = getClient()
    if (client) await client.auth.signOut()
    window.location.href = 'login.html'
  }

  // ── Close all ────────────────────────────────────────────

  function closeAll() {
    searchModal.classList.remove('open')
    profileModal.classList.remove('open')
    overlay.classList.remove('open')
    document.getElementById('cnav-btn-cerca')?.classList.remove('active')
    document.getElementById('cnav-btn-profilo')?.classList.remove('active')
  }
  window.cnavCloseAll = closeAll

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll() })
})()
