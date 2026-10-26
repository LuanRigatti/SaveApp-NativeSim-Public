const { isNativeSheetSupported } = require('../src/platform/nativeSheetCapability');

describe('native iOS sheet capability', () => {
  test('uses SwiftUI whenever the Expo UI native module is available on iOS', () => {
    expect(isNativeSheetSupported('ios', true)).toBe(true);
  });

  test('keeps the fallback on iOS when the Expo UI native module is unavailable', () => {
    expect(isNativeSheetSupported('ios', false)).toBe(false);
  });

  test('does not select the SwiftUI sheet on other platforms', () => {
    expect(isNativeSheetSupported('android', true)).toBe(false);
    expect(isNativeSheetSupported('web', true)).toBe(false);
  });
});
