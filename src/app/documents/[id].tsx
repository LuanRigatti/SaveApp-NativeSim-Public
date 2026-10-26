import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SavedDocumentThumbnail } from '@/components/homeContent/SavedDocumentThumbnail';
import { ProgressiveCollapsibleScreen } from '@/components/premium';
import { formatDocumentSize, getDocumentTypeLabel } from '@/features/documents/documentPresentation';
import { HomeFolderAuthorizationPrompt } from '@/features/home-folders/HomeFolderAuthorizationPrompt';
import { useHomeFolderItemAuthorization } from '@/features/home-folders/useHomeFolderAuthorization';
import { useLocalDocumentLibrary } from '@/features/documents/LocalDocumentLibraryProvider';
import type { SavedDocument } from '@/features/documents/documentTypes';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

export default function SavedDocumentDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const parsedId = Number(Array.isArray(id) ? id[0] : id);
  const documentId = Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : null;
  const authorization = useHomeFolderItemAuthorization('document', documentId);

  if (!authorization.isAuthorized) {
    return <HomeFolderAuthorizationPrompt authorization={authorization} />;
  }
  return <SavedDocumentDetailsContent id={documentId} ensureAccess={authorization.requestAuthorization} />;
}

function SavedDocumentDetailsContent({
  id,
  ensureAccess,
}: {
  id: number | null;
  ensureAccess: () => Promise<'authenticated' | 'cancelled' | 'unavailable' | 'failed'>;
}) {
  const { theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const { getDocument, openDocument } = useLocalDocumentLibrary();
  const [document, setDocument] = useState<SavedDocument | null>(null);

  useEffect(() => {
    let isCurrent = true;
    if (id != null) {
      void getDocument(id).then((saved) => {
        if (isCurrent) setDocument(saved);
      });
    }
    return () => {
      isCurrent = false;
    };
  }, [getDocument, id]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerShadowVisible: false,
          headerTintColor: theme.colors.textPrimary,
          headerTitle: '',
          headerTransparent: true,
        }}
      />
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <ProgressiveCollapsibleScreen
          compactTitle="Documento"
          contentGap={theme.spacing.md}
          contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
          largeTitle={
            <View style={{ paddingHorizontal: theme.layout.screenHorizontalPadding }}>
              <Text
                style={[
                  theme.typography.largeTitle,
                  {
                    color: theme.colors.textPrimary,
                    fontSize: theme.typography.largeTitle.fontSize + 2,
                  },
                ]}
              >
                Documento
              </Text>
            </View>
          }
          nativeHeader
          scrollContentContainerStyle={{
            paddingBottom: insets.bottom + theme.spacing.xxl,
            paddingHorizontal: 0,
          }}
        >
          <View
            style={{
              alignItems: 'center',
              alignSelf: 'center',
              flexGrow: 1,
              gap: theme.spacing.md,
              justifyContent: 'center',
              maxWidth: 500,
              padding: theme.spacing.lg,
              width: '100%',
            }}
          >
            {document ? (
              <>
                <SavedDocumentThumbnail document={document} height={132} width={112} />
                <Text
                  style={[
                    theme.typography.body,
                    {
                      alignSelf: 'stretch',
                      color: theme.colors.textPrimary,
                      flexShrink: 1,
                      minWidth: 0,
                      textAlign: 'center',
                    },
                  ]}
                >
                  {document.originalName}
                </Text>
                <Text style={[theme.typography.subheadline, { color: theme.colors.textSecondary }]}>
                  {getDocumentTypeLabel(document.extension)} · {formatDocumentSize(document.sizeBytes)}
                </Text>
                {document.textExcerpt ? (
                  <Text style={[theme.typography.body, { color: theme.colors.textSecondary, textAlign: 'center' }]}>
                    {document.textExcerpt}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void (async () => {
                      if (await ensureAccess() === 'authenticated') await openDocument(document);
                    })();
                  }}
                  style={{
                    alignItems: 'center',
                    backgroundColor: theme.colors.primary,
                    borderRadius: theme.radius.md,
                    marginTop: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.lg,
                    paddingVertical: theme.spacing.sm,
                  }}
                >
                  <Text style={[theme.typography.headline, { color: theme.colors.textInverse }]}>Abrir arquivo</Text>
                </Pressable>
              </>
            ) : (
              <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Arquivo indisponível</Text>
            )}
          </View>
        </ProgressiveCollapsibleScreen>
      </View>
    </>
  );
}
