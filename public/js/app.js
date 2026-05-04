import { renderSlide } from './slides.js';
import {
  loadProgress, saveProgress, syncToGitHub, loadLessonsIndex, loadLesson, loadConcepts,
  listUsers, createUser, getCurrentUserId, setCurrentUserId
} from './progress-client.js';

// ---- Dashboard ----
export async function initDashboard() {
  // Step 1: ensure a user is selected. If not, render the picker and wait.
  let userId = getCurrentUserId();
  if (!userId) {
    await renderUserPicker();
    return; // renderUserPicker reloads the page once a user is chosen.
  }

  // Step 2: try to load the chosen user's progress. If the file is gone
  // (user deleted, repo wiped, etc.), fall back to picker.
  let progress;
  try {
    progress = await loadProgress();
  } catch (e) {
    setCurrentUserId('');
    await renderUserPicker();
    return;
  }

  // Hide the picker, show the dashboard.
  document.getElementById('user-picker-main').hidden = true;
  document.getElementById('dashboard-main').hidden = false;
  document.getElementById('topbar-user-actions').hidden = false;
  document.getElementById('current-user-label').textContent = userId;
  document.getElementById('switch-user-btn').onclick = () => {
    setCurrentUserId('');
    location.reload();
  };

  const lessons = await loadLessonsIndex();

  document.getElementById('user-greeting').textContent = `Hi ${progress.userName || userId} —`;
  document.getElementById('stat-keystrokes').textContent = progress.stats.totalKeystrokes.toLocaleString();
  document.getElementById('stat-exercises').textContent = progress.stats.exercisesCompleted;
  document.getElementById('stat-time').textContent = formatTime(progress.stats.totalTimeSeconds);
  document.getElementById('stat-saved').textContent = progress.lastSavedAt
    ? new Date(progress.lastSavedAt).toLocaleString()
    : 'Never';

  const list = document.getElementById('lessons-list');
  list.innerHTML = '';
  for (const lesson of lessons) {
    const completed = progress.lessonsCompleted.includes(lesson.id);
    const isCurrent = progress.currentLesson === lesson.id;
    const card = document.createElement('a');
    card.className = `lesson-card ${completed ? 'completed' : ''} ${isCurrent ? 'current' : ''}`;
    card.href = `/lesson.html?id=${encodeURIComponent(lesson.id)}`;
    card.innerHTML = `
      <div class="lesson-title">${lesson.title}</div>
      <div class="lesson-meta">${lesson.slideCount} slides ${completed ? '· ✓ completed' : isCurrent ? '· in progress' : ''}</div>
      <div class="lesson-id">${lesson.id}</div>
    `;
    list.appendChild(card);
  }

  document.getElementById('resume-btn').onclick = () => {
    const lesson = lessons.find(l => l.id === progress.currentLesson) || lessons[0];
    if (!lesson) return;
    location.href = `/lesson.html?id=${encodeURIComponent(lesson.id)}&slide=${progress.currentSlide || 0}`;
  };

  document.getElementById('sync-btn').onclick = async () => {
    const btn = document.getElementById('sync-btn');
    btn.disabled = true;
    btn.textContent = 'Syncing…';
    try {
      const result = await syncToGitHub(`progress: ${progress.currentLesson} slide ${progress.currentSlide}`);
      btn.textContent = result.ok ? 'Synced ✓' : 'Sync failed';
      if (!result.ok) {
        console.error(result);
        showSyncErrorModal(result);
      }
    } catch (e) {
      btn.textContent = 'Sync failed';
      console.error(e);
      showSyncErrorModal({ error: String(e), failedStep: '(network)', stderr: '', stdout: '' });
    }
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Sync to GitHub'; }, 2500);
  };
}

