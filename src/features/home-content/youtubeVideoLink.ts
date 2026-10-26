const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export type YouTubeVideoLink = {
  videoId: string;
  canonicalUrl: string;
};

export function parseYouTubeVideoLink(input: string): YouTubeVideoLink | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !YOUTUBE_HOSTS.has(url.hostname.toLowerCase()) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0
  ) {
    return null;
  }

  const path = url.pathname.split('/').filter(Boolean);
  let videoId: string | null = null;

  if (url.hostname.toLowerCase() === 'youtu.be') {
    if (path.length === 1) videoId = path[0];
  } else if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) {
    videoId = url.searchParams.get('v');
  } else if (
    path.length === 2 &&
    (path[0] === 'shorts' || path[0] === 'live')
  ) {
    videoId = path[1];
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) return null;

  const canonicalUrl = new URL('https://www.youtube.com/watch');
  canonicalUrl.searchParams.set('v', videoId);
  return { videoId, canonicalUrl: canonicalUrl.href };
}

export function readableYouTubeFallbackTitle(title: string, input: string): string {
  if (parseYouTubeVideoLink(input) && title.trim().toLowerCase() === 'watch') {
    return 'Vídeo do YouTube';
  }
  return title;
}
