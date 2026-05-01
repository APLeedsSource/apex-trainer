// All progress endpoints are user-scoped. The current userId lives in
// localStorage under 'apex-trainer:userId' and is set by app.js after the
// user picks their name. Helpers here read it on demand.

const USER_KEY = 'apex-trainer:userId';

export function getCurrentUserId() {
  return localStorage.getItem(USER_KEY) || '';
}

export function setCurrentUserId(id) {
  if (id) localStorage.setItem(USER_KEY, id);
  else localStorage.removeItem(USER_KEY);
}

function userQS() {
  const id = getCurrentUserId();
  return id ? `?user=${encodeURIComponent(id)}` : '';
}

export async function listUsers() {
  const res = await fetch('/api/users');
  return res.json();
}

export async function createUser(name) {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return res.json();
}

export async function loadProgress() {
  const res = await fetch(`/api/progress${userQS()}`);
  if (!res.ok) throw new Error(`loadProgress failed: ${res.status}`);
  return res.json();
}

export async function saveProgress(progress) {
  const res = await fetch(`/api/progress${userQS()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress)
  });
  return res.json();
}

export async function syncToGitHub(message) {
  const res = await fetch(`/api/sync${userQS()}`, {
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

export async function loadConcepts() {
  const res = await fetch('/content/concepts.json');
  if (!res.ok) return {};
  return res.json();
}
