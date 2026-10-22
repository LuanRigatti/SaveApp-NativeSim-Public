import { isRunningInExpoGo } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import type { NativeRuntimeEnvironment } from '@/types/native-ui';

export type RuntimeEnvironmentInput = {
  platform: string;
  expoGo: boolean;
  executionEnvironment: ExecutionEnvironment;
};

export function classifyRuntimeEnvironment({
  executionEnvironment,
  expoGo,
  platform,
}: RuntimeEnvironmentInput): NativeRuntimeEnvironment {
  if (platform === 'web') {
    return 'web';
  }

  if (expoGo || executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'expo-go';
  }

  return 'development-build';
}

export function getRuntimeEnvironment(): NativeRuntimeEnvironment {
  return classifyRuntimeEnvironment({
    executionEnvironment: Constants.executionEnvironment,
    expoGo: isRunningInExpoGo(),
    platform: Platform.OS,
  });
}

export function isExpoGoRuntime(): boolean {
  return getRuntimeEnvironment() === 'expo-go';
}

export function isDevelopmentBuildRuntime(): boolean {
  return getRuntimeEnvironment() === 'development-build';
}

export function isWebRuntime(): boolean {
  return getRuntimeEnvironment() === 'web';
}
