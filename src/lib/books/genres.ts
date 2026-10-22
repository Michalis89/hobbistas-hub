/**
 * Maps free-form library subjects to a small, stable genre vocabulary.
 *
 * Open Library subjects are crowd-sourced: a single work carries hundreds of
 * them, in several languages, mixing genres with themes ("hope", "fear"),
 * places, characters and list names ("Open Library Staff Picks"). Stored
 * as-is in media_items.genres they would flood genre_affinity and the
 * recommenders with noise, so only subjects that name a recognised genre
 * survive, normalised to one spelling.
 */

/**
 * `en` is matched against the lowercased subject; `el` against the
 * lowercased, accent-free form (Greek library subjects carry tonos, e.g.
 * "Ελληνική πεζογραφία" -> "ελληνικη πεζογραφια"). Greek patterns anchor on
 * (?<!\p{L}) instead of \b, which only knows ASCII letters.
 */
type GenreRule = { genre: string; en: RegExp; el?: RegExp };

// Order matters: more specific rules first ("science fiction" before
// "fiction", "history and criticism" before "history", "αστυνομικό
// μυθιστόρημα" before "μυθιστόρημα").
const GENRE_RULES: GenreRule[] = [
  { genre: 'Literary Criticism', en: /\bcriticism\b/, el: /(?<!\p{L})κριτικη/u },
  {
    genre: 'Science Fiction',
    en: /\bscience fiction\b|\bsci-fi\b/,
    el: /(?<!\p{L})επιστημονικη φαντασια/u,
  },
  { genre: 'Fantasy', en: /\bfantasy\b/, el: /(?<!\p{L})φανταστικ|(?<!\p{L})φαντασια/u },
  { genre: 'Horror', en: /\bhorror\b/, el: /(?<!\p{L})τρομου/u },
  { genre: 'Mystery', en: /\bmyster(y|ies)\b|\bdetective\b/, el: /(?<!\p{L})αστυνομικ/u },
  { genre: 'Thriller', en: /\bthrillers?\b|\bsuspense\b/, el: /(?<!\p{L})θριλερ/u },
  { genre: 'Crime', en: /\bcrime\b/, el: /(?<!\p{L})εγκλημα/u },
  {
    genre: 'Romance',
    en: /\bromance\b|\blove stories\b/,
    el: /(?<!\p{L})(αισθηματικ|ερωτικ|ρομαντικ)/u,
  },
  {
    genre: 'Historical Fiction',
    en: /\bhistorical fiction\b/,
    el: /(?<!\p{L})ιστορικο μυθιστορημα/u,
  },
  { genre: 'Dystopian', en: /\bdystopi/, el: /(?<!\p{L})δυστοπι/u },
  { genre: 'Adventure', en: /\badventure\b/, el: /(?<!\p{L})περιπετει/u },
  { genre: 'Young Adult', en: /\byoung adult\b/, el: /(?<!\p{L})(νεανικ|εφηβικ)/u },
  { genre: "Children's", en: /\bjuvenile\b|\bchildren'?s\b/, el: /(?<!\p{L})παιδικ/u },
  { genre: 'Comics', en: /\bcomics?\b|\bgraphic novels?\b/, el: /(?<!\p{L})κομικς/u },
  {
    genre: 'Humor',
    en: /\bhumou?r(ous)?\b|\bsatire\b|\bparod(y|ies)\b/,
    el: /(?<!\p{L})(χιουμορ|σατιρ)/u,
  },
  { genre: 'Poetry', en: /\bpoetry\b|\bpoems\b/, el: /(?<!\p{L})(ποιηση|ποιηματ)/u },
  { genre: 'Drama', en: /\bdrama\b|\bplays\b/, el: /(?<!\p{L})(θεατρ|δραμα)/u },
  { genre: 'Classics', en: /\bclassics?\b/, el: /(?<!\p{L})κλασικ/u },
  {
    genre: 'Biography',
    en: /\bbiograph|\bautobiograph|\bmemoirs?\b/,
    el: /(?<!\p{L})(βιογραφ|αυτοβιογραφ|απομνημονευματ)/u,
  },
  { genre: 'Philosophy', en: /\bphilosoph/, el: /(?<!\p{L})φιλοσοφ/u },
  { genre: 'Psychology', en: /\bpsycholog/, el: /(?<!\p{L})ψυχολογ/u },
  {
    genre: 'Religion',
    en: /\breligio|\btheolog|\bspiritual/,
    el: /(?<!\p{L})(θρησκ|θεολογ|ορθοδοξ)/u,
  },
  { genre: 'Politics', en: /\bpolitic/, el: /(?<!\p{L})πολιτικ/u },
  {
    genre: 'Business',
    en: /\bbusiness\b|\beconomics\b|\bmanagement\b/,
    el: /(?<!\p{L})(οικονομ|επιχειρ)/u,
  },
  { genre: 'Self-Help', en: /\bself-help\b|\bpersonal development\b/, el: /(?<!\p{L})αυτοβοηθει/u },
  { genre: 'Science', en: /\bscience\b/, el: /(?<!\p{L})επιστημ/u },
  // "ιστορία" (history) only as a whole word: "ιστορίες" means stories
  { genre: 'History', en: /\bhistory\b/, el: /(?<!\p{L})ιστορια(?!\p{L})/u },
  { genre: 'Travel', en: /\btravel\b/, el: /(?<!\p{L})ταξιδ/u },
  { genre: 'Cooking', en: /\bcook(ing|ery|books?)\b/, el: /(?<!\p{L})μαγειρικ/u },
  { genre: 'Art', en: /\bart\b|\bpainting\b/, el: /(?<!\p{L})(τεχνη(?!\p{L})|ζωγραφικ)/u },
  {
    genre: 'Fiction',
    en: /\bfiction\b/,
    el: /(?<!\p{L})(μυθιστορ|πεζογραφ|λογοτεχνι|διηγηματ)/u,
  },
];

const stripAccents = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '');

const matchesRule = (rule: GenreRule, part: string) =>
  rule.en.test(part) || (rule.el ? rule.el.test(stripAccents(part)) : false);

const MAX_GENRES = 5;

/**
 * Subjects pack several facets into one string: Google's BISAC style
 * ("Juvenile Fiction / Fantasy & Magic") and library headings
 * ("Fiction, fantasy, epic"). Each part is matched on its own.
 */
const subjectParts = (subject: string) =>
  subject
    .split(/\s*[/,]\s*/)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);

export function subjectsToGenres(subjects: readonly string[] | null | undefined): string[] {
  const genres: string[] = [];
  for (const subject of subjects ?? []) {
    for (const part of subjectParts(subject)) {
      const rule = GENRE_RULES.find(candidate => matchesRule(candidate, part));
      if (rule && !genres.includes(rule.genre)) {
        genres.push(rule.genre);
        if (genres.length >= MAX_GENRES) {
          return genres;
        }
      }
    }
  }
  return genres;
}
