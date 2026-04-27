#!/usr/bin/env python3
"""
Slim a WebVTT Zoom transcript into a readable narrative markdown file.

- Strips cue numbers and timestamps
- Folds consecutive utterances from the same speaker into paragraphs
- Drops trivial fillers (Okay., Yes., Right., Uh-huh., etc.)
- Removes 'uh', 'um', and similar verbal stutters mid-sentence
- Keeps all speakers (Ari + students), since student questions often prompt clarifying explanations

Also writes a TOPIC_HINTS.md alongside each slim file: keyword-frequency
based guess for which trainer lessons each transcript informs.

Usage:
    python3 scripts/slim-transcript.py transcripts/raw/*.vtt
"""
import re
import sys
from pathlib import Path
from collections import Counter

CUE_NUM_RE = re.compile(r'^\d+$')
TS_RE = re.compile(r'^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$')
SPEAKER_RE = re.compile(r'^([^:]+?):\s*(.*)$')

# Trivial utterances to drop entirely if they're a complete cue body
TRIVIAL = {
    'okay.', 'okay', 'yes.', 'yes', 'yeah.', 'yeah', 'right.', 'right',
    'uh-huh.', 'uh-huh', 'mhm.', 'mhm', 'mm-hm.', 'mm-hmm.',
    'so…', 'so...', 'so.', 'so', "alright.", 'alright',
    'ta-da! alright!', 'and… here we go.', 'and... here we go.',
    'ok.', 'ok',
}

# Mid-sentence stutters / fillers — replaced with empty string then collapsed
FILLERS = [
    re.compile(r'\b(uh|um|err|hmm)\b[,.\s]*', re.IGNORECASE),
    re.compile(r'\byou know\b[,.\s]*', re.IGNORECASE),
    re.compile(r'\bkind of\b', re.IGNORECASE),
    re.compile(r'\bsort of\b', re.IGNORECASE),
    re.compile(r'\b(I mean|like)\b,', re.IGNORECASE),
]

# Topic keyword buckets → trainer lesson ids
TOPIC_KEYWORDS = {
    '00-foundations':       ['variable', 'declaration', 'pascal case', 'camel case', 'compile', 'syntax', 'curly brace'],
    '01-data-types':        ['data type', 'integer', 'decimal', 'double', 'string', 'boolean', 'date', 'datetime', 'primitive', 'null'],
    '02-collections':       ['collection', 'list', 'set', 'map', 'array', 'addall', 'isempty', 'contains'],
    '03-classes':           ['class', 'object', 'constructor', 'instance', 'this keyword', 'instantiate', 'wrapper class'],
    '04-loops':             ['for loop', 'for-each', 'while loop', 'iterate', 'iteration', 'break', 'continue'],
    '05-methods':           ['method', 'parameter', 'argument', 'return', 'void', 'helper'],
    '06-properties':        ['property', 'getter', 'setter', 'auto property', 'computed property', 'lazy'],
    '07-soql':              ['soql', 'select', 'where clause', 'order by', 'subquery', 'relationship query', 'bind variable'],
    '08-dml':               ['dml', 'insert', 'update', 'upsert', 'delete', 'undelete', 'database.insert', 'all or none'],
    '09-triggers':          ['trigger', 'before insert', 'before update', 'after insert', 'trigger.new', 'trigger context'],
    '10-oop-pillars':       ['inheritance', 'polymorphism', 'abstract', 'interface', 'extends', 'override', 'virtual', 'encapsulation'],
    '11-async':             ['asynchronous', 'async', 'future', 'queueable', 'batch', 'schedulable', 'batchable', 'system.schedule', 'cron'],
    '12-capstone-arlington': ['vendor service', 'vendorservicehelper', 'arlington', 'invocable', 'flow', 'mgmtfee', 'service__c', 'vendor_service'],
    '13-tests':             ['test class', 'test method', 'assert', 'test.startTest', 'test.stoptest', '@testsetup', 'unit test'],
    '14-governor-limits':   ['governor limit', 'bulkif', 'limits.', 'cpu time', 'heap', 'rows', 'multitenan'],
    '15-apis':              ['api', 'callout', 'rest', 'http', 'json', 'named credential', 'restresource', '@httpget', '@httppost'],
    '16-caching':           ['cache', 'platform cache', 'org cache', 'session cache', 'cacheable', 'ttl', 'cache invalid'],
}


