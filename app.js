/* ============================================================
   QUIZMASTER PRO — app.js
   Complete Application Logic
   ============================================================ */

// ============================================================
// 1. FIREBASE CONFIGURATION
//    Replace these values with your Firebase project config
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCFjXNtrCW6RdsWgFyg6xZ6k9PsDsuUVps",
    authDomain: "quizmasterpro-36b3a.firebaseapp.com",
    projectId: "quizmasterpro-36b3a",
    storageBucket: "quizmasterpro-36b3a.firebasestorage.app",
    messagingSenderId: "806269872561",
    appId: "1:806269872561:web:72f395492e81415e497590",
    measurementId: "G-BDJ3SH66CQ"
};

// Admin secret code (change this for production!)
const ADMIN_SECRET_CODE = "ADMIN@2025";

// ============================================================
// 2. FIREBASE INIT
// ============================================================

firebase.initializeApp(FIREBASE_CONFIG);
const auth  = firebase.auth();
const db    = firebase.firestore();

// ============================================================
// 3. GLOBAL STATE
// ============================================================
let currentUser     = null;   // Firebase Auth user
let currentUserData = null;   // Firestore user document data
let activeQuiz      = null;   // In-progress quiz state

// ============================================================
// 4. UTILITY FUNCTIONS
// ============================================================

function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${message}</span>`;
  const container = document.getElementById('toast-container');
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = '0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

function openModal(html, wide = false) {
  document.getElementById('modal-body').innerHTML = html;
  const box = document.getElementById('modal-box');
  box.style.maxWidth = wide ? '720px' : '540px';
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

function handleModalClick(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getGrade(pct) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
}

function getGradeColor(grade) {
  const map = { 'A+': '#059669', A: '#10B981', B: '#3B82F6', C: '#F59E0B', D: '#F97316', F: '#EF4444' };
  return map[grade] || '#6B7280';
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
}

function getRoleLabel(role) {
  return { superuser: 'Super User', teacher: 'Teacher', student: 'Student' }[role] || role;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

function spinner() { return '<div class="spinner"></div>'; }

// ============================================================
// 5. PAGE & VIEW ROUTING
// ============================================================

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const el = document.getElementById(`page-${id}`);
  if (el) el.classList.remove('hidden');
}

function setActiveNav(view) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}

function setHeader(title, breadcrumb = '') {
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-breadcrumb').textContent = breadcrumb;
  document.getElementById('header-actions').innerHTML = '';
}

function setHeaderAction(html) {
  document.getElementById('header-actions').innerHTML = html;
}

function navigate(view, params = {}) {
  setActiveNav(view);
  window._navParams = params;

  const main = document.getElementById('app-main');
  main.innerHTML = spinner();

  const role = currentUserData?.role;

  // Super User views
  if (view === 'su-dashboard')   renderSUDashboard();
  else if (view === 'su-users')  renderUserManagement();
  else if (view === 'su-quizzes') renderAllQuizzesSU();
  else if (view === 'su-results') renderAllResultsSU();

  // Teacher views
  else if (view === 't-dashboard')  renderTeacherDashboard();
  else if (view === 't-myquizzes')  renderMyQuizzes();
  else if (view === 't-createquiz') renderCreateQuizForm();
  else if (view === 't-questions')  renderManageQuestions(params.quizId);
  else if (view === 't-report')     renderStudentReport(params.quizId);

  // Student views
  else if (view === 's-dashboard') renderStudentDashboard();
  else if (view === 's-quizzes')   renderAvailableQuizzes();
  else if (view === 's-takequiz')  startQuiz(params.quizId);
  else if (view === 's-results')   renderMyResults();
  else if (view === 's-result-detail') renderResultDetail(params.attemptId);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ============================================================
// 6. AUTHENTICATION
// ============================================================

function showAuthPage(tab = 'login') {
  showPage('auth');
  switchAuthTab(tab);
}

function switchAuthTab(tab) {
  document.getElementById('auth-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('auth-register').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

// Show admin code field when superuser role is selected
document.querySelectorAll('input[name="reg-role"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.getElementById('admin-code-group').classList.toggle('hidden', radio.value !== 'superuser');
  });
});

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  btn.disabled = true; btn.innerHTML = '<span>Signing in…</span>';
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    showToast(friendlyAuthError(err.code), 'error');
    btn.disabled = false; btn.innerHTML = '<span>Sign In</span>';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-register');
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-password').value;
  const role  = document.querySelector('input[name="reg-role"]:checked').value;
  const adminCode = document.getElementById('reg-admin-code').value;

  if (role === 'superuser' && adminCode !== ADMIN_SECRET_CODE) {
    showToast('Invalid admin code.', 'error'); return;
  }
  btn.disabled = true; btn.innerHTML = '<span>Creating account…</span>';
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await db.collection('users').doc(cred.user.uid).set({
      name, email, role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await cred.user.updateProfile({ displayName: name });
  } catch (err) {
    showToast(friendlyAuthError(err.code), 'error');
    btn.disabled = false; btn.innerHTML = '<span>Create Account</span>';
  }
}

async function handleLogout() {
  await auth.signOut();
  currentUser = currentUserData = null;
  showPage('welcome');
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'Email already registered.',
    'auth/invalid-email': 'Please enter a valid email.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please try later.'
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ============================================================
// 7. AUTH STATE + APP INIT
// ============================================================

function buildSidebar(role) {
  const navDefs = {
    superuser: [
      { icon: '📊', label: 'Dashboard', view: 'su-dashboard' },
      { icon: '👥', label: 'Manage Users', view: 'su-users' },
      { icon: '📝', label: 'All Quizzes', view: 'su-quizzes' },
      { icon: '🏆', label: 'All Results', view: 'su-results' },
    ],
    teacher: [
      { icon: '📊', label: 'Dashboard', view: 't-dashboard' },
      { icon: '📝', label: 'My Quizzes', view: 't-myquizzes' },
      { icon: '➕', label: 'Create Quiz', view: 't-createquiz' },
    ],
    student: [
      { icon: '🏠', label: 'Dashboard', view: 's-dashboard' },
      { icon: '📋', label: 'Available Quizzes', view: 's-quizzes' },
      { icon: '🏆', label: 'My Results', view: 's-results' },
    ]
  };

  const items = navDefs[role] || [];
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = items.map(item => `
    <button class="nav-item" data-view="${item.view}" onclick="navigate('${item.view}')">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </button>
  `).join('');
}

function updateUserInfo() {
  const { name, role } = currentUserData;
  document.getElementById('sidebar-username').textContent = name;
  document.getElementById('user-initials').textContent = getInitials(name);
  const rb = document.getElementById('sidebar-role-badge');
  rb.textContent = getRoleLabel(role);
  rb.className = `role-badge ${role}`;
}

auth.onAuthStateChanged(async (user) => {
  document.getElementById('app-loading').classList.add('hidden');
  if (user) {
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      if (!snap.exists) { await auth.signOut(); showPage('welcome'); return; }
      currentUser = user;
      currentUserData = { id: user.uid, ...snap.data() };
      showPage('app');
      buildSidebar(currentUserData.role);
      updateUserInfo();
      const initView = { superuser: 'su-dashboard', teacher: 't-dashboard', student: 's-dashboard' };
      navigate(initView[currentUserData.role]);
    } catch (err) {
      console.error(err);
      showPage('welcome');
    }
  } else {
    showPage('welcome');
  }
});

// ============================================================
// 8. SUPER USER MODULE
// ============================================================

async function renderSUDashboard() {
  setHeader('Dashboard', 'Super User Overview');
  try {
    const [usersSnap, quizzesSnap, attemptsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('quizzes').get(),
      db.collection('attempts').where('completed', '==', true).get()
    ]);
    const users = usersSnap.docs.map(d => d.data());
    const teachers = users.filter(u => u.role === 'teacher').length;
    const students = users.filter(u => u.role === 'student').length;
    const suCount  = users.filter(u => u.role === 'superuser').length;

    document.getElementById('app-main').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card-icon">👥</div>
          <div class="stat-card-label">Total Users</div>
          <div class="stat-card-value">${users.length}</div>
          <div class="stat-card-sub">${teachers} Teachers · ${students} Students</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon">📝</div>
          <div class="stat-card-label">Total Quizzes</div>
          <div class="stat-card-value">${quizzesSnap.size}</div>
          <div class="stat-card-sub">${quizzesSnap.docs.filter(d=>d.data().published).length} Published</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon">🎯</div>
          <div class="stat-card-label">Attempts</div>
          <div class="stat-card-value">${attemptsSnap.size}</div>
          <div class="stat-card-sub">Completed quiz attempts</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon">🔮</div>
          <div class="stat-card-label">Super Users</div>
          <div class="stat-card-value">${suCount}</div>
          <div class="stat-card-sub">Admin access accounts</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Recent Quiz Attempts</span></div>
        <div class="card-body" id="su-recent-attempts">${spinner()}</div>
      </div>
    `;

    const recentSnap = await db.collection('attempts').where('completed','==',true).orderBy('completedAt','desc').limit(10).get();
    const rows = recentSnap.docs.map(d => {
      const a = d.data();
      return `<tr>
        <td>${escHtml(a.studentName)}</td>
        <td>${escHtml(a.quizTitle)}</td>
        <td>${a.score}/${a.totalMarks}</td>
        <td>${a.percentage?.toFixed(1)}%</td>
        <td><span class="badge badge-info">${getGrade(a.percentage)}</span></td>
        <td>${formatDateTime(a.completedAt)}</td>
      </tr>`;
    }).join('');

    document.getElementById('su-recent-attempts').innerHTML = rows.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Student</th><th>Quiz</th><th>Score</th><th>%</th><th>Grade</th><th>Date</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>` : '<div class="empty-state"><div class="empty-icon">📋</div><h3>No attempts yet</h3></div>';
  } catch (err) {
    document.getElementById('app-main').innerHTML = `<p class="text-danger">Error loading data: ${err.message}</p>`;
  }
}

async function renderUserManagement() {
  setHeader('Manage Users', 'View and manage all user accounts');
  document.getElementById('app-main').innerHTML = spinner();
  try {
    const snap = await db.collection('users').orderBy('createdAt','desc').get();
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const rows = users.map(u => `
      <tr>
        <td><strong>${escHtml(u.name)}</strong></td>
        <td>${escHtml(u.email)}</td>
        <td><span class="badge ${u.role==='superuser'?'badge-purple':u.role==='teacher'?'badge-info':'badge-success'}">${getRoleLabel(u.role)}</span></td>
        <td>${formatDate(u.createdAt)}</td>
        <td>
          <div class="td-actions">
            ${u.id !== currentUser.uid ? `
              <button class="btn btn-sm btn-outline" onclick="suChangeRole('${u.id}','${u.name}','${u.role}')">Change Role</button>
              <button class="btn btn-sm btn-danger" onclick="suDeleteUser('${u.id}','${u.name}')">Delete</button>
            ` : '<span class="text-muted" style="font-size:0.78rem">You</span>'}
          </div>
        </td>
      </tr>
    `).join('');

    document.getElementById('app-main').innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">All Users (${users.length})</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-3)">No users found</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    document.getElementById('app-main').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`;
  }
}

