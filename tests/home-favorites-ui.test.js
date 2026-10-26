/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const read = (path) => readFileSync(join(__dirname, path), 'utf8');
const toolbar = read('../src/app/(tabs)/_layout.tsx');
const home = read('../src/app/(tabs)/index.tsx');
const gallery = read('../src/components/photos/PhotoMasonryGallery.tsx');
const migration = read('../src/features/home-content/favoritesSchemaMigration.ts');

describe('Home favorites UI and privacy contract', () => {
  test('places independent star and existing folder menu controls directly in one native toolbar group', () => {
    const rightToolbar = toolbar.split('<Stack.Toolbar placement="right">')[1]?.split('</Stack.Toolbar>')[0] ?? '';
    const starIndex = rightToolbar.indexOf('<Stack.Toolbar.Button');
    const folderMenuIndex = rightToolbar.indexOf('{createHomeFolderToolbarMenu(');

    expect(starIndex).toBeGreaterThan(-1);
    expect(folderMenuIndex).toBeGreaterThan(starIndex);
    expect(rightToolbar).toContain("icon={favoritesOnly ? 'star.fill' : 'star'}");
    expect(rightToolbar).toContain('selected={favoritesOnly}');
    expect(rightToolbar).toContain('separateBackground={false}');
    expect(rightToolbar).toContain('disabled={!favoritesReady}');
    expect(rightToolbar).not.toMatch(/<Stack\.Toolbar\.View|<Host|<Pressable/);
    expect(rightToolbar.match(/<Stack\.Toolbar\.Button/g)).toHaveLength(1);
    expect(toolbar).toContain('setFavoritesOnly(false)');
    expect(toolbar).toContain('createHomeFolderToolbarMenu({');
    expect(read('../src/features/home-folders/homeFolderToolbarMenu.tsx')).toContain('separateBackground={false}');
  });

  test('provides separate accessible star and folder hit areas in non-iOS fallbacks', () => {
    for (const path of [
      '../src/features/home-folders/HomeFolderFilterButton.native.tsx',
      '../src/features/home-folders/HomeFolderFilterButton.tsx',
    ]) {
      const fallback = read(path);
      expect(fallback).toContain('borderRadius: theme.radius.pill');
      expect(fallback).toContain("name={favoritesOnly ? 'star' : 'star-outline'}");
      expect(fallback).toContain('Selecionar pasta. Atual: ${currentLabel}.');
      expect(fallback).toContain('Desativar Favoritos');
      expect(fallback).toContain('Mostrar Favoritos');
      expect(fallback.match(/accessibilityRole="button"/g)?.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('uses the same derived Favorites title and only filters the shared gallery', () => {
    expect(home).toContain('getHomeTitleForFavorites(getHomeFolderHomeTitle(selection, folders), favoritesOnly)');
    expect(home).toMatch(/favoriteKeys=\{favoriteKeys\}[\s\S]*?favoritesOnly=\{favoritesOnly\}/);
    expect(home).toContain("hidden={view !== 'folders' || favoritesOnly}");
    expect(gallery).toContain('filterHomeFavoriteItems(');
    expect(gallery).toContain("? 'Nenhum favorito ainda'");
    expect(gallery).toMatch(/filterHomeFavoriteItems\([\s\S]*?accessibleUnlockedFolderIds,[\s\n]*homeFoldersReady/);
  });

  test('adds the same conditional favorite action to native and fallback item menus', () => {
    expect(gallery).toContain("currentlyFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'");
    expect(gallery).toContain("currentlyFavorite ? 'star.slash' : 'star'");
    expect(gallery).toContain('createFavoriteAction(itemType, itemId)');
    for (const contentType of ['item.mediaType', "'link'", "'text'", "'document'", "'checklist'"]) {
      expect(gallery).toContain(`renderFavoriteMenuAction(${contentType},`);
    }
    expect(gallery).toContain('onPress: withItemAuthorization(itemType, itemId, async () =>');
    expect(gallery).toMatch(/createFavoriteAction[\s\S]*?withItemAuthorization\(itemType, itemId/);
    expect(read('../src/app/(tabs)/_layout.tsx')).toMatch(/const handleFavoritesPress[\s\S]*?setFavoritesOnly\(!favoritesOnly\)[\s\S]*?router\.dismissTo\('\/'\)/);
  });

  test('does not clear Favorites when Face ID cancels a protected folder selection', () => {
    const layout = read('../src/app/(tabs)/_layout.tsx');
    expect(layout).toMatch(/const outcome = await authorizeFolder\(folderId\);[\s\S]*?if \(outcome !== 'authenticated' \|\| !isFolderAuthorized\(folderId\)\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?setFavoritesOnly\(false\)/);
  });

  test('stores associations separately and removes them only when an item is permanently deleted', () => {
    expect(migration).toContain('SAVED_FAVORITES_SCHEMA_VERSION = 10');
    expect(migration).toContain('CREATE TABLE saved_favorite_items');
    expect(migration).toContain('PRIMARY KEY (item_type, item_id)');
    expect(migration).toMatch(/AFTER DELETE ON photos[\s\S]*?DELETE FROM saved_favorite_items/);
    expect(migration).toMatch(/AFTER DELETE ON saved_content[\s\S]*?DELETE FROM saved_favorite_items/);
    expect(migration).toMatch(/AFTER DELETE ON saved_documents[\s\S]*?DELETE FROM saved_favorite_items/);
    expect(migration).toMatch(/AFTER DELETE ON saved_checklists[\s\S]*?DELETE FROM saved_favorite_items/);
  });
});
