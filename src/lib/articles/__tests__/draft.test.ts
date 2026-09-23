import {
  draftFromRow,
  emptyDraft,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
  buildArticlePayload,
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
