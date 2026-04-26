import { renderSlide } from './slides.js';
import { loadProgress, saveProgress, syncToGitHub, loadLessonsIndex, loadLesson } from './progress-client.js';

// ---- Dashboard ----
export async function initDashboard() {
  const progress = await loadProgress();
  const lessons = await loadLessonsIndex();

  document.getElementById('user-greeting').textContent = `Hi ${progress.userName || 'Arthur'} —`;
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
      if (!result.ok) console.error(result);
    } catch (e) {
      btn.textContent = 'Sync failed';
      console.error(e);
    }
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Sync to GitHub'; }, 2500);
  };
}

// ---- Lesson player ----
export async function initLesson() {
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
    renderSlide(lesson.slides[i], host, ctx);

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
