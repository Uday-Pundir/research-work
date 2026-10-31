// =========================================
// Activity Tracker — Frontend Logic (app.js)
// =========================================

const API = 'http://localhost:8050/api';

// ── State ──
let state = {
  goals: [],
  activities: [],
  todayActs: [],
  goalProgress: {},
  weekly: {},
  today: '',
  profile: null,
};
let charts = {};
let selectedColor = '#8b5cf6';
let isDark = true;

// ── Chart palette ──
const PALETTE = ['#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#a78bfa','#34d399','#fbbf24','#f472b6'];

// ─────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────
window.onload = async function () {
  setDateDisplay();
  loadTheme();
  initCharts();
  setTodayDate();
  await loadProfile();
  await refreshData();
};

function setDateDisplay() {
  const now = new Date();
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  document.getElementById('sidebarDate').textContent = now.toLocaleDateString(undefined, opts);
}

function setTodayDate() {
  const today = new Date().toISOString().split('T')[0];
  const logDate = document.getElementById('logDate');
  if (logDate) { logDate.value = today; logDate.max = today; }
  const histMonth = document.getElementById('histMonth');
  if (histMonth) histMonth.value = today.slice(0, 7);
}

// ─────────────────────────────────────────
//  THEME
// ─────────────────────────────────────────
function loadTheme() {
  isDark = localStorage.getItem('atTheme') !== 'light';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.getElementById('themeBtn').textContent = isDark ? '🌙' : '☀️';
}
function toggleTheme() {
  isDark = !isDark;
  localStorage.setItem('atTheme', isDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.getElementById('themeBtn').textContent = isDark ? '🌙' : '☀️';
  // Re-build charts for new theme
  Object.values(charts).forEach(c => c && c.destroy());
  charts = {};
  initCharts();
  updateAnalyticsCharts();
}

// ─────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────
const PAGE_META = {
  today:     ['Today\'s Overview',   'Track your daily progress'],
  goals:     ['My Goals',            'Set and manage your personal goals'],
  log:       ['Log Activity',        'Record what you accomplished'],
  history:   ['Activity History',    'Browse all your logged activities'],
  analytics: ['Analytics',           'Insights and charts from your data'],
  profile:   ['About Me',            'Personal profile, academics & professional links'],
};

function navigate(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const targetPage = document.getElementById('page-' + page);
  if (targetPage) targetPage.classList.add('active');
  
  // If no element passed (e.g. from profile badge), find the corresponding nav link
  if (!el) el = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (el) el.classList.add('active');

  const [title, sub] = PAGE_META[page] || ['', ''];
  document.getElementById('headerTitle').textContent = title;
  document.getElementById('headerSub').textContent = sub;
  if (page === 'analytics') updateAnalyticsCharts();
  if (page === 'history')   renderHistory();
  if (page === 'profile')   renderProfile();
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const mc = document.getElementById('mainContent');
  const hd = document.querySelector('.header');
  sb.classList.toggle('hidden');
  mc.classList.toggle('expanded');
  hd.style.left = sb.classList.contains('hidden') ? '0' : 'var(--sidebar-w)';
}

// ─────────────────────────────────────────
//  DATA FETCH
// ─────────────────────────────────────────
async function refreshData() {
  try {
    const res = await fetch(`${API}/summary`);
    if (!res.ok) throw new Error('Server error ' + res.status);
    const data = await res.json();
    state.goals       = data.goals       || [];
    state.activities  = data.activities  || [];
    state.todayActs   = data.today_activities || [];
    state.goalProgress= data.goal_progress || {};
    state.weekly      = data.weekly      || {};
    state.today       = data.today       || new Date().toISOString().split('T')[0];
    renderAll();
    toast('✓ Data loaded', 'success');
  } catch (e) {
    toast('⚠ Cannot reach server. Make sure server.py is running.', 'error');
    console.error(e);
  }
}

function renderAll() {
  renderSummary();
  renderTodayGoals();
  renderTodayFeed();
  renderGoalsPage();
  renderLogSelects();
  renderHistoryFilters();
  updateNavCounts();
  updateStreak();
  renderProfileStats();
}

// ─────────────────────────────────────────
//  SUMMARY STRIP
// ─────────────────────────────────────────
function renderSummary() {
  const total = state.goals.length;
  const done  = state.goals.filter(g => {
    const prog = state.goalProgress[g.id] || {};
    const pct  = pctOf(prog.today, g.target_value);
    return pct >= 100;
  }).length;
  const actsToday = state.todayActs.length;
  const rate = total ? Math.round(done / total * 100) : 0;
  document.getElementById('sumGoals').textContent = total;
  document.getElementById('sumDone').textContent  = done;
  document.getElementById('sumActs').textContent  = actsToday;
  document.getElementById('sumRate').textContent  = rate + '%';
}

// ─────────────────────────────────────────
//  TODAY — GOAL PROGRESS
// ─────────────────────────────────────────
function renderTodayGoals() {
  const grid = document.getElementById('todayGoalsGrid');
  if (!state.goals.length) {
    grid.innerHTML = `<div class="empty-state-card">
      <div class="empty-icon">🎯</div>
      <h3>No goals yet</h3>
      <p>Create your first goal to start tracking!</p>
      <button class="btn-primary" onclick="navigate('goals', document.querySelector('[data-page=goals]'))">Create a Goal</button>
    </div>`;
    return;
  }
  grid.innerHTML = state.goals.map(g => {
    const prog  = state.goalProgress[g.id] || {};
    const today = parseFloat(prog.today) || 0;
    const target= parseFloat(g.target_value) || 1;
    const pct   = Math.min(Math.round(today / target * 100), 100);
    const done  = pct >= 100;
    const color = g.color || '#8b5cf6';
    const todayActs = state.todayActs.filter(a => String(a.goal_id) === String(g.id));
    return `<div class="goal-progress-card" style="--goal-color:${color}">
      <div class="gpc-top">
        <div class="gpc-icon">${g.icon || '🎯'}</div>
        <div class="gpc-info">
          <div class="gpc-name">${esc(g.name)}</div>
          <div class="gpc-cat">${esc(g.category)} · ${todayActs.length} activit${todayActs.length===1?'y':'ies'} today</div>
        </div>
        <div class="gpc-right">
          <div class="gpc-pct ${done?'done':''}" style="color:${color}">${pct}%</div>
          <div class="gpc-target">${today.toFixed(1)} / ${target} ${esc(g.unit||'')}</div>
        </div>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="gpc-meta">
        <span>${done ? '✅ Goal reached!' : `${(target-today).toFixed(1)} ${esc(g.unit||'')} remaining`}</span>
        <button class="log-quick-btn" style="color:${color}" onclick="quickLog('${g.id}','${esc(g.name)}')">+ Log</button>
      </div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────
//  TODAY — ACTIVITY FEED
// ─────────────────────────────────────────
function renderTodayFeed() {
  const feed = document.getElementById('todayFeed');
  document.getElementById('todayActCount').textContent = state.todayActs.length + ' logged';
  if (!state.todayActs.length) {
    feed.innerHTML = '<div class="feed-empty">No activities logged yet today. Go log one! 👆</div>';
    return;
  }
  const reversed = [...state.todayActs].reverse();
  feed.innerHTML = reversed.map(a => {
    const goal  = state.goals.find(g => String(g.id) === String(a.goal_id)) || {};
    const color = goal.color || '#8b5cf6';
    return `<div class="feed-item">
      <div class="feed-dot" style="background:${color}"></div>
      <div class="feed-info">
        <div class="feed-name">${esc(a.activity_name || a.activity_name)}</div>
        <div class="feed-meta">${esc(goal.name||'Unknown goal')} · ${fmtTime(a.timestamp)}${a.notes ? ' · ' + esc(a.notes) : ''}</div>
      </div>
      <div class="feed-value" style="color:${color}">${a.value} <span style="font-size:12px;font-weight:400;color:var(--text2)">${esc(a.unit||goal.unit||'')}</span></div>
      <button class="feed-del" onclick="deleteActivity('${a.id}')" title="Delete">🗑</button>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────
//  GOALS PAGE
// ─────────────────────────────────────────
function renderGoalsPage() {
  const grid = document.getElementById('goalsGrid');
  if (!state.goals.length) {
    grid.innerHTML = `<div class="empty-state-card">
      <div class="empty-icon">🎯</div><h3>No goals yet</h3>
      <p>Set your first goal and start tracking your progress!</p>
      <button class="btn-primary" onclick="openGoalModal()">Create First Goal</button>
    </div>`;
    return;
  }
  grid.innerHTML = state.goals.map(g => {
    const prog    = state.goalProgress[g.id] || {};
    const todayV  = parseFloat(prog.today)    || 0;
    const allV    = parseFloat(prog.all_time) || 0;
    const target  = parseFloat(g.target_value)|| 1;
    const pct     = Math.min(Math.round(todayV / target * 100), 100);
    const color   = g.color || '#8b5cf6';
    const daysLeft= g.deadline ? daysUntil(g.deadline) : null;
    return `<div class="goal-card">
      <div class="goal-card-top">
        <div class="gc-icon" style="background:${color}22">${g.icon || '🎯'}</div>
        <div class="gc-info">
          <div class="gc-name">${esc(g.name)}</div>
          <div class="gc-desc">${esc(g.description||'')}</div>
          <span class="gc-cat" style="color:${color};background:${color}18">${esc(g.category)}</span>
        </div>
      </div>
      <div class="goal-stats">
        <div class="gs-item">
          <div class="gs-val" style="color:${color}">${pct}%</div>
          <div class="gs-lbl">Today</div>
        </div>
        <div class="gs-item">
          <div class="gs-val">${target} ${esc(g.unit||'')}</div>
          <div class="gs-lbl">Daily Target</div>
        </div>
        <div class="gs-item">
          <div class="gs-val">${allV.toFixed(1)}</div>
          <div class="gs-lbl">All-Time</div>
        </div>
        ${daysLeft !== null ? `<div class="gs-item"><div class="gs-val" style="color:${daysLeft<3?'var(--red)':'var(--amber)'}">${daysLeft}d</div><div class="gs-lbl">Left</div></div>` : ''}
      </div>
      <div class="progress-bar-bg" style="margin-bottom:14px">
        <div class="progress-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="goal-actions">
        <button class="ga-btn ga-log" onclick="quickLog('${g.id}','${esc(g.name)}')">+ Log</button>
        <button class="ga-btn ga-edit" onclick="editGoal('${g.id}')">✏ Edit</button>
        <button class="ga-btn ga-del" onclick="deleteGoal('${g.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────
//  LOG SELECTS
// ─────────────────────────────────────────
function renderLogSelects() {
  // Main log form select
  const sel = document.getElementById('logGoalId');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Select a goal —</option>';
  state.goals.forEach(g => {
    const o = document.createElement('option');
    o.value = g.id; o.textContent = `${g.icon||'🎯'} ${g.name}`;
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;

  // Quick goal buttons
  const ql = document.getElementById('quickGoalList');
  ql.innerHTML = state.goals.slice(0,6).map(g => `
    <button class="quick-goal-btn" onclick="quickLog('${g.id}','${esc(g.name)}')">
      <span class="qg-icon">${g.icon||'🎯'}</span>
      <div class="qg-info">
        <div class="qg-name">${esc(g.name)}</div>
        <div class="qg-target">Target: ${g.target_value} ${esc(g.unit||'')}</div>
      </div>
    </button>`).join('');

  // Analytics trend select
  const ts = document.getElementById('trendGoalSelect');
  if (ts) {
    ts.innerHTML = '<option value="">All Goals</option>';
    state.goals.forEach(g => {
      const o = document.createElement('option');
      o.value = g.id; o.textContent = g.name;
      ts.appendChild(o);
    });
  }

  // History filter select
  const hs = document.getElementById('histGoalFilter');
  if (hs) {
    hs.innerHTML = '<option value="">All Goals</option>';
    state.goals.forEach(g => {
      const o = document.createElement('option');
      o.value = g.id; o.textContent = g.name;
      hs.appendChild(o);
    });
  }

  // Recent logs
  const rll = document.getElementById('recentLogList');
  const last5 = [...state.activities].reverse().slice(0,5);
  rll.innerHTML = last5.length ? last5.map(a => {
    const goal = state.goals.find(g => String(g.id)===String(a.goal_id))||{};
    return `<div class="recent-log-item">
      <div class="rli-name">${esc(a.activity_name)}</div>
      <div class="rli-meta">${esc(goal.name||'?')} · ${a.value} ${esc(a.unit||goal.unit||'')} · ${fmtDate(a.date)}</div>
    </div>`;
  }).join('') : '<p style="color:var(--text2);font-size:13px">No activities yet.</p>';
}

// ─────────────────────────────────────────
//  HISTORY PAGE
// ─────────────────────────────────────────
function renderHistoryFilters() {
  renderHistory();
}

function renderHistory() {
  const goalFilter  = document.getElementById('histGoalFilter')?.value || '';
  const monthFilter = document.getElementById('histMonth')?.value || '';
  let acts = [...state.activities].reverse();
  if (goalFilter) acts = acts.filter(a => String(a.goal_id) === goalFilter);
  if (monthFilter) acts = acts.filter(a => String(a.date||'').startsWith(monthFilter));
  const tbody = document.getElementById('historyBody');
  if (!acts.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-td">No activities found.</td></tr>`;
    return;
  }
  tbody.innerHTML = acts.map(a => {
    const goal  = state.goals.find(g => String(g.id)===String(a.goal_id))||{};
    const color = goal.color||'#8b5cf6';
    return `<tr>
      <td style="color:var(--text2)">${fmtDate(a.date)}</td>
      <td><span style="color:${color}">${goal.icon||'🎯'} ${esc(goal.name||'—')}</span></td>
      <td><strong>${esc(a.activity_name)}</strong></td>
      <td style="color:${color};font-weight:700">${a.value} <span style="color:var(--text2);font-weight:400">${esc(a.unit||goal.unit||'')}</span></td>
      <td style="color:var(--text2)">${esc(a.notes||'—')}</td>
      <td><button class="del-act-btn" onclick="deleteActivity('${a.id}')">🗑</button></td>
    </tr>`;
  }).join('');
}

// ─────────────────────────────────────────
//  NAV COUNTS / STREAK
// ─────────────────────────────────────────
function updateNavCounts() {
  document.getElementById('navTodayCount').textContent = state.todayActs.length;
  document.getElementById('navGoalsCount').textContent = state.goals.length;
}

function updateStreak() {
  // Count consecutive days with at least 1 activity
  const daySet = new Set(state.activities.map(a => String(a.date||'').split('T')[0]));
  let streak = 0, d = new Date();
  while (true) {
    const key = d.toISOString().split('T')[0];
    if (daySet.has(key)) { streak++; d.setDate(d.getDate()-1); }
    else break;
  }
  document.getElementById('streakNum').textContent = streak;
}

// ─────────────────────────────────────────
//  CHARTS (Analytics)
// ─────────────────────────────────────────
function chartCfg() {
  return {
    textColor: isDark ? '#7b82a0' : '#5b6080',
    gridColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
  };
}

function initCharts() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded yet. Skipping chart initialization.');
    return;
  }
  const cfg = chartCfg();
  const tt  = { backgroundColor:'rgba(13,18,36,.95)', titleColor:'#e8eaf6', bodyColor:'#7b82a0',
                 borderColor:'rgba(139,92,246,.4)', borderWidth:1, padding:12, cornerRadius:10, displayColors:false };

  // Weekly bar chart
  const wCtx = document.getElementById('weeklyChart')?.getContext('2d');
  if (wCtx) charts.weekly = new Chart(wCtx, {
    type:'bar', data:{labels:[],datasets:[{label:'Activities',data:[],
      backgroundColor:'rgba(139,92,246,.7)',borderRadius:6,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tt}},
      scales:{x:{ticks:{color:cfg.textColor,font:{size:11}},grid:{display:false}},
              y:{ticks:{color:cfg.textColor,font:{size:11},stepSize:1},grid:{color:cfg.gridColor},beginAtZero:true}}}
  });

  // Progress donut
  const pCtx = document.getElementById('progressChart')?.getContext('2d');
  if (pCtx) charts.progress = new Chart(pCtx, {
    type:'doughnut', data:{labels:[],datasets:[{data:[],backgroundColor:PALETTE,borderWidth:0,hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      plugins:{legend:{position:'bottom',labels:{color:cfg.textColor,padding:10,font:{size:11}}},tooltip:{...tt}}}
  });

  // Trend line chart
  const tCtx = document.getElementById('trendChart')?.getContext('2d');
  if (tCtx) charts.trend = new Chart(tCtx, {
    type:'line', data:{labels:[],datasets:[]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:cfg.textColor,font:{size:11}}},tooltip:{...tt}},
      scales:{x:{ticks:{color:cfg.textColor,font:{size:11}},grid:{display:false}},
              y:{ticks:{color:cfg.textColor,font:{size:11}},grid:{color:cfg.gridColor},beginAtZero:true}}}
  });
}

function updateAnalyticsCharts() {
  if (!charts.weekly) { initCharts(); }
  updateWeeklyChart();
  updateProgressChart();
  renderTrendChart();
  updateAllTimeStats();
}

function updateWeeklyChart() {
  if (!charts.weekly) return;
  // Last 14 days
  const days = [];
  const counts = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const key = d.toISOString().split('T')[0];
    days.push(key.slice(5)); // MM-DD
    counts.push(state.activities.filter(a => String(a.date||'').startsWith(key)).length);
  }
  charts.weekly.data.labels = days;
  charts.weekly.data.datasets[0].data = counts;
  charts.weekly.update();
}

function updateProgressChart() {
  if (!charts.progress) return;
  const labels = [], data = [];
  state.goals.forEach((g,i) => {
    const prog  = state.goalProgress[g.id]||{};
    const today = parseFloat(prog.today)||0;
    const pct   = Math.min(Math.round(today/(parseFloat(g.target_value)||1)*100),100);
    labels.push(`${g.icon||'🎯'} ${g.name} (${pct}%)`);
    data.push(pct || 1);
  });
  if (!labels.length) { labels.push('No goals'); data.push(1); }
  charts.progress.data.labels = labels;
  charts.progress.data.datasets[0].data = data;
  charts.progress.data.datasets[0].backgroundColor = PALETTE.slice(0, labels.length);
  charts.progress.update();
}

function renderTrendChart() {
  if (!charts.trend) return;
  const selGoalId = document.getElementById('trendGoalSelect')?.value || '';
  const goalsToPlot = selGoalId ? state.goals.filter(g=>String(g.id)===selGoalId) : state.goals;

  // Get last 14 days labels
  const dayLabels = [];
  for (let i=13; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    dayLabels.push(d.toISOString().split('T')[0]);
  }

  const datasets = goalsToPlot.slice(0,6).map((g,i) => {
    const color = g.color || PALETTE[i % PALETTE.length];
    const data  = dayLabels.map(day => {
      const acts = state.activities.filter(a => String(a.goal_id)===String(g.id) && String(a.date||'').startsWith(day));
      return acts.reduce((s,a) => s + parseFloat(a.value||0), 0);
    });
    return { label: `${g.icon||'🎯'} ${g.name}`, data, borderColor: color,
      backgroundColor: color+'22', fill:false, tension:.4, pointRadius:4,
      pointHoverRadius:7, borderWidth:2 };
  });

  charts.trend.data.labels = dayLabels.map(d=>d.slice(5));
  charts.trend.data.datasets = datasets;
  charts.trend.update();
}

function updateAllTimeStats() {
  const el = document.getElementById('allTimeStats');
  if (!el) return;
  const vals = state.activities.map(a=>parseFloat(a.value)||0);
  const totalLogs  = state.activities.length;
  const totalValue = vals.reduce((s,v)=>s+v,0);
  const avgPerDay  = (() => {
    const days = new Set(state.activities.map(a=>String(a.date||'').split('T')[0])).size;
    return days ? (totalLogs/days).toFixed(1) : 0;
  })();
  const bestDay = (() => {
    const counts = {};
    state.activities.forEach(a=>{const d=String(a.date||'').split('T')[0];counts[d]=(counts[d]||0)+1;});
    return Math.max(0,...Object.values(counts));
  })();
  el.innerHTML = [
    ['Total Activities', totalLogs],
    ['Total Value', totalValue.toFixed(1)],
    ['Avg / Day', avgPerDay],
    ['Best Day', bestDay + ' acts'],
    ['Goals Set', state.goals.length],
    ['Days Active', new Set(state.activities.map(a=>String(a.date||'').split('T')[0])).size],
  ].map(([l,v])=>`<div class="stat-item"><div class="sv">${v}</div><div class="sl">${l}</div></div>`).join('');
}

// ─────────────────────────────────────────
//  GOAL CRUD
// ─────────────────────────────────────────
function openGoalModal(prefill={}) {
  document.getElementById('goalModalTitle').textContent = prefill.id ? 'Edit Goal' : 'Create New Goal';
  document.getElementById('goalSubmitBtn').textContent  = prefill.id ? 'Save Changes' : 'Create Goal';
  document.getElementById('gName').value      = prefill.name      || '';
  document.getElementById('gDesc').value      = prefill.description || '';
  document.getElementById('gCategory').value  = prefill.category  || '';
  document.getElementById('gIcon').value      = prefill.icon      || '';
  document.getElementById('gTarget').value    = prefill.target_value || '';
  document.getElementById('gUnit').value      = prefill.unit      || '';
  document.getElementById('gDeadline').value  = prefill.deadline  || '';
  document.getElementById('gEditId').value    = prefill.id        || '';
  selectedColor = prefill.color || '#8b5cf6';
  document.getElementById('gColor').value = selectedColor;
  document.querySelectorAll('.color-dot').forEach(d => {
    d.classList.toggle('active', d.dataset.color === selectedColor);
  });
  document.getElementById('goalModalBackdrop').classList.add('open');
  setTimeout(()=>document.getElementById('gName').focus(), 100);
}
function closeGoalModal() {
  document.getElementById('goalModalBackdrop').classList.remove('open');
}
function selectColor(btn) {
  document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('active'));
  btn.classList.add('active');
  selectedColor = btn.dataset.color;
  document.getElementById('gColor').value = selectedColor;
}
async function submitGoal(e) {
  e.preventDefault();
  const editId = document.getElementById('gEditId').value;
  const payload = {
    name:         document.getElementById('gName').value.trim(),
    description:  document.getElementById('gDesc').value.trim(),
    category:     document.getElementById('gCategory').value.trim(),
    icon:         document.getElementById('gIcon').value.trim() || '🎯',
    target_value: parseFloat(document.getElementById('gTarget').value),
    unit:         document.getElementById('gUnit').value.trim(),
    deadline:     document.getElementById('gDeadline').value,
    color:        document.getElementById('gColor').value,
  };
  try {
    const url    = editId ? `${API}/goals/${editId}` : `${API}/goals`;
    const method = editId ? 'PUT' : 'POST';
    const res    = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if (!res.ok) throw new Error(await res.text());
    toast(editId ? '✓ Goal updated!' : '✓ Goal created!', 'success');
    closeGoalModal();
    await refreshData();
  } catch(err) { toast('Error: ' + err.message, 'error'); }
}
async function editGoal(id) {
  const goal = state.goals.find(g=>String(g.id)===String(id));
  if (goal) openGoalModal(goal);
}
async function deleteGoal(id) {
  const goal = state.goals.find(g=>String(g.id)===String(id));
  if (!confirm(`Delete goal "${goal?.name}"? All activities for this goal will remain in history.`)) return;
  try {
    const res = await fetch(`${API}/goals/${id}`, {method:'DELETE'});
    if (!res.ok) throw new Error(await res.text());
    toast('Goal deleted.', 'info');
    await refreshData();
  } catch(err) { toast('Error: ' + err.message, 'error'); }
}

