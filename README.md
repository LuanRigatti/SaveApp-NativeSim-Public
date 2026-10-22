# SaveApp

SaveApp é uma demonstração independente de interface para React Native com Expo SDK 58. Demonstra navegação e controles nativos de iOS, sem autenticação, rede, banco remoto ou lógica comercial. Ainda não implementa salvar fotos, links ou textos.

## Incluído

- Expo Router com NativeTabs estável e Native Stack.
- Stack.Toolbar compartilhada e sincronização nativa de toolbars.
- Títulos grandes/compactos, animação durante scroll e Progressive Blur.
- Controles SwiftUI via `@expo/ui`, incluindo Bottom Sheet e Context Menu.
- Liquid Glass quando suportado, com fallbacks para Expo Go, Android e Web.
- Tema claro/escuro, tokens, Reanimated e feedback tátil.
- Quatro abas demonstrativas e uma tela secundária fictícia.

## Começar localmente

Requisitos: Node.js 22.13 ou mais recente. O alvo mínimo iOS é 16.4. Para executar controles SwiftUI em iOS, use Development Build validado pelo workflow manual apropriado.

```powershell
npm ci
npx expo install --check
npx expo-doctor
npm run start
```

## Validar alterações

```powershell
npm run typecheck
npm run lint
npm test -- --runInBand
node scripts/verify-saveapp-native.js
Invoke-Pester -Path .\tests\SaveAppSecurity.Tests.ps1
```

As checagens locais não comprovam comportamento visual nativo.

## Identidade e dependências

Nome exibido `SaveApp`, slug/scheme `saveapp`, bundle ID `com.luanrigatti.saveapp`. O projeto EAS não é vinculado por padrão. Quando solicitado, o workflow EAS separado exige um projeto SaveApp próprio e permite apenas perfis Simulator. O lockfile mantém as versões resolvidas e integridades do snapshot-base.

## Espelho e workflows manuais

A fonte privada é `LuanRigatti/SaveApp` em `main`; o espelho público é `LuanRigatti/SaveApp-NativeSim-Public` em `main`. Swift Preflight, NativeSim e EAS usam workflows independentes acionados manualmente.

As quatro skills locais são `$mirror-saveapp`, `$saveapp-swift-preflight`, `$saveapp-nativesim` e `$saveapp-simulator-archive`. NativeSim valida Swift Preflight para o SHA exato, dura 120 minutos por padrão e entrega os links antes da recuperação de artifact. A skill de arquivo recupera uma build existente somente depois do sucesso de build, export e upload; o artifact tem retenção de sete dias.

`scripts/mirror-saveapp.ps1` opera apenas nos repositórios SaveApp, aplica allowlist e scanners, grava proveniência para o SHA privado exato e só faz push normal fast-forward. Nunca recebe alterações do espelho. O script recusa um `main` remoto vazio; depois de todos os checks locais, o responsável deve fazer bootstrap do repositório público com um commit raiz vazio.

## Limites desta implementação

O diretório recebido não contém `.git`. O responsável fará bootstrap do repositório privado e criará os destinos remotos após revisar as validações locais. Nenhum workflow, EAS, prebuild local, Xcode build ou Simulator é iniciado pelos comandos locais acima. Consulte `docs/current-state.md` para os identificadores nativos mantidos por compatibilidade.
