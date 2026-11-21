import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { uploadMedia } from '@workspace/api-client-react';
import { apiUrl, authFetch, getToken } from './api';

/** Uploads a photo picked with lib/device.pickPhoto (data: URL on web, file URI on phones). */
export async function uploadImage(uri: string, opts: { private: boolean }): Promise<string> {
  let data: string, mime: string;
  if (uri.startsWith('data:')) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(uri);
    if (!m) throw new Error('bad image');
    [, mime, data] = m;
  } else {
    data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const ext = uri.split('.').pop()?.toLowerCase();
    mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  }
  const r = await uploadMedia({ data, mime, private: opts.private });
  return r.id;
}

/** Public images (listing photos) are plain URLs. */
export const mediaUrl = (id: string) => apiUrl(`/api/media/${id}`);

/**
 * Private images (licences, registration documents) need the session: phones send the header,
 * browsers get a blob URL fetched with it.
 */
const blobs = new Map<string, Promise<string>>();
export async function privateImage(id: string): Promise<{ uri: string; headers?: Record<string, string> }> {
  if (Platform.OS !== 'web') return { uri: mediaUrl(id), headers: { Authorization: `Bearer ${getToken() ?? ''}` } };
  let p = blobs.get(id);
  if (!p) {
    p = authFetch(`/api/media/${id}`).then(async (r) => {
      if (!r.ok) throw new Error(`media ${r.status}`);
      return URL.createObjectURL(await r.blob());
    });
    blobs.set(id, p);
    p.catch(() => blobs.delete(id));
  }
  return { uri: await p };
}
