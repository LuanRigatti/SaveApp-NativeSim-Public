# Estado atual — SaveApp

## Snapshot e escopo

SaveApp é um app independente de demonstração de UI em React Native, Expo SDK 58 e TypeScript. Não possui login, rede de dados, banco remoto, persistência de conteúdo ou funcionalidade para salvar fotos, links e textos.

The Starter UI template was used only as the initial base for this independent SaveApp snapshot.

The provided clean snapshot SHA is `2c02d426611b83b913ae7297a929d0d6d845dd9d`.

O diretório de trabalho contém o snapshot exato informado e não possui `.git`. Nenhum workflow, publicação, build nativo ou sessão foi iniciado durante esta implementação.

## Identidade e destinos

- Nome exibido: `SaveApp`.
- Slug e URL scheme: `saveapp`.
- Bundle ID iOS e package Android: `com.luanrigatti.saveapp`.
- Fonte privada planejada: `C:\Projetos\SaveApp`, `LuanRigatti/SaveApp`, branch `main`, visibilidade privada.
- Espelho planejado: `C:\Projetos\SaveApp-NativeSim-Public`, `LuanRigatti/SaveApp-NativeSim-Public`, branch `main`, visibilidade pública.
- O espelho é unidirecional, filtrado por allowlist e nunca recebe alterações de volta à fonte.
- `.nativesim-source` é gerado no espelho para o SHA privado exato e não deve existir na fonte privada.
- O script de mirror não inicializa Git, não cria repositórios e recusa `main` remoto vazio. Depois dos checks locais, o responsável deve inicializar o repositório público com commit raiz vazio antes da primeira publicação.

## SDK e dependências

O projeto permanece em Expo SDK 58. O nome do pacote raiz é `saveapp`; as versões, URLs resolvidas e integridades de dependências permanecem iguais às do snapshot informado.

NativeTabs usa o módulo estável `expo-router/native-tabs`. Native Stack, Stack.Toolbar e as adaptações nativas mantêm os contratos existentes.

## Telas demonstrativas

O app contém quatro abas — Início, Coleções, Buscar e Ajustes — e uma rota de detalhe. Os textos e cartões são fictícios. A busca opera sobre lista local. Não há fluxo de persistência ou captura de conteúdo.

## Workflows e skills

Os workflows são manuais por `workflow_dispatch`:

- `swift-preflight.yml`: valida dependências, Expo, TypeScript, ESLint, Jest e contratos; sua execução remota também gera e compila o projeto iOS.
- `native-sim.yml`: compatível com a CLI instalada (template 18), exige gate, usa scheme SaveApp, exporta o mesmo `.app` construído e retém o artifact por sete dias.
- `eas-build.yml`: workflow independente, perfis somente Simulator e projeto EAS SaveApp explicitamente configurado.

As quatro skills são `mirror-saveapp`, `saveapp-swift-preflight`, `saveapp-nativesim` e `saveapp-simulator-archive`. Swift Preflight é aceito apenas para o SHA público exato. NativeSim recusa execuções duplicadas, dura 120 minutos por padrão e apresenta os links antes de qualquer download de artifact. A recuperação posterior seleciona uma build existente com export/upload concluídos.

## Identificadores compatíveis preservados

- `plugins/withStarterToolbarSync.js` remains byte-for-byte unchanged because its native patch anchors are still required.
- `StarterToolbarMorphExperimentVariant` remains an internal plist key required by that plugin. This and the plugin filename are compatibility identifiers only.
- The two protected patch scripts also retain their historical log prefixes as compatibility-only diagnostics.
- Os scripts `scripts/patch-expo-ui-bottom-sheet.js` e `scripts/patch-expo-module-scan-timeout.js`, seus markers de versão/âncora e `tests/expo-module-scan-timeout.test.js` mantêm os contratos nativos. O teste conserva o basename, mas suas referências de diretório temporário e do mirror usam nomes SaveApp.
- The source statement above is static documentation in this file. Security tests verify that previous paths and repositories do not appear in operational targets.

## Evidência e limites

A validação autorizada é local e estática. Ela não comprova compilação de Xcode, aparência em Simulator ou comportamento em iPhone. Resultados de instalação, tipos, lint, testes, contratos, segurança e parsers serão registrados após a execução.
