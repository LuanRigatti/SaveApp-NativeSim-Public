const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { shouldKeepHomeToolbarItemsMounted } = require('../src/features/home-content/homeToolbarVisibility');
const rootLayoutSource = readFileSync(join(__dirname, '../src/app/_layout.tsx'), 'utf8');
const gallerySource = readFileSync(join(__dirname, '../src/components/photos/PhotoMasonryGallery.tsx'), 'utf8');
const tabsLayoutSource = readFileSync(join(__dirname, '../src/app/(tabs)/_layout.tsx'), 'utf8');

describe('Home native toolbar item visibility', () => {
  test('keeps the Home toolbar items mounted on Home and saved-content detail routes', () => {
    for (const pathname of [
      '/',
      '/links/123',
      '/photos/123',
      '/videos/123',
      '/texts/123',
      '/documents/123',
      '/folders/folder-123',
      '/folders/folder-123/',
      '/texts/compose',
      '/links/123/',
      '/checklists/compose',
      '/checklists/compose/',
      '/checklists/123',
      '/checklists/123/',
    ]) {
      expect(shouldKeepHomeToolbarItemsMounted(pathname)).toBe(true);
    }
  });

  test('registers document details in the Root Native Stack and promotes the gallery preview to them', () => {
    expect(rootLayoutSource).toMatch(/name="documents\/\[id\]"/);
    expect(gallerySource).toMatch(/pathname: '\/documents\/\[id\]'/);
  });

  test('keeps both native Home toolbar controls declared and mounted across checklist routes', () => {
    expect(rootLayoutSource).toMatch(/name="checklists\/compose"/);
    expect(rootLayoutSource).toMatch(/name="checklists\/\[id\]"/);
    expect(tabsLayoutSource).toMatch(/Stack\.Toolbar\.Button[\s\S]*?hidden=\{!shouldShowHomeToolbarItems\}/);
    expect(tabsLayoutSource).toMatch(/createHomeFolderToolbarMenu\([\s\S]*?hidden:\s*!shouldShowHomeToolbarItems/);
  });

  test('hides Home toolbar items on other tabs and unrelated detail routes', () => {
    for (const pathname of ['/collections', '/search', '/settings', '/details/123', '/links', '/checklists']) {
      expect(shouldKeepHomeToolbarItemsMounted(pathname)).toBe(false);
    }
  });
});
