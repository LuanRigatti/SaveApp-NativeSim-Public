const { canFetchLinkPreview, fallbackLinkTitle, normalizeWebLink } = require('../src/features/home-content/linkValidation');

describe('saved link validation', () => {
  test('normalizes host-only, HTTP and HTTPS addresses', () => {
    expect(normalizeWebLink('  WWW.Example.com  ')).toEqual({
      url: 'https://www.example.com/',
      domain: 'example.com',
    });
    expect(normalizeWebLink('http://example.com/path?q=1')).toMatchObject({
      url: 'http://example.com/path?q=1',
      domain: 'example.com',
    });
    expect(normalizeWebLink('https://EXAMPLE.com:443/')).toMatchObject({
      url: 'https://example.com/',
    });
  });

  test.each(['javascript:alert(1)', 'data:text/html,hi', 'file:///tmp/a', 'https://user:pass@example.com', 'not a host']) (
    'rejects unsafe or malformed address %s',
    (value) => expect(() => normalizeWebLink(value)).toThrow('HTTP or HTTPS'),
  );

  test('allows saving local links while skipping metadata requests to private hosts', () => {
    expect(normalizeWebLink('http://127.0.0.1:3000').url).toBe('http://127.0.0.1:3000/');
    expect(canFetchLinkPreview('http://localhost')).toBe(false);
    expect(canFetchLinkPreview('http://192.168.1.1')).toBe(false);
    expect(canFetchLinkPreview('https://example.com')).toBe(true);
    expect(canFetchLinkPreview('https://8.8.8.8')).toBe(true);
  });

  test('derives a concise title from the final URL path or domain', () => {
    expect(fallbackLinkTitle('https://example.com/articles/saved-notes')).toBe('saved notes');
    expect(fallbackLinkTitle('https://www.example.com/')).toBe('example.com');
  });
});