// ---- Lesson player ----
export async function initLesson() {
  // Guard: if no user is selected, send the visitor back to the dashboard
  // (which will show the picker).
  if (!getCurrentUserId()) {
    location.href = '/';
    return;
  }

  const params = new URLSearchParams(location.search);
  const lessonId = params.get('id');
  const startSlide = parseInt(params.get('slide') || '0', 10);

  const lessons = await loadLessonsIndex();
  const meta = lessons.find(l => l.id === lessonId);
  if (!meta) {
    document.getElementById('slide-host').textContent = `Lesson "${lessonId}" not found.`;
    return;
  }
  const lesson = await loadLesson(meta.file);
  const progress = await loadProgress();
  const concepts = await loadConcepts();
  if (!Array.isArray(progress.mutedConcepts)) progress.mutedConcepts = [];
  const sessionMuted = new Set();
  const reminders = new ConceptReminders({
    concepts,
    currentLessonId: lessonId,
    isPermanentlyMuted: id => progress.mutedConcepts.includes(id),
    isSessionMuted: id => sessionMuted.has(id),
    onMutePermanent: id => {
      if (!progress.mutedConcepts.includes(id)) progress.mutedConcepts.push(id);
      saveProgress(progress);
    },
    onMuteSession: id => sessionMuted.add(id)
  });

  setupRemindersUI(progress, concepts);
  const devMode = setupDevMode();

  // resume from saved slide if user navigated here without explicit slide param
  let idx = !isNaN(startSlide) && startSlide >= 0 ? startSlide : 0;
  if (progress.currentLesson === lessonId && !params.has('slide')) {
    idx = progress.currentSlide || 0;
  }
  if (idx >= lesson.slides.length) idx = 0;

  document.getElementById('lesson-title').textContent = lesson.title;

  const host = document.getElementById('slide-host');
  const nextBtn = document.getElementById('next-btn');
  const prevBtn = document.getElementById('prev-btn');
  const progressEl = document.getElementById('slide-progress');

  const sessionStart = Date.now();
  const exercisesAtStart = progress.stats.exercisesCompleted;
  let keystrokesAtStart = progress.stats.totalKeystrokes;

  const ctx = {
    enableNext() { nextBtn.disabled = false; },
    showLineConcepts(conceptIds) { reminders.showFor(conceptIds); },
    recordExercise(slide, result) {
      progress.stats.totalKeystrokes += (slide.code || '').length;
      progress.stats.exercisesCompleted += 1;
      progress.exerciseHistory.push({
        slideTitle: slide.title,
        wpm: result.wpm,
        accuracy: result.accuracy,
        seconds: result.seconds,
        completedAt: new Date().toISOString()
      });
      if (progress.exerciseHistory.length > 200) progress.exerciseHistory.shift();
    }
  };

  function show(i) {
    idx = i;
    progressEl.textContent = `Slide ${i + 1} of ${lesson.slides.length}`;
    nextBtn.disabled = true;
    prevBtn.disabled = i === 0;
    if (i === lesson.slides.length - 1) nextBtn.textContent = 'Finish lesson';
    else nextBtn.textContent = 'Next →';
    const slide = lesson.slides[i];
    renderSlide(slide, host, ctx);
    // Type-along slides drive their own per-line reminders via the typing
    // engine's onLineStart callback. For other slide types, stage the
    // slide-level concepts now (or clear if none).
    if (slide.type !== 'type-along') {
      reminders.showFor(slide.concepts || []);
    } else {
      // Engine will fire onLineStart(0) immediately and call showFor for
      // line 0's concepts — but if the slide is missing lineConcepts entirely,
      // we still want to clear stale cards from a prior slide.
      reminders.showFor([]);
    }

    // Dev mode: skip the completion gate so any slide can be advanced past.
    if (devMode.isOn()) nextBtn.disabled = false;

    progress.currentLesson = lessonId;
    progress.currentSlide = i;
    saveProgress(progress).catch(console.error);
  }

  nextBtn.onclick = async () => {
    if (idx < lesson.slides.length - 1) {
      show(idx + 1);
    } else {
      // finish lesson
      progress.stats.totalTimeSeconds += Math.round((Date.now() - sessionStart) / 1000);
      if (!progress.lessonsCompleted.includes(lessonId)) {
        progress.lessonsCompleted.push(lessonId);
      }
      // advance to next lesson if available
      const i = lessons.findIndex(l => l.id === lessonId);
      const next = lessons[i + 1];
      if (next) {
        progress.currentLesson = next.id;
        progress.currentSlide = 0;
      }
      await saveProgress(progress);
      location.href = '/';
    }
  };
  prevBtn.onclick = () => { if (idx > 0) show(idx - 1); };

  show(idx);

  // bank session time on visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      progress.stats.totalTimeSeconds += Math.round((Date.now() - sessionStart) / 1000);
      saveProgress(progress);
    }
  });
}

