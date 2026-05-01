# Apex Trainer

A type-to-learn game for Apex and coding fundamentals.

## What it is

An interactive local app that teaches Apex (and general coding concepts) by having you TYPE known patterns instead of memorizing them. Code is displayed in light grey; you type each character; correct keystrokes turn solid; wrong ones flash red. After each line completes, an explanation reveals on the right.

Covers core Apex concepts (data types, collections, classes, loops, methods, properties, SOQL, DML, triggers, OOP, async) plus real-world topics (governor limits, APIs, caching) and a capstone Salesforce consulting project.

## Prerequisites

- **Git** (for cloning and the Sync feature). Configure your identity once: `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`.
- **Node.js** (>= 18 recommended). Install via [nvm](https://github.com/nvm-sh/nvm) if needed.
- **Collaborator access** to the trainer's GitHub repo (so the Sync button can push your progress). The repo owner adds you under Settings → Collaborators.

## Install

```bash
git clone https://github.com/APLeedsSource/apex-trainer.git
cd apex-trainer
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## First run

The app opens to a **Pick your name** screen.

- If you've used the trainer before on any device, your name appears as a clickable card. Click it to load your progress.
- If this is your first time, type your name into the **Add me** field (letters, digits, underscores, hyphens — up to 40 characters) and click **+ Add me**. A fresh `progress-{yourname}.json` file is created.

Once you pick a user, the app remembers your choice in your browser (`localStorage`). Subsequent visits skip the picker. To switch users, click **Switch user** in the header.

## Saving and syncing your progress

- Progress is saved to disk automatically every time you advance a slide. It lives in `progress-{yourname}.json` at the repo root.
- To sync your progress so other devices can pick it up — or so it doesn't get lost if your machine dies — click **Sync to GitHub** on the dashboard. That commits your progress file and pushes it to the shared repo.
- Each user only ever modifies their own file, so you won't conflict with anyone else's work.

## Continuing on another device

1. On the second device: `git clone https://github.com/APLeedsSource/apex-trainer.git` (or `git pull` if you already have it).
2. `npm install && npm start`.
3. The picker shows your name. Click it. Your progress is right where you left off.

If you've been using the app on the second device too without syncing, run `git pull` before `npm start` to fetch the latest version of your progress file.

## Troubleshooting Sync

If the Sync button reports an error:

1. Open a terminal in the repo and run `git pull --rebase`. This pulls down anything new from the remote (your other device, lesson updates, etc.) and replays your local changes on top.
2. Resolve any conflicts (rare — only happens if you somehow made conflicting edits to the same progress file from two devices simultaneously). Save, then `git rebase --continue`.
3. Click Sync again.

## How progress is structured

Each user's `progress-{name}.json` tracks:
- Current lesson and slide
- List of completed lessons
- Stats (keystrokes, exercises, time spent)
- Recent exercise history (WPM, accuracy, etc.)
- Concept reminders the user has muted

Lesson content lives in `content/lessons/` (one JSON file per lesson) and is shared across all users.

## Project structure

```
apex-trainer/
├── server.js                 # Express server — user-scoped /api/progress, /api/sync, /api/users
├── public/
│   ├── index.html            # dashboard + user picker
│   ├── lesson.html           # slide player
│   ├── css/styles.css
│   └── js/
│       ├── app.js
│       ├── typing-engine.js  # the ghost-text mechanic
│       ├── slides.js         # renderers for each slide type
│       └── progress-client.js
├── content/
│   ├── lessons/              # one JSON file per lesson
│   └── concepts.json         # concept registry for reminder cards
└── progress-{name}.json      # one file per registered user (committed to git)
```

## Adding a lesson

Drop a new JSON file into `content/lessons/`. The dashboard discovers them automatically (alphabetical by filename, hence the `00-`, `01-`, `02-` prefix). Each lesson is a sequence of slides. Slide types: `concept`, `type-along`, `recall`, `quiz`. See `00-foundations.json` for examples.

## Notes on the auth model

The "pick your name" screen is intentionally trivial — no passwords, no sessions. Anyone with repo access can pretend to be anyone else. This is fine for a small trusted group, but don't use this trainer to store anything sensitive.
