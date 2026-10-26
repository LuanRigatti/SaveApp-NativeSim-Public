/* global __dirname, describe, expect, test */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const gallerySource = readFileSync(
  join(__dirname, '../src/components/photos/PhotoMasonryGallery.tsx'),
  'utf8',
);
const previewSource = readFileSync(
  join(__dirname, '../src/components/homeContent/SavedLinkPreviewContent.tsx'),
  'utf8',
);
const detailSource = readFileSync(join(__dirname, '../src/app/links/[id].tsx'), 'utf8');
const { getLinkPreviewSize } = require('../src/features/home-content/linkPreviewLayout');

describe('saved link native preview', () => {
  test('sizes image and text previews without reserving empty image space', () => {
    const withImageAndDescription = getLinkPreviewSize(390, true, true);
    const withoutImage = getLinkPreviewSize(390, false, true);
    const withoutDescription = getLinkPreviewSize(390, false, false);

    expect(withImageAndDescription.width).toBe(342);
    expect(withImageAndDescription.height).toBe(Math.round((342 * 9) / 16) + 180);
    expect(withoutImage.height).toBe(180);
    expect(withoutDescription.height).toBe(112);
    expect(getLinkPreviewSize(320, true, false).width).toBe(272);
  });

  test('uses the native Link.Preview with locally cached metadata in all link card layouts', () => {
    expect(gallerySource).toMatch(/<Link\.Trigger>\{contentTrigger\}<\/Link\.Trigger>[\s\S]*?<Link\.Preview style=\{previewSize\}>/);
    expect(gallerySource).toMatch(/<SavedLinkPreviewContent link=\{item\} width=\{previewSize\.width\} \/>/);
    expect(previewSource).toMatch(/source=\{\{ uri: link\.previewImageUri! \}\}/);
    expect(previewSource).toMatch(/\{link\.title \|\| link\.domain\}/);
    expect(previewSource).toMatch(/link\.description\.trim\(\)/);
    expect(previewSource).toMatch(/\{link\.domain\}/);
    expect(previewSource).not.toMatch(/imageUrl|fetch\(/);
  });

  test('confirms native card taps before opening the original URL and keeps preview navigation recoverable', () => {
    expect(gallerySource).toMatch(/pathname: '\/links\/\[id\]'[\s\S]*?params: \{ id: String\(item\.id\) \}/);
    expect(gallerySource).toContain("import { confirmSavedLinkOpen } from '@/features/home-content/savedLinkOpenConfirmation';");
    expect(gallerySource).toMatch(/event\.preventDefault\(\);\s*requestOpenLink\(\)/);
    expect(gallerySource).toMatch(/confirmSavedLinkOpen\(async \(\) => \{\s*if \(!\(await authorizeItemForAction\('link', savedLink\.id\)\)\) return;\s*await Linking\.openURL\(savedLink\.url\)\.catch\(\(\) => undefined\);/);
    expect(detailSource).toContain("import { confirmSavedLinkOpen } from '@/features/home-content/savedLinkOpenConfirmation';");
    expect(detailSource).toMatch(/confirmSavedLinkOpen\(openLink\)/);
    expect(detailSource).toMatch(/await Linking\.openURL\(link\.url\)/);
    expect(detailSource).toMatch(/Abrir link/);
    expect(detailSource).toMatch(/useLocalSavedContent\(\)/);
  });

  test('preserves the existing destructive link delete action', () => {
    expect(gallerySource).toMatch(/<Link\.MenuAction title="Apagar link" icon="trash" destructive onPress=\{deleteItem\} \/>/);
    expect(gallerySource).toMatch(/requestDeleteContent\([\s\S]*?item\.contentType,[\s\S]*?prepareForMediaRemovalAnimation,[\s\S]*?authorizeItemForAction\(item\.contentType, item\.id\)/);
  });
});
