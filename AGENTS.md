# Instruções para agentes — SaveApp

## Produto e escopo

SaveApp é um aplicativo independente em Expo SDK 58 cuja migração para repositórios próprios está concluída. A Home importa, armazena e exibe fotos e vídeos localmente, além de links e textos persistidos no SQLite. O restante do app inclui telas demonstrativas. Novas capacidades podem evoluir conforme requisitos solicitados; não invente ou antecipe requisitos futuros.

A ausência atual de autenticação, sincronização em nuvem ou de outras funcionalidades além das já implementadas descreve o estado existente, não uma proibição permanente. Implemente somente o que for solicitado. Serviços externos, autenticação e credenciais exigem autorização explícita. Mantenha segredos fora do código, documentação, logs e do espelho público.

## Limites de repositório e publicação

- Trabalhe no projeto privado `C:\Projetos\SaveApp`, repositório `LuanRigatti/SaveApp`, branch `main`. Ele é a fonte da verdade.
- O espelho de testes é `C:\Projetos\SaveApp-NativeSim-Public`, repositório `LuanRigatti/SaveApp-NativeSim-Public`, branch `main`. Só opere nele durante o fluxo de espelhamento ou NativeSim solicitado pelo usuário.
- A direção é sempre privada para pública. Nunca copie ou integre mudanças do espelho à fonte privada.
- Não modifique outros projetos, repositórios ou checkouts; não reutilize suas dependências, identidade, ativos, dados ou lógica no SaveApp.
- Não copie `.env`, credenciais, certificados, dados pessoais, builds ou histórico privado para o espelho. Preserve allowlist, scanners, validação de caminhos, proveniência exata, exigência de árvore limpa e push fast-forward. Nunca use force push.
- Não faça commit ou push sem autorização explícita. Não publique o espelho sem autorização específica para esse fluxo.

## Arquitetura e design

- Antes de mudanças relevantes, leia por inteiro `docs/current-state.md`, `AI_CONTEXT.md` e `docs/design-system.md`.
- Antes de alterar APIs Expo, consulte a documentação correspondente ao SDK 58.
- Preserve Expo Router NativeTabs estável, Native Stack, `Stack.Toolbar`, o plugin de sincronização de toolbar e seus anchors e marcador plist compatíveis.
- Preserve SwiftUI e `@expo/ui`, Liquid Glass, SF Symbols, `ProgressiveCollapsibleScreen`, Progressive Blur, Bottom Sheets, animações, gestos e fallbacks.
- `plugins/withStarterToolbarSync.js`, `StarterToolbarMorphExperimentVariant`, os scripts de patch, seus anchors/markers e os nomes de teste compatíveis são contratos internos. Só os altere quando a solicitação incluir essa mudança e houver validação apropriada.
- Preserve Expo SDK 58 e as versões resolvidas e integridades registradas em `package-lock.json`. Mudanças de SDK, dependências, configuração nativa, scripts ou workflows precisam estar explicitamente no escopo.
- Telas demonstrativas podem evoluir para os requisitos do produto. Use o design system e os componentes compartilhados; não acrescente comportamento fora do pedido nem reescreva componentes nativos sem necessidade do requisito.

## Segurança e integrações

- Trate dados e permissões conforme o recurso solicitado e preserve as proteções já existentes nos scripts, workflows, scanner e gate NativeSim.
- Não inclua segredos ou dados pessoais em arquivos versionados, mensagens de log ou publicações. Quando um requisito autorizado depender de credencial, use o mecanismo seguro correspondente ao ambiente e mantenha-a fora do repositório.
- Não introduza autenticação, rede, serviços externos ou dados remotos sem pedido explícito. Essa regra controla autorização e escopo; não impede futuras funcionalidades que o usuário solicitar.

## Validação

Depois de mudanças de código, execute as validações locais pertinentes, como typecheck, lint, testes direcionados, verificação de dependências, Expo Doctor, contratos nativos e testes de segurança.

Para mudanças exclusivamente documentais, confira o conteúdo, confirme que somente os documentos autorizados mudaram e rode `git diff --check`; não execute uma suíte de testes sem necessidade.

Não inicie workflows remotos, Swift Preflight, EAS, prebuild local, Xcode build ou NativeSim sem solicitação explícita. Mudanças nativas requerem Swift Preflight somente após essa autorização. Checagens estáticas não comprovam compilação ou aparência em Simulator/iPhone.

## Skills e evidências

- `$mirror-saveapp` prepara e revisa o espelhamento; publique somente quando o usuário autorizar essa etapa.
- `$saveapp-swift-preflight` executa ou inspeciona Preflight do SHA público exato quando solicitado.
- `$saveapp-nativesim` conduz o fluxo completo de espelhamento, Preflight e sessão Simulator quando solicitado.
- `$saveapp-simulator-archive` recupera um artifact de uma execução existente, sem iniciar outro build.
- Consulte `docs/current-state.md` para o histórico da primeira validação iOS Simulator. Trate SHAs, Run IDs e checksums registrados como evidência histórica; não como a versão corrente.
- Relate separadamente resultados estáticos, workflow remoto, Simulator e iPhone físico. Não declare teste em dispositivo ou publicação na App Store sem evidência correspondente.
- Atualize a documentação quando uma mudança autorizada alterar arquitetura, funcionalidades implementadas, estado ou design.
