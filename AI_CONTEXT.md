# Contexto técnico do SaveApp

## Objetivo e limites

SaveApp é uma demonstração de UI para iOS e outras plataformas, com Expo SDK 58. O app valida navegação, aparência e controles nativos. Não implementa salvar fotos, links ou textos; não adicionar autenticação, rede de dados, banco remoto ou lógica comercial.

## Identidade

- Nome: `SaveApp`.
- Slug e scheme: `saveapp`.
- Bundle identifier iOS e package Android: `com.luanrigatti.saveapp`.
- EAS fica desvinculado por padrão. O workflow separado só aceita um projeto próprio configurado com `SAVEAPP_EAS_PROJECT_ID`.
- O marcador plist de morph continua vinculado ao plugin nativo preservado; a explicação dos nomes de compatibilidade está em `docs/current-state.md`.

## Runtime e navegação

- Expo SDK 58, React Native 0.88 e React 19.3, conforme as versões declaradas.
- Expo Router usa `expo-router/native-tabs` estável.
- Native Stack e Stack.Toolbar hospedam navegação e controles de toolbar nativos.
- SF Symbols são usados no iOS; fallbacks mantêm a demonstração nos demais runtimes.
- React Native organiza layout; SwiftUI e `@expo/ui` mantêm interações nativas.

## Componentes reutilizáveis

- ProgressiveCollapsibleScreen implementa títulos grandes/compactos e blur de cabeçalho.
- ProgressiveBlur combina blur, gradiente e máscara.
- NativeSheet usa BottomSheet SwiftUI em Development Build iOS e fallback de gestos nos demais runtimes.
- NativeButton usa Button SwiftUI em Development Build iOS e fallback visual multiplataforma.
- NativeCardContextMenu usa ContextMenu SwiftUI no iOS.
- NativeHomeToolbarActions hospeda ações SwiftUI em Stack.Toolbar.
- Tema claro/escuro e preferência visual são locais; a chave de armazenamento é `@saveapp/theme-mode`.

## Adaptações preservadas

- O plugin de sincronização de toolbar mantém anchors compatíveis com react-native-screens 4.30.0.
- `scripts/patch-expo-ui-bottom-sheet.js` ajusta a área segura inferior em BottomSheetView de @expo/ui 58.0.19.
- `scripts/patch-expo-module-scan-timeout.js` ajusta o timeout do scanner Apple de expo-modules-autolinking 58.0.14 e falha se versão ou anchor mudar.
- `.github/native-sim/gate.cjs` preserva o contrato auditado; o workflow exige template 18 e a normalização aprovada do token.
- O NativeSim clona o SHA público exato em uma pasta temporária ignorada dentro de SaveApp, usa um sink bare local no mesmo SHA e limpa ambos ao sair. As simulações locais usam fixtures e CLI/GitHub simulados; não executam `native-sim up`.
- O launcher remove PSEventJob sem acessar `Action`; falhas de limpeza não substituem o erro principal.

## Operações manuais

- Fonte privada: `LuanRigatti/SaveApp`, branch `main`.
- Espelho público: `LuanRigatti/SaveApp-NativeSim-Public`, branch `main`.
- O espelho é unidirecional e grava `.nativesim-source` para o SHA privado exato; esse arquivo não existe na fonte.
- Swift Preflight e NativeSim usam apenas o espelho. NativeSim exige Preflight aprovado para o mesmo SHA e recusa duplicatas.
- A sessão é manual, dura 120 minutos por padrão e exporta o mesmo `.app` construído para artifact retido por sete dias.
- O workflow EAS é manual, separado e limitado a perfis Simulator.
- A skill de arquivo baixa artifact existente após build, export e upload verificados; não inicia sessão nem build.
- O espelho recusa `main` remoto vazio. Depois dos checks locais, o responsável deve fazer bootstrap público com um commit raiz vazio.