export type NormalizedWebLink = {
  url: string;
  domain: string;
};

export class InvalidWebLinkError extends Error {
  constructor() {
    super('Enter a valid HTTP or HTTPS address.');
    this.name = 'InvalidWebLinkError';
  }
}

export function normalizeWebLink(input: string): NormalizedWebLink {
  const trimmed = input.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new InvalidWebLinkError();
  }

  const hasExplicitScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
  const candidate = hasExplicitScheme ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      !url.hostname ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new InvalidWebLinkError();
    }

    return {
      url: url.href,
      domain: url.hostname.replace(/^www\./i, ''),
    };
  } catch {
    throw new InvalidWebLinkError();
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    first >= 224
  );
}

/** Metadata requests skip local/private hosts; saving or opening such a link remains allowed. */
export function canFetchLinkPreview(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '::' ||
      hostname === '::1' ||
      hostname.startsWith('fe80:') ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd')
    ) {
      return false;
    }

    return !isPrivateIpv4(hostname);
  } catch {
    return false;
  }
}

export function fallbackLinkTitle(url: string): string {
  const parsed = new URL(url);
  const lastPathPart = parsed.pathname
    .split('/')
    .filter(Boolean)
    .at(-1)
    ?.replace(/[-_]+/g, ' ')
    .trim();

  if (lastPathPart) {
    try {
      return decodeURIComponent(lastPathPart).slice(0, 120);
    } catch {
      return lastPathPart.slice(0, 120);
    }
  }

  return parsed.hostname.replace(/^www\./i, '').slice(0, 120);
}
