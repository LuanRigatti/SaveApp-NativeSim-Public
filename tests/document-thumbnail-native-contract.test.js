/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const moduleConfig = JSON.parse(
  readFileSync(join(__dirname, '../modules/document-thumbnailing/expo-module.config.json'), 'utf8'),
);
const modulePackage = JSON.parse(
  readFileSync(join(__dirname, '../modules/document-thumbnailing/package.json'), 'utf8'),
);
const podspecSource = readFileSync(
  join(__dirname, '../modules/document-thumbnailing/ios/SaveAppDocumentThumbnailing.podspec'),
  'utf8',
);
const swiftSource = readFileSync(
  join(__dirname, '../modules/document-thumbnailing/ios/SaveAppDocumentThumbnailingModule.swift'),
  'utf8',
);
const nativeVerificationSource = readFileSync(join(__dirname, '../scripts/verify-saveapp-native.js'), 'utf8');

describe('QuickLookThumbnailing local Apple module contract', () => {
  test('is an Apple-only local Expo module and uses the official asynchronous module API', () => {
    expect(moduleConfig.platforms).toEqual(['apple']);
    expect(moduleConfig.apple.modules).toEqual(['SaveAppDocumentThumbnailingModule']);
    expect(moduleConfig.apple.podspecPath).toBe('ios/SaveAppDocumentThumbnailing.podspec');
    expect(modulePackage.name).toBe('saveapp-document-thumbnailing');
    expect(modulePackage.private).toBe(true);
    expect(podspecSource).toMatch(/s\.dependency 'ExpoModulesCore'/);
    expect(podspecSource).toMatch(/:ios => '16\.4'/);
    expect(podspecSource).toMatch(/QuickLookThumbnailing/);
    expect(swiftSource).toMatch(/import QuickLookThumbnailing/);
    expect(swiftSource).toMatch(/AsyncFunction\("generateThumbnailAsync"\)/);
  });

  test('accepts only private SaveApp document paths and asks Quick Look for real thumbnails', () => {
    expect(swiftSource).toMatch(/\^documents\/document-/);
    expect(swiftSource).toMatch(/resolvingSymlinksInPath/);
    expect(swiftSource).toMatch(/attributes\[\.type\].*\.typeRegular/s);
    expect(swiftSource).toMatch(/representationTypes: \[\.thumbnail\]/);
    expect(swiftSource).toMatch(/request\.iconMode = false/);
    expect(swiftSource).toMatch(/representation\.type == \.thumbnail/);
    expect(swiftSource).not.toMatch(/representationTypes: \[[^\]]*\.icon/);
  });

  test('bounds thumbnail dimensions and writes JPEG within the app private Documents directory', () => {
    expect(swiftSource).toMatch(/size: CGSize\(width: 768, height: 768\)/);
    expect(swiftSource).toMatch(/maximumThumbnailPixels = 1_536/);
    expect(swiftSource).toMatch(/maximumThumbnailBytes = 2 \* 1024 \* 1024/);
    expect(swiftSource).toMatch(/jpegData\(compressionQuality:/);
    expect(swiftSource).toMatch(/document-thumbnails\/document-/);
    expect(swiftSource).not.toMatch(/promise\.resolve\([^\n]*data/);
  });

  test('SDK 58 autolinking verification requires the exact local pod and Swift module', () => {
    expect(nativeVerificationSource).toMatch(/expo-modules-autolinking/);
    expect(nativeVerificationSource).toMatch(/saveapp-document-thumbnailing/);
    expect(nativeVerificationSource).toMatch(/SaveAppDocumentThumbnailing/);
    expect(nativeVerificationSource).toMatch(/modules\/document-thumbnailing\/ios/);
  });
});
