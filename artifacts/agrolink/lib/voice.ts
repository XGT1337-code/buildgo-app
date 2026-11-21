import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { IOSOutputFormat, AudioQuality, type RecordingOptions } from 'expo-audio';
import { authFetch, apiUrl, getToken } from './api';

/**
 * Voice notes: mono AAC (.m4a) on phones, Opus/WebM in browsers. Both play on Android and in
 * Chrome/Edge/Firefox, so a note recorded on the website plays in the APK and vice versa.
 */
export const VOICE_PRESET: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.HIGH, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: { mimeType: 'audio/webm;codecs=opus', bitsPerSecond: 64000 },
};

export const MAX_VOICE_MS = 5 * 60_000;

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Reads a finished recording as base64 + MIME type for upload. */
export async function readRecording(uri: string): Promise<{ data: string; mime: string }> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    return { data, mime: (blob.type || 'audio/webm').split(';')[0] };
  }
  const data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const ext = uri.split('.').pop()?.toLowerCase();
  return { data, mime: ext === '3gp' ? 'audio/3gpp' : ext === 'webm' ? 'audio/webm' : 'audio/mp4' };
}

/**
 * A playable source for a voice note on the server. Phones stream it with the auth header;
 * browsers cannot add headers to <audio>, so the bytes are fetched once and kept as a blob URL.
 */
const blobCache = new Map<string, Promise<string>>();
export async function voiceSource(audioId: string): Promise<{ uri: string; headers?: Record<string, string> }> {
  const path = `/api/chat/audio/${audioId}`;
  if (Platform.OS !== 'web') return { uri: apiUrl(path), headers: { Authorization: `Bearer ${getToken() ?? ''}` } };
  let p = blobCache.get(audioId);
  if (!p) {
    p = authFetch(path).then(async (r) => {
      if (!r.ok) throw new Error(`audio ${r.status}`);
      return URL.createObjectURL(await r.blob());
    });
    blobCache.set(audioId, p);
    p.catch(() => blobCache.delete(audioId));
  }
  return { uri: await p };
}
