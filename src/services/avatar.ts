/**
 * avatar.ts — profile photo capture + Supabase Storage upload (Phase 17, Part C).
 *
 * Flow: pick from library / take photo (expo-image-picker) → read bytes →
 * upload to the `avatars` Storage bucket at `<uid>/avatar.jpg` → return the
 * public URL (cache-busted). The URL is stored on profiles.avatar_url.
 *
 * Rules upheld:
 *  - Only the anon Supabase client + the user's session are used. RLS (see
 *    docs/AVATAR_STORAGE.md) restricts writes to the caller's own `<uid>/`
 *    folder, so no service_role is ever needed in the app.
 *  - The storage path is keyed by the authenticated user id.
 *  - We never fake success: a failed upload throws and the UI surfaces it.
 *  - Images are square-cropped + quality-compressed by the picker, and a hard
 *    size guard rejects anything unexpectedly large.
 *
 * REQUIRES one-time Supabase setup (bucket + RLS) — see docs/AVATAR_STORAGE.md.
 * Until that exists, uploads fail with a clear "couldn't save photo" message
 * (never a silent/fake success).
 */
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

export const AVATAR_BUCKET = 'avatars';

/** Reject images larger than this (post-compression they're well under it). */
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB

export type AvatarErrorCode =
  | 'permission'
  | 'camera_unavailable'
  | 'too_large'
  | 'read_failed'
  | 'upload_failed'
  | 'unknown';

export class AvatarError extends Error {
  code: AvatarErrorCode;
  constructor(code: AvatarErrorCode, message: string) {
    super(message);
    this.name = 'AvatarError';
    this.code = code;
  }
}

export type AvatarSource = 'library' | 'camera';

/**
 * Open the library or camera and return the chosen square image asset.
 * Returns null when the user cancels. Throws AvatarError on permission denial
 * or when the camera is unavailable (e.g. a simulator).
 */
export async function pickAvatar(
  source: AvatarSource,
): Promise<ImagePicker.ImagePickerAsset | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
  };

  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw new AvatarError('permission', 'Camera access is off.');
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchCameraAsync(options);
    } catch {
      throw new AvatarError('camera_unavailable', 'Camera is not available.');
    }
    return result.canceled ? null : (result.assets[0] ?? null);
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new AvatarError('permission', 'Photo library access is off.');
  }
  const result = await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : (result.assets[0] ?? null);
}

/**
 * Upload an image asset to `avatars/<userId>/avatar.jpg` (upsert) and return a
 * cache-busted public URL. Throws AvatarError on a size or upload failure.
 */
export async function uploadAvatar(
  userId: string,
  asset: ImagePicker.ImagePickerAsset,
): Promise<string> {
  if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_BYTES) {
    throw new AvatarError('too_large', 'That photo is too large.');
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await fetch(asset.uri).then((r) => r.arrayBuffer());
  } catch {
    throw new AvatarError('read_failed', 'Could not read that photo.');
  }
  if (bytes.byteLength > MAX_BYTES) {
    throw new AvatarError('too_large', 'That photo is too large.');
  }

  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

  if (error) {
    throw new AvatarError('upload_failed', error.message);
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // Cache-bust so the new image shows immediately (path is stable on upsert).
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Best-effort delete of the user's stored avatar. Never throws. */
export async function removeAvatarFile(userId: string): Promise<void> {
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([`${userId}/avatar.jpg`]);
  } catch {
    // Best effort — clearing profiles.avatar_url is what actually matters.
  }
}

/** Map any avatar failure to a friendly, non-technical message. */
export function friendlyAvatarError(err: unknown): string {
  if (err instanceof AvatarError) {
    switch (err.code) {
      case 'permission':
        return 'Allow photo access in iOS Settings to add a photo.';
      case 'camera_unavailable':
        return 'The camera isn’t available on this device.';
      case 'too_large':
        return 'That photo is too large. Try a smaller one.';
      case 'read_failed':
        return 'Couldn’t read that photo. Please try another.';
      case 'upload_failed':
        return 'Couldn’t save your photo. Please try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}