def parse_vtt(path: Path):
    """Yield (speaker, text) tuples from a WebVTT file."""
    text = path.read_text(encoding='utf-8', errors='replace')
    blocks = text.split('\n\n')
    for block in blocks:
        lines = [l.rstrip() for l in block.splitlines() if l.strip()]
        if not lines:
            continue
        # Skip WEBVTT header
        if lines[0].upper() == 'WEBVTT':
            continue
        # Skip cue number
        if CUE_NUM_RE.match(lines[0]):
            lines = lines[1:]
        if not lines:
            continue
        # Skip timestamp
        if TS_RE.match(lines[0]):
            lines = lines[1:]
        if not lines:
            continue
        body = ' '.join(lines).strip()
        m = SPEAKER_RE.match(body)
        if m:
            speaker = m.group(1).strip()
            text_part = m.group(2).strip()
        else:
            speaker = '(unknown)'
            text_part = body
        yield speaker, text_part


def is_trivial(text: str) -> bool:
    return text.strip().lower() in TRIVIAL


def clean(text: str) -> str:
    for f in FILLERS:
        text = f.sub('', text)
    # Collapse repeated whitespace and trim
    text = re.sub(r'\s+', ' ', text).strip()
    # Remove leading/trailing punctuation if collapsing left it dangling
    text = re.sub(r'^[,;\s]+', '', text)
    return text


def slim(path: Path) -> tuple[str, dict]:
    """Return (slim_markdown, topic_hint_dict)."""
    paragraphs = []          # list of (speaker, [utterance, ...])
    word_counter = Counter()
    speaker_word_counts = Counter()

    for speaker, text in parse_vtt(path):
        if is_trivial(text):
            continue
        cleaned = clean(text)
        if not cleaned or len(cleaned) < 3:
            continue

        # Update word counts (lowercased) for topic inference — Ari's words weighted heavier
        weight = 3 if 'ari' in speaker.lower() else 1
        words = re.findall(r"[a-zA-Z][a-zA-Z\.\-_]+", cleaned.lower())
        for w in words:
            word_counter[w] += weight

        # Fold into the previous paragraph if same speaker
        if paragraphs and paragraphs[-1][0] == speaker:
            paragraphs[-1][1].append(cleaned)
        else:
            paragraphs.append((speaker, [cleaned]))

    # Build markdown
    lines = [f'# Slim transcript: {path.name}', '']
    for speaker, utterances in paragraphs:
        joined = ' '.join(utterances)
        if speaker.lower().startswith('ari'):
            lines.append(f'**Ari:** {joined}')
        else:
            lines.append(f'_{speaker}:_ {joined}')
        lines.append('')

    # Topic inference — score each lesson by phrase hit count
    full_text = ' '.join(' '.join(u) for _, u in paragraphs).lower()
    scores = {}
    for lesson, keywords in TOPIC_KEYWORDS.items():
        score = sum(full_text.count(kw) for kw in keywords)
        if score > 0:
            scores[lesson] = score
    sorted_scores = dict(sorted(scores.items(), key=lambda kv: -kv[1]))

    return '\n'.join(lines), sorted_scores


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        sys.exit(1)

    overall_hints = {}
    out_dir = Path('transcripts/slim')
    out_dir.mkdir(parents=True, exist_ok=True)

    for arg in argv[1:]:
        path = Path(arg)
        if not path.is_file():
            print(f'skip (not a file): {path}')
            continue
        slim_md, scores = slim(path)
        # Output filename: same stem as raw, .md extension
        out_path = out_dir / (path.stem + '.md')
        out_path.write_text(slim_md, encoding='utf-8')
        overall_hints[path.name] = scores
        top = ', '.join(f'{k}({v})' for k, v in list(scores.items())[:5]) or '(no topic hits)'
        print(f'{path.name}: {len(slim_md):,} chars → {out_path}')
        print(f'  topic hits: {top}')

    # Write hints summary
    hints_path = Path('transcripts/TOPIC_HINTS.md')
    hint_lines = ['# Topic Inference Hints', '',
                  'Auto-generated keyword-frequency scores per transcript. Higher = more likely match.',
                  '']
    for fname, scores in overall_hints.items():
        hint_lines.append(f'## {fname}')
        if not scores:
            hint_lines.append('_(no keyword hits — review manually)_')
        else:
            for lesson, score in scores.items():
                hint_lines.append(f'- {lesson}: {score}')
        hint_lines.append('')
    hints_path.write_text('\n'.join(hint_lines), encoding='utf-8')
    print(f'\nHints summary: {hints_path}')


if __name__ == '__main__':
    main(sys.argv)
