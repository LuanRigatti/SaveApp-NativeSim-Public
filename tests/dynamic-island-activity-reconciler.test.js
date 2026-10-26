jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const { createActivityReconciler } = require('../src/features/dynamic-island/activityReconciler');
const { createOptionalNativeModuleLoader } = require('../src/features/dynamic-island/optionalNativeModuleLoader');
const { isMatchingActivityLinkToken } = require('../src/features/dynamic-island/activityLinkAuthorization');
const { createLiveActivityFailureAlert } = require('../src/features/dynamic-island/liveActivityFailureAlert');

describe('SaveApp Live Activity lifecycle', () => {
  test('does not load the ExpoWidgets factory when the native module is absent', () => {
    const requireOptionalNativeModule = jest.fn(() => null);
    const loadFactory = jest.fn(() => ({ start: jest.fn(), getInstances: jest.fn(() => []) }));
    const loader = createOptionalNativeModuleLoader(
      'ExpoWidgets',
      requireOptionalNativeModule,
      loadFactory,
    );

    expect(loader.isAvailable()).toBe(false);
    expect(loader.get()).toBeNull();
    expect(loader.get()).toBeNull();
    expect(requireOptionalNativeModule).toHaveBeenCalledTimes(1);
    expect(requireOptionalNativeModule).toHaveBeenCalledWith('ExpoWidgets');
    expect(loadFactory).not.toHaveBeenCalled();
  });

  test('loads and caches the ExpoWidgets factory when the native module exists', () => {
    const nativeModule = { widgetsDirectory: 'file:///shared' };
    const factory = { start: jest.fn(), getInstances: jest.fn(() => []) };
    const requireOptionalNativeModule = jest.fn(() => nativeModule);
    const loadFactory = jest.fn(() => factory);
    const loader = createOptionalNativeModuleLoader(
      'ExpoWidgets',
      requireOptionalNativeModule,
      loadFactory,
    );

    expect(loader.isAvailable()).toBe(true);
    expect(loader.get()).toBe(factory);
    expect(loader.get()).toBe(factory);
    expect(loadFactory).toHaveBeenCalledTimes(1);
  });

  test('treats native module probe and factory loading errors as unavailable', () => {
    const loadFactory = jest.fn(() => ({ start: jest.fn(), getInstances: jest.fn(() => []) }));
    const probeFailure = createOptionalNativeModuleLoader(
      'ExpoWidgets',
      () => { throw new Error('native registry unavailable'); },
      loadFactory,
    );
    const factoryFailure = createOptionalNativeModuleLoader(
      'ExpoWidgets',
      () => ({}),
      () => { throw new Error('factory unavailable'); },
    );

    expect(probeFailure.isAvailable()).toBe(false);
    expect(probeFailure.get()).toBeNull();
    expect(factoryFailure.isAvailable()).toBe(false);
    expect(factoryFailure.get()).toBeNull();
    expect(loadFactory).not.toHaveBeenCalled();
  });

  test('only accepts the exact single-string token associated with the activity URL', () => {
    expect(isMatchingActivityLinkToken('a'.repeat(36), 'a'.repeat(36))).toBe(true);
    expect(isMatchingActivityLinkToken('b'.repeat(36), 'a'.repeat(36))).toBe(false);
    expect(isMatchingActivityLinkToken(['a'.repeat(36)], 'a'.repeat(36))).toBe(false);
    expect(isMatchingActivityLinkToken(undefined, 'a'.repeat(36))).toBe(false);
    expect(isMatchingActivityLinkToken('a'.repeat(36), null)).toBe(false);
  });

  test('starts one activity for concurrent enable requests', async () => {
    const instances = [];
    const start = jest.fn(async () => {
      instances.push({ end: jest.fn(async () => undefined) });
    });
    const reconcile = createActivityReconciler({
      getInstances: () => instances,
      start,
    });

    await Promise.all([reconcile(true), reconcile(true)]);

    expect(start).toHaveBeenCalledTimes(1);
  });

  test('keeps one existing activity and ends any duplicates immediately', async () => {
    const keep = { end: jest.fn(async () => undefined) };
    const duplicate = { end: jest.fn(async () => undefined) };
    const start = jest.fn();
    const reconcile = createActivityReconciler({
      getInstances: () => [keep, duplicate],
      start,
    });

    await reconcile(true);

    expect(start).not.toHaveBeenCalled();
    expect(keep.end).not.toHaveBeenCalled();
    expect(duplicate.end).toHaveBeenCalledWith('immediate');
  });

  test('ends every activity when the setting is disabled', async () => {
    const first = { end: jest.fn(async () => undefined) };
    const second = { end: jest.fn(async () => undefined) };
    const start = jest.fn();
    const reconcile = createActivityReconciler({
      getInstances: () => [first, second],
      start,
    });

    await reconcile(false);

    expect(first.end).toHaveBeenCalledWith('immediate');
    expect(second.end).toHaveBeenCalledWith('immediate');
    expect(start).not.toHaveBeenCalled();
  });

  test('propagates start failures so the settings toggle can roll back', async () => {
    const expectedError = new Error('Live Activities are unavailable');
    const reconcile = createActivityReconciler({
      getInstances: () => [],
      start: async () => { throw expectedError; },
    });

    await expect(reconcile(true)).rejects.toBe(expectedError);
  });

  test('shows the underlying native activation error instead of replacing it with a permission guess', () => {
    const failure = createLiveActivityFailureAlert(
      new Error('Failed to start live activity: Missing required entitlement'),
      'activate',
    );

    expect(failure.title).toBe('Não foi possível ativar');
    expect(failure.message).toContain('Missing required entitlement');
    expect(failure.message).not.toContain('Verifique se Atividades ao Vivo estão habilitadas');
  });

  test('keeps the native error code and message in the failure details', () => {
    const failure = createLiveActivityFailureAlert(
      { code: 'ERR_ACTIVITY_START', message: 'ActivityKit rejected the request' },
      'activate',
    );

    expect(failure.message).toContain('ERR_ACTIVITY_START');
    expect(failure.message).toContain('ActivityKit rejected the request');
  });

  test('uses a safe fallback when the caught value has no readable error details', () => {
    const failure = createLiveActivityFailureAlert(null, 'activate');

    expect(failure.message).toContain('Não foi possível iniciar a Live Activity');
    expect(failure.message).not.toContain('undefined');
  });

  test('bounds unexpectedly long native error details', () => {
    const failure = createLiveActivityFailureAlert(new Error('x'.repeat(2_000)), 'activate');

    expect(failure.message.length).toBeLessThan(800);
    expect(failure.message.endsWith('…')).toBe(true);
  });
});
