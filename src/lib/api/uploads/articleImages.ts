import { randomUUID } from 'crypto';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import getSupabaseServer from '@/lib/supabase-server';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';

const BUCKET_NAME = 'articles';
const ALLOWED_ROLES = ['admin', 'owner', 'author', 'reviewer'] as const;

/**
 * Storage extension is derived from the declared MIME type rather than the
 * user-supplied filename, so a file named `payload.html` cannot be persisted
 * with an html extension and served back from the public bucket.
 */
const ALLOWED_IMAGE_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ArticleImageUploadResult =
  | { ok: true; url: string }
  | { ok: false; status: number; message: string };

const failure = (status: number, message: string): ArticleImageUploadResult => ({
  ok: false,
  status,
  message,
});

/**
 * Shared upload pipeline for article imagery.
 *
 * `pathPrefix` separates cover art from images embedded in article bodies so
 * the two can be listed, audited or garbage-collected independently.
 */
export async function uploadArticleImage(
  request: Request,
  { pathPrefix }: { pathPrefix: string },
): Promise<ArticleImageUploadResult> {
  try {
    const supabase = await createRouteHandlerClient();
    const session = await requireAuth(supabase);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return failure(400, 'File not found.');
    }

    const extension = ALLOWED_IMAGE_TYPES[file.type];
    if (!extension) {
      return failure(415, 'Unsupported image type. Use JPEG, PNG, WebP, GIF or AVIF.');
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return failure(413, `Image is too large. Maximum size is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`);
    }

    const supabaseServer = getSupabaseServer();
    const { data: user, error: userError } = await supabaseServer
      .from('users')
      .select('roles')
      .eq('id', session.user.id)
      .single();
    if (userError || !user) {
      console.error('Article image upload: failed to load user roles', userError);
      return failure(403, 'Action is not allowed.');
    }

    const userRoles = Array.isArray(user.roles) ? user.roles : [];
    if (!userRoles.some(role => ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number]))) {
      return failure(403, 'You do not have permission for this action.');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return failure(413, 'Image is too large.');
    }

    const storagePath = `articles/${pathPrefix}-${randomUUID()}.${extension}`;

    const { error: uploadError } = await supabaseServer.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        cacheControl: '3600',
        upsert: true,
        // Taken from the validated allowlist, never from the client value.
        contentType: file.type,
      });

    if (uploadError) {
      console.error('Article image upload failed', uploadError);
      return failure(500, 'Upload failed.');
    }

    const { data: urlData } = await supabaseServer.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    if (!urlData?.publicUrl) {
      console.error('Article image upload failed to get public url');
      return failure(500, 'We cannot return the image URL.');
    }

    return { ok: true, url: urlData.publicUrl };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return failure(401, 'Unauthorized access.');
    }
    console.error('Article image upload error:', error);
    return failure(500, 'Image upload error.');
  }
}
