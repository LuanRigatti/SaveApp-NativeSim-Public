# Instruções para agentes — SaveApp

## Escopo

SaveApp é um aplicativo demonstrativo de interface baseado em Expo SDK 58. Ele mostra navegação e controles nativos; ainda não implementa salvar fotos, links ou textos. Não acrescente autenticação, serviços externos, lógica comercial, dados pessoais ou credenciais.

A fonte privada é `C:\Projetos\SaveApp`, `LuanRigatti/SaveApp`, branch `main`, visibilidade privada. O espelho filtrado é `C:\Projetos\SaveApp-NativeSim-Public`, `LuanRigatti/SaveApp-NativeSim-Public`, branch `main`, visibilidade pública. A direção é sempre privada para pública; nunca receba alterações do espelho.

## Arquitetura

- Antes de mudanças relevantes, consulte `docs/current-state.md`, `AI_CONTEXT.md` e `docs/design-system.md`.
- Antes de alterar APIs Expo, consulte a documentação versionada do Expo SDK 58.
- Preserve Expo Router NativeTabs estável, Native Stack, Stack.Toolbar, o plugin de sincronização de toolbar e seu marcador plist compatível; os nomes internos protegidos estão documentados em `docs/current-state.md`.
- Preserve `@expo/ui`/SwiftUI, Liquid Glass, ProgressiveCollapsibleScreen, Progressive Blur e fallbacks.
- Preserve SDK 58 e todas as versões resolvidas e integridades do lockfile.
- Componentes visuais não devem depender de login, rede ou serviços externos.

## Validação local

Após alterações, execute as verificações locais pertinentes:

```powershell
npm ci
npm run typecheck
npm run lint
npm test -- --runInBand
npx expo install --check
npx expo-doctor
node scripts/verify-saveapp-native.js
Invoke-Pester -Path .\tests\SaveAppSecurity.Tests.ps1
```

Mudanças nativas exigem o workflow Swift Preflight somente após solicitação explícita. Não inicie workflow, EAS, prebuild local, Xcode build ou NativeSim sem pedido explícito. Checagens estáticas não comprovam comportamento em Simulator ou iPhone.

## Espelho e operações

- Use `$mirror-saveapp` para revisão independente e `$saveapp-nativesim` somente quando o usuário pedir o fluxo completo.
- `scripts/mirror-saveapp.ps1` publica somente nos destinos fixos SaveApp, com allowlist, scanners, proveniência do SHA de origem e push normal fast-forward.
- Nunca use force push. Não copie `.env`, credenciais, certificados, dados pessoais, builds ou histórico privado.
- `.nativesim-source` é criado no espelho a partir do SHA privado exato; não mantenha proveniência estática no código privado.
- O script recusa um `main` remoto público vazio. Depois que as verificações locais terminarem, o responsável deve inicializar o repositório público com um commit raiz vazio antes da publicação.
- Todos os workflows são `workflow_dispatch` manuais. Swift Preflight deve passar para o SHA público exato; NativeSim exporta o mesmo `.app` que foi construído e mantém o artifact por sete dias.
- NativeSim dura 120 minutos por padrão. Nunca grave ou reconstrua a URL autenticada do stream ou sua chave.

## Evidência

Relate separadamente validação estática, workflow remoto, Simulator e iPhone. Não apresente testes locais como prova de compilação nativa ou comportamento visual.
