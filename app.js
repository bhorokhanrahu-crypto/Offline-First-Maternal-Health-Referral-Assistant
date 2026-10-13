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
function symptomLabel(id) {
  const s = SYMPTOMS.find(function (x) { return x.id === id; });
  return s ? s.label : id;
}

// ---------- navigation ----------
let view = { name: 'dashboard', id: null };
function go(name, id) { view = { name: name, id: id || null }; render(); window.scrollTo(0, 0); }

function render() {
  document.querySelectorAll('nav button').forEach(function (b) {
    b.classList.toggle('active', b.dataset.view === view.name);
  });
  const m = $('#main');
  if (view.name === 'dashboard') renderDashboard(m);
  else if (view.name === 'register') renderRegister(m);
  else if (view.name === 'facilities') renderFacilities(m);
  else if (view.name === 'summary') renderSummary(m);
}

// ---------- dashboard ----------
function renderDashboard(m) {
  const patients = store.get('patients');
  const visits = store.get('visits').sort(function (a, b) { return b.createdAt - a.createdAt; });
  const pending = visits.filter(function (v) { return v.review === 'pending'; });
  const urgent = pending.filter(function (v) { return v.flags.some(function (f) { return f.level === 'urgent'; }); });
  const unsynced = visits.filter(function (v) { return !v.synced; });
  const stats = [['Demo patients', patients.length], ['Pending review', pending.length],
                 ['Urgent flags to review', urgent.length], ['Awaiting sync', unsynced.length]];
  let html = '<div class="stats">' + stats.map(function (s) {
    return '<div class="card"><b>' + s[1] + '</b><span>' + s[0] + '</span></div>';
  }).join('') + '</div><h2>Visits</h2>';
  if (!visits.length) html += '<p>No visits yet. Add one from "New visit".</p>';
  visits.forEach(function (v) {
    const p = patients.find(function (x) { return x.id === v.patientId; });
    const isUrgent = v.flags.some(function (f) { return f.level === 'urgent'; });
    html += '<div class="card row" data-open="' + v.id + '"><span><b>' + esc(p ? p.displayId : '?') + '</b> · ' + esc(v.visitDate) + '</span><span>' +
      (isUrgent ? '<span class="pill off">URGENT</span> ' : (v.flags.length ? '<span class="pill warn">Review</span> ' : '')) +
      '<span class="pill">' + v.review + '</span></span></div>';
  });
  html += '<div class="actions no-print"><button id="demo">Load sample data</button><button id="clear">Clear all demo data</button></div>';
  m.innerHTML = html;
  m.querySelectorAll('[data-open]').forEach(function (el) {
    el.onclick = function () { go('summary', Number(el.dataset.open)); };
  });
  $('#demo').onclick = function () {
    const t = Date.now();
    const samples = [
      { id: 'DEMO-001', age: 24, weeks: 30, symptoms: [], notes: 'Routine visit.' },
      { id: 'DEMO-002', age: 31, weeks: 36, symptoms: ['bleeding', 'headache_vision'], notes: 'Reported this morning.' },
      { id: 'DEMO-003', age: 19, weeks: 22, symptoms: ['fever'], notes: '' }
    ];
    const ps = store.get('patients'), vs = store.get('visits');
    samples.forEach(function (x, i) {
      const pid = t + i * 2;
      ps.push({ id: pid, displayId: x.id, age: x.age, weeks: x.weeks });
      vs.push({ id: pid + 1, patientId: pid, visitDate: new Date().toISOString().slice(0, 10), chwId: 'CHW-DEMO',
        symptoms: x.symptoms, notes: x.notes, flags: evaluate(x.symptoms), guidanceVersion: GUIDANCE_VERSION,
        review: 'pending', synced: false, createdAt: t + i });
    });
    store.set('patients', ps); store.set('visits', vs); render();
  };
  $('#clear').onclick = function () {
    if (confirm('Delete all saved demo data on this device?')) { store.set('patients', []); store.set('visits', []); render(); }
  };
}

