export type OptionalNativeModuleLoader<T> = {
  get: () => T | null;
  isAvailable: () => boolean;
};

/** Loads a native-backed factory only after its native module is registered. */
export function createOptionalNativeModuleLoader<T>(
  moduleName: string,
  requireOptionalNativeModule: (name: string) => unknown | null,
  load: () => T,
): OptionalNativeModuleLoader<T> {
  let loaded = false;
  let unavailable = false;
  let value: T | null = null;

  const get = (): T | null => {
    if (unavailable) return null;
    if (loaded) return value;

    try {
      if (!requireOptionalNativeModule(moduleName)) {
        unavailable = true;
        return null;
      }

      value = load();
      loaded = true;
      return value;
    } catch {
      unavailable = true;
      return null;
    }
  };

  return {
    get,
    isAvailable: () => get() !== null,
  };
}
