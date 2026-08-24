import {
  AI_TASTE_MIN_EVIDENCE_TITLES,
  isAiTasteEligible,
  isAiTasteSupportedCategory,
} from '../taste-eligibility';

describe('isAiTasteSupportedCategory', () => {
  it.each(['games', 'anime', 'manga'])('supports %s', category => {
    expect(isAiTasteSupportedCategory(category)).toBe(true);
  });

  it.each(['movies', 'tv', 'books', 'coding', 'pet', 'vape', ''])(
    'does not support %s',
    category => {
      expect(isAiTasteSupportedCategory(category)).toBe(false);
    },
  );
});

describe('isAiTasteEligible', () => {
  const eligible = { category: 'games', engagedEntryCount: AI_TASTE_MIN_EVIDENCE_TITLES };

  it('allows games with enough engaged titles', () => {
    expect(isAiTasteEligible(eligible)).toBe(true);
  });

  it('refuses games one title below the evidence threshold', () => {
    expect(
      isAiTasteEligible({ category: 'games', engagedEntryCount: AI_TASTE_MIN_EVIDENCE_TITLES - 1 }),
    ).toBe(false);
  });

  it('refuses an empty games library', () => {
    expect(isAiTasteEligible({ category: 'games', engagedEntryCount: 0 })).toBe(false);
  });

  it.each(['movies', 'tv', 'books'])(
    'refuses %s however large the library',
    category => {
      expect(isAiTasteEligible({ category, engagedEntryCount: 5000 })).toBe(false);
    },
  );

  it('holds anime to its own, higher evidence floor rather than the games one', () => {
    expect(isAiTasteEligible({ category: 'anime', engagedEntryCount: 8 })).toBe(true);
    expect(isAiTasteEligible({ category: 'anime', engagedEntryCount: 7 })).toBe(false);
    // The same count that clears the bar for games does not clear it for anime.
    expect(isAiTasteEligible({ category: 'games', engagedEntryCount: 6 })).toBe(true);
    expect(isAiTasteEligible({ category: 'anime', engagedEntryCount: 6 })).toBe(false);
  });

  it('holds manga to its own floor, which is neither the games nor the anime one', () => {
    expect(isAiTasteEligible({ category: 'manga', engagedEntryCount: 7 })).toBe(true);
    expect(isAiTasteEligible({ category: 'manga', engagedEntryCount: 6 })).toBe(false);
    // Six clears the bar for games and seven does not clear it for anime; manga sits between.
    expect(isAiTasteEligible({ category: 'games', engagedEntryCount: 6 })).toBe(true);
    expect(isAiTasteEligible({ category: 'anime', engagedEntryCount: 7 })).toBe(false);
  });

  it('refuses a read-only manga dashboard however large the library', () => {
    expect(
      isAiTasteEligible({ category: 'manga', engagedEntryCount: 5000, isReadOnly: true }),
    ).toBe(false);
  });

  it('refuses a read-only anime dashboard however large the library', () => {
    expect(
      isAiTasteEligible({ category: 'anime', engagedEntryCount: 5000, isReadOnly: true }),
    ).toBe(false);
  });

  it('refuses a read-only dashboard', () => {
    expect(isAiTasteEligible({ ...eligible, isReadOnly: true })).toBe(false);
  });

  it('matches the evidence builder threshold, so the client never asks for what the server refuses', () => {
    expect(AI_TASTE_MIN_EVIDENCE_TITLES).toBe(6);
  });
});
