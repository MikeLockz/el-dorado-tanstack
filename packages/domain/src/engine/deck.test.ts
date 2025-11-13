import { describe, expect, it } from 'vitest';
import { createDeck, getDeckCountForPlayers } from './deck';
import { shuffleDeck } from './shuffle';

describe('deck creation', () => {
  it('creates a full 52-card deck per standard deck', () => {
    const deck = createDeck(1);
    expect(deck).toHaveLength(52);
    const ids = new Set(deck.map((card) => card.id));
    expect(ids.size).toBe(52);
  });

  it('creates two unique decks when required', () => {
    const deck = createDeck(2);
    expect(deck).toHaveLength(104);
    const ids = new Set(deck.map((card) => card.id));
    expect(ids.size).toBe(104);
    const deckIndices = new Set(deck.map((card) => card.deckIndex));
    expect(deckIndices).toEqual(new Set([0, 1]));
  });

  it('deterministically shuffles based on seed', () => {
    const baseDeck = createDeck(1);
    const shuffleA = shuffleDeck(baseDeck, 'seed:alpha');
    const shuffleB = shuffleDeck(baseDeck, 'seed:alpha');
    const shuffleC = shuffleDeck(baseDeck, 'seed:beta');

    expect(shuffleA).toEqual(shuffleB);
    expect(shuffleA).not.toEqual(shuffleC);
  });

  it('maps player counts to deck counts', () => {
    expect(getDeckCountForPlayers(2)).toBe(1);
    expect(getDeckCountForPlayers(5)).toBe(1);
    expect(getDeckCountForPlayers(6)).toBe(2);
    expect(getDeckCountForPlayers(10)).toBe(2);
  });
});
