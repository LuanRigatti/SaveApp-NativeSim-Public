/* global describe, expect, test */

const {
  getHomeFolderIdFromPathname,
  getHomeFolderRoute,
} = require('../src/features/home-folders/homeFolderNavigation');

describe('stable Home folder navigation', () => {
  test('builds the shared Native Stack route using a folder ID', () => {
    expect(getHomeFolderRoute('folder-123')).toEqual({
      pathname: '/folders/[id]',
      params: { id: 'folder-123' },
    });
  });

  test('reads encoded IDs from the folder route and rejects unrelated paths', () => {
    expect(getHomeFolderIdFromPathname('/folders/folder%3A123')).toBe('folder:123');
    expect(getHomeFolderIdFromPathname('/folders/folder-123/')).toBe('folder-123');
    expect(getHomeFolderIdFromPathname('/documents/123')).toBeNull();
    expect(getHomeFolderIdFromPathname('/folders/%E0%A4%A')).toBeNull();
  });
});
