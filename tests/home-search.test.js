/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  createHomeSearchIndex,
  filterHomeItemsBySearch,
  filterHomeSearchIndex,
  normalizeHomeSearchText,
  supportsNativeHomeSearch,
} = require('../src/features/home-content/homeSearch');
const { filterHomeFavoriteItems } = require('../src/features/home-content/homeFavorites');
const { getHomeViewLayout } = require('../src/features/home-content/homeViewMode');
const { filterHomeFolderItems } = require('../src/features/home-folders/homeFolderTypes');

const homeSource = readFileSync(join(__dirname, '../src/app/(tabs)/index.tsx'), 'utf8');
const tabsLayoutSource = readFileSync(join(__dirname, '../src/app/(tabs)/_layout.tsx'), 'utf8');
const rootLayoutSource = readFileSync(join(__dirname, '../src/app/_layout.tsx'), 'utf8');
const gallerySource = readFileSync(join(__dirname, '../src/components/photos/PhotoMasonryGallery.tsx'), 'utf8');

const searchableItems = [
  { id: 1, mediaType: 'photo', customTitle: 'Café da manhã', mimeType: 'image/jpeg' },
  { id: 2, mediaType: 'video', mimeType: 'video/mp4' },
  { id: 3, contentType: 'link', title: 'Vídeo favorito', domain: 'exemplo.com', url: 'https://exemplo.com/video', normalizedUrl: 'https://exemplo.com/video', description: 'Uma descrição' },
  { id: 4, contentType: 'text', text: 'Anotações sobre São Paulo' },
  { id: 5, contentType: 'document', originalName: 'Relatório anual.pdf', mimeType: 'application/pdf', extension: 'pdf', textExcerpt: 'Resumo financeiro' },
  { id: 6, contentType: 'checklist', title: 'Compras', previewTasks: [{ text: 'Pão francês', isCompleted: false }] },
];