// ─────────────────────────────────────────
//  ACTIVITY CRUD
// ─────────────────────────────────────────
async function submitActivity(e) {
  e.preventDefault();
  const goalId = document.getElementById('logGoalId').value;
  const name   = document.getElementById('logName').value.trim();
  const value  = parseFloat(document.getElementById('logValue').value);
  const unit   = document.getElementById('logUnit').value.trim();
  const date   = document.getElementById('logDate').value;
  const notes  = document.getElementById('logNotes').value.trim();
  if (!goalId || !name || isNaN(value)) { toast('Fill in all required fields!', 'error'); return; }
  const goal   = state.goals.find(g=>String(g.id)===String(goalId))||{};
  const payload = { goal_id:goalId, activity_name:name, value, unit:unit||goal.unit||'', date, notes };
  try {
    const res = await fetch(`${API}/activities`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if (!res.ok) throw new Error(await res.text());
    toast(`✓ "${name}" logged!`, 'success');
    document.getElementById('logForm').reset();
    setTodayDate();
    await refreshData();
    // Navigate to today to see the update
    navigate('today', document.querySelector('[data-page=today]'));
  } catch(err) { toast('Error: ' + err.message, 'error'); }
}

async function deleteActivity(id) {
  if (!confirm('Delete this activity?')) return;
  try {
    const res = await fetch(`${API}/activities/${id}`, {method:'DELETE'});
    if (!res.ok) throw new Error(await res.text());
    toast('Activity deleted.', 'info');
    await refreshData();
    renderHistory();
  } catch(err) { toast('Error: ' + err.message, 'error'); }
}

function quickLog(goalId, goalName) {
  navigate('log', document.querySelector('[data-page=log]'));
  setTimeout(() => {
    document.getElementById('logGoalId').value = goalId;
    document.getElementById('logName').focus();
    const goal = state.goals.find(g=>String(g.id)===String(goalId))||{};
    if (goal.unit) document.getElementById('logUnit').value = goal.unit;
  }, 150);
}

// ─────────────────────────────────────────
//  EXPORT
// ─────────────────────────────────────────
async function exportData() {
  try {
    const res = await fetch(`${API}/export`);
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href=url; a.download='activity_tracker_data.xlsx'; a.click();
    URL.revokeObjectURL(url);
    toast('✓ Excel file downloaded!', 'success');
  } catch(err) { toast('Export error: ' + err.message, 'error'); }
}

// ─────────────────────────────────────────
//  PROFILE MANAGEMENT
// ─────────────────────────────────────────
const DEFAULT_PROFILE_FRONTEND = {
  name: 'Uday Pundir',
  title: 'Student & Aspiring Software Engineer',
  university: 'Your College / University',
  degree: 'B.Tech in Computer Science & Engineering',
  year: '3rd Year (Class of 2026)',
  bio: 'Passionate about programming, solving complex algorithms, and building interactive web projects. Constantly learning and striving for daily discipline.',
  avatar: '👨‍💻',
  github: 'https://github.com/udaypundir',
  linkedin: 'https://www.linkedin.com/in/uday-pundir',
  email: 'udaypundir.work@gmail.com',
  portfolio: '',
  skills: 'Python, JavaScript, Data Structures, Web Development, Git, React'
};

async function loadProfile() {
  try {
    const res = await fetch(`${API}/profile`);
    if (res.ok) {
      state.profile = await res.json();
    } else {
      throw new Error('Fallback to local');
    }
  } catch (e) {
    const cached = localStorage.getItem('atProfile');
    state.profile = cached ? JSON.parse(cached) : { ...DEFAULT_PROFILE_FRONTEND };
  }
  renderProfile();
}

function renderProfile() {
  const p = state.profile || DEFAULT_PROFILE_FRONTEND;

  // Sidebar snippet
  const sbAvatar = document.getElementById('sidebarAvatar');
  const sbName   = document.getElementById('sidebarUserName');
  const sbRole   = document.getElementById('sidebarUserRole');
  if (sbAvatar) sbAvatar.textContent = p.avatar || '👨‍💻';
  if (sbName)   sbName.textContent   = p.name || 'Your Name';
  if (sbRole)   sbRole.textContent   = p.degree || p.title || 'Student';

  // Profile page hero
  const pAvatar = document.getElementById('profAvatar');
  const pName   = document.getElementById('profName');
  const pTitle  = document.getElementById('profTitle');
  const pMDeg   = document.getElementById('profMetaDegree');
  const pMUniv  = document.getElementById('profMetaUniv');
  const pMYear  = document.getElementById('profMetaYear');

  if (pAvatar) pAvatar.textContent = p.avatar || '👨‍💻';
  if (pName)   pName.textContent   = p.name || 'Your Name';
  if (pTitle)  pTitle.textContent  = p.title || 'Student';
  if (pMDeg)   pMDeg.textContent   = p.degree || 'Degree';
  if (pMUniv)  pMUniv.textContent  = p.university || 'University';
  if (pMYear)  pMYear.textContent  = p.year || 'Class of 2026';

  // Academic info
  const pUniv   = document.getElementById('profUniversity');
  const pDeg    = document.getElementById('profDegree');
  const pYr     = document.getElementById('profYear');
  const pInt    = document.getElementById('profInterests');
  if (pUniv) pUniv.textContent = p.university || 'Not specified';
  if (pDeg)  pDeg.textContent  = p.degree || 'Not specified';
  if (pYr)   pYr.textContent   = p.year || 'Not specified';
  if (pInt)  pInt.textContent  = p.skills ? p.skills.split(',').slice(0, 3).join(', ') : 'Computer Science, Software Development';

  // Social Links
  renderSocialLink('profGithubLink', 'profGithubHandle', p.github);
  renderSocialLink('profLinkedinLink', 'profLinkedinHandle', p.linkedin);
  
  // Email Link
  const emLink = document.getElementById('profEmailLink');
  const emHandle = document.getElementById('profEmailHandle');
  if (emLink && emHandle) {
    if (p.email) {
      emLink.href = 'mailto:' + p.email;
      emHandle.textContent = p.email;
      emLink.style.display = 'flex';
    } else {
      emLink.style.display = 'none';
    }
  }

  // Portfolio Link
  const pfLink = document.getElementById('profPortfolioLink');
  const pfHandle = document.getElementById('profPortfolioHandle');
  if (pfLink && pfHandle) {
    if (p.portfolio) {
      pfLink.href = p.portfolio.startsWith('http') ? p.portfolio : 'https://' + p.portfolio;
      pfHandle.textContent = p.portfolio.replace(/^https?:\/\//, '');
      pfLink.style.display = 'flex';
    } else {
      pfLink.style.display = 'none';
    }
  }

  // Skills Pills
  const skillsWrap = document.getElementById('profSkillsPills');
  if (skillsWrap) {
    const list = (p.skills || '').split(',').map(s => s.trim()).filter(Boolean);
    if (list.length) {
      skillsWrap.innerHTML = list.map(s => `<span class="skill-pill">⚡ ${esc(s)}</span>`).join('');
    } else {
      skillsWrap.innerHTML = '<span class="skill-pill" style="opacity:0.6">No skills added yet</span>';
    }
  }

  // Bio
  const pBio = document.getElementById('profBio');
  if (pBio) pBio.textContent = p.bio || 'Add your bio in the profile settings.';

  renderProfileStats();
}

function renderSocialLink(linkId, handleId, url) {
  const linkEl = document.getElementById(linkId);
  const handleEl = document.getElementById(handleId);
  if (!linkEl || !handleEl) return;
  if (url && url.trim()) {
    const fullUrl = url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim();
    linkEl.href = fullUrl;
    let cleanHandle = fullUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    handleEl.textContent = cleanHandle;
    linkEl.style.display = 'flex';
  } else {
    linkEl.style.display = 'none';
  }
}

function renderProfileStats() {
  const pGoals = document.getElementById('profStatGoals');
  const pActs  = document.getElementById('profStatActs');
  const pStrk  = document.getElementById('profStatStreak');
  const sNum   = document.getElementById('streakNum');
  if (pGoals) pGoals.textContent = state.goals ? state.goals.length : 0;
  if (pActs)  pActs.textContent  = state.activities ? state.activities.length : 0;
  if (pStrk && sNum) pStrk.textContent = sNum.textContent || '0';
}

function openProfileModal() {
  const p = state.profile || DEFAULT_PROFILE_FRONTEND;
  document.getElementById('pFormName').value      = p.name || '';
  document.getElementById('pFormTitle').value     = p.title || '';
  document.getElementById('pFormUniv').value      = p.university || '';
  document.getElementById('pFormDegree').value    = p.degree || '';
  document.getElementById('pFormYear').value      = p.year || '';
  document.getElementById('pFormBio').value       = p.bio || '';
  document.getElementById('pFormSkills').value    = p.skills || '';
  document.getElementById('pFormGithub').value    = p.github || '';
  document.getElementById('pFormLinkedin').value  = p.linkedin || '';
  document.getElementById('pFormEmail').value     = p.email || '';
  document.getElementById('pFormPortfolio').value  = p.portfolio || '';
  document.getElementById('pFormAvatar').value    = p.avatar || '👨‍💻';

  // Highlight active avatar opt
  document.querySelectorAll('.avatar-opt').forEach(opt => {
    opt.classList.toggle('active', opt.textContent.trim() === (p.avatar || '👨‍💻'));
  });

  document.getElementById('profileModalBackdrop').classList.add('open');
  setTimeout(() => document.getElementById('pFormName').focus(), 100);
}

function closeProfileModal() {
  document.getElementById('profileModalBackdrop').classList.remove('open');
}

function selectAvatar(emoji) {
  document.getElementById('pFormAvatar').value = emoji;
  document.querySelectorAll('.avatar-opt').forEach(opt => {
    opt.classList.toggle('active', opt.textContent.trim() === emoji);
  });
}

async function submitProfile(e) {
  e.preventDefault();
  const payload = {
    name:       document.getElementById('pFormName').value.trim(),
    title:      document.getElementById('pFormTitle').value.trim(),
    university: document.getElementById('pFormUniv').value.trim(),
    degree:     document.getElementById('pFormDegree').value.trim(),
    year:       document.getElementById('pFormYear').value.trim(),
    bio:        document.getElementById('pFormBio').value.trim(),
    skills:     document.getElementById('pFormSkills').value.trim(),
    github:     document.getElementById('pFormGithub').value.trim(),
    linkedin:   document.getElementById('pFormLinkedin').value.trim(),
    email:      document.getElementById('pFormEmail').value.trim(),
    portfolio:  document.getElementById('pFormPortfolio').value.trim(),
    avatar:     document.getElementById('pFormAvatar').value || '👨‍💻',
  };

  state.profile = payload;
  localStorage.setItem('atProfile', JSON.stringify(payload));

  try {
    const res = await fetch(`${API}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
  } catch (err) {
    console.warn('Backend sync failed, saved locally:', err);
  }

  renderProfile();
  closeProfileModal();
  toast('✓ Profile updated successfully!', 'success');
}

// ─────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────
function pctOf(val, target) {
  const v = parseFloat(val)||0, t = parseFloat(target)||1;
  return Math.min(Math.round(v/t*100), 100);
}
function daysUntil(dateStr) {
  const d = new Date(dateStr), now = new Date();
  now.setHours(0,0,0,0); d.setHours(0,0,0,0);
  return Math.ceil((d-now)/(1000*60*60*24));
}
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
}
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
let toastTimer;
function toast(msg, type='info') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.className='toast', 3500);
}
