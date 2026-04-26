import { TypingEngine } from './typing-engine.js';

export function renderSlide(slide, container, ctx) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = `slide slide-${slide.type}`;
  container.appendChild(wrap);

  switch (slide.type) {
    case 'concept': return renderConcept(slide, wrap, ctx);
    case 'type-along': return renderTypeAlong(slide, wrap, ctx);
    case 'recall': return renderRecall(slide, wrap, ctx);
    case 'quiz': return renderQuiz(slide, wrap, ctx);
    default:
      wrap.textContent = `Unknown slide type: ${slide.type}`;
      ctx.enableNext();
  }
}

function renderConcept(slide, wrap, ctx) {
  const h = document.createElement('h2');
  h.textContent = slide.title || 'Concept';
  wrap.appendChild(h);
  const body = document.createElement('div');
  body.className = 'concept-body';
  // body is an array of strings or plain string
  const paragraphs = Array.isArray(slide.body) ? slide.body : [slide.body];
  for (const p of paragraphs) {
    const para = document.createElement('p');
    para.innerHTML = highlightVocab(p, slide.vocabulary || []);
    body.appendChild(para);
  }
  wrap.appendChild(body);

  if (slide.vocabulary && slide.vocabulary.length) {
    const tipDiv = document.createElement('div');
    tipDiv.className = 'tip';
    tipDiv.textContent = 'Tip: hover the highlighted terms for a quick definition.';
    wrap.appendChild(tipDiv);
  }
  ctx.enableNext();
}

function highlightVocab(text, vocab) {
  if (!vocab || !vocab.length) return escapeHtml(text);
  // Single-pass tokenizer. Iterating replacements over an already-escaped
  // string would re-match injected HTML attributes (e.g. "class" inside
  // class="vocab"), corrupting the markup. Walk the original text once,
  // escaping the in-between segments and emitting raw spans for matches.
  const map = new Map();
  for (const term of vocab) {
    const t = (typeof term === 'string') ? { word: term, def: '' } : term;
    map.set(t.word.toLowerCase(), t);
  }
  const sorted = [...map.values()].sort((a, b) => b.word.length - a.word.length);
  const pattern = new RegExp(`\\b(${sorted.map(t => escapeRegex(t.word)).join('|')})\\b`, 'gi');
  let out = '';
  let lastIndex = 0;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    out += escapeHtml(text.slice(lastIndex, m.index));
    const matched = m[1];
    const t = map.get(matched.toLowerCase());
    out += `<span class="vocab" title="${escapeAttr((t && t.def) || matched)}">${escapeHtml(matched)}</span>`;
    lastIndex = m.index + matched.length;
  }
  out += escapeHtml(text.slice(lastIndex));
  return out;
}

function renderTypeAlong(slide, wrap, ctx) {
  const h = document.createElement('h2');
  h.textContent = slide.title || 'Type along';
  wrap.appendChild(h);

  if (slide.intro) {
    const p = document.createElement('p');
    p.className = 'intro';
    p.textContent = slide.intro;
    wrap.appendChild(p);
  }

  const split = document.createElement('div');
  split.className = 'split';
  wrap.appendChild(split);

  // LEFT column: line-by-line explanations (the lesson content — the primary
  // surface). Cream/parchment styled so it visually leads the eye.
  const explainCol = document.createElement('div');
  explainCol.className = 'explain-col';
  explainCol.innerHTML = '<h3>Line-by-line</h3>';
  split.appendChild(explainCol);

  const explanations = slide.lineExplanations || [];
  const explainItems = explanations.map((text, i) => {
    const item = document.createElement('div');
    item.className = 'explain-item locked';
    item.innerHTML = `<div class="line-num">Line ${i + 1}</div><div class="line-text">${escapeHtml(text)}</div>`;
    explainCol.appendChild(item);
    return item;
  });

  // RIGHT column: the practice surface (code editor).
  const editorWrap = document.createElement('div');
  editorWrap.className = 'editor-wrap';
  split.appendChild(editorWrap);

  const meta = document.createElement('div');
  meta.className = 'editor-meta';
  meta.innerHTML = '<span class="hint">Click the code area, then start typing. Tab skips indentation. Backspace deletes.</span><span class="stats" id="ta-stats"></span>';
  editorWrap.appendChild(meta);

  const editor = document.createElement('div');
  editor.className = 'editor';
  editorWrap.appendChild(editor);

  const code = slide.code;
  const stats = wrap.querySelector('#ta-stats');

  const engine = new TypingEngine(editor, code, {
    onProgress: (frac) => {
      stats.textContent = `${Math.round(frac * 100)}%`;
    },
    onLineComplete: (lineIndex) => {
      if (explainItems[lineIndex]) {
        explainItems[lineIndex].classList.remove('locked');
        explainItems[lineIndex].classList.add('revealed');
        explainItems[lineIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    },
    onComplete: (result) => {
      stats.textContent = `Done · ${result.wpm} wpm · ${result.accuracy}% accuracy`;
      ctx.recordExercise(slide, result);
      ctx.enableNext();
    }
  });

  // focus the editor automatically
  setTimeout(() => editor.focus(), 100);
}

function renderRecall(slide, wrap, ctx) {
  const h = document.createElement('h2');
  h.textContent = 'Recall card';
  wrap.appendChild(h);

  const card = document.createElement('div');
  card.className = 'recall-card';
  const front = document.createElement('div');
  front.className = 'recall-front';
  front.textContent = slide.front;
  const back = document.createElement('div');
  back.className = 'recall-back hidden';
  back.innerHTML = `<strong>Answer:</strong> ${escapeHtml(slide.back)}`;
  if (slide.detail) {
    const d = document.createElement('div');
    d.className = 'recall-detail';
    d.textContent = slide.detail;
    back.appendChild(d);
  }
  card.appendChild(front);
  card.appendChild(back);
  wrap.appendChild(card);

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Reveal';
  btn.onclick = () => {
    back.classList.remove('hidden');
    btn.disabled = true;
    ctx.enableNext();
  };
  wrap.appendChild(btn);
}

function renderQuiz(slide, wrap, ctx) {
  const h = document.createElement('h2');
  h.textContent = slide.question;
  wrap.appendChild(h);

  const list = document.createElement('div');
  list.className = 'quiz-options';
  wrap.appendChild(list);

  let answered = false;
  slide.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-opt';
    btn.textContent = opt;
    btn.onclick = () => {
      if (answered) return;
      answered = true;
      const correct = i === slide.correct;
      btn.classList.add(correct ? 'correct' : 'wrong');
      if (!correct) {
        list.children[slide.correct].classList.add('correct');
      }
      const fb = document.createElement('div');
      fb.className = 'quiz-feedback';
      fb.textContent = correct
        ? (slide.explanation || 'Correct!')
        : (slide.explanation || `Not quite. The right answer is "${slide.options[slide.correct]}".`);
      wrap.appendChild(fb);
      ctx.enableNext();
    };
    list.appendChild(btn);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
