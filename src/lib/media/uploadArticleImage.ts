const COVER_API_PATH = '/api/uploads/article-cover';
const BODY_API_PATH = '/api/uploads/article-image';

async function postImage(apiPath: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(apiPath, { method: 'POST', body: formData });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message =
      data && typeof data.message === 'string' ? data.message : 'Image upload failed. Try again.';
    throw new Error(message);
  }

  const data = await response.json();
  if (!data?.url) {
    throw new Error('We did not receive an image URL from the server.');
  }

  return data.url as string;
}

/** Cover art shown in cards, hero sections and Open Graph previews. */
export function uploadArticleCoverImage(file: File): Promise<string> {
  return postImage(COVER_API_PATH, file);
}

/** Images embedded in the article body via the editor. */
export function uploadArticleBodyImage(file: File): Promise<string> {
  return postImage(BODY_API_PATH, file);
}