function formatTime(s) {
  if (!s) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ---- Dev mode toggle: skips completion gate so any slide can be advanced
// past, for testing/debugging. State lives in localStorage only — never
// touches progress.json or git.
function setupDevMode() {
  const STORAGE_KEY = 'apex-trainer:devMode';
  const btn = document.getElementById('dev-toggle');
  const nextBtn = document.getElementById('next-btn');
  let on = localStorage.getItem(STORAGE_KEY) === 'true';
  function render() {
    if (!btn) return;
    btn.textContent = on ? 'DEV ✓' : 'Dev mode';
    btn.classList.toggle('dev-active', on);
    if (on && nextBtn) nextBtn.disabled = false;
  }
  if (btn) {
    btn.onclick = () => {
      on = !on;
      localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false');
      render();
    };
  }
  render();
  return { isOn: () => on };
}

// ---- Concept reminders: floating sticky-note cards bottom-right ----
class ConceptReminders {
  constructor(opts) {
    this.opts = opts;
    this.stack = document.getElementById('concept-stack');
    if (!this.stack) {
      this.stack = document.createElement('div');
      this.stack.id = 'concept-stack';
      this.stack.className = 'concept-stack';
      document.body.appendChild(this.stack);
    }
    this.activeCards = new Map(); // id -> element
  }

  showFor(conceptIds) {
    // Drop cards that are no longer relevant for this slide
    for (const [id, el] of this.activeCards.entries()) {
      if (!conceptIds.includes(id)) this.dismiss(id);
    }
    // Add cards for new concepts
    for (const id of conceptIds) {
      if (this.activeCards.has(id)) continue;
      const c = this.opts.concepts[id];
      if (!c) continue;
      // Don't show a reminder while the user is in the lesson where the
      // concept was first introduced — they're learning it for the first time.
      if (c.introducedIn === this.opts.currentLessonId) continue;
      if (this.opts.isPermanentlyMuted(id)) continue;
      if (this.opts.isSessionMuted(id)) continue;
      this.spawn(id, c);
    }
  }

  spawn(id, c) {
    const el = document.createElement('div');
    el.className = 'concept-card';
    el.innerHTML = `
      <div class="concept-head">💡 Reminder · from ${c.introducedIn || 'earlier'}</div>
      <div class="concept-title">${escapeHtml(c.title)}</div>
      <div class="concept-text">${escapeHtml(c.reminder)}</div>
      <div class="concept-actions">
        <button class="know-btn" data-action="know">I know this</button>
        <button data-action="hide">Hide for now</button>
      </div>
    `;
    el.querySelector('[data-action="know"]').onclick = () => {
      this.opts.onMutePermanent(id);
      this.dismiss(id);
    };
    el.querySelector('[data-action="hide"]').onclick = () => {
      this.opts.onMuteSession(id);
      this.dismiss(id);
    };
    this.stack.appendChild(el);
    this.activeCards.set(id, el);
  }

  dismiss(id) {
    const el = this.activeCards.get(id);
    if (!el) return;
    el.classList.add('fading');
    this.activeCards.delete(id);
    setTimeout(() => el.remove(), 220);
  }
}

function setupRemindersUI(progress, concepts) {
  const link = document.getElementById('manage-reminders');
  if (!link) return;
  const updateLabel = () => {
    const n = (progress.mutedConcepts || []).length;
    link.textContent = n ? `Reminders muted (${n})` : 'Manage reminders';
  };
  updateLabel();
  link.onclick = () => openRemindersModal(progress, concepts, updateLabel);
}

function openRemindersModal(progress, concepts, onChange) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  const muted = progress.mutedConcepts || [];
  const items = muted.length
    ? muted.map(id => {
        const c = concepts[id] || { title: id, reminder: '' };
        return `
          <div class="muted-item" data-id="${escapeHtml(id)}">
            <div>
              <div class="muted-name">${escapeHtml(c.title)}</div>
              <div class="muted-desc">${escapeHtml(c.reminder)}</div>
            </div>
            <button class="btn unmute-btn">Unmute</button>
          </div>`;
      }).join('')
    : '<div class="muted-empty">You haven\'t muted any concept reminders yet.</div>';
  modal.innerHTML = `
    <h2>Concept reminders</h2>
    <div class="modal-sub">Reminders you've marked as known. Unmute any to start seeing them again on relevant slides.</div>
    <div class="muted-list">${items}</div>
    <div class="modal-footer"><button class="btn btn-primary close-btn">Done</button></div>
  `;
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  modal.querySelectorAll('.unmute-btn').forEach(btn => {
    btn.onclick = (e) => {
      const id = e.target.closest('.muted-item').dataset.id;
      progress.mutedConcepts = (progress.mutedConcepts || []).filter(x => x !== id);
      saveProgress(progress);
      e.target.closest('.muted-item').remove();
      onChange();
      if (!progress.mutedConcepts.length) {
        modal.querySelector('.muted-list').innerHTML = '<div class="muted-empty">You haven\'t muted any concept reminders yet.</div>';
      }
    };
  });
  modal.querySelector('.close-btn').onclick = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ---- Sync error modal: surface what actually broke when Sync fails so the
// user can either fix it themselves or paste the details to whoever is helping.
function showSyncErrorModal(result) {
  const failedStep = result.failedStep || '(unknown step)';
  const stderr = (result.stderr || '').trim();
  const stdout = (result.stdout || '').trim();
  const error = (result.error || '').trim();

  const detailsBlob = [
    'Failed step: ' + failedStep,
    '',
    'Error: ' + error,
    '',
    'Stderr:',
    stderr || '(empty)',
    '',
    'Stdout:',
    stdout || '(empty)'
  ].join('\n');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <h2>Sync to GitHub failed</h2>
    <div class="modal-sub">Your progress is still saved on this machine - only the upload to GitHub failed. Below is the exact error from Git so you can see what went wrong.</div>
    <div class="muted-list" style="max-height: 300px; overflow: auto; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; white-space: pre-wrap; padding: 12px;">${escapeHtml(detailsBlob)}</div>
    <div class="modal-footer" style="display: flex; gap: 8px; justify-content: flex-end;">
      <button class="btn copy-btn">Copy details</button>
      <button class="btn btn-primary close-btn">Close</button>
    </div>
  `;
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  modal.querySelector('.copy-btn').onclick = async (e) => {
    try {
      await navigator.clipboard.writeText(detailsBlob);
      e.target.textContent = 'Copied ✓';
      setTimeout(() => { e.target.textContent = 'Copy details'; }, 1500);
    } catch {
      e.target.textContent = 'Copy failed';
    }
  };
  modal.querySelector('.close-btn').onclick = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
}

// ---- User picker (first-run / switch-user screen) ----
async function renderUserPicker() {
  document.getElementById('user-picker-main').hidden = false;
  document.getElementById('dashboard-main').hidden = true;
  document.getElementById('topbar-user-actions').hidden = true;

  const users = await listUsers();
  const cards = document.getElementById('user-cards');
  cards.innerHTML = '';
  if (users.length === 0) {
    cards.innerHTML = '<div class="user-cards-empty">No one has joined yet — be the first.</div>';
  } else {
    for (const id of users) {
      const card = document.createElement('button');
      card.className = 'user-card';
      card.type = 'button';
      card.textContent = id;
      card.onclick = () => {
        setCurrentUserId(id);
        location.reload();
      };
      cards.appendChild(card);
    }
  }

  const input = document.getElementById('new-user-name');
  const errEl = document.getElementById('user-add-error');
  document.getElementById('add-user-btn').onclick = async () => {
    const name = input.value.trim();
    errEl.textContent = '';
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name)) {
      errEl.textContent = 'Use 1–40 letters, digits, underscores, or hyphens.';
      return;
    }
    const result = await createUser(name);
    if (!result.ok) {
      errEl.textContent = result.error || 'Could not create user.';
      return;
    }
    setCurrentUserId(result.user);
    location.reload();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('add-user-btn').click();
  });
}
