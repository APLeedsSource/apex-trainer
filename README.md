# Apex Trainer

A type-to-learn game for Apex and coding fundamentals.

## What it is

An interactive local app that teaches Apex (and general coding concepts) by having you TYPE known patterns instead of memorizing them. Code is displayed in light grey; you type each character; correct keystrokes turn solid; wrong ones flash red. After each line completes, an explanation reveals on the right.

Covers core Apex concepts (data types, collections, classes, loops, methods, properties, SOQL, DML, triggers, OOP, async) plus real-world topics (governor limits, APIs, caching) and a capstone Salesforce consulting project.

## Install (any Mac)

```bash
git clone https://github.com/APLeedsSource/apex-trainer.git
cd apex-trainer
npm install
npm start
```

Then open http://localhost:3000.

Requires Node.js (tested on v22). Install via [nvm](https://github.com/nvm-sh/nvm) if needed.

## How progress saves

- Your save state lives in `progress.json` at the repo root, committed to git.
- Click **Sync to GitHub** in the UI to commit and push it.
- On your other Mac: `git pull` before running, and the game resumes where you left off.

## Project structure

```
apex-trainer/
├── server.js                 # Express server — serves the UI, reads/writes progress.json
├── public/
│   ├── index.html            # dashboard
│   ├── lesson.html           # slide player
│   ├── css/styles.css
│   └── js/
│       ├── app.js
│       ├── typing-engine.js  # the ghost-text mechanic
│       ├── slides.js         # renderers for each slide type
│       └── progress-client.js
├── content/
│   └── lessons/              # one JSON file per lesson
└── progress.json             # your save file
```

## Adding lessons

Drop a new JSON file into `content/lessons/`. The dashboard discovers them automatically (alphabetical by filename, hence the `00-`, `01-`, `02-` prefix). Each lesson is a sequence of slides. Slide types: `concept`, `type-along`, `recall`, `quiz`. See `00-foundations.json` for examples.

## Status

Phase 1 (walking skeleton) — Lesson 0: Foundations. More lessons coming as content is authored.
