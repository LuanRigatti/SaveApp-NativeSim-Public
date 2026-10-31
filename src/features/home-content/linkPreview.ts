import { fetch as expoFetch } from 'expo/fetch';

import { canFetchLinkPreview, fallbackLinkTitle, normalizeWebLink } from './linkValidation';
import { parseYouTubeVideoLink, readableYouTubeFallbackTitle } from './youtubeVideoLink';

export type LinkPreviewMetadata = {
  title: string;
  description: string | null;
  domain: string;
  imageUrl: string | null;
  faviconUrl: string | null;
};

export type DownloadedPreviewImage = {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  extension: 'jpg' | 'png' | 'webp' | 'gif';
};

export type DownloadedFaviconImage = {
  bytes: Uint8Array;
  mimeType: string;
};

type LinkPreviewFetcher = typeof expoFetch;

const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_FAVICON_BYTES = 256 * 1024;
const MAX_OEMBED_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 3_500;
const MAX_REDIRECTS = 4;
const YOUTUBE_OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';
const YOUTUBE_THUMBNAIL_HOSTS = new Set(['i.ytimg.com', 'img.youtube.com']);

type SafeResponseOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
};

function createAbortError(): Error {
  const error = new Error('The request was cancelled.');
  error.name = 'AbortError';
  return error;
}

function createTimeoutError(): Error {
  const error = new Error('The link preview request timed out.');
  error.name = 'TimeoutError';
  return error;
}

function fallbackMetadata(url: string): LinkPreviewMetadata {
  const normalized = normalizeWebLink(url);
  return {
    title: fallbackLinkTitle(normalized.url),
    description: null,
    domain: normalized.domain,
    imageUrl: null,
    faviconUrl: null,
  };
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return {
      amp: '&',
      quot: '"',
      apos: "'",
      lt: '<',
      gt: '>',
      nbsp: ' ',
    }[normalized] ?? match;
  });
}

function parseTagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(tag))) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }

  return attributes;
}

function cleanMetadataText(value: string | undefined, limit: number): string | null {
  if (!value) {
    return null;
  }

  const cleaned = decodeHtmlEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, limit) : null;
}

function resolveHttpUrl(value: string | undefined, baseUrl: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const resolved = new URL(value, baseUrl);
    return (resolved.protocol === 'http:' || resolved.protocol === 'https:') && resolved.hostname
      ? resolved.href
      : null;
  } catch {
    return null;
  }
}

export function parseLinkPreviewHtml(html: string, pageUrl: string): LinkPreviewMetadata {
  const fallback = fallbackMetadata(pageUrl);
  const meta = new Map<string, string>();

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseTagAttributes(match[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? '').toLowerCase();
    if (key && attrs.content) {
      meta.set(key, attrs.content);
    }
  }

  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const title = cleanMetadataText(
    meta.get('og:title') ?? meta.get('twitter:title') ?? meta.get('title') ?? titleTag ?? undefined,
    180,
  );
  const description = cleanMetadataText(
    meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'),
    360,
  );
  const imageUrl = resolveHttpUrl(
    meta.get('og:image:secure_url') ??
      meta.get('og:image') ??
      meta.get('twitter:image:src') ??
      meta.get('twitter:image'),
    pageUrl,
  );

  const faviconCandidates: { url: string; priority: number; declaredType: string; pathExtension: string }[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseTagAttributes(match[0]);
    const rel = attrs.rel?.toLowerCase().split(/\s+/) ?? [];
    const isAppleTouchIcon = rel.some((token) => token.startsWith('apple-touch-icon'));
    const isIcon = rel.includes('icon');
    if (!isAppleTouchIcon && !isIcon) continue;
    const url = resolveHttpUrl(attrs.href, pageUrl);
    if (!url) continue;
    const declaredType = attrs.type?.split(';')[0]?.trim().toLowerCase() ?? '';
    let pathExtension = '';
    try {
      const pathComponent = new URL(url).pathname.split('/').pop() ?? '';
      pathExtension = pathComponent.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? '';
    } catch { /* URL already resolved. */ }
    faviconCandidates.push({ url, priority: isAppleTouchIcon ? 0 : 1, declaredType, pathExtension });
  }

  const supportedFaviconTypes = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'image/x-icon', 'image/vnd.microsoft.icon', 'image/ico',
  ]);
  const supportedFaviconExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'ico']);
  const supportedFavicon = faviconCandidates
    .filter((candidate) => {
      if (candidate.declaredType && !supportedFaviconTypes.has(candidate.declaredType)) return false;
      if (candidate.pathExtension === 'svg') return false;
      return !candidate.pathExtension || supportedFaviconExtensions.has(candidate.pathExtension);
    })
    .sort((left, right) => left.priority - right.priority)[0]?.url;
  let faviconUrl = supportedFavicon ?? null;
  if (!faviconUrl && faviconCandidates.length > 0) {
    try {
      faviconUrl = new URL('/favicon.ico', pageUrl).href;
    } catch { /* Invalid page URL is rejected by the caller's normalization. */ }
  }

  return {
    title: title ?? fallback.title,
    description,
    domain: fallback.domain,
    imageUrl,
    faviconUrl,
  };
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

