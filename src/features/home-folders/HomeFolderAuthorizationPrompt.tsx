import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { getFolderAuthenticationFailureMessage } from './folderFaceIdAuthentication';
import type { HomeFolderAuthorization } from './useHomeFolderAuthorization';
import { useAppTheme } from '@/theme';

export function HomeFolderAuthorizationPrompt({
  authorization,
}: {
  authorization: HomeFolderAuthorization;
}) {
  const { theme } = useAppTheme();
  const message = authorization.status === 'checking'
    ? 'Verificando acesso…'
    : authorization.status === 'requesting'
      ? 'Aguardando autenticação…'
      : authorization.status === 'unavailable'
        ? getFolderAuthenticationFailureMessage('unavailable')
        : authorization.status === 'failed'
          ? getFolderAuthenticationFailureMessage('failed')
          : 'A pasta permanece bloqueada.';

  return (
    <View
      accessibilityViewIsModal
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        flex: 1,
        justifyContent: 'center',
        padding: theme.spacing.xl,
      }}
    >
      <Text style={[theme.typography.headline, { color: theme.colors.textPrimary, textAlign: 'center' }]}>
        Conteúdo protegido
      </Text>
      <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm, textAlign: 'center' }]}>
        {message}
      </Text>
      {authorization.status === 'requesting' || authorization.status === 'checking' ? (
        <ActivityIndicator color={theme.colors.info} style={{ marginTop: theme.spacing.lg }} />
      ) : authorization.isAppActive ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void authorization.requestAuthorization()}
          style={{ alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md, minHeight: theme.sizes.touchTargetMinimum, paddingHorizontal: theme.spacing.md }}
        >
          <Text style={[theme.typography.headline, { color: theme.colors.info }]}>Tentar novamente com Face ID</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
