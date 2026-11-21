/**
 * Tiny global store for in-app toasts and confirm dialogs, so plain functions
 * (notify / confirm in lib/device) can show branded UI without hooks.
 */
export type ToastTone = 'info' | 'success' | 'error';
export interface Toast { id: number; title: string; msg?: string; tone: ToastTone }
export interface Dialog { title: string; msg: string; okLabel: string; destructive: boolean; onOk: () => void }

interface FeedbackState { toasts: Toast[]; dialog: Dialog | null }

let state: FeedbackState = { toasts: [], dialog: null };
const listeners = new Set<(s: FeedbackState) => void>();
let seq = 0;

const emit = (next: FeedbackState) => { state = next; listeners.forEach((l) => l(state)); };

export function subscribeFeedback(l: (s: FeedbackState) => void) {
  listeners.add(l);
  l(state);
  return () => { listeners.delete(l); };
}

export function showToast(title: string, msg?: string, tone: ToastTone = 'info') {
  const id = ++seq;
  // Keep at most 3 on screen; the newest goes on top.
  emit({ ...state, toasts: [{ id, title, msg, tone }, ...state.toasts].slice(0, 3) });
  setTimeout(() => dismissToast(id), tone === 'error' ? 5200 : 3600);
}

export function dismissToast(id: number) {
  if (!state.toasts.some((t) => t.id === id)) return;
  emit({ ...state, toasts: state.toasts.filter((t) => t.id !== id) });
}

export function showDialog(d: Dialog) { emit({ ...state, dialog: d }); }
export function closeDialog() { emit({ ...state, dialog: null }); }
