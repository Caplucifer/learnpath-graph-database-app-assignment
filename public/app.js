const API = '/api';
let allCourses = [];
let activeCourseId = null;

const courseListEl = document.getElementById('course-list');
const mainPanelEl = document.getElementById('main-panel');
const connStatusEl = document.getElementById('conn-status');
const searchInput = document.getElementById('search');
const searchResultsEl = document.getElementById('search-results');
const pathFromEl = document.getElementById('path-from');
const pathToEl = document.getElementById('path-to');
const pathGoBtn = document.getElementById('path-go');
const pathResultEl = document.getElementById('path-result');

async function checkHealth() {
  try {
    const res = await fetch(`${API}/health`);
    const data = await res.json();
    if (data.ok) {
      connStatusEl.textContent = '● connected to CognoDB';
      connStatusEl.className = 'conn-status ok';
    } else {
      connStatusEl.textContent = '● database unreachable';
      connStatusEl.className = 'conn-status bad';
    }
  } catch {
    connStatusEl.textContent = '● offline';
    connStatusEl.className = 'conn-status bad';
  }
}

async function loadCourses() {
  courseListEl.innerHTML = '<div class="list-loading"><span class="spinner"></span> Loading catalogue…</div>';
  try {
    const res = await fetch(`${API}/courses`);
    if (!res.ok) throw new Error('request failed');
    allCourses = await res.json();
    if (allCourses.length === 0) {
      courseListEl.innerHTML = '<div class="list-empty">No courses yet. Run <code>npm run seed</code> to load sample data.</div>';
      return;
    }
    renderCourseList(allCourses);
    populatePathSelectors(allCourses);
  } catch (err) {
    courseListEl.innerHTML = '<div class="list-error">Could not load courses. Check that the server and CognoDB are running.</div>';
  }
}

function renderCourseList(courses) {
  const byCategory = {};
  for (const c of courses) {
    const cat = c.category || 'Uncategorised';
    (byCategory[cat] = byCategory[cat] || []).push(c);
  }
  courseListEl.innerHTML = '';
  for (const [cat, list] of Object.entries(byCategory)) {
    const group = document.createElement('div');
    group.className = 'category-group';
    group.innerHTML = `<div class="category-label">${escapeHtml(cat)}</div>`;
    for (const c of list) {
      const item = document.createElement('div');
      item.className = 'course-item' + (c.id === activeCourseId ? ' active' : '');
      item.style.setProperty('--lvl', c.level);
      item.innerHTML = `<span class="level-dot"></span> ${escapeHtml(c.title)}`;
      item.addEventListener('click', () => selectCourse(c.id));
      group.appendChild(item);
    }
    courseListEl.appendChild(group);
  }
}

function populatePathSelectors(courses) {
  const sorted = [...courses].sort((a, b) => a.title.localeCompare(b.title));
  for (const sel of [pathFromEl, pathToEl]) {
    sel.innerHTML = '<option value="">Select a course…</option>' +
      sorted.map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
  }
}