// ---------- new visit ----------
function renderRegister(m) {
  const today = new Date().toISOString().slice(0, 10);
  m.innerHTML =
    '<form id="f"><h2>New visit</h2>' +
    '<label>Fictional patient ID<input name="displayId" placeholder="DEMO-001"></label>' +
    '<label>Age<input name="age" type="number" min="1"></label>' +
    '<label>Weeks pregnant (if known)<input name="weeks" type="number" min="0"></label>' +
    '<label>Visit date<input name="visitDate" type="date" value="' + today + '"></label>' +
    '<label>CHW ID<input name="chwId"></label>' +
    '<fieldset><legend>Symptoms / observations</legend>' +
    SYMPTOMS.map(function (s) {
      return '<label class="check"><input type="checkbox" name="sym" value="' + s.id + '"> ' + esc(s.label) + '</label>';
    }).join('') + '</fieldset>' +
    '<label>Notes<textarea name="notes" rows="3"></textarea></label>' +
    '<p id="err" class="err"></p>' +
    '<button class="primary" type="submit">Save locally &amp; evaluate</button></form>';

  $('#f').onsubmit = function (e) {
    e.preventDefault();
    const f = e.target;
    const displayId = f.elements.displayId.value.trim();
    const chwId = f.elements.chwId.value.trim();
    const age = Number(f.elements.age.value);
    if (!displayId || !chwId || !(age > 0)) { $('#err').textContent = 'Patient ID, CHW ID and age are required.'; return; }
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
  if (p.weeks == null) missing.push('Weeks of pregnancy');
  if (!v.notes) missing.push('Clinical notes');

  let html = '';
  if (urgent) html += '<div class="alert">URGENT: ' + esc(urgent.action) + '</div>';
  html += '<h2>Referral summary</h2><div class="card">' +
    '<p><b>Patient:</b> ' + esc(p.displayId) + ' · Age ' + p.age + (p.weeks != null ? ' · ' + p.weeks + ' weeks' : '') + '</p>' +
    '<p><b>Visit:</b> ' + esc(v.visitDate) + ' · CHW ' + esc(v.chwId) + '</p>' +
    '<p><b>Recorded:</b> ' + (v.symptoms.length ? v.symptoms.map(symptomLabel).map(esc).join(', ') : 'No warning symptoms recorded') + '</p>' +
    (v.notes ? '<p><b>Notes:</b> ' + esc(v.notes) + '</p>' : '') + '</div><h3>Warnings</h3>';
  if (!v.flags.length) html += '<p>No rule triggered. A healthcare professional should still review.</p>';
  v.flags.forEach(function (f) {
    html += '<div class="card flag ' + f.level + '"><b>' + f.level.toUpperCase() + ':</b> ' + esc(f.reason) +
      '<br><small>Action: ' + esc(f.action) + '</small><br><small>Guidance ref: ' + esc(f.ref) + ' · version ' + esc(v.guidanceVersion) + '</small></div>';
  });
  html += '<p><b>Missing information:</b> ' + (missing.length ? missing.join(', ') : 'None') + '</p>' +
    '<p><b>Professional review:</b> ' + v.review + ' · <b>Sync:</b> ' + (v.synced ? 'synced' : 'pending') + '</p>' +
    '<div class="actions no-print"><button id="rev">Mark as ' + (v.review === 'pending' ? 'reviewed' : 'pending') + '</button>' +
    '<button id="fac">Find facility</button><button class="primary" id="prn">Print / Save PDF</button></div>';
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
  m.innerHTML = '<h2>Facility directory</h2><input id="q" placeholder="Search..."><label class="check"><input type="checkbox" id="em"> Emergency-capable only</label><div id="list"></div>';
  function draw() {
    const q = $('#q').value.toLowerCase();
    const em = $('#em').checked;
    $('#list').innerHTML = FACILITIES.filter(function (x) {
      return (x.name + x.address + x.type).toLowerCase().indexOf(q) !== -1 && (!em || x.emergency);
    }).map(function (x) {
      const dir = (navigator.onLine && x.lat != null)
        ? ' · <a target="_blank" rel="noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=' + x.lat + ',' + x.lng + '">Directions</a>' : '';
      return '<div class="card"><b>' + esc(x.name) + '</b> ' + (x.emergency ? '<span class="pill ok">Emergency</span>' : '') +
        '<br>' + esc(x.type) + ' · ' + esc(x.address) + '<br><a href="tel:' + esc(x.phone) + '">' + esc(x.phone) + '</a>' + dir + '</div>';
    }).join('') || '<p>No facility found.</p>';
  }
  $('#q').oninput = draw; $('#em').onchange = draw; draw();
}

// ---------- online/offline + start ----------
function updateNet() {
  const el = $('#net');
  el.textContent = navigator.onLine ? 'Online' : 'Offline';
  el.className = 'pill ' + (navigator.onLine ? 'ok' : 'off');
}
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
document.querySelectorAll('nav button').forEach(function (b) { b.onclick = function () { go(b.dataset.view); }; });
updateNet();
render();

// Service worker only works on https or localhost (not file://)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js');
}
