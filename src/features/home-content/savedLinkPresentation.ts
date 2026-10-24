import type { SavedLink } from './homeContentTypes';

export type SavedLinkPresentation = {
  sourceLabel: string;
  primaryText: string;
  secondaryText: string | null;
};

type SavedLinkPresentationInput = Pick<
  SavedLink,
  'url' | 'normalizedUrl' | 'title' | 'description' | 'domain'
>;

type LinkPlatform = 'instagram' | 'x' | 'youtube' | 'tiktok' | 'generic';

const PRESENTATION_TEXT_LIMIT = 110;
const SECONDARY_TEXT_LIMIT = 88;

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function truncateText(value: string, limit: number): string {
  const characters = Array.from(value);
  if (characters.length <= limit) return value;

  const prefix = characters.slice(0, limit - 1).join('');
  const lastSpace = prefix.lastIndexOf(' ');
  const readablePrefix = lastSpace >= limit * 0.65 ? prefix.slice(0, lastSpace) : prefix;
  return `${readablePrefix.trimEnd()}…`;
}

function getHostname(link: SavedLinkPresentationInput): string {
  for (const candidate of [link.normalizedUrl, link.url]) {
    try {
      const parsed = new URL(candidate);
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname) {
        return parsed.hostname.toLowerCase().replace(/\.$/, '');
      }
    } catch {
      // Fall back to the persisted domain when a saved URL cannot be parsed.
    }
  }

  return cleanText(link.domain)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/:?#]/, 1)[0]
    .toLowerCase()
    .replace(/\.$/, '');
}

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function detectPlatform(hostname: string): LinkPlatform {
  if (hostMatches(hostname, 'instagram.com')) return 'instagram';
  if (hostMatches(hostname, 'x.com') || hostMatches(hostname, 'twitter.com')) return 'x';
  if (hostMatches(hostname, 'youtube.com') || hostname === 'youtu.be') return 'youtube';
  if (hostMatches(hostname, 'tiktok.com')) return 'tiktok';
  return 'generic';
}

function getSourceLabel(platform: LinkPlatform, hostname: string): string {
  switch (platform) {
    case 'instagram':
      return 'Instagram';
    case 'x':
      return 'X';
    case 'youtube':
      return 'YouTube';
    case 'tiktok':
      return 'TikTok';
    default:
      return hostname.replace(/^www\./i, '') || 'Link';
  }
}

function stripPlatformSuffix(title: string, platform: LinkPlatform): string {
  const suffixes: Partial<Record<LinkPlatform, RegExp>> = {
    instagram: /\s*(?:\||•|·|–|—|-)?\s*Instagram(?:\s+photos and videos)?\s*$/i,
    x: /\s*(?:\||•|·|–|—|-)?\s*(?:X|Twitter)\s*$/i,
    youtube: /\s*(?:\||•|·|–|—|-)?\s*YouTube\s*$/i,
    tiktok: /\s*(?:\||•|·|–|—|-)?\s*TikTok\s*$/i,
  };
  const suffix = suffixes[platform];
  return suffix ? title.replace(suffix, '').trim() : title;
}

function isPlatformOnlyTitle(value: string, platform: LinkPlatform): boolean {
  const labels: Partial<Record<LinkPlatform, RegExp>> = {
    instagram: /^Instagram(?:\s+photos and videos)?$/i,
    x: /^(?:X|Twitter)$/i,
    youtube: /^YouTube$/i,
    tiktok: /^TikTok$/i,
  };
  return labels[platform]?.test(value) ?? false;
}

function getPlatformTitleAndSubtitle(
  title: string,
  description: string,
  platform: LinkPlatform,
): { primaryText: string; secondaryText: string } {
  if (platform === 'instagram') {
    const authorAndCaption = title.match(/^(.+?)\s+on Instagram:\s*(.+)$/i);
    if (authorAndCaption) {
      return { primaryText: authorAndCaption[1].trim(), secondaryText: authorAndCaption[2].trim() };
    }

    const author = title.match(
      /^(.+?)\s+(?:on Instagram|(?:\||•|·|–|—|-)\s*Instagram(?:\s+photos and videos)?)$/i,
    );
    if (author) {
      return { primaryText: author[1].trim(), secondaryText: description };
    }
  }

  if (platform === 'x') {
    const authorAndPost = title.match(/^(.+?)\s+on\s+(?:X|Twitter):\s*(.+)$/i);
    if (authorAndPost) {
      return { primaryText: authorAndPost[1].trim(), secondaryText: authorAndPost[2].trim() };
    }

    const author = title.match(/^(.+?)\s+on\s+(?:X|Twitter)$/i);
    if (author) {
      return { primaryText: author[1].trim(), secondaryText: description };
    }
  }

  const primaryText = stripPlatformSuffix(title, platform) || title;
  if (isPlatformOnlyTitle(primaryText, platform) && description) {
    return { primaryText: description, secondaryText: '' };
  }

  return { primaryText, secondaryText: description };
}

export function getSavedLinkPresentation(link: SavedLinkPresentationInput): SavedLinkPresentation {
  const hostname = getHostname(link);
  const platform = detectPlatform(hostname);
  const sourceLabel = getSourceLabel(platform, hostname);
  const originalTitle = cleanText(link.title) || sourceLabel;
  const description = cleanText(link.description);
  const { primaryText, secondaryText } = getPlatformTitleAndSubtitle(
    originalTitle,
    description,
    platform,
  );
  const normalizedPrimary = cleanText(primaryText) || originalTitle;
  const normalizedSecondary = cleanText(secondaryText);
  const distinctSecondary =
    normalizedSecondary && normalizedSecondary.toLowerCase() !== normalizedPrimary.toLowerCase()
      ? normalizedSecondary
      : '';

  return {
    sourceLabel,
    primaryText: truncateText(normalizedPrimary, PRESENTATION_TEXT_LIMIT),
    secondaryText: distinctSecondary ? truncateText(distinctSecondary, SECONDARY_TEXT_LIMIT) : null,
  };
}
