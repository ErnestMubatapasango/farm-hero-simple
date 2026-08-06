import { supabase } from "@/integrations/supabase/client";

export const AVATAR_BUCKET = "avatars";

/**
 * profiles.avatar_url may hold either an absolute URL (legacy/external) or a
 * storage path inside the private `avatars` bucket. Resolve both to something
 * an <img> can render.
 */
export async function resolveAvatarUrl(value?: string | null): Promise<string | null> {
  if (!value) return null;
  if (/^(https?:|data:|blob:)/.test(value)) return value;
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(value, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}
