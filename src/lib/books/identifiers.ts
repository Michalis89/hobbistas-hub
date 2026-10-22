/**
 * Book provider id helpers with no server dependencies, so client and
 * server code can both tell which provider an external id belongs to.
 */

/** "/works/OL82563W" -> "OL82563W" */
export const toOpenLibraryWorkId = (key: string | undefined | null) => {
  const match = key?.match(/OL\d+W$/);
  return match ? match[0] : null;
};

/** Open Library work ids look like OL82563W; Google Books ids never do. */
export const isOpenLibraryWorkId = (value: string) => /^OL\d+W$/.test(value);

/**
 * Books found only in the National Library of Greece catalogue are addressed
 * as NLG<biblionumber> (e.g. NLG70625), so the id cannot be mistaken for a
 * Google Books id or an Open Library work id.
 */
export const toNlgExternalId = (nlgId: number) => `NLG${nlgId}`;

export const parseNlgExternalId = (value: string): number | null => {
  const match = value.match(/^NLG(\d+)$/);
  return match ? Number(match[1]) : null;
};

/** Books found only on Hardcover are addressed as HC<id> (e.g. HC328491). */
export const toHardcoverExternalId = (hardcoverId: number) => `HC${hardcoverId}`;

export const parseHardcoverExternalId = (value: string): number | null => {
  const match = value.match(/^HC(\d+)$/);
  return match ? Number(match[1]) : null;
};
