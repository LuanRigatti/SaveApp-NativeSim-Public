export function formatVideoDuration(durationMs: number | null): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return '';
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  const hours = Math.floor(totalMinutes / 60);

  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${totalMinutes}:${seconds}`;
}