async function withSafeResponse<T>(
  inputUrl: string,
  signal: AbortSignal | undefined,
  fetcher: LinkPreviewFetcher,
  accept: string,
  readResponse: (response: Response, responseUrl: string) => Promise<T>,
  options: SafeResponseOptions = {},
): Promise<T> {
  if (!canFetchLinkPreview(inputUrl)) {
    throw new Error('Preview requests are not allowed for this host.');
  }

  const normalizedInput = normalizeWebLink(inputUrl).url;
  let requestUrl = normalizedInput;
  let redirects = 0;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) {
    throw createAbortError();
  }
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  if (timeoutMs <= 0) {
    signal?.removeEventListener('abort', onAbort);
    throw createTimeoutError();
  }
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (true) {
      const response = await fetcher(requestUrl, {
        credentials: 'omit',
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: accept,
          'User-Agent': 'SaveApp-LinkPreview/1.0',
        },
      });

      if (isRedirect(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirects >= maxRedirects) {
          throw new Error('The preview redirect limit was reached.');
        }

        const destination = new URL(location, requestUrl).href;
        if (!canFetchLinkPreview(destination)) {
          throw new Error('The preview redirect points to a local or private host.');
        }

        requestUrl = normalizeWebLink(destination).url;
        redirects += 1;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('The website did not return a preview page.');
      }

      return await readResponse(response, requestUrl);
    }
  } catch (error) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    if (controller.signal.aborted) throw createTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function readBoundedHtml(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'text/html' && contentType !== 'application/xhtml+xml') {
    await response.body?.cancel();
    throw new Error('The website did not return HTML.');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('The preview response has no readable body.');
  }

  const decoder = new TextDecoder();
  let html = '';
  let totalBytes = 0;

  try {
    while (totalBytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const remaining = MAX_HTML_BYTES - totalBytes;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      totalBytes += chunk.byteLength;
      html += decoder.decode(chunk, { stream: true });

      if (value.byteLength > remaining) {
        await reader.cancel();
        break;
      }
    }

    html += decoder.decode();
    return html;
  } finally {
    reader.releaseLock();
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
    await response.body?.cancel();
    throw new Error('The oEmbed service did not return JSON.');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('The oEmbed response has no readable body.');

  const decoder = new TextDecoder();
  let body = '';
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_OEMBED_BYTES) {
        await reader.cancel();
        throw new Error('The oEmbed response exceeds the size limit.');
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return JSON.parse(body) as unknown;
}

function isTrustedYouTubeThumbnail(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.port.length === 0 &&
      YOUTUBE_THUMBNAIL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function parseYouTubeOEmbedMetadata(value: unknown, videoUrl: string): LinkPreviewMetadata | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? cleanMetadataText(record.title, 180) : null;
  const author = typeof record.author_name === 'string' ? cleanMetadataText(record.author_name, 120) : null;
  const thumbnail = typeof record.thumbnail_url === 'string'
    ? resolveHttpUrl(record.thumbnail_url, YOUTUBE_OEMBED_ENDPOINT)
    : null;
  const imageUrl = isTrustedYouTubeThumbnail(thumbnail) ? thumbnail : null;

  if (!title && !author && !imageUrl) return null;

  const fallback = fallbackMetadata(videoUrl);
  return {
    title: readableYouTubeFallbackTitle(title ?? fallback.title, videoUrl),
    description: author,
    domain: fallback.domain,
    imageUrl,
    faviconUrl: null,
  };
}

async function getYouTubeOEmbedPreview(
  videoUrl: string,
  signal: AbortSignal | undefined,
  fetcher: LinkPreviewFetcher,
  timeoutMs: number,
): Promise<LinkPreviewMetadata | null> {
  const video = parseYouTubeVideoLink(videoUrl);
  if (!video) return null;

  const endpoint = new URL(YOUTUBE_OEMBED_ENDPOINT);
  endpoint.searchParams.set('url', video.canonicalUrl);
  endpoint.searchParams.set('format', 'json');
  const value = await withSafeResponse(
    endpoint.href,
    signal,
    fetcher,
    'application/json',
    readBoundedJson,
    { timeoutMs },
  );
  return parseYouTubeOEmbedMetadata(value, videoUrl);
}

