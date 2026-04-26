export async function loadProgress() {
  const res = await fetch('/api/progress');
  return res.json();
}

export async function saveProgress(progress) {
  const res = await fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress)
  });
  return res.json();
}

export async function syncToGitHub(message) {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  return res.json();
}

export async function loadLessonsIndex() {
  const res = await fetch('/api/lessons');
  return res.json();
}

export async function loadLesson(file) {
  const res = await fetch(`/content/lessons/${file}`);
  return res.json();
}