async function selectCourse(id) {
  activeCourseId = id;
  renderCourseList(allCourses);
  mainPanelEl.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';
  try {
    const res = await fetch(`${API}/courses/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load course');
    }
    const course = await res.json();
    renderCourseDetail(course);
  } catch (err) {
    mainPanelEl.innerHTML = `<div class="empty-state"><span class="empty-mark">⚠</span><h2>Couldn't load that course</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function renderCourseDetail(c) {
  const skillsHtml = (c.skills || []).filter(Boolean).map(s => `<span class="chip">${escapeHtml(s)}</span>`).join('');
  const prereqHtml = chainHtml(c.fullPrerequisiteChain, 'Nothing — this is a starting-point course.');
  const unlockHtml = chainHtml(c.fullUnlockChain, 'Nothing yet builds on this course.');

  mainPanelEl.innerHTML = `
    <div class="course-header">
      <div class="course-eyebrow">Level ${c.level} · ${escapeHtml(c.category || 'General')}</div>
      <h2>${escapeHtml(c.title)}</h2>
      <p class="desc">${escapeHtml(c.description || '')}</p>
      <div class="skill-chips">${skillsHtml}</div>
    </div>
    <div class="two-col">
      <div class="section">
        <h3>Full prerequisite chain <span class="count-badge">${c.fullPrerequisiteChain.length} course(s), up to ${maxDepth(c.fullPrerequisiteChain)} hops</span></h3>
        ${prereqHtml}
      </div>
      <div class="section">
        <h3>What this unlocks <span class="count-badge">${c.fullUnlockChain.length} course(s), up to ${maxDepth(c.fullUnlockChain)} hops</span></h3>
        ${unlockHtml}
      </div>
    </div>
  `;
  mainPanelEl.querySelectorAll('.chain-item').forEach(el => {
    el.addEventListener('click', () => selectCourse(el.dataset.id));
  });
}

function chainHtml(list, emptyMsg) {
  if (!list || list.length === 0) return `<p class="chain-empty">${emptyMsg}</p>`;
  return `<ul class="chain-list">${list.map(item => `
    <li class="chain-item" data-id="${item.id}">
      <span class="depth-tag">${item.depth} hop${item.depth > 1 ? 's' : ''}</span>
      ${escapeHtml(item.title)}
    </li>`).join('')}</ul>`;
}

function maxDepth(list) {
  if (!list || list.length === 0) return 0;
  return Math.max(...list.map(x => x.depth));
}

// ---------- Search ----------
let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const term = searchInput.value.trim();
  if (!term) { searchResultsEl.classList.add('hidden'); return; }
  searchTimer = setTimeout(() => runSearch(term), 220);
});
document.addEventListener('click', (e) => {
  if (!searchResultsEl.contains(e.target) && e.target !== searchInput) {
    searchResultsEl.classList.add('hidden');
  }
});

async function runSearch(term) {
  try {
    const res = await fetch(`${API}/search?q=${encodeURIComponent(term)}`);
    const results = await res.json();
    if (results.length === 0) {
      searchResultsEl.innerHTML = '<div class="search-result-item"><span class="desc">No matching courses.</span></div>';
    } else {
      searchResultsEl.innerHTML = results.map(c => `
        <div class="search-result-item" data-id="${c.id}">
          <div class="title">${escapeHtml(c.title)}</div>
          <div class="desc">${escapeHtml(c.description || '')}</div>
        </div>`).join('');
      searchResultsEl.querySelectorAll('.search-result-item[data-id]').forEach(el => {
        el.addEventListener('click', () => {
          selectCourse(el.dataset.id);
          searchResultsEl.classList.add('hidden');
          searchInput.value = '';
        });
      });
    }
    searchResultsEl.classList.remove('hidden');
  } catch {
    searchResultsEl.classList.add('hidden');
  }
}

// ---------- Path finder ----------
pathGoBtn.addEventListener('click', async () => {
  const from = pathFromEl.value;
  const to = pathToEl.value;
  if (!from || !to) {
    pathResultEl.innerHTML = '<p class="path-none">Pick both a starting and target course.</p>';
    return;
  }
  pathResultEl.innerHTML = '<span class="spinner"></span>';
  pathGoBtn.disabled = true;
  try {
    const res = await fetch(`${API}/path?from=${from}&to=${to}`);
    const data = await res.json();
    if (!data.connected || data.nodes.length === 0) {
      pathResultEl.innerHTML = '<p class="path-none">No path found between these courses.</p>';
      return;
    }
    pathResultEl.innerHTML = `<div class="path-meta">${data.hops} hop${data.hops !== 1 ? 's' : ''}</div>` +
      data.nodes.map((n, i) => `
        ${i > 0 ? '<div class="path-arrow">↓</div>' : ''}
        <div class="path-hop">${escapeHtml(n.title)} <span class="depth-tag">L${n.level}</span></div>
      `).join('');
  } catch {
    pathResultEl.innerHTML = '<p class="path-none">Something went wrong finding that path.</p>';
  } finally {
    pathGoBtn.disabled = false;
  }
});

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

checkHealth();
loadCourses();
setInterval(checkHealth, 30000);
