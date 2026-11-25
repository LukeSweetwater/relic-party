import { describe, expect, it } from 'vitest';
import { buildCategory, matchAnswer, normalize, STARTER_PACK } from './answers.js';

const fruits = buildCategory('Fruits', ['apple', 'kiwi|kiwifruit', 'passion fruit|granadilla', 'pineapple']);

describe('normalize', () => {
  it('ignores case, accents, punctuation and a leading "the"', () => {
    expect(normalize('  The Côte-d’Ivoire!! ')).toBe('cote d ivoire');
  });
});

describe('matchAnswer', () => {
  it('matches exact answers and aliases to the canonical name', () => {
    expect(matchAnswer(fruits, 'APPLE')).toBe('apple');
    expect(matchAnswer(fruits, 'granadilla')).toBe('passion fruit');
    expect(matchAnswer(fruits, 'kiwifruit')).toBe('kiwi');
  });
  it('accepts simple plurals and one typo in longer words', () => {
    expect(matchAnswer(fruits, 'apples')).toBe('apple');
    expect(matchAnswer(fruits, 'pinapple')).toBe('pineapple');
  });
  it('rejects wrong answers and allows no typo in short words', () => {
    expect(matchAnswer(fruits, 'carrot')).toBeNull();
    expect(matchAnswer(fruits, 'kiwo')).toBeNull();
    expect(matchAnswer(fruits, '   ')).toBeNull();
  });
  it('ships a starter pack where every category has 30+ answers', () => {
    expect(STARTER_PACK.length).toBeGreaterThanOrEqual(12);
    for (const c of STARTER_PACK) expect(new Set(c.lookup.values()).size).toBeGreaterThanOrEqual(30);
  });
});
