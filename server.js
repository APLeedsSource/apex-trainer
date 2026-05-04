const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/content', express.static(path.join(ROOT, 'content')));

const DEFAULT_PROGRESS = {
  userName: '',
  currentLesson: '00-foundations',
  currentSlide: 0,
  lessonsCompleted: [],
  stats: { totalKeystrokes: 0, totalTimeSeconds: 0, exercisesCompleted: 0 },
  exerciseHistory: [],
  weakConcepts: [],
  mutedConcepts: [],
  lastSavedAt: null
};

// userId must be a safe slug — letters, digits, underscore, hyphen only.
// This is the only thing protecting us from path traversal in filenames.
function isValidUserId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(id);
}

function progressPath(userId) {
  return path.join(ROOT, `progress-${userId}.json`);
}

function listUserIds() {
  return fs.readdirSync(ROOT)
    .filter(f => /^progress-[a-zA-Z0-9_-]+\.json$/.test(f))
    .map(f => f.replace(/^progress-/, '').replace(/\.json$/, ''))
    .sort();
}

function readProgress(userId) {
  const p = progressPath(userId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeProgress(userId, data) {
  fs.writeFileSync(progressPath(userId), JSON.stringify(data, null, 2));
}

// ---- Users ----
app.get('/api/users', (req, res) => {
  res.json(listUserIds());
});

app.post('/api/users', (req, res) => {
  const name = (req.body && req.body.name || '').trim();
  if (!isValidUserId(name)) {
    return res.status(400).json({ ok: false, error: 'Name must be 1-40 chars, letters/digits/underscore/hyphen only.' });
  }
  if (fs.existsSync(progressPath(name))) {
    return res.status(409).json({ ok: false, error: 'A user with that name already exists.' });
  }
  const fresh = { ...DEFAULT_PROGRESS, userName: name, lastSavedAt: new Date().toISOString() };
  writeProgress(name, fresh);
  res.json({ ok: true, user: name });
});

// ---- Progress (user-scoped) ----
app.get('/api/progress', (req, res) => {
  const userId = req.query.user;
  if (!isValidUserId(userId)) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid ?user=' });
  }
  const data = readProgress(userId);
  if (!data) {
    return res.status(404).json({ ok: false, error: `No progress for user ${userId}` });
  }
  res.json(data);
});

app.post('/api/progress', (req, res) => {
  const userId = req.query.user;
  if (!isValidUserId(userId)) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid ?user=' });
  }
  const incoming = req.body || {};
  incoming.lastSavedAt = new Date().toISOString();
  // Always pin userName to the URL-scoped userId so a stale client can't
  // overwrite under a different name.
  incoming.userName = userId;
  writeProgress(userId, incoming);
  res.json({ ok: true });
});

// ---- Lessons ----
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

// ---- Sync (user-scoped) ----
// Pulls (rebase) before pushing so multiple collaborators editing different
// progress-*.json files don't reject each other's pushes. Each user's commit
// only stages their own file, so cross-user conflicts are avoided.
app.post('/api/sync', (req, res) => {
  const userId = req.query.user;
  if (!isValidUserId(userId)) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid ?user=' });
  }
  const file = `progress-${userId}.json`;
  const msg = (req.body && req.body.message) || `progress: ${userId} update`;
  const steps = [
    ['git', ['add', file]],
    ['git', ['commit', '-m', msg]],
    ['git', ['pull', '--rebase']],
    ['git', ['push']]
  ];
  const output = [];
  function runNext(i) {
    if (i >= steps.length) return res.json({ ok: true, output });
    const [cmd, args] = steps[i];
    execFile(cmd, args, { cwd: ROOT }, (err, stdout, stderr) => {
      output.push({ step: args.join(' '), stdout, stderr, code: err ? err.code : 0 });
      // git commit returns non-zero if nothing to commit; treat as soft success.
      if (err && args[0] === 'commit' && /nothing to commit/i.test(stdout + stderr)) {
        return runNext(i + 1);
      }
      if (err) {
        // Log the failure to the server console so the user (or whoever's
        // helping them) can see exactly what broke without opening DevTools.
        console.error('---');
        console.error('[SYNC FAILED] user=' + userId);
        console.error('[SYNC FAILED] step: ' + ['git'].concat(args).join(' '));
        console.error('[SYNC FAILED] stderr: ' + (stderr || '(empty)').trim());
        console.error('[SYNC FAILED] stdout: ' + (stdout || '(empty)').trim());
        console.error('[SYNC FAILED] error: ' + String(err).trim());
        console.error('---');
        return res.status(500).json({
          ok: false,
          failedStep: ['git'].concat(args).join(' '),
          stderr: (stderr || '').trim(),
          stdout: (stdout || '').trim(),
          error: String(err),
          output
        });
      }
      runNext(i + 1);
    });
  }
  runNext(0);
});

app.listen(PORT, () => {
  console.log(`apex-trainer running at http://localhost:${PORT}`);
});
