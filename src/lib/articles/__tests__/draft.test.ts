import {
  draftFromRow,
  emptyDraft,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
  buildArticlePayload,
  isPublishable,
  isSaveable,
} from '@/lib/articles/draft';

describe('datetime-local conversion', () => {
  it('round-trips a timestamp through the input format', () => {
    const iso = fromLocalDateTimeInput('2026-08-23T14:30');
    expect(iso).not.toBeNull();
    expect(toLocalDateTimeInput(iso)).toBe('2026-08-23T14:30');
  });

  it('pads single digit months, days, hours and minutes', () => {
    expect(toLocalDateTimeInput(fromLocalDateTimeInput('2026-01-02T03:04'))).toBe(
      '2026-01-02T03:04',
    );
  });

  it('treats empty and invalid values as unset', () => {
    expect(toLocalDateTimeInput(null)).toBe('');
    expect(toLocalDateTimeInput('')).toBe('');
    expect(toLocalDateTimeInput('not a date')).toBe('');
    expect(fromLocalDateTimeInput('')).toBeNull();
    expect(fromLocalDateTimeInput('nonsense')).toBeNull();
  });
});

describe('scheduling in the payload', () => {
  const base = { ...emptyDraft(), title: 'T', category: 'games' as const };

  it('sends an absolute timestamp for a scheduled article', () => {
    const payload = buildArticlePayload({ ...base, scheduledFor: '2026-08-23T14:30' });
    expect(payload.scheduled_for).toBe(new Date('2026-08-23T14:30').toISOString());
  });

  it('sends null when nothing is scheduled', () => {
    expect(buildArticlePayload(base).scheduled_for).toBeNull();
  });
});

describe('draftFromRow', () => {
  it('reads a scheduled article back into the composer', () => {
    const iso = new Date('2026-09-01T10:00').toISOString();
    const draft = draftFromRow({
      title: 'Later',
      category: 'games',
      topic: 'articles',
      status: 'scheduled',
      scheduled_for: iso,
    });

    expect(draft.status).toBe('scheduled');
    expect(draft.scheduledFor).toBe(toLocalDateTimeInput(iso));
  });

  it('leaves the schedule unset for a plain draft', () => {
    expect(draftFromRow({ title: 'X', category: 'games' }).scheduledFor).toBe('');
  });

  it('maps a review row to the review content type', () => {
    expect(draftFromRow({ topic: 'reviews', score: 8 }).type).toBe('review');
    expect(draftFromRow({ topic: 'reviews', score: 8 }).score).toBe('8');
  });
});

describe('isSaveable and isPublishable (bilingual drafts)', () => {
  const games = { ...emptyDraft(), category: 'games' as const };

  it('saves a draft with a title in either language', () => {
    expect(isSaveable({ ...games, title: 'English' })).toBe(true);
    expect(isSaveable(games, 'Ελληνικός τίτλος')).toBe(true);
  });

  it('does not save without any title or without a category', () => {
    expect(isSaveable(games)).toBe(false);
    expect(isSaveable({ ...games, title: '   ' }, '  ')).toBe(false);
    expect(isSaveable({ ...emptyDraft(), title: 'English' })).toBe(false);
    expect(isSaveable(emptyDraft(), 'Ελληνικά')).toBe(false);
  });

  it('publishes only with the English title, a category and a body', () => {
    const complete = { ...games, title: 'English', contentHtml: '<p>Body</p>' };
    expect(isPublishable(complete)).toBe(true);
    expect(isPublishable({ ...complete, title: ' ' })).toBe(false);
    expect(isPublishable({ ...complete, category: '' as const })).toBe(false);
    expect(isPublishable({ ...complete, contentHtml: '  ' })).toBe(false);
  });
});
