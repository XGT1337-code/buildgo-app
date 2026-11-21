import { Platform, Share } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { showDialog, showToast, type ToastTone } from './feedback';
import type { LngLat } from './types';
import { t } from './i18n';

/** Branded confirm dialog (same look on iOS, Android and web; no blocking window.confirm). */
export function confirm(title: string, msg: string, ok: () => void, okLabel = 'OK', destructive = true) {
  showDialog({ title, msg, okLabel, destructive, onOk: ok });
}

/** Non-blocking toast. Errors stay on screen a little longer. */
export function notify(title: string, msg: string, tone: ToastTone = 'info') {
  showToast(title, msg, tone);
}

/**
 * Hands a text file to the user: download on web, share sheet on native.
 * Used for diary and data exports, since all data lives on this device.
 */
export async function shareText(filename: string, text: string, mime = 'text/plain') {
  if (Platform.OS === 'web') {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      notify(t('Downloaded'), filename, 'success');
    } catch {
      notify(t('Export failed'), t('Your browser blocked the download.'), 'error');
    }
    return;
  }
  try { await Share.share({ message: text, title: filename }); } catch { /* dismissed */ }
}

/** Opens the user's maps app (or Google Maps on web) at a point, for driving to a field. */
export function mapsUrl([lng, lat]: LngLat, label: string) {
  const q = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (Platform.OS === 'ios') return `https://maps.apple.com/?ll=${q}&q=${encodeURIComponent(label)}`;
  if (Platform.OS === 'android') return `geo:${q}?q=${q}(${encodeURIComponent(label)})`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export async function pickPhoto(source: 'library' | 'camera'): Promise<string | undefined> {
  const keep = async (r: ImagePicker.ImagePickerResult) => {
    if (r.canceled || !r.assets[0]) return undefined;
    const asset = r.assets[0];
    if ((asset.fileSize ?? 0) > 2 * 1024 * 1024) {
      notify(t('Photo unavailable'), t('Choose a photo smaller than 2 MB.'), 'error');
      return undefined;
    }
    if (Platform.OS === 'web') {
      // Expo 57 returns a temporary blob: URI even when base64 is requested.
      if (!asset.base64) throw new Error('The selected image could not be saved.');
      const data = `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
      if (asset.uri.startsWith('blob:')) URL.revokeObjectURL(asset.uri);
      return data;
    }
    const dir = `${FileSystem.documentDirectory}field-photos/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const dest = `${dir}${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    await FileSystem.copyAsync({ from: asset.uri, to: dest });
    return dest;
  };
  try {
    if (source === 'camera' && Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        notify(t('Camera blocked'), t('Allow camera access in your phone settings to take photos.'), 'error');
        return undefined;
      }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: true });
      return await keep(r);
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: true, base64: Platform.OS === 'web' });
    return await keep(r);
  } catch {
    notify(t('Photo unavailable'), t('Could not open photos on this device.'), 'error');
    return undefined;
  }
}
