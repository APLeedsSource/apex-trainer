const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PROGRESS_FILE = path.join(ROOT, 'progress.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/content', express.static(path.join(ROOT, 'content')));

const DEFAULT_PROGRESS = {
  userName: 'Arthur',
  currentLesson: '00-foundations',
  currentSlide: 0,
  lessonsCompleted: [],
  stats: { totalKeystrokes: 0, totalTimeSeconds: 0, exercisesCompleted: 0 },
  exerciseHistory: [],
  weakConcepts: [],
  lastSavedAt: null
};

function readProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return DEFAULT_PROGRESS;
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch (e) {
    return DEFAULT_PROGRESS;
  }
}

function writeProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/progress', (req, res) => {
  res.json(readProgress());
});

app.post('/api/progress', (req, res) => {
  const incoming = req.body || {};
  incoming.lastSavedAt = new Date().toISOString();
  writeProgress(incoming);
  res.json({ ok: true });
});

app.get('/api/lessons', (req, res) => {
  const dir = path.join(ROOT, 'content', 'lessons');
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const lessons = files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { id: data.id, title: data.title, slideCount: (data.slides || []).length, file: f };
  });
  res.json(lessons);
});

app.post('/api/sync', (req, res) => {
  const msg = (req.body && req.body.message) || 'progress: update';
  const steps = [
    ['git', ['add', 'progress.json']],
    ['git', ['commit', '-m', msg]],
    ['git', ['push']]
  ];
  const output = [];
  function runNext(i) {
    if (i >= steps.length) return res.json({ ok: true, output });
    const [cmd, args] = steps[i];
    execFile(cmd, args, { cwd: ROOT }, (err, stdout, stderr) => {
      output.push({ step: args.join(' '), stdout, stderr, code: err ? err.code : 0 });
      // git commit returns non-zero if nothing to commit; treat as soft success and continue.
      if (err && args[0] === 'commit' && /nothing to commit/i.test(stdout + stderr)) {
        return runNext(i + 1);
      }
      if (err) {
        return res.status(500).json({ ok: false, output, error: String(err) });
      }
      runNext(i + 1);
    });
  }
  runNext(0);
});

app.listen(PORT, () => {
  console.log(`apex-trainer running at http://localhost:${PORT}`);
});