function applyYouTubeFallbackTitle(metadata: LinkPreviewMetadata, url: string): LinkPreviewMetadata {
  const video = parseYouTubeVideoLink(url);
  return video
    ? { ...metadata, title: readableYouTubeFallbackTitle(metadata.title, video.canonicalUrl) }
    : metadata;
}

export async function getLinkPreview(
  url: string,
  signal?: AbortSignal,
  fetcher: LinkPreviewFetcher = expoFetch,
): Promise<LinkPreviewMetadata> {
  const fallback = fallbackMetadata(url);
  if (!canFetchLinkPreview(url)) {
    return fallback;
  }

  const startedAt = Date.now();
  const remainingTimeout = () => Math.max(0, REQUEST_TIMEOUT_MS - (Date.now() - startedAt));

  if (parseYouTubeVideoLink(url)) {
    try {
      const youtubePreview = await getYouTubeOEmbedPreview(url, signal, fetcher, remainingTimeout());
      if (youtubePreview) return youtubePreview;
    } catch {
      if (signal?.aborted) throw createAbortError();
    }
  }

  try {
    const htmlPreview = await withSafeResponse(
      url,
      signal,
      fetcher,
      'text/html,application/xhtml+xml;q=0.9',
      async (response, responseUrl) =>
        parseLinkPreviewHtml(await readBoundedHtml(response), responseUrl),
      { timeoutMs: remainingTimeout() },
    );
    return applyYouTubeFallbackTitle(htmlPreview, url);
  } catch {
    if (signal?.aborted) {
      throw createAbortError();
    }
    return applyYouTubeFallbackTitle(fallback, url);
  }
}

function getImageType(mimeType: string | null): DownloadedPreviewImage['mimeType'] | null {
  const normalized = mimeType?.split(';')[0].trim().toLowerCase();
  if (
    normalized === 'image/jpeg' ||
    normalized === 'image/png' ||
    normalized === 'image/webp' ||
    normalized === 'image/gif'
  ) {
    return normalized;
  }
  return null;
}

function extensionForImageType(mimeType: DownloadedPreviewImage['mimeType']): DownloadedPreviewImage['extension'] {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'gif';
}

async function readBoundedImage(response: Response, maxBytes = MAX_IMAGE_BYTES): Promise<DownloadedPreviewImage> {
  const mimeType = getImageType(response.headers.get('content-type'));
  if (!mimeType) {
    await response.body?.cancel();
    throw new Error('The preview resource is not a supported image.');
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error('The preview image exceeds the size limit.');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('The preview image has no readable body.');
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error('The preview image exceeds the size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw new Error('The preview image is empty.');
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { bytes, mimeType, extension: extensionForImageType(mimeType) };
}

export async function downloadLinkPreviewImage(
  url: string,
  signal?: AbortSignal,
  fetcher: LinkPreviewFetcher = expoFetch,
): Promise<DownloadedPreviewImage> {
  return withSafeResponse(
    url,
    signal,
    fetcher,
    'image/jpeg,image/png,image/webp,image/gif',
    (response) => readBoundedImage(response),
  );
}

/** Downloads only a small raster site icon through the same URL and redirect protections as previews. */
export async function downloadLinkFaviconImage(
  url: string,
  signal?: AbortSignal,
  fetcher: LinkPreviewFetcher = expoFetch,
): Promise<DownloadedFaviconImage> {
  return withSafeResponse(
    url,
    signal,
    fetcher,
    'image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon,image/ico',
    readBoundedFavicon,
  );
}

async function readBoundedFavicon(response: Response): Promise<DownloadedFaviconImage> {
  const mimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  const allowedTypes = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/x-icon', 'image/vnd.microsoft.icon', 'image/ico',
  ]);
  if (!allowedTypes.has(mimeType)) {
    await response.body?.cancel();
    throw new Error('The favicon resource is not a supported image.');
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FAVICON_BYTES) {
    await response.body?.cancel();
    throw new Error('The favicon exceeds the size limit.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The favicon response has no readable body.');
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_FAVICON_BYTES) {
        await reader.cancel();
        throw new Error('The favicon exceeds the size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0) throw new Error('The favicon is empty.');
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, mimeType };
}