function suChangeRole(uid, name, currentRole) {
  openModal(`
    <h2 class="modal-title">Change Role</h2>
    <p style="margin-bottom:1.25rem">Changing role for <strong>${escHtml(name)}</strong></p>
    <div class="form-group">
      <label>New Role</label>
      <select id="new-role-select">
        <option value="student" ${currentRole==='student'?'selected':''}>Student</option>
        <option value="teacher" ${currentRole==='teacher'?'selected':''}>Teacher</option>
        <option value="superuser" ${currentRole==='superuser'?'selected':''}>Super User</option>
      </select>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="suConfirmChangeRole('${uid}')">Save Role</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function suConfirmChangeRole(uid) {
  const role = document.getElementById('new-role-select').value;
  try {
    await db.collection('users').doc(uid).update({ role });
    showToast('Role updated successfully', 'success');
    closeModal();
    renderUserManagement();
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

function suDeleteUser(uid, name) {
  openModal(`
    <h2 class="modal-title">Delete User</h2>
    <p style="margin-bottom:1.5rem">Are you sure you want to delete <strong>${escHtml(name)}</strong>? This removes their profile from the database. Their login credentials will remain (use Firebase Console to fully delete).</p>
    <div class="form-actions">
      <button class="btn btn-danger" onclick="suConfirmDeleteUser('${uid}')">Yes, Delete</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function suConfirmDeleteUser(uid) {
  try {
    await db.collection('users').doc(uid).delete();
    showToast('User removed from database', 'success');
    closeModal();
    renderUserManagement();
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

async function renderAllQuizzesSU() {
  setHeader('All Quizzes', 'Platform-wide quiz management');
  document.getElementById('app-main').innerHTML = spinner();
  try {
    const snap = await db.collection('quizzes').orderBy('createdAt','desc').get();
    const quizzes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rows = quizzes.map(q => `
      <tr>
        <td><strong>${escHtml(q.title)}</strong></td>
        <td>${escHtml(q.teacherName || '—')}</td>
        <td><span class="badge ${q.published ? 'badge-success':'badge-gray'}">${q.published?'Published':'Draft'}</span></td>
        <td>${escHtml(String(q.questionCount||0))}</td>
        <td>${formatDate(q.createdAt)}</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-sm btn-outline" onclick="suTogglePublish('${q.id}',${q.published})">${q.published?'Unpublish':'Publish'}</button>
            <button class="btn btn-sm btn-danger" onclick="suDeleteQuiz('${q.id}','${escHtml(q.title)}')">Delete</button>
          </div>
        </td>
      </tr>`).join('');
    document.getElementById('app-main').innerHTML = `
      <div class="card">
        <div class="card-header"><span class="card-title">All Quizzes (${quizzes.length})</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Title</th><th>Teacher</th><th>Status</th><th>Questions</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-3)">No quizzes yet</td></tr>'}</tbody>
        </table></div>
      </div>`;
  } catch (err) { document.getElementById('app-main').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`; }
}

async function suTogglePublish(qid, current) {
  try {
    await db.collection('quizzes').doc(qid).update({ published: !current });
    showToast(!current ? 'Quiz published' : 'Quiz unpublished', 'success');
    renderAllQuizzesSU();
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

async function suDeleteQuiz(qid, title) {
  if (!confirm(`Delete quiz "${title}"? This cannot be undone.`)) return;
  try {
    const batch = db.batch();
    batch.delete(db.collection('quizzes').doc(qid));
    const qSnap = await db.collection('questions').where('quizId','==',qid).get();
    qSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    showToast('Quiz deleted', 'success');
    renderAllQuizzesSU();
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

async function renderAllResultsSU() {
  setHeader('All Results', 'Platform-wide student results');
  document.getElementById('app-main').innerHTML = spinner();
  try {
    const snap = await db.collection('attempts').where('completed','==',true).orderBy('completedAt','desc').get();
    const attempts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rows = attempts.map(a => `<tr>
      <td>${escHtml(a.studentName)}</td>
      <td>${escHtml(a.quizTitle)}</td>
      <td>${a.score}/${a.totalMarks}</td>
      <td>${a.percentage?.toFixed(1)}%</td>
      <td><span class="badge badge-info">${getGrade(a.percentage)}</span></td>
      <td>${formatDateTime(a.completedAt)}</td>
    </tr>`).join('');
    document.getElementById('app-main').innerHTML = `
      <div class="card">
        <div class="card-header"><span class="card-title">All Student Results (${attempts.length})</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Student</th><th>Quiz</th><th>Score</th><th>%</th><th>Grade</th><th>Date</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-3)">No results yet</td></tr>'}</tbody>
        </table></div>
      </div>`;
  } catch (err) { document.getElementById('app-main').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`; }
}

// ============================================================
// 9. TEACHER MODULE
// ============================================================

async function renderTeacherDashboard() {
  setHeader('Dashboard', `Welcome back, ${currentUserData.name}`);
  try {
    const [quizSnap, attSnap] = await Promise.all([
      db.collection('quizzes').where('teacherId','==',currentUser.uid).get(),
      db.collection('attempts').where('teacherId','==',currentUser.uid).where('completed','==',true).get()
    ]);
    const attempts = attSnap.docs.map(d => d.data());
    const avgScore = attempts.length ? (attempts.reduce((s,a)=>s+a.percentage,0)/attempts.length).toFixed(1) : 0;
    const published = quizSnap.docs.filter(d=>d.data().published).length;

    document.getElementById('app-main').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-card-icon">📝</div><div class="stat-card-label">My Quizzes</div><div class="stat-card-value">${quizSnap.size}</div><div class="stat-card-sub">${published} published</div></div>
        <div class="stat-card"><div class="stat-card-icon">🎯</div><div class="stat-card-label">Total Attempts</div><div class="stat-card-value">${attempts.length}</div><div class="stat-card-sub">Across all quizzes</div></div>
        <div class="stat-card"><div class="stat-card-icon">📈</div><div class="stat-card-label">Avg Score</div><div class="stat-card-value">${avgScore}%</div><div class="stat-card-sub">Class average</div></div>
      </div>
      <div class="section-header">
        <h2>My Quizzes</h2>
        <button class="btn btn-primary btn-sm" onclick="navigate('t-createquiz')">+ Create Quiz</button>
      </div>
      <div id="t-quick-quizzes">${spinner()}</div>
    `;

    const quizzes = quizSnap.docs.map(d=>({id:d.id,...d.data()})).slice(0,6);
    document.getElementById('t-quick-quizzes').innerHTML = quizzes.length ? `
      <div class="quiz-grid">${quizzes.map(q => teacherQuizCard(q)).join('')}</div>
    ` : `<div class="empty-state"><div class="empty-icon">📝</div><h3>No quizzes yet</h3><p>Click "Create Quiz" to get started.</p></div>`;
  } catch (err) {
    document.getElementById('app-main').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`;
  }
}

function teacherQuizCard(q) {
  return `
    <div class="quiz-card">
      <div class="quiz-card-header">
        <h3>${escHtml(q.title)}</h3>
        <p>${escHtml(q.description || 'No description')}</p>
      </div>
      <div class="quiz-card-body">
        <div class="quiz-meta">
          <span>❓ ${q.questionCount||0} Questions</span>
          <span>⏱️ ${q.timeLimit ? q.timeLimit+'min' : 'No limit'}</span>
          <span class="badge ${q.published?'badge-success':'badge-gray'}">${q.published?'Live':'Draft'}</span>
        </div>
        <div class="quiz-card-actions">
          <button class="btn btn-sm btn-primary" onclick="navigate('t-questions',{quizId:'${q.id}'})">Questions</button>
          <button class="btn btn-sm btn-outline" onclick="navigate('t-report',{quizId:'${q.id}'})">Report</button>
          <button class="btn btn-sm ${q.published?'btn-ghost':'btn-success'}" onclick="teacherTogglePublish('${q.id}',${q.published})">${q.published?'Unpublish':'Publish'}</button>
        </div>
      </div>
    </div>`;
}

async function renderMyQuizzes() {
  setHeader('My Quizzes', 'Manage your quizzes');
  setHeaderAction(`<button class="btn btn-primary btn-sm" onclick="navigate('t-createquiz')">+ New Quiz</button>`);
  document.getElementById('app-main').innerHTML = spinner();
  try {
    const snap = await db.collection('quizzes').where('teacherId','==',currentUser.uid).orderBy('createdAt','desc').get();
    const quizzes = snap.docs.map(d=>({id:d.id,...d.data()}));
    document.getElementById('app-main').innerHTML = quizzes.length ? `
      <div class="quiz-grid">${quizzes.map(q=>teacherQuizCard(q)).join('')}</div>
    ` : `<div class="empty-state"><div class="empty-icon">📝</div><h3>No quizzes yet</h3><p>Create your first quiz and start testing your students.</p><br><button class="btn btn-primary" onclick="navigate('t-createquiz')">Create Quiz</button></div>`;
  } catch (err) { document.getElementById('app-main').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`; }
}

function renderCreateQuizForm() {
  setHeader('Create Quiz', 'Set up a new quiz');
  document.getElementById('app-main').innerHTML = `
    <div class="card" style="max-width:640px">
      <div class="card-header"><span class="card-title">New Quiz Details</span></div>
      <div class="card-body">
        <form id="create-quiz-form" onsubmit="submitCreateQuiz(event)">
          <div class="form-group">
            <label>Quiz Title *</label>
            <input type="text" id="quiz-title" placeholder="e.g. Chapter 5: Cell Biology" required maxlength="100">
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea id="quiz-desc" rows="3" placeholder="Brief description of the quiz…"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Time Limit (minutes)</label>
              <input type="number" id="quiz-time" placeholder="0 = No limit" min="0" max="300" value="0">
            </div>
            <div class="form-group">
              <label>Passing Marks (%)</label>
              <input type="number" id="quiz-pass" placeholder="e.g. 50" min="0" max="100" value="50">
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Create & Add Questions →</button>
            <button type="button" class="btn btn-ghost" onclick="navigate('t-myquizzes')">Cancel</button>
          </div>
        </form>
      </div>
    </div>`;
}

async function submitCreateQuiz(e) {
  e.preventDefault();
  const title = document.getElementById('quiz-title').value.trim();
  const desc  = document.getElementById('quiz-desc').value.trim();
  const time  = parseInt(document.getElementById('quiz-time').value) || 0;
  const pass  = parseInt(document.getElementById('quiz-pass').value) || 50;
  try {
    const ref = await db.collection('quizzes').add({
      title, description: desc, timeLimit: time, passingMarks: pass,
      teacherId: currentUser.uid, teacherName: currentUserData.name,
      published: false, resultsDeclared: false,
      questionCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Quiz created! Now add questions.', 'success');
    navigate('t-questions', { quizId: ref.id });
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

async function teacherTogglePublish(qid, current) {
  try {
    await db.collection('quizzes').doc(qid).update({ published: !current });
    showToast(!current ? '🚀 Quiz is now live!' : 'Quiz moved to draft', 'success');
    navigate('t-myquizzes');
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

async function renderManageQuestions(quizId) {
  if (!quizId) { navigate('t-myquizzes'); return; }
  try {
    const quizDoc = await db.collection('quizzes').doc(quizId).get();
    if (!quizDoc.exists) { showToast('Quiz not found', 'error'); navigate('t-myquizzes'); return; }
    const quiz = { id: quizDoc.id, ...quizDoc.data() };

    setHeader('Manage Questions', quiz.title);
    setHeaderAction(`
      <button class="btn btn-sm ${quiz.published?'btn-ghost':'btn-success'}" onclick="teacherTogglePublish('${quizId}',${quiz.published})">${quiz.published?'Unpublish':'🚀 Publish'}</button>
      <button class="btn btn-sm btn-outline" onclick="navigate('t-report',{quizId:'${quizId}'})">View Report</button>
    `);

    document.getElementById('app-main').innerHTML = `
      <div class="grid-2" style="align-items:start;gap:1.5rem">
        <div>
          <div class="section-header">
            <h2>Questions</h2>
            <button class="btn btn-primary btn-sm" onclick="openAddQuestionModal('${quizId}')">+ Add Question</button>
          </div>
          <div id="questions-list">${spinner()}</div>
        </div>
        <div>
          <div class="card">
            <div class="card-header"><span class="card-title">📤 Upload via Excel</span></div>
            <div class="card-body">
              <p style="font-size:0.85rem;color:var(--text-3);margin-bottom:1rem">Bulk upload questions from an Excel file.</p>
              <div class="excel-info">
                <strong>Expected Column Format:</strong>
                A: Question | B: Option 1 | C: Option 2 | D: Option 3 | E: Option 4 | F: Correct (1–4) | G: Marks (optional)
              </div>
              <div class="form-group" style="margin-top:1rem">
                <label>Select .xlsx / .xls file</label>
                <input type="file" id="excel-file" accept=".xlsx,.xls">
              </div>
              <button class="btn btn-primary btn-sm" onclick="uploadExcel('${quizId}')">Upload Questions</button>
            </div>
          </div>
          ${quiz.resultsDeclared ? `<div class="declared-banner" style="margin-top:1rem">🏆 Results have been officially declared</div>` : `
          <div class="card" style="margin-top:1rem">
            <div class="card-body">
              <p style="font-size:0.85rem;margin-bottom:1rem"><strong>Declare Results</strong> — marks this quiz as officially complete and visible to all students.</p>
              <button class="btn btn-accent btn-sm" onclick="declareResults('${quizId}')">🏆 Declare Results</button>
            </div>
          </div>`}
        </div>
      </div>
    `;
    loadQuestionsList(quizId);
  } catch (err) { document.getElementById('app-main').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`; }
}

async function loadQuestionsList(quizId) {
  try {
    const snap = await db.collection('questions').where('quizId','==',quizId).orderBy('order').get();
    const questions = snap.docs.map((d,i) => ({ id: d.id, ...d.data(), idx: i+1 }));
    const list = document.getElementById('questions-list');
    if (!list) return;
    list.innerHTML = questions.length ? questions.map(q => `
      <div class="card" style="margin-bottom:0.75rem">
        <div class="card-body" style="padding:1rem 1.25rem">
          <div style="display:flex;justify-content:space-between;gap:0.5rem;margin-bottom:0.6rem">
            <span style="font-size:0.75rem;font-weight:700;color:var(--primary);text-transform:uppercase">Q${q.idx} · ${q.marks||1} mark(s)</span>
            <div class="td-actions">
              <button class="btn btn-sm btn-outline" onclick="openEditQuestionModal('${quizId}','${q.id}')">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteQuestion('${q.id}','${quizId}')">Del</button>
            </div>
          </div>
          <p style="font-size:0.875rem;font-weight:600;margin-bottom:0.5rem">${escHtml(q.question)}</p>
          <div style="display:flex;flex-direction:column;gap:0.25rem">
            ${(q.options||[]).map((opt,i) => `
              <span style="font-size:0.78rem;padding:0.2rem 0.5rem;border-radius:4px;${i===q.correctAnswer?'background:#D1FAE5;color:#065F46;font-weight:600':'color:var(--text-3)'}">
                ${String.fromCharCode(65+i)}. ${escHtml(opt)} ${i===q.correctAnswer?'✓':''}
              </span>`).join('')}
          </div>
        </div>
      </div>`).join('') :
      `<div class="empty-state"><div class="empty-icon">❓</div><h3>No questions yet</h3><p>Add questions manually or upload an Excel file.</p></div>`;
  } catch (err) { document.getElementById('questions-list').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`; }
}

function questionModalHTML(quizId, q = null) {
  const isEdit = q !== null;
  return `
    <h2 class="modal-title">${isEdit ? 'Edit Question' : 'Add Question'}</h2>
    <form id="q-form" onsubmit="${isEdit ? `submitEditQuestion(event,'${q.id}','${quizId}')` : `submitAddQuestion(event,'${quizId}')`}">
      <div class="form-group">
        <label>Question *</label>
        <textarea id="q-text" rows="3" placeholder="Enter your question…" required>${isEdit ? escHtml(q.question) : ''}</textarea>
      </div>
      ${[0,1,2,3].map(i => `
        <div class="form-group">
          <label>Option ${String.fromCharCode(65+i)} ${i<2?'*':''}</label>
          <input type="text" id="q-opt-${i}" placeholder="Option ${String.fromCharCode(65+i)}" value="${isEdit && q.options ? escHtml(q.options[i]||'') : ''}" ${i<2?'required':''}>
        </div>`).join('')}
      <div class="form-row">
        <div class="form-group">
          <label>Correct Answer *</label>
          <select id="q-correct" required>
            ${[0,1,2,3].map(i=>`<option value="${i}" ${isEdit&&q.correctAnswer===i?'selected':''}>Option ${String.fromCharCode(65+i)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Marks</label>
          <input type="number" id="q-marks" value="${isEdit ? q.marks||1 : 1}" min="1" max="100">
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Question'}</button>
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>
    </form>`;
}

function openAddQuestionModal(quizId) { openModal(questionModalHTML(quizId)); }

async function openEditQuestionModal(quizId, questionId) {
  const snap = await db.collection('questions').doc(questionId).get();
  if (!snap.exists) { showToast('Question not found','error'); return; }
  openModal(questionModalHTML(quizId, { id: snap.id, ...snap.data() }));
}

async function submitAddQuestion(e, quizId) {
  e.preventDefault();
  const data = buildQuestionData();
  try {
    const snap = await db.collection('questions').where('quizId','==',quizId).get();
    await db.collection('questions').add({ ...data, quizId, order: snap.size, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('quizzes').doc(quizId).update({ questionCount: snap.size + 1 });
    showToast('Question added!', 'success'); closeModal(); loadQuestionsList(quizId);
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

async function submitEditQuestion(e, questionId, quizId) {
  e.preventDefault();
  try {
    await db.collection('questions').doc(questionId).update(buildQuestionData());
    showToast('Question updated!', 'success'); closeModal(); loadQuestionsList(quizId);
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

function buildQuestionData() {
  return {
    question: document.getElementById('q-text').value.trim(),
    options: [0,1,2,3].map(i => document.getElementById(`q-opt-${i}`).value.trim()),
    correctAnswer: parseInt(document.getElementById('q-correct').value),
    marks: parseInt(document.getElementById('q-marks').value) || 1
  };
}

async function deleteQuestion(questionId, quizId) {
  if (!confirm('Delete this question?')) return;
  try {
    await db.collection('questions').doc(questionId).delete();
    const snap = await db.collection('questions').where('quizId','==',quizId).get();
    await db.collection('quizzes').doc(quizId).update({ questionCount: snap.size });
    showToast('Question deleted', 'success'); loadQuestionsList(quizId);
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

async function uploadExcel(quizId) {
  const file = document.getElementById('excel-file')?.files?.[0];
  if (!file) { showToast('Please select an Excel file', 'warning'); return; }
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // Auto-detect header row
      let start = 0;
      if (rows[0] && typeof rows[0][0] === 'string' && rows[0][0].toLowerCase().includes('question')) start = 1;

      const existingSnap = await db.collection('questions').where('quizId','==',quizId).get();
      let orderOffset = existingSnap.size;
      const batch = db.batch();
      let count = 0;

      for (let i = start; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0] || !String(row[0]).trim()) continue;
        const qRef = db.collection('questions').doc();
        const correctIdx = Math.max(0, Math.min(3, (parseInt(row[5]) || 1) - 1));
        batch.set(qRef, {
          quizId,
          question: String(row[0]).trim(),
          options: [String(row[1]||'').trim(), String(row[2]||'').trim(), String(row[3]||'').trim(), String(row[4]||'').trim()],
          correctAnswer: correctIdx,
          marks: parseInt(row[6]) || 1,
          order: orderOffset + count,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        count++;
      }

      if (count === 0) { showToast('No valid rows found in the file', 'warning'); return; }
      await batch.commit();
      await db.collection('quizzes').doc(quizId).update({ questionCount: orderOffset + count });
      showToast(`✅ ${count} questions uploaded!`, 'success');
      loadQuestionsList(quizId);
    } catch (err) { showToast('Excel error: ' + err.message, 'error'); }
  };
  reader.readAsArrayBuffer(file);
}

async function declareResults(quizId) {
  if (!confirm('Declare official results for this quiz? Students will be notified.')) return;
  try {
    await db.collection('quizzes').doc(quizId).update({ resultsDeclared: true, declaredAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast('🏆 Results declared!', 'success');
    renderManageQuestions(quizId);
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

async function renderStudentReport(quizId) {
  if (!quizId) { navigate('t-myquizzes'); return; }
  try {
    const quizDoc = await db.collection('quizzes').doc(quizId).get();
    const quiz = { id: quizDoc.id, ...quizDoc.data() };
    setHeader('Student Report', quiz.title);
    setHeaderAction(`<button class="btn btn-sm btn-outline" onclick="navigate('t-questions',{quizId:'${quizId}'})">← Questions</button>`);
    document.getElementById('app-main').innerHTML = spinner();

    const snap = await db.collection('attempts').where('quizId','==',quizId).where('completed','==',true).orderBy('completedAt','desc').get();
    const attempts = snap.docs.map(d=>({id:d.id,...d.data()}));

    if (!attempts.length) {
      document.getElementById('app-main').innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h3>No submissions yet</h3><p>No students have completed this quiz yet.</p></div>`;
      return;
    }

    const avg = (attempts.reduce((s,a)=>s+a.percentage,0)/attempts.length).toFixed(1);
    const highest = Math.max(...attempts.map(a=>a.percentage)).toFixed(1);
    const lowest  = Math.min(...attempts.map(a=>a.percentage)).toFixed(1);
    const passed  = attempts.filter(a=>a.percentage>=(quiz.passingMarks||50)).length;

    const rows = attempts.map((a,i) => `<tr>
      <td>${i+1}</td>
      <td>${escHtml(a.studentName)}</td>
      <td>${a.score}/${a.totalMarks}</td>
      <td>${a.percentage?.toFixed(1)}%</td>
      <td><span class="badge badge-info">${getGrade(a.percentage)}</span></td>
      <td><span class="badge ${a.percentage>=(quiz.passingMarks||50)?'badge-success':'badge-danger'}">${a.percentage>=(quiz.passingMarks||50)?'Pass':'Fail'}</span></td>
      <td>${formatDateTime(a.completedAt)}</td>
    </tr>`).join('');

    document.getElementById('app-main').innerHTML = `
      ${quiz.resultsDeclared ? `<div class="declared-banner">🏆 Results have been officially declared</div>` : ''}
      <div class="report-summary">
        <div class="report-summary-item"><div class="report-summary-num">${attempts.length}</div><div class="report-summary-lbl">Submitted</div></div>
        <div class="report-summary-item"><div class="report-summary-num">${avg}%</div><div class="report-summary-lbl">Avg Score</div></div>
        <div class="report-summary-item"><div class="report-summary-num">${highest}%</div><div class="report-summary-lbl">Highest</div></div>
        <div class="report-summary-item"><div class="report-summary-num">${lowest}%</div><div class="report-summary-lbl">Lowest</div></div>
        <div class="report-summary-item"><div class="report-summary-num">${passed}/${attempts.length}</div><div class="report-summary-lbl">Passed</div></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Student Submissions</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Student</th><th>Score</th><th>%</th><th>Grade</th><th>Result</th><th>Submitted</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  } catch (err) { document.getElementById('app-main').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`; }
}

// ============================================================
// 10. STUDENT MODULE
// ============================================================

async function renderStudentDashboard() {
  setHeader('Dashboard', `Hello, ${currentUserData.name}! 👋`);
  try {
    const [mySnap, pubSnap] = await Promise.all([
      db.collection('attempts').where('studentId','==',currentUser.uid).where('completed','==',true).get(),
      db.collection('quizzes').where('published','==',true).get()
    ]);
    const myAttempts = mySnap.docs.map(d=>d.data());
    const avgScore = myAttempts.length ? (myAttempts.reduce((s,a)=>s+a.percentage,0)/myAttempts.length).toFixed(1) : 0;
    const completedIds = new Set(myAttempts.map(a=>a.quizId));
    const available = pubSnap.docs.filter(d=>!completedIds.has(d.id)).length;

    document.getElementById('app-main').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-card-icon">📋</div><div class="stat-card-label">Available</div><div class="stat-card-value">${available}</div><div class="stat-card-sub">Quizzes to take</div></div>
        <div class="stat-card"><div class="stat-card-icon">✅</div><div class="stat-card-label">Completed</div><div class="stat-card-value">${myAttempts.length}</div><div class="stat-card-sub">Quizzes done</div></div>
        <div class="stat-card"><div class="stat-card-icon">📈</div><div class="stat-card-label">My Average</div><div class="stat-card-value">${avgScore}%</div><div class="stat-card-sub">Overall performance</div></div>
      </div>
      <div class="section-header"><h2>📋 Available Quizzes</h2><button class="btn btn-sm btn-ghost" onclick="navigate('s-quizzes')">View all →</button></div>
      <div id="student-avail-list">${spinner()}</div>
    `;

    const availQuizzes = pubSnap.docs.filter(d=>!completedIds.has(d.id)).slice(0,4).map(d=>({id:d.id,...d.data()}));
    document.getElementById('student-avail-list').innerHTML = availQuizzes.length ? `
      <div class="quiz-grid">${availQuizzes.map(q => studentQuizCard(q, false)).join('')}</div>
    ` : `<div class="empty-state"><div class="empty-icon">🎉</div><h3>All caught up!</h3><p>No new quizzes available right now.</p></div>`;
  } catch (err) { document.getElementById('app-main').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`; }
}

function studentQuizCard(q, completed, grade = null) {
  return `
    <div class="quiz-card">
      <div class="quiz-card-header">
        <h3>${escHtml(q.title)}</h3>
        <p>${escHtml(q.description || 'Click to start')}</p>
      </div>
      <div class="quiz-card-body">
        <div class="quiz-meta">
          <span>❓ ${q.questionCount||0} Questions</span>
          ${q.timeLimit ? `<span>⏱️ ${q.timeLimit} min</span>` : ''}
          ${q.resultsDeclared ? '<span class="badge badge-success">🏆 Results Declared</span>' : ''}
        </div>
        <div class="quiz-card-actions">
          ${completed
            ? `<span class="badge badge-success">Done · ${grade}</span>
               <button class="btn btn-sm btn-outline" onclick="navigate('s-results')">See Results</button>`
            : `<button class="btn btn-sm btn-primary" onclick="confirmStartQuiz('${q.id}','${escHtml(q.title)}',${q.questionCount||0},${q.timeLimit||0})">Start Quiz →</button>`}
        </div>
      </div>
    </div>`;
}

function confirmStartQuiz(quizId, title, qCount, timeLimit) {
  openModal(`
    <h2 class="modal-title">Ready to Start?</h2>
    <p style="margin-bottom:1.25rem"><strong>${escHtml(title)}</strong></p>
    <ul style="list-style:none;display:flex;flex-direction:column;gap:0.6rem;margin-bottom:1.5rem;font-size:0.875rem;color:var(--text-2)">
      <li>❓ ${qCount} Questions</li>
      <li>⏱️ Time limit: ${timeLimit ? timeLimit + ' minutes' : 'None'}</li>
      <li>🔒 Answers are locked once you proceed to the next question</li>
      <li>⚠️ You cannot go back to a previous question</li>
      <li>🎯 Your score will be shown instantly at the end</li>
    </ul>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="closeModal();navigate('s-takequiz',{quizId:'${quizId}'})">Start Now →</button>
      <button class="btn btn-ghost" onclick="closeModal()">Not yet</button>
    </div>
  `);
}

async function renderAvailableQuizzes() {
  setHeader('Available Quizzes', 'All published quizzes');
  document.getElementById('app-main').innerHTML = spinner();
  try {
    const [pubSnap, mySnap] = await Promise.all([
      db.collection('quizzes').where('published','==',true).get(),
      db.collection('attempts').where('studentId','==',currentUser.uid).where('completed','==',true).get()
    ]);
    const myAttempts = Object.fromEntries(mySnap.docs.map(d=>[d.data().quizId, d.data()]));
    const quizzes = pubSnap.docs.map(d=>({id:d.id,...d.data()}));

    document.getElementById('app-main').innerHTML = quizzes.length ? `
      <div class="quiz-grid">${quizzes.map(q => {
        const att = myAttempts[q.id];
        return studentQuizCard(q, !!att, att ? getGrade(att.percentage) : null);
      }).join('')}</div>
    ` : `<div class="empty-state"><div class="empty-icon">📋</div><h3>No quizzes available</h3><p>Check back later for new quizzes from your teachers.</p></div>`;
  } catch (err) { document.getElementById('app-main').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`; }
}

// ========== QUIZ TAKING ENGINE ==========

async function startQuiz(quizId) {
  if (!quizId) { navigate('s-quizzes'); return; }
  try {
    // Check if already completed
    const existingSnap = await db.collection('attempts')
      .where('studentId','==',currentUser.uid)
      .where('quizId','==',quizId)
      .where('completed','==',true)
      .get();
    if (!existingSnap.empty) {
      showToast('You already completed this quiz.', 'info');
      navigate('s-results');
      return;
    }

    const [quizDoc, qSnap] = await Promise.all([
      db.collection('quizzes').doc(quizId).get(),
      db.collection('questions').where('quizId','==',quizId).orderBy('order').get()
    ]);

    if (!quizDoc.exists) { showToast('Quiz not found', 'error'); navigate('s-quizzes'); return; }
    if (qSnap.empty) { showToast('This quiz has no questions yet', 'warning'); navigate('s-quizzes'); return; }

    const quiz = { id: quizDoc.id, ...quizDoc.data() };
    const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    activeQuiz = {
      quizId, quiz,
      questions,
      currentIndex: 0,
      submittedAnswers: {}, // questionId → optionIndex
      selectedAnswer: null, // currently highlighted (not yet locked)
      startTime: Date.now(),
      timerInterval: null
    };

    setHeader(quiz.title, `${questions.length} Questions`);
    document.getElementById('header-actions').innerHTML = quiz.timeLimit
      ? `<div id="quiz-timer" style="font-family:var(--font-display);font-weight:700;font-size:1.1rem;color:var(--primary)">⏱️ --:--</div>` : '';

    if (quiz.timeLimit) startTimer(quiz.timeLimit * 60);

    renderQuizQuestion();
  } catch (err) { document.getElementById('app-main').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`; }
}

function startTimer(totalSeconds) {
  let remaining = totalSeconds;
  const el = document.getElementById('quiz-timer');
  activeQuiz.timerInterval = setInterval(() => {
    remaining--;
    if (!el) { clearInterval(activeQuiz.timerInterval); return; }
    const m = Math.floor(remaining/60).toString().padStart(2,'0');
    const s = (remaining%60).toString().padStart(2,'0');
    el.innerHTML = `⏱️ ${m}:${s}`;
    if (remaining <= 60) el.style.color = 'var(--danger)';
    if (remaining <= 0) { clearInterval(activeQuiz.timerInterval); finishQuiz(); }
  }, 1000);
}

function renderQuizQuestion() {
  const { questions, currentIndex, submittedAnswers, selectedAnswer } = activeQuiz;
  const q = questions[currentIndex];
  const total = questions.length;
  const pct = ((currentIndex) / total * 100).toFixed(0);
  const isLocked = submittedAnswers.hasOwnProperty(q.id);
  const isLast = currentIndex === total - 1;
  const letters = ['A', 'B', 'C', 'D'];

  document.getElementById('app-main').innerHTML = `
    <div class="quiz-container">
      <div class="quiz-header-bar">
        <div>
          <div class="quiz-header-title">${escHtml(activeQuiz.quiz.title)}</div>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <div class="quiz-progress-text">${currentIndex+1} / ${total}</div>
      </div>

      <div class="question-card">
        <div class="question-num">Question ${currentIndex+1}</div>
        <p class="question-text">${escHtml(q.question)}</p>
        <p class="question-marks">${q.marks||1} mark(s)</p>

        <div class="options-list">
          ${(q.options||[]).map((opt, i) => {
            let cls = 'option-item';
            if (isLocked) {
              cls += ' locked';
              if (submittedAnswers[q.id] === i) cls += ' selected-opt';
            } else {
              if (selectedAnswer === i) cls += ' selected-opt';
            }
            return `
              <div class="${cls}" onclick="${isLocked ? '' : `selectOption(${i})`}">
                <div class="option-letter">${letters[i]}</div>
                <span>${escHtml(opt)}</span>
              </div>`;
          }).join('')}
        </div>

        <div class="quiz-actions">
          ${isLocked
            ? (isLast
                ? `<button class="btn btn-accent btn-lg" onclick="finishQuiz()">🏁 Submit Quiz</button>`
                : `<button class="btn btn-primary" onclick="goNext()">Next Question →</button>`)
            : `<p class="quiz-warning">⚠️ Select an answer before proceeding</p>
               <button class="btn btn-primary" onclick="lockAndNext()" id="btn-next" ${selectedAnswer===null?'disabled':''}>
                 ${isLast ? '🏁 Submit Quiz' : 'Lock & Next →'}
               </button>`}
        </div>
      </div>
    </div>`;
}

function selectOption(index) {
  if (!activeQuiz) return;
  const q = activeQuiz.questions[activeQuiz.currentIndex];
  if (activeQuiz.submittedAnswers.hasOwnProperty(q.id)) return; // already locked
  activeQuiz.selectedAnswer = index;

  document.querySelectorAll('.option-item').forEach((el, i) => {
    el.classList.toggle('selected-opt', i === index);
  });
  const btn = document.getElementById('btn-next');
  if (btn) btn.disabled = false;
}

function lockAndNext() {
  if (!activeQuiz) return;
  const { selectedAnswer, currentIndex, questions } = activeQuiz;
  if (selectedAnswer === null) { showToast('Please select an answer', 'warning'); return; }
  const q = questions[currentIndex];
  activeQuiz.submittedAnswers[q.id] = selectedAnswer;
  activeQuiz.selectedAnswer = null;

  if (currentIndex === questions.length - 1) { finishQuiz(); }
  else { activeQuiz.currentIndex++; renderQuizQuestion(); }
}

function goNext() {
  if (!activeQuiz) return;
  if (activeQuiz.currentIndex < activeQuiz.questions.length - 1) {
    activeQuiz.currentIndex++;
    activeQuiz.selectedAnswer = null;
    renderQuizQuestion();
  } else { finishQuiz(); }
}

async function finishQuiz() {
  if (!activeQuiz) return;
  if (activeQuiz.timerInterval) clearInterval(activeQuiz.timerInterval);

  const { quizId, quiz, questions, submittedAnswers, startTime } = activeQuiz;

  let score = 0, totalMarks = 0;
  questions.forEach(q => {
    totalMarks += q.marks || 1;
    if (submittedAnswers[q.id] === q.correctAnswer) score += q.marks || 1;
  });

  const percentage = totalMarks > 0 ? (score / totalMarks * 100) : 0;
  const timeTaken = Math.floor((Date.now() - startTime) / 1000);

  const attemptData = {
    quizId, quizTitle: quiz.title,
    teacherId: quiz.teacherId,
    studentId: currentUser.uid,
    studentName: currentUserData.name,
    answers: submittedAnswers,
    score, totalMarks, percentage,
    timeTakenSeconds: timeTaken,
    completed: true,
    startedAt: new firebase.firestore.Timestamp(Math.floor(startTime/1000), 0),
    completedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const ref = await db.collection('attempts').add(attemptData);
    const attempt = { ...attemptData, id: ref.id };
    activeQuiz = null;
    renderQuizResults(attempt, questions);
  } catch (err) { showToast('Error saving results: ' + err.message, 'error'); }
}

function renderQuizResults(attempt, questions) {
  const { score, totalMarks, percentage, quizTitle, timeTakenSeconds } = attempt;
  const grade = getGrade(percentage);
  const gradeColor = getGradeColor(grade);
  const emoji = percentage >= 90 ? '🏆' : percentage >= 70 ? '🎉' : percentage >= 50 ? '👍' : '📚';

  setHeader('Quiz Results', quizTitle);
  document.getElementById('header-actions').innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="navigate('s-results')">View All Results</button>
    <button class="btn btn-primary btn-sm" onclick="navigate('s-quizzes')">More Quizzes</button>
  `;

  const circum = 2 * Math.PI * 70;
  const offset = circum * (1 - percentage / 100);

  const reviewHTML = questions.map(q => {
    const chosen = attempt.answers?.[q.id];
    const isCorrect = chosen === q.correctAnswer;
    const letters = ['A','B','C','D'];
    return `
      <div class="review-item ${isCorrect ? 'correct' : 'wrong'}">
        <p class="review-q">${isCorrect ? '✅' : '❌'} ${escHtml(q.question)}</p>
        <div class="review-a">
          <span>Your answer: <strong>${chosen !== undefined ? letters[chosen] + '. ' + escHtml(q.options[chosen]) : 'Not answered'}</strong></span>
          ${!isCorrect ? `<span style="color:var(--success)">Correct: <strong>${letters[q.correctAnswer]}. ${escHtml(q.options[q.correctAnswer])}</strong></span>` : ''}
        </div>
      </div>`;
  }).join('');

  document.getElementById('app-main').innerHTML = `
    <div class="result-card">
      <div class="result-hero">
        <div class="result-emoji">${emoji}</div>
        <h2 class="result-title">${percentage >= 50 ? 'Congratulations!' : 'Keep Practicing!'}</h2>
        <p class="result-sub">${escHtml(quizTitle)}</p>
      </div>

      <div class="score-ring-wrap">
        <svg class="score-ring-svg" width="180" height="180" viewBox="0 0 180 180">
          <circle class="score-ring-track" cx="90" cy="90" r="70" stroke-width="14"/>
          <circle class="score-ring-fill" cx="90" cy="90" r="70" stroke-width="14"
            stroke="${gradeColor}"
            stroke-dasharray="${circum}"
            stroke-dashoffset="${circum}"
            id="ring-fill-circle"/>
          <text class="score-ring-text" x="90" y="82">
            <tspan class="score-pct" x="90" dy="0">${percentage.toFixed(1)}%</tspan>
            <tspan class="score-label-txt" x="90" dy="24">Score</tspan>
          </text>
        </svg>
      </div>

      <div style="text-align:center;margin-bottom:1.5rem">
        <div class="grade-chip" style="background:${gradeColor}">${grade}</div>
        <p style="font-size:0.85rem;color:var(--text-3)">Grade</p>
      </div>

      <div class="result-stats">
        <div class="result-stat"><div class="result-stat-num" style="color:var(--primary)">${score}</div><div class="result-stat-lbl">Score</div></div>
        <div class="result-stat"><div class="result-stat-num">${totalMarks}</div><div class="result-stat-lbl">Total Marks</div></div>
        <div class="result-stat"><div class="result-stat-num" style="color:var(--success)">${questions.filter(q=>attempt.answers?.[q.id]===q.correctAnswer).length}</div><div class="result-stat-lbl">Correct</div></div>
        <div class="result-stat"><div class="result-stat-num" style="color:var(--danger)">${questions.filter(q=>attempt.answers?.[q.id]!==q.correctAnswer).length}</div><div class="result-stat-lbl">Wrong</div></div>
      </div>

      <hr class="divider">
      <div class="review-section">
        <h3>Answer Review</h3>
        <div class="review-list">${reviewHTML}</div>
      </div>
    </div>`;

  // Animate the ring
  setTimeout(() => {
    const circle = document.getElementById('ring-fill-circle');
    if (circle) circle.style.strokeDashoffset = offset;
  }, 100);
}

async function renderMyResults() {
  setHeader('My Results', 'Your quiz history');
  document.getElementById('app-main').innerHTML = spinner();
  try {
    const snap = await db.collection('attempts')
      .where('studentId','==',currentUser.uid)
      .where('completed','==',true)
      .orderBy('completedAt','desc')
      .get();
    const attempts = snap.docs.map(d=>({id:d.id,...d.data()}));

    if (!attempts.length) {
      document.getElementById('app-main').innerHTML = `<div class="empty-state"><div class="empty-icon">🏆</div><h3>No results yet</h3><p>Complete a quiz to see your results here.</p><br><button class="btn btn-primary" onclick="navigate('s-quizzes')">Browse Quizzes</button></div>`;
      return;
    }

    const avgScore = (attempts.reduce((s,a)=>s+a.percentage,0)/attempts.length).toFixed(1);
    document.getElementById('app-main').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-card-icon">✅</div><div class="stat-card-label">Quizzes Done</div><div class="stat-card-value">${attempts.length}</div></div>
        <div class="stat-card"><div class="stat-card-icon">📈</div><div class="stat-card-label">Average Score</div><div class="stat-card-value">${avgScore}%</div></div>
        <div class="stat-card"><div class="stat-card-icon">🏆</div><div class="stat-card-label">Best Score</div><div class="stat-card-value">${Math.max(...attempts.map(a=>a.percentage)).toFixed(1)}%</div></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">All My Results</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Quiz</th><th>Score</th><th>%</th><th>Grade</th><th>Date</th></tr></thead>
          <tbody>${attempts.map(a => {
            const g = getGrade(a.percentage);
            return `<tr>
              <td><strong>${escHtml(a.quizTitle)}</strong></td>
              <td>${a.score}/${a.totalMarks}</td>
              <td>${a.percentage?.toFixed(1)}%</td>
              <td><span class="badge badge-info">${g}</span></td>
              <td>${formatDate(a.completedAt)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;
  } catch (err) { document.getElementById('app-main').innerHTML = `<p class="text-danger">Error: ${err.message}</p>`; }
}