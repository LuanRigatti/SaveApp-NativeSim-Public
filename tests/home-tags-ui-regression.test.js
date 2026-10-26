/* global describe, expect, test */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('saved tag UI integration', () => {
  test('native settings reuse the existing palette for label management', () => {
    const nativeSettings = read('src/components/native/HomeSettingsBottomSheet.ios.tsx');
    const fallbackSettings = read('src/app/settings-sheet-fallback.tsx');
    const settingsProvider = read('src/features/home-content/HomeSettingsSheetProvider.tsx');

    expect(nativeSettings).toContain('<NavigationLink value="tags">');
    expect(nativeSettings).toContain('<NavigationDestination value="tags">');
    expect(nativeSettings).toContain('getAccentColorRows().map');
    expect(nativeSettings).toContain('createSavedTag');
    expect(nativeSettings).toContain('updateSavedTag');
    expect(nativeSettings).toContain('deleteSavedTag');
    expect(fallbackSettings).toContain("page === 'tags'");
    expect(fallbackSettings).toContain('notifySavedTagsChanged');
    expect(settingsProvider).toContain("initialPage?: 'root' | 'folders' | 'tags'");
  });

  test('all saved content menu branches expose label assignment and management', () => {
    const gallery = read('src/components/photos/PhotoMasonryGallery.tsx');

    for (const itemType of ['link', 'text', 'document', 'checklist']) {
      expect(gallery).toContain(`renderSavedTagSubmenu('${itemType}'`);
    }
    expect(gallery).toContain('renderSavedTagSubmenu(item.mediaType, item.id)');
    expect(gallery).toContain('<Link.Menu icon="tag" title="Etiquetas">');
    expect(gallery).toContain('Gerenciar etiquetas');
    expect(gallery).toContain('openTagPicker({ itemType, itemId })');
  });

  test('color dots are gated to a specific folder and use existing card/list metadata rows', () => {
    const gallery = read('src/components/photos/PhotoMasonryGallery.tsx');
    const gridCard = read('src/components/homeContent/HomeGridCard.tsx');
    const dots = read('src/components/homeContent/HomeTagDots.tsx');
    const presentation = read('src/features/home-tags/tagPresentation.ts');

    expect(gallery).toContain("getVisibleSavedTagDots(folderFilter.kind === 'folder'");
    expect(gallery).toContain("if (!homeFoldersReady || !isAppActive || !isTagAppActive || hidden || AppState.currentState !== 'active') return null;");
    expect(gallery).toContain('tagAssignmentData.scopeKey === tagQueryScopeKey');
    expect(gridCard).toContain('tagDots?: readonly SavedTagAssignment[]');
    expect(gridCard).toContain('<HomeTagDots tags={tagDots} />');
    expect(dots).toContain('height: 6');
    expect(dots).toContain('width: 6');
    expect(presentation).toContain('assignments.slice(0, HOME_FOLDER_TAG_DOT_LIMIT)');
    expect(presentation).toContain('HOME_FOLDER_TAG_DOT_LIMIT = 2');
  });

  test('Face ID authorization is rechecked against the folder assignment and lock epoch', () => {
    const gallery = read('src/components/photos/PhotoMasonryGallery.tsx');
    const authorization = gallery.slice(
      gallery.indexOf('const authorizeTagOperation'),
      gallery.indexOf('const toggleSavedTag'),
    );

    expect(authorization).toContain('getHomeFolderItemAssignment(itemType, itemId)');
    expect(authorization).toContain('authorizeFolder(initialFolder.id)');
    expect(authorization).toContain('isFolderAuthorized(currentFolder.id)');
    expect(authorization).toContain('lockEpoch === operationEpoch');
    expect(authorization).toContain('isAppActive');
  });
});
