import AsyncStorage from '@react-native-async-storage/async-storage';

export const ACTIVITY_LINK_AUTHORIZATION_KEY = '@saveapp/dynamic-island-link-authorization-v1';

export type ActivityLinkAuthorization = {
  token: string;
  activityId: string | null;
};

export function isMatchingActivityLinkToken(
  candidate: string | string[] | undefined,
  expected: string | null,
): candidate is string {
  return typeof candidate === 'string' && expected !== null && candidate === expected;
}

export async function readActivityLinkAuthorization(): Promise<ActivityLinkAuthorization | null> {
  const storedValue = await AsyncStorage.getItem(ACTIVITY_LINK_AUTHORIZATION_KEY);
  if (!storedValue) return null;

  try {
    const parsed = JSON.parse(storedValue) as Partial<ActivityLinkAuthorization>;
    if (
      typeof parsed.token !== 'string' ||
      parsed.token.length < 32 ||
      (parsed.activityId !== null && typeof parsed.activityId !== 'string')
    ) {
      return null;
    }
    return { token: parsed.token, activityId: parsed.activityId ?? null };
  } catch {
    return null;
  }
}

export async function writeActivityLinkAuthorization(
  authorization: ActivityLinkAuthorization,
): Promise<void> {
  await AsyncStorage.setItem(
    ACTIVITY_LINK_AUTHORIZATION_KEY,
    JSON.stringify(authorization),
  );
}

export async function clearActivityLinkAuthorization(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVITY_LINK_AUTHORIZATION_KEY);
}
