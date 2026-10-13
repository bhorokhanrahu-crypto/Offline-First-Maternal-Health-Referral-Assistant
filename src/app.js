// ---------- helpers ----------
function $(s) { return document.querySelector(s); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
// Storage layer: localStorage (works offline, also when opened directly from file://)
const store = {
  get: function (k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } },
  set: function (k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
const VISIT_DRAFT_KEY = 'matref-visit-draft-v1';
function readVisitDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(VISIT_DRAFT_KEY) || 'null');
    return draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : null;
  } catch (error) {
    console.error('Could not read saved visit draft:', error);
    return null;
  }
}
function collectVisitDraft(form) {
  return {
    displayId: form.elements.displayId.value,
    age: form.elements.age.value,
    weeks: form.elements.weeks.value,
    visitDate: form.elements.visitDate.value,
    chwId: form.elements.chwId.value,
    symptoms: Array.from(form.querySelectorAll('input[name=sym]:checked')).map(function (field) { return field.value; }),
    notes: form.elements.notes.value
  };
}
function saveVisitDraft(form) {
  const draft = collectVisitDraft(form);
  const hasContent = draft.displayId.trim() || draft.age || draft.weeks || draft.chwId.trim() || draft.notes.trim() || draft.symptoms.length;
  try {
    if (hasContent) localStorage.setItem(VISIT_DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(VISIT_DRAFT_KEY);
    $('#draft-status').textContent = t(hasContent ? 'draft_saved' : 'draft_empty');
  } catch (error) {
    console.error('Could not save visit draft:', error);
    $('#draft-status').textContent = t('draft_save_failed');
  }
}
function symptomLabel(id) {
  const s = SYMPTOMS.find(function (x) { return x.id === id; });
  return s ? t('symptom_' + id) : id;
}
function displayNote(note) {
  const sampleNotes = ['Routine visit.', 'Reported this morning.', TRANSLATIONS.en.routine_note, TRANSLATIONS.en.reported_today,
    TRANSLATIONS.ur.routine_note, TRANSLATIONS.ur.reported_today, TRANSLATIONS.sd.routine_note, TRANSLATIONS.sd.reported_today];
  if (sampleNotes.indexOf(note) === -1) return note;
  return note === 'Routine visit.' || note === TRANSLATIONS.en.routine_note || note === TRANSLATIONS.ur.routine_note || note === TRANSLATIONS.sd.routine_note
    ? t('routine_note') : t('reported_today');
}

// ---------- navigation ----------
let view = { name: 'dashboard', id: null };
let appMode = localStorage.getItem('matref-mode') === 'online' ? 'online' : 'offline';
let chatMessages = [];
let chatStatus = 'unknown';
let chatSending = false;
let chatError = false;
let chatRetryQuestion = '';
function go(name, id) { view = { name: name, id: id || null }; render(); window.scrollTo(0, 0); }

function updateModeUI() {
  document.querySelectorAll('[data-mode]').forEach(function (button) {
    const selected = button.dataset.mode === appMode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const chatButton = $('nav button[data-view="chat"]');
  chatButton.hidden = appMode !== 'online';
  $('#mode-description').textContent = t(appMode === 'offline' ? 'offline_mode_desc' : 'online_mode_desc');
}

function setMode(mode) {
  if (mode !== 'offline' && mode !== 'online') return;
  if (mode === appMode) return;
  appMode = mode;
  localStorage.setItem('matref-mode', appMode);
  chatMessages = [];
  chatError = false;
  chatRetryQuestion = '';
  chatStatus = appMode === 'online' && navigator.onLine ? 'unknown' : 'offline';
  if (appMode === 'offline' && view.name === 'chat') view = { name: 'dashboard', id: null };
  updateModeUI();
  render();
}

function setLanguage(language) {
  const form = $('#f');
  const draft = {};
  if (form) {
    Array.from(form.elements).forEach(function (field) {
      if (!field.name) return;
      if (field.type === 'checkbox') {
        if (field.checked) (draft[field.name] || (draft[field.name] = [])).push(field.value);
      } else {
        draft[field.name] = field.value;
      }
    });
  }
  localStorage.setItem('matref-language', language);
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'en' ? 'ltr' : 'rtl';
  document.title = t('app_title');
  $('#language').setAttribute('aria-label', t('language'));
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    el.textContent = t(el.dataset.i18n);
  });
  updateModeUI();
  $('#language').value = language;
  updateNet();
  render();
  if (view.name === 'register' && Object.keys(draft).length) {
    const newForm = $('#f');
    Object.keys(draft).forEach(function (name) {
      Array.from(newForm.elements).forEach(function (field) {
        if (field.name !== name) return;
        if (field.type === 'checkbox') field.checked = draft[name].indexOf(field.value) !== -1;
        else field.value = draft[name];
      });
    });
  }
}

function render() {
  updateModeUI();
  document.querySelectorAll('nav button').forEach(function (b) {
    b.classList.toggle('active', b.dataset.view === view.name);
  });
  const m = $('#main');
  if (view.name === 'dashboard') renderDashboard(m);
  else if (view.name === 'register') renderRegister(m);
  else if (view.name === 'facilities') renderFacilities(m);
  else if (view.name === 'summary') renderSummary(m);
  else if (view.name === 'chat') renderChat(m);
}

// ---------- dashboard ----------
function renderDashboard(m) {
  const patients = store.get('patients');
  const visits = store.get('visits').sort(function (a, b) { return b.createdAt - a.createdAt; });
  const pending = visits.filter(function (v) { return v.review === 'pending'; });
  const urgent = pending.filter(function (v) { return v.flags.some(function (f) { return f.level === 'urgent'; }); });
  const unsynced = visits.filter(function (v) { return !v.synced; });
  const stats = [['demo_patients', patients.length], ['pending_review', pending.length],
                 ['urgent_to_review', urgent.length], ['awaiting_sync', unsynced.length]];
  let html = '<div class="stats">' + stats.map(function (s) {
    return '<div class="card stat-card"><b>' + s[1] + '</b><span>' + esc(t(s[0])) + '</span></div>';
  }).join('') + '</div><h2>' + esc(t('visits')) + '</h2>';
  if (!visits.length) html += '<div class="empty-state"><p>' + esc(t('no_visits')) + '</p><button class="primary" id="empty-add">' + esc(t('add_visit')) + '</button></div>';
  if (visits.length) html += '<div class="visit-tools"><label>' + esc(t('visits_search')) + '<input id="visit-search" type="search" placeholder="' + esc(t('visits_search')) + '"></label>' +
    '<label>' + esc(t('visit_filter')) + '<select id="visit-filter"><option value="all">' + esc(t('all_visits')) + '</option><option value="urgent">' + esc(t('urgent_only')) + '</option>' +
    '<option value="pending">' + esc(t('needs_review')) + '</option><option value="reviewed">' + esc(t('reviewed_only')) + '</option></select></label></div><div id="visit-list"></div>';
  html += '<div class="actions no-print"><button id="demo">' + esc(t('load_samples')) + '</button><button id="export" class="quiet-button">' + esc(t('export_backup')) + '</button><button id="clear" class="quiet-button">' + esc(t('clear_demo')) + '</button></div>';
  m.innerHTML = html;
  if ($('#empty-add')) $('#empty-add').onclick = function () { go('register'); };
  function drawVisits() {
    const query = $('#visit-search').value.trim().toLocaleLowerCase();
    const filter = $('#visit-filter').value;
    const matches = visits.filter(function (v) {
      const patient = patients.find(function (x) { return x.id === v.patientId; });
      const searchable = [patient ? patient.displayId : '', v.visitDate, v.chwId, v.notes,
        v.symptoms.map(symptomLabel).join(' ')].join(' ').toLocaleLowerCase();
      const urgentVisit = v.flags.some(function (flag) { return flag.level === 'urgent'; });
      return searchable.indexOf(query) !== -1 &&
        (filter === 'all' || (filter === 'urgent' && urgentVisit) ||
          (filter === 'pending' && v.review === 'pending') || (filter === 'reviewed' && v.review === 'reviewed'));
    });
    $('#visit-list').innerHTML = matches.map(function (v) {
    const p = patients.find(function (x) { return x.id === v.patientId; });
    const isUrgent = v.flags.some(function (f) { return f.level === 'urgent'; });
    return '<div class="card row" data-open="' + v.id + '"><span><b>' + esc(p ? p.displayId : '?') + '</b> · ' + esc(v.visitDate) + '</span><span>' +
      (isUrgent ? '<span class="pill off">' + esc(t('urgent')) + '</span> ' : (v.flags.length ? '<span class="pill warn">' + esc(t('review')) + '</span> ' : '')) +
      '<span class="pill">' + esc(t(v.review)) + '</span></span></div>';
    }).join('') || '<p class="empty-filter">' + esc(t('no_matching_visits')) + '</p>';
    $('#visit-list').querySelectorAll('[data-open]').forEach(function (el) {
      el.onclick = function () { go('summary', Number(el.dataset.open)); };
    });
  }
  if (visits.length) {
    $('#visit-search').oninput = drawVisits;
    $('#visit-filter').onchange = drawVisits;
    drawVisits();
  }
  $('#demo').onclick = function () {
    const timestamp = Date.now();
    const samples = [
      { id: 'DEMO-001', age: 24, weeks: 30, symptoms: [], notes: t('routine_note') },
      { id: 'DEMO-002', age: 31, weeks: 36, symptoms: ['bleeding', 'headache_vision'], notes: t('reported_today') },
      { id: 'DEMO-003', age: 19, weeks: 22, symptoms: ['fever'], notes: '' }
    ];
    const ps = store.get('patients'), vs = store.get('visits');
    samples.forEach(function (x, i) {
      const pid = timestamp + i * 2;
      ps.push({ id: pid, displayId: x.id, age: x.age, weeks: x.weeks });
      vs.push({ id: pid + 1, patientId: pid, visitDate: new Date().toISOString().slice(0, 10), chwId: 'CHW-DEMO',
        symptoms: x.symptoms, notes: x.notes, flags: evaluate(x.symptoms), guidanceVersion: GUIDANCE_VERSION,
        review: 'pending', synced: false, createdAt: timestamp + i });
    });
    store.set('patients', ps); store.set('visits', vs); render();
  };
  $('#export').onclick = function () {
    if (!confirm(t('export_confirm'))) return;
    try {
      const backup = {
        format: 'maternal-referral-assistant',
        version: 1,
        exportedAt: new Date().toISOString(),
        patients: store.get('patients'),
        visits: store.get('visits')
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'maternal-referral-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (error) {
      console.error('Could not export local visit data:', error);
      alert(t('export_failed'));
    }
  };
  $('#clear').onclick = function () {
    if (confirm(t('delete_confirm'))) { store.set('patients', []); store.set('visits', []); render(); }
  };
}

// ---------- new visit ----------
function renderRegister(m) {
  const today = new Date().toISOString().slice(0, 10);
  const draft = readVisitDraft();
  m.innerHTML =
    '<form id="f"><h2>' + esc(t('new_visit_title')) + '</h2>' +
    '<p id="draft-status" class="draft-status" role="status">' + esc(t(draft ? 'draft_restored' : 'draft_empty')) + '</p>' +
    '<label>' + esc(t('patient_id')) + '<input name="displayId" placeholder="' + esc(t('patient_id_hint')) + '" value="' + esc(draft && draft.displayId || '') + '"></label>' +
    '<label>' + esc(t('age')) + '<input name="age" type="number" min="1" inputmode="numeric" value="' + esc(draft && draft.age || '') + '"></label>' +
    '<label>' + esc(t('weeks')) + '<input name="weeks" type="number" min="0" inputmode="numeric" value="' + esc(draft && draft.weeks || '') + '"></label>' +
    '<label>' + esc(t('visit_date')) + '<input name="visitDate" type="date" value="' + esc(draft && draft.visitDate || today) + '"></label>' +
    '<label>' + esc(t('chw_id')) + '<input name="chwId" value="' + esc(draft && draft.chwId || '') + '"></label>' +
    '<fieldset><legend>' + esc(t('symptoms')) + '</legend>' +
    SYMPTOMS.map(function (s) {
      return '<label class="check"><input type="checkbox" name="sym" value="' + s.id + '"' +
        (draft && Array.isArray(draft.symptoms) && draft.symptoms.indexOf(s.id) !== -1 ? ' checked' : '') + '> ' + esc(symptomLabel(s.id)) + '</label>';
    }).join('') + '</fieldset>' +
    '<label>' + esc(t('notes')) + '<textarea name="notes" rows="3">' + esc(draft && draft.notes || '') + '</textarea></label>' +
    '<p id="err" class="err"></p>' +
    '<div class="actions"><button class="primary" type="submit">' + esc(t('save_evaluate')) + '</button>' +
    '<button class="quiet-button" id="discard-draft" type="button">' + esc(t('discard_draft')) + '</button></div></form>';

  const form = $('#f');
  form.addEventListener('input', function () { saveVisitDraft(form); });
  form.addEventListener('change', function () { saveVisitDraft(form); });
  $('#discard-draft').onclick = function () {
    try {
      localStorage.removeItem(VISIT_DRAFT_KEY);
    } catch (error) {
      console.error('Could not discard visit draft:', error);
      $('#draft-status').textContent = t('draft_save_failed');
      return;
    }
    form.reset();
    form.elements.visitDate.value = today;
    $('#draft-status').textContent = t('draft_empty');
  };
  form.onsubmit = function (e) {
    e.preventDefault();
    const f = e.target;
    const displayId = f.elements.displayId.value.trim();
    const chwId = f.elements.chwId.value.trim();
    const age = Number(f.elements.age.value);
    if (!displayId || !chwId || !(age > 0)) { $('#err').textContent = t('required_error'); return; }
    const symptoms = Array.from(f.querySelectorAll('input[name=sym]:checked')).map(function (c) { return c.value; });

    const patients = store.get('patients');
    let p = patients.find(function (x) { return x.displayId === displayId; });
    if (!p) {
      p = { id: Date.now(), displayId: displayId, age: age, weeks: f.elements.weeks.value ? Number(f.elements.weeks.value) : null };
      patients.push(p);
    }
    const visits = store.get('visits');
    const visit = {
      id: Date.now() + 1, patientId: p.id, visitDate: f.elements.visitDate.value, chwId: chwId,
      symptoms: symptoms, notes: f.elements.notes.value.trim(), flags: evaluate(symptoms),
      guidanceVersion: GUIDANCE_VERSION, review: 'pending', synced: false, createdAt: Date.now()
    };
    visits.push(visit);
    store.set('patients', patients);
    store.set('visits', visits);
    try {
      localStorage.removeItem(VISIT_DRAFT_KEY);
    } catch (error) {
      console.error('Could not clear the saved visit draft after saving:', error);
      alert(t('draft_clear_failed'));
    }
    go('summary', visit.id);
  };
}

// ---------- referral summary ----------
function renderSummary(m) {
  const visits = store.get('visits');
  const v = visits.find(function (x) { return x.id === view.id; });
  if (!v) { go('dashboard'); return; }
  const p = store.get('patients').find(function (x) { return x.id === v.patientId; });
  const urgent = v.flags.find(function (f) { return f.level === 'urgent'; });
  const missing = [];
  if (p.weeks == null) missing.push(t('missing_weeks'));
  if (!v.notes) missing.push(t('clinical_notes'));

  let html = '';
  if (urgent) html += '<div class="alert"><b>' + esc(t('urgent')) + ':</b> ' + esc(t('urgent_action')) + '</div>';
  html += '<h2>' + esc(t('referral_summary')) + '</h2><div class="card summary-card">' +
    '<p><b>' + esc(t('patient')) + ':</b> ' + esc(p.displayId) + ' · ' + esc(t('age_short')) + ' ' + p.age + (p.weeks != null ? ' · ' + p.weeks + ' ' + esc(t('weeks_short')) : '') + '</p>' +
    '<p><b>' + esc(t('visit')) + ':</b> ' + esc(v.visitDate) + ' · ' + esc(t('chw_id')) + ' ' + esc(v.chwId) + '</p>' +
    '<p><b>' + esc(t('recorded')) + ':</b> ' + (v.symptoms.length ? v.symptoms.map(symptomLabel).map(esc).join(', ') : esc(t('no_warning'))) + '</p>' +
    (v.notes ? '<p><b>' + esc(t('clinical_notes')) + ':</b> ' + esc(displayNote(v.notes)) + '</p>' : '') + '</div><h3>' + esc(t('warnings')) + '</h3>';
  if (!v.flags.length) html += '<p>' + esc(t('no_rule')) + '</p>';
  v.flags.forEach(function (f) {
    html += '<div class="card flag ' + f.level + '"><b>' + esc(t(f.level)) + ':</b> ' + esc(t('reason_' + f.ruleId)) +
      '<br><small><b>' + esc(t('action')) + ':</b> ' + esc(t(f.level === 'urgent' ? 'urgent_action' : 'review_action')) + '</small><br><small>' +
      esc(t('guidance_ref')) + ': ' + esc(t('guidance_not_verified')) + ' · ' + esc(t('version')) + ' ' + esc(v.guidanceVersion) + '</small></div>';
  });
  html += '<p><b>' + esc(t('missing_info')) + ':</b> ' + (missing.length ? missing.map(esc).join(', ') : esc(t('none'))) + '</p>' +
    '<p><b>' + esc(t('professional_review')) + ':</b> ' + esc(t(v.review)) + ' · <b>' + esc(t('sync')) + ':</b> ' + (v.synced ? esc(t('reviewed')) : esc(t('pending'))) + '</p>' +
    '<div class="actions no-print"><button id="rev">' + esc(t(v.review === 'pending' ? 'mark_reviewed' : 'mark_pending')) + '</button>' +
    '<button id="fac">' + esc(t('find_facility')) + '</button><button class="primary" id="prn">' + esc(t('print_summary')) + '</button></div>';
  m.innerHTML = html;

  $('#rev').onclick = function () {
    v.review = v.review === 'pending' ? 'reviewed' : 'pending';
    store.set('visits', visits); render();
  };
  $('#fac').onclick = function () { go('facilities'); };
  $('#prn').onclick = function () { window.print(); };
}

// ---------- facilities ----------
function renderFacilities(m) {
  m.innerHTML = '<h2>' + esc(t('facility_directory')) + '</h2><input id="q" aria-label="' + esc(t('search')) + '" placeholder="' + esc(t('search')) + '"><label class="check"><input type="checkbox" id="em"> ' + esc(t('emergency_only')) + '</label><div id="list"></div>';
  const facilityNames = { f1: 'sample_district_hospital', f2: 'sample_maternity_home', f3: 'sample_health_unit', f4: 'sample_rural_center' };
  const facilityTypes = { Hospital: 'hospital', 'Maternity clinic': 'maternity_clinic', BHU: 'bh_unit', RHC: 'rural_health_center' };
  const facilityAddresses = { f1: 'address_f1', f2: 'address_f2', f3: 'address_f3', f4: 'address_f4' };
  function draw() {
    const q = $('#q').value.toLowerCase();
    const em = $('#em').checked;
    $('#list').innerHTML = FACILITIES.filter(function (x) {
      const translated = [x.name, x.address, x.type, t(facilityNames[x.id]), t(facilityTypes[x.type])].join(' ').toLowerCase();
      return translated.indexOf(q) !== -1 && (!em || x.emergency);
    }).map(function (x) {
      const dir = (navigator.onLine && x.lat != null)
        ? ' · <a target="_blank" rel="noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=' + x.lat + ',' + x.lng + '">' + esc(t('directions')) + '</a>' : '';
      return '<div class="card facility-card"><b>' + esc(t(facilityNames[x.id])) + '</b> ' + (x.emergency ? '<span class="pill ok">' + esc(t('emergency')) + '</span>' : '') +
        '<br>' + esc(t(facilityTypes[x.type])) + ' · ' + esc(t(facilityAddresses[x.id])) + '<br><a href="tel:' + esc(x.phone) + '">' + esc(x.phone) + '</a>' + dir + '</div>';
    }).join('') || '<p>' + esc(t('no_facility')) + '</p>';
  }
  $('#q').oninput = draw; $('#em').onchange = draw; draw();
}

// ---------- optional online chat ----------
function chatStatusKey() {
  if (appMode !== 'online') return 'chat_mode_offline';
  if (!navigator.onLine || chatStatus === 'offline') return 'chat_offline';
  if (chatStatus === 'unknown' || chatStatus === 'checking') return 'chat_connecting';
  if (chatStatus === 'ready') return 'chat_ready';
  if (chatStatus === 'unconfigured') return 'chat_unconfigured';
  return 'chat_unavailable';
}

function renderChat(m) {
  const ready = navigator.onLine && chatStatus === 'ready' && !chatSending;
  const messages = chatMessages.map(function (message) {
    return '<div class="chat-message ' + message.role + '"><b>' +
      esc(message.role === 'assistant' ? t('chat_nav') : t('chat_input')) +
      '</b><p>' + esc(message.content).replace(/\n/g, '<br>') + '</p></div>';
  }).join('');
  m.innerHTML =
    '<section class="chat-panel"><h2>' + esc(t('chat_title')) + '</h2>' +
    '<p class="chat-subtitle">' + esc(t('chat_subtitle')) + '</p>' +
    '<p class="chat-disclosure">' + esc(t('chat_disclosure')) + '</p>' +
    '<p class="chat-safety">' + esc(t('chat_safety')) + '</p>' +
    '<p class="chat-status" role="status" aria-live="polite">' + esc(t(chatSending ? 'chat_sending' : chatStatusKey())) + '</p>' +
    (chatError ? '<p class="chat-error" role="alert">' + esc(t(chatError)) +
      (chatRetryQuestion && ready ? ' <button class="quiet-button" id="chat-retry" type="button">' + esc(t('chat_retry')) + '</button>' : '') + '</p>' : '') +
    '<div class="chat-history" aria-live="polite">' + messages + '</div>' +
    '<div class="chat-prompts"><p>' + esc(t('chat_suggestions')) + '</p>' +
    ['prompt_handover', 'prompt_respectful', 'prompt_routine'].map(function (key) {
      return '<button class="prompt-chip" type="button" data-prompt="' + esc(t(key)) + '"' + (ready ? '' : ' disabled') + '>' + esc(t(key)) + '</button>';
    }).join('') + '</div>' +
    '<form id="chat-form"><label for="chat-question">' + esc(t('chat_input')) +
    '<textarea id="chat-question" name="question" rows="3" maxlength="1500" placeholder="' + esc(t('chat_placeholder')) +
    '" required' + (ready ? '' : ' disabled') + '></textarea></label>' +
    '<div class="actions"><button class="primary" type="submit"' + (ready ? '' : ' disabled') + '>' +
    esc(t('chat_send')) + '</button><button class="quiet-button" type="button" id="chat-clear"' +
    (chatMessages.length && !chatSending ? '' : ' disabled') + '>' + esc(t('chat_clear')) + '</button></div></form></section>';

  if (appMode === 'online' && chatStatus === 'unknown' && navigator.onLine) checkChatStatus();
  $('#chat-clear').onclick = function () { chatMessages = []; chatError = false; chatRetryQuestion = ''; renderChat(m); };
  m.querySelectorAll('[data-prompt]').forEach(function (button) {
    button.onclick = function () {
      $('#chat-question').value = button.dataset.prompt;
      $('#chat-question').focus();
    };
  });
  if ($('#chat-retry')) $('#chat-retry').onclick = function () { sendChat(chatRetryQuestion, true); };
  $('#chat-form').onsubmit = function (event) {
    event.preventDefault();
    const question = $('#chat-question').value.trim();
    if (!question || !navigator.onLine || chatStatus !== 'ready' || chatSending) return;
    sendChat(question, false);
  };
}

function sendChat(question, retrying) {
  if (appMode !== 'online' || !navigator.onLine || chatStatus !== 'ready' || chatSending) return;
  if (!retrying) chatMessages.push({ role: 'user', content: question });
  chatMessages = chatMessages.slice(-12);
  chatSending = true;
  chatError = false;
  chatRetryQuestion = '';
  const controller = new AbortController();
  const timeout = setTimeout(function () { controller.abort(); }, 30000);
  renderChat($('#main'));
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ language: document.documentElement.lang, messages: chatMessages }),
    signal: controller.signal
  }).then(function (response) {
    return response.json().then(function (result) {
      if (!response.ok) throw new Error(result.detail || result.error || 'Chat request failed');
      if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('Chat response was empty');
      chatMessages.push({ role: 'assistant', content: result.reply });
      chatMessages = chatMessages.slice(-12);
    });
  }).catch(function (error) {
    chatError = error.name === 'AbortError' ? 'chat_timeout' : 'chat_unavailable';
    chatRetryQuestion = question;
    console.error('Online chat request failed:', error.message);
  }).then(function () {
    clearTimeout(timeout);
    chatSending = false;
    if (!navigator.onLine) chatStatus = 'offline';
    if (view.name === 'chat') renderChat($('#main'));
  });
}

