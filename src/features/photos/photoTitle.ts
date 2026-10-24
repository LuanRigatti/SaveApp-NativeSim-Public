import type { PhotoMetadata } from './photoTypes';

const MAX_CUSTOM_PHOTO_TITLE_LENGTH = 100;

/** Only explicit filename labels can identify screenshots; image formats are not evidence. */
export function isScreenshotFileName(fileName: string | null | undefined): boolean {
  if (!fileName) {
    return false;
  }

  const baseName = fileName.split(/[\\/]/).pop() ?? '';
  const normalized = baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  return /^(?:screenshot|screen[\s_-]*shot|captura[\s_-]+de[\s_-]+tela)(?:[\s_.-]|$)/.test(
    normalized,
  );
}

/** Empty or whitespace-only values clear the custom title and restore automatic naming. */
export function normalizeCustomPhotoTitle(value: string): string | null {
  const normalized = Array.from(value.trim())
    .slice(0, MAX_CUSTOM_PHOTO_TITLE_LENGTH)
    .join('')
    .trimEnd();

  return normalized.length > 0 ? normalized : null;
}

export function getAutomaticPhotoTitle(photo: Pick<PhotoMetadata, 'isScreenshot'>): string {
  return photo.isScreenshot ? 'Captura de tela' : 'Foto';
}

export function getPhotoDisplayTitle(
  photo: Pick<PhotoMetadata, 'isScreenshot' | 'customTitle'>,
): string {
  const customTitle = photo.customTitle?.trim();
  return customTitle || getAutomaticPhotoTitle(photo);
}

/** Formats the persisted SaveApp timestamp in the device's local calendar and timezone. */
export function getPhotoSavedDateLabel(createdAt: number, now: Date = new Date()): string | null {
  if (!Number.isFinite(createdAt) || !Number.isFinite(now.getTime())) {
    return null;
  }

  const savedAt = new Date(createdAt);
  if (!Number.isFinite(savedAt.getTime())) {
    return null;
  }

  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(savedAt);
  const isSameLocalDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  if (isSameLocalDay(savedAt, now)) {
    return `Hoje, ${time}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(savedAt, yesterday)) {
    return `Ontem, ${time}`;
  }

  const dateParts = new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: '2-digit',
  }).formatToParts(savedAt);
  const day = dateParts.find((part) => part.type === 'day')?.value;
  const month = dateParts.find((part) => part.type === 'month')?.value;

  return day && month ? `${day}/${month}, ${time}` : null;
}
