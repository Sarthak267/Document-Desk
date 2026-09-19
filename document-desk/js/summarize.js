import { extractSentences } from './model.js';

/**
 * Extractive summarization: scores each existing sentence by how many
 * frequent, meaningful words it contains, then returns the highest-scoring
 * sentences in their original order.
 *
 * This is a statistical technique (in the spirit of Luhn's 1958 algorithm),
 * not language understanding. It selects sentences verbatim from the source —
 * it does not paraphrase, infer, or verify anything. Good for surfacing the
 * document's most information-dense sentences quickly; not a substitute for
 * reading anything where nuance or exact meaning matters.
 */

const STOPWORDS = new Set(
  ('a an the and or but if then else when while of to in on at by for with about ' +
   'against between into through during before after above below from up down out ' +
   'off over under again further once here there all any both each few more most ' +
   'other some such no nor not only own same so than too very s t can will just don ' +
   'should now is are was were be been being have has had do does did doing would ' +
   'could may might must shall this that these those it its as we you i he she they ' +
   'them his her their our your my me him us also which who whom what where why how')
    .split(' ')
);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z][a-z'-]*/g) || []).filter((w) => w.length > 2);
}

export function summarize(doc, { ratio = 0.25, maxSentences = null } = {}) {
  const sentences = extractSentences(doc);
  if (sentences.length === 0) {
    return { summary: '', sentences: [], keywords: [], stats: null };
  }

  const freq = new Map();
  for (const s of sentences) {
    for (const w of tokenize(s.text)) {
      if (STOPWORDS.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  const maxFreq = Math.max(1, ...freq.values());
  for (const [w, c] of freq) freq.set(w, c / maxFreq);

  const scored = sentences.map((s, idx) => {
    const words = tokenize(s.text).filter((w) => !STOPWORDS.has(w));
    const rawScore = words.reduce((sum, w) => sum + (freq.get(w) || 0), 0);
    const density = words.length ? rawScore / Math.sqrt(words.length) : 0;
    // Small boost for opening sentences — they're disproportionately likely to be topic sentences.
    const positionBoost = s.sentIndexInPara === 0 ? 1.15 : 1.0;
    return { ...s, idx, score: density * positionBoost };
  });

  const targetCount = Math.max(1, maxSentences || Math.round(sentences.length * ratio));
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, targetCount);
  const ordered = top.sort((a, b) => a.idx - b.idx);

  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);

  const originalWords = sentences.reduce((sum, s) => sum + tokenize(s.text).length, 0);
  const summaryWords = ordered.reduce((sum, s) => sum + tokenize(s.text).length, 0);

  return {
    summary: ordered.map((s) => s.text).join(' '),
    sentences: ordered,
    keywords,
    stats: {
      originalSentences: sentences.length,
      summarySentences: ordered.length,
      originalWords,
      summaryWords,
      reductionPct: originalWords ? Math.round((1 - summaryWords / originalWords) * 100) : 0,
    },
  };
}