describe('Home local search', () => {
  test('normalizes case, accents, and repeated whitespace', () => {
    expect(normalizeHomeSearchText('  CAFÉ   de São   Paulo ')).toBe('cafe de sao paulo');
    expect(filterHomeItemsBySearch(searchableItems, 'cafe')).toEqual([searchableItems[0]]);
    expect(filterHomeItemsBySearch(searchableItems, 'pao frances')).toEqual([searchableItems[5]]);
  });

  test('restores the original item set for an empty or whitespace-only query', () => {
    expect(filterHomeItemsBySearch(searchableItems, '')).toBe(searchableItems);
    expect(filterHomeItemsBySearch(searchableItems, '   ')).toBe(searchableItems);
  });

  test('reuses a normalized in-memory index across keystrokes', () => {
    const index = createHomeSearchIndex(searchableItems);
    expect(filterHomeSearchIndex(index, 'cafe')).toEqual([searchableItems[0]]);
    expect(filterHomeSearchIndex(index, 'relatorio')).toEqual([searchableItems[4]]);
    expect(filterHomeSearchIndex(index, '')).toBe(searchableItems);
  });

  test('searches only textual fields available for each saved content type', () => {
    expect(filterHomeItemsBySearch(searchableItems, 'image/jpeg').map(({ id }) => id)).toEqual([1]);
    expect(filterHomeItemsBySearch(searchableItems, 'video/mp4').map(({ id }) => id)).toEqual([2]);
    expect(filterHomeItemsBySearch(searchableItems, 'exemplo.com').map(({ id }) => id)).toEqual([3]);
    expect(filterHomeItemsBySearch(searchableItems, 'https://exemplo.com/video').map(({ id }) => id)).toEqual([3]);
    expect(filterHomeItemsBySearch(searchableItems, 'sao paulo').map(({ id }) => id)).toEqual([4]);
    expect(filterHomeItemsBySearch(searchableItems, 'relatorio anual').map(({ id }) => id)).toEqual([5]);
    expect(filterHomeItemsBySearch(searchableItems, 'financeiro').map(({ id }) => id)).toEqual([5]);
    expect(filterHomeItemsBySearch(searchableItems, 'compras').map(({ id }) => id)).toEqual([6]);
  });

  test('does not search private paths, preview URIs, or other non-text metadata', () => {
    const item = {
      ...searchableItems[0],
      relativePath: 'private-folder/secret-name.jpg',
      uri: 'file:///private-folder/secret-name.jpg',
    };
    expect(filterHomeItemsBySearch([item], 'secret-name')).toEqual([]);
  });

  test('applies search after the existing folder, favorite, and protected-folder filters', () => {
    const itemKey = (type, id) => `${type}:${id}`;
    const folderIds = new Map([[itemKey('link', 3), 'locked'], [itemKey('text', 4), 'open']]);
    const protectedIds = new Set(['locked']);
    const folderItems = filterHomeFolderItems(
      searchableItems,
      { kind: 'folder', folderId: 'locked' },
      folderIds,
      protectedIds,
      new Set(),
    );
    expect(filterHomeItemsBySearch(folderItems, 'video')).toEqual([]);
    const authorizedFolderItems = filterHomeFolderItems(
      searchableItems,
      { kind: 'folder', folderId: 'locked' },
      folderIds,
      protectedIds,
      new Set(['locked']),
    );
    expect(filterHomeItemsBySearch(authorizedFolderItems, 'video')).toEqual([searchableItems[2]]);

    const favoriteItems = filterHomeFavoriteItems(
      searchableItems,
      new Set([itemKey('link', 3), itemKey('text', 4)]),
      folderIds,
      protectedIds,
      new Set(),
      true,
    );
    expect(filterHomeItemsBySearch(favoriteItems, 'anotacoes')).toEqual([searchableItems[3]]);
    expect(filterHomeItemsBySearch(favoriteItems, 'video')).toEqual([]);
  });

  test('uses the same search-filtered gallery data for all five existing layouts', () => {
    const modes = ['large', 'small', 'list', 'compact-list', 'single-line'];
    for (const mode of modes) expect(getHomeViewLayout(mode)).toBeDefined();
    expect(gallerySource).toMatch(/createHomeSearchIndex\(folderAndFavoriteFilteredItems\)/);
    expect(gallerySource).toMatch(/filterHomeSearchIndex\(homeSearchIndex, searchQuery\)/);
    expect(gallerySource).toMatch(/buildHomeGalleryEntriesWhenReady\(filteredItems/);
    expect(gallerySource).toMatch(/data=\{entries\}/);
  });

  test('uses the native iOS 26 search slot and retains the original plus menu actions', () => {
    expect(supportsNativeHomeSearch('ios', '26.0')).toBe(true);
    expect(supportsNativeHomeSearch('ios', 26)).toBe(true);
    expect(supportsNativeHomeSearch('ios', 25)).toBe(false);
    expect(supportsNativeHomeSearch('android', 35)).toBe(false);
    expect(tabsLayoutSource).toContain('allowToolbarIntegration');
    expect(tabsLayoutSource).toContain('placeholder="Buscar"');
    expect(tabsLayoutSource).toContain('placement="integrated"');
    expect(tabsLayoutSource).not.toContain('placement="integratedButton"');
    expect(tabsLayoutSource).toContain('hideWhenScrolling={false}');
    expect(tabsLayoutSource).toContain('<Stack.SearchBar');
    expect(tabsLayoutSource).toContain('<HomeSearchProvider>');
    expect(homeSource).not.toContain('<Stack.SearchBar');
    expect(homeSource).toContain('<Stack.Toolbar.SearchBarSlot');
    const searchSlot = homeSource.match(/<Stack\.Toolbar\.SearchBarSlot([\s\S]*?)\/>/);
    expect(searchSlot).not.toBeNull();
    expect(searchSlot[1]).not.toMatch(/separateBackground/);
    expect(homeSource).toMatch(/<Stack\.Toolbar placement="bottom">[\s\S]*?<Stack\.Toolbar\.SearchBarSlot[\s\S]*?<Stack\.Toolbar\.Spacer\s*\/>[\s\S]*?<Stack\.Toolbar\.Menu[\s\S]*?separateBackground/);
    for (const action of ['Adicionar imagens', 'Adicionar vídeos', 'Adicionar link', 'Adicionar texto', 'Adicionar arquivos', 'Adicionar lista']) {
      expect(homeSource).toContain(action);
    }
    expect(tabsLayoutSource).toContain("onCancelButtonPress={() => setSearchQuery('')}");
    expect(rootLayoutSource).toContain('<Stack.Screen name="(tabs)" />');
  });

  test('searches only active Home catalogs and reports an empty query result', () => {
    expect(gallerySource).toContain("'Nenhum resultado encontrado'");
    expect(gallerySource).toMatch(/const allItems = \[\.\.\.media, \.\.\.contents, \.\.\.documents, \.\.\.checklists\]/);
    expect(gallerySource).not.toContain('useLocalTrash');
    expect(homeSource).toContain("hidden={view === 'folders' && !favoritesOnly}");
  });
});