function checkChatStatus() {
  if (appMode !== 'online') return;
  chatStatus = 'checking';
  fetch('/api/chat/status', { headers: { 'Accept': 'application/json' }, cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('Chat status request failed: ' + response.status);
      return response.json();
    }).then(function (status) {
      chatStatus = status.configured ? 'ready' : 'unconfigured';
    }).catch(function (error) {
      chatStatus = navigator.onLine ? 'unavailable' : 'offline';
      console.error('Online chat status check failed:', error.message);
    }).then(function () {
      if (view.name === 'chat') renderChat($('#main'));
    });
}

// ---------- online/offline + start ----------
function updateNet() {
  const el = $('#net');
  el.textContent = t(navigator.onLine ? 'online' : 'offline');
  el.className = 'pill ' + (navigator.onLine ? 'ok' : 'off');
}
function handleNetworkChange() {
  updateNet();
  if (view.name === 'chat' && appMode === 'online') {
    chatStatus = navigator.onLine ? 'unknown' : 'offline';
    render();
  }
}
window.addEventListener('online', handleNetworkChange);
window.addEventListener('offline', handleNetworkChange);
document.querySelectorAll('nav button').forEach(function (b) { b.onclick = function () { go(b.dataset.view); }; });
document.querySelectorAll('[data-mode]').forEach(function (b) { b.onclick = function () { setMode(b.dataset.mode); }; });
$('#language').onchange = function (e) { setLanguage(e.target.value); };
setLanguage(localStorage.getItem('matref-language') || 'en');
updateNet();

// Service worker only works on https or localhost (not file://)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js');
}
