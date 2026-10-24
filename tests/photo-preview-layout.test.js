const { getPhotoPreviewSize } = require('../src/features/photos/photoPreviewLayout');

describe('photo preview dimensions', () => {
  test.each([
    ['wide landscape', 4000, 1000],
    ['portrait', 900, 1600],
    ['square', 1200, 1200],
    ['very tall', 600, 2400],
  ])('keeps %s inside the native preview bounds without cropping', (_name, width, height) => {
    const preview = getPhotoPreviewSize(width, height, 320, 480);

    expect(preview.width).toBeGreaterThan(0);
    expect(preview.height).toBeGreaterThan(0);
    expect(preview.width).toBeLessThanOrEqual(320);
    expect(preview.height).toBeLessThanOrEqual(480);
    expect(preview.width / preview.height).toBeCloseTo(width / height, 2);
  });

  test('returns safe finite dimensions for invalid metadata', () => {
    expect(getPhotoPreviewSize(Number.NaN, 100, 320, 480)).toEqual({ width: 1, height: 1 });
    expect(getPhotoPreviewSize(100, 100, 0, 480)).toEqual({ width: 1, height: 1 });
  });
});
