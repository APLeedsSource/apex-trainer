// Ghost-text typing engine.
// Render code with each char as a <span class="ghost">; user types, correct
// chars become .typed; wrong keystrokes flash .err and block until corrected.
// Emits onLineComplete(lineIndex) and onComplete({wpm, accuracy, seconds}).

export class TypingEngine {
  constructor(container, code, opts = {}) {
    this.container = container;
    this.code = code;
    this.opts = { autoSkipIndent: true, ...opts };
    this.cursor = 0;
    this.startTime = null;
    this.keystrokes = 0;
    this.errors = 0;
    this.lineEndIndices = [];
    this.lastLineCompleted = -1;
    this.activeLine = -1;
    this.onLineComplete = opts.onLineComplete || (() => {});
    this.onLineStart = opts.onLineStart || (() => {});
    this.onComplete = opts.onComplete || (() => {});
    this.onProgress = opts.onProgress || (() => {});
    this.render();
    this.bindKeys();
    this.maybeAutoSkip();
    this.updateActiveLine();
  }

  updateActiveLine() {
    if (this.cursor >= this.spans.length) return;
    const newLine = parseInt(this.spans[this.cursor].dataset.line, 10);
    if (newLine !== this.activeLine) {
      this.activeLine = newLine;
      this.onLineStart(newLine);
    }
  }

  render() {
    this.container.innerHTML = '';
    this.container.classList.add('typing-area');
    this.container.tabIndex = 0;
    const pre = document.createElement('pre');
    pre.className = 'typing-pre';
    this.spans = [];
    let line = 0;
    for (let i = 0; i < this.code.length; i++) {
      const ch = this.code[i];
      const span = document.createElement('span');
      span.className = 'ghost';
      span.textContent = ch === '\n' ? '↵\n' : ch; // visible newline glyph
      span.dataset.char = ch;
      span.dataset.index = i;
      span.dataset.line = line;
      pre.appendChild(span);
      this.spans.push(span);
      if (ch === '\n') {
        this.lineEndIndices.push(i);
        line++;
      }
    }
    if (this.lineEndIndices[this.lineEndIndices.length - 1] !== this.code.length - 1) {
      this.lineEndIndices.push(this.code.length - 1);
    }
    this.container.appendChild(pre);
    this.cursorEl = document.createElement('span');
    this.cursorEl.className = 'cursor';
    this.placeCursor();
    this.container.focus();
  }

  placeCursor() {
    if (this.cursor >= this.spans.length) return;
    const target = this.spans[this.cursor];
    target.classList.add('current');
    this.spans.forEach((s, idx) => {
      if (idx !== this.cursor) s.classList.remove('current');
    });
  }

  maybeAutoSkip() {
    if (!this.opts.autoSkipIndent) return;
    while (
      this.cursor < this.code.length &&
      this.isAtLineStart(this.cursor) &&
      (this.code[this.cursor] === ' ' || this.code[this.cursor] === '\t')
    ) {
      this.spans[this.cursor].classList.remove('ghost');
      this.spans[this.cursor].classList.add('typed', 'auto');
      this.cursor++;
    }
    this.placeCursor();
  }

  isAtLineStart(i) {
    return i === 0 || this.code[i - 1] === '\n';
  }

  bindKeys() {
    this.handler = (e) => {
      if (this.cursor >= this.code.length) return;
      // Ignore modifier-only keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const expected = this.code[this.cursor];

      if (e.key === 'Backspace') {
        e.preventDefault();
        if (this.cursor > 0) {
          this.cursor--;
          while (this.cursor > 0 && this.spans[this.cursor].classList.contains('auto')) {
            this.cursor--;
          }
          const s = this.spans[this.cursor];
          s.classList.remove('typed', 'err');
          s.classList.add('ghost');
          this.placeCursor();
        }
        return;
      }

      if (e.key === 'Enter') {
        if (expected === '\n') {
          e.preventDefault();
          this.acceptChar();
          return;
        }
        e.preventDefault();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        // accept any whitespace via Tab as a "skip indent" helper
        while (this.cursor < this.code.length && (this.code[this.cursor] === ' ' || this.code[this.cursor] === '\t')) {
          this.acceptChar();
        }
        return;
      }

      if (e.key.length !== 1) return; // ignore arrow keys, function keys, etc.

      e.preventDefault();
      if (e.key === expected) {
        this.acceptChar();
      } else {
        this.rejectChar();
      }
    };
    this.container.addEventListener('keydown', this.handler);
    this.container.addEventListener('click', () => this.container.focus());
  }

  acceptChar() {
    if (this.startTime === null) this.startTime = Date.now();
    this.keystrokes++;
    const s = this.spans[this.cursor];
    s.classList.remove('ghost', 'err', 'current');
    s.classList.add('typed');
    const wasNewline = this.code[this.cursor] === '\n';
    const lineOfThis = parseInt(s.dataset.line, 10);
    this.cursor++;
    if (wasNewline && lineOfThis > this.lastLineCompleted) {
      this.lastLineCompleted = lineOfThis;
      this.onLineComplete(lineOfThis);
    }
    this.maybeAutoSkip();
    this.updateActiveLine();
    this.placeCursor();
    this.onProgress(this.cursor / this.code.length);
    if (this.cursor >= this.code.length) {
      // finalize last line if it wasn't terminated by \n
      const totalLines = this.lineEndIndices.length;
      const finalLine = totalLines - 1;
      if (finalLine > this.lastLineCompleted) {
        this.lastLineCompleted = finalLine;
        this.onLineComplete(finalLine);
      }
      this.finish();
    }
  }

  rejectChar() {
    this.errors++;
    const s = this.spans[this.cursor];
    s.classList.add('err');
    setTimeout(() => s.classList.remove('err'), 200);
  }

  finish() {
    const seconds = (Date.now() - (this.startTime || Date.now())) / 1000;
    const minutes = Math.max(seconds / 60, 1 / 60);
    const words = this.code.length / 5;
    const wpm = Math.round(words / minutes);
    const accuracy = Math.round(
      ((this.keystrokes - this.errors) / Math.max(this.keystrokes, 1)) * 100
    );
    this.onComplete({ wpm, accuracy, seconds: Math.round(seconds) });
  }

  destroy() {
    if (this.handler) this.container.removeEventListener('keydown', this.handler);
  }
}
