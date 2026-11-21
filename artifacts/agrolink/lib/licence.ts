import { t } from './i18n';

/** "TR-B" → "Machinery B"; the operator certificates get their own name; road categories stay as they are. */
export const catLabel = (x: string) =>
  x === 'CRANE' ? t('Crane operator') : x === 'LIFT' ? t('Platform operator') : x.startsWith('TR-') ? `${t('Machinery')} ${x.slice(3)}` : x;
