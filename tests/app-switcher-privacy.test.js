/* global describe, expect, test */

const fs = require('node:fs');
const path = require('node:path');
const {
  shouldCoverAppSwitcherPreview,
} = require('../src/features/home-folders/appSwitcherPrivacy');

const repositoryRoot = path.resolve(__dirname, '..');
const rootLayout = fs.readFileSync(path.join(repositoryRoot, 'src/app/_layout.tsx'), 'utf8');
const folders = [
  { id: 'private-folder', isProtected: true },
  { id: 'regular-folder', isProtected: false },
];

function evaluate(overrides = {}) {
  return shouldCoverAppSwitcherPreview({
    pathname: '/',
    selection: { kind: 'view', view: 'all-items' },
    folders,
    folderIdByItemKey: new Map(),
    isFolderCatalogReady: true,
    ...overrides,
  });
}

describe('App Switcher privacy cover', () => {
  test('leaves ordinary Home and content previews visible', () => {
    expect(evaluate()).toBe(false);
    expect(evaluate({ pathname: '/documents/20' })).toBe(false);
    expect(evaluate({ pathname: '/checklists/4' })).toBe(false);
    expect(evaluate({ pathname: '/(tabs)/index' })).toBe(false);
  });

  test('covers a protected folder route or protected folder filter', () => {
    expect(evaluate({ pathname: '/folders/private-folder' })).toBe(true);
    expect(evaluate({
      selection: { kind: 'folder', folderId: 'private-folder' },
    })).toBe(true);
  });

  test('covers the App Switcher while an authorized protected trash title is visible', () => {
    expect(evaluate({ hasAuthorizedProtectedTrashContent: true })).toBe(true);
  });

  test('keeps ordinary folders and the folder overview visible', () => {
    expect(evaluate({ pathname: '/folders/regular-folder' })).toBe(false);
    expect(evaluate({
      selection: { kind: 'view', view: 'folders' },
    })).toBe(false);
    expect(evaluate({
      pathname: '/collections',
      selection: { kind: 'folder', folderId: 'private-folder' },
    })).toBe(false);
  });

  test('covers saved-item routes assigned to protected folders', () => {
    const protectedAssignments = new Map([
      ['photo:1', 'private-folder'],
      ['video:2', 'private-folder'],
      ['link:3', 'private-folder'],
      ['text:4', 'private-folder'],
      ['document:5', 'private-folder'],
      ['checklist:6', 'private-folder'],
    ]);

    for (const [route, itemId] of [
      ['photos', 1],
      ['videos', 2],
      ['links', 3],
      ['texts', 4],
      ['documents', 5],
      ['checklists', 6],
    ]) {
      expect(evaluate({
        pathname: `/${route}/${itemId}`,
        folderIdByItemKey: protectedAssignments,
      })).toBe(true);
    }
  });

  test('fails closed while associations are not ready or point to a missing folder', () => {
    expect(evaluate({
      pathname: '/documents/20',
      isFolderCatalogReady: false,
    })).toBe(true);
    expect(evaluate({
      pathname: '/documents/20',
      folderIdByItemKey: new Map([['document:20', 'missing-folder']]),
    })).toBe(true);
    expect(evaluate({ pathname: '/folders/deleted-folder' })).toBe(true);
  });

  test('renders the privacy cover only for an inactive sensitive screen', () => {
    expect(rootLayout).toContain('!isAppActive && shouldCoverPreview ?');
    expect(rootLayout).not.toMatch(/!isAppActive\s*\?/);
  });
});
