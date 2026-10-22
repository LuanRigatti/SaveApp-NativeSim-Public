# Design system do SaveApp

## Princípios

SaveApp usa uma paleta demonstrativa independente azul/índigo. Os componentes preservam interações nativas e padrões visuais reutilizáveis, sem conteúdo empresarial, dados pessoais ou serviços remotos.

Use os tokens do ThemeProvider para cor, tipografia, espaçamento, raio, borda, sombra, animação e tamanho. Evite valores avulsos quando um token representar o mesmo papel.

## Tokens de tema

- `background`, `backgroundSecondary`, `surface`, `surfaceElevated` e `surfaceMuted` definem superfícies.
- `textPrimary`, `textSecondary`, `textTertiary` e `textDisabled` definem hierarquia textual.
- `primary`, `secondary`, `brand` e `focus` definem ênfase e interação.
- `success`, `warning`, `danger` e `info` são estados visuais genéricos.
- `glassSurface` e `glassBorder` servem aos fallbacks translúcidos.
- `darkModeCardSurface` e `darkModeInsetSurface` diferenciam cartões e áreas inseridas no tema escuro.

Light e Dark derivam do ThemeProvider e seguem a aparência do sistema por padrão. A escolha manual é armazenada localmente sob `@saveapp/theme-mode`.

## Navegação e títulos

NativeTabs e Native Stack controlam transições e gestos. Stack.Toolbar hospeda controles nativos. ProgressiveCollapsibleScreen mantém alinhados o título grande, o título compacto, a interpolação durante o scroll e o blur do cabeçalho.

Não sobreponha controles React Native interativos aos controles SwiftUI. Não restrinja animações nativas com clipping ou frames artificiais.

## Materiais e controles

- Liquid Glass vem de expo-glass-effect e `@expo/ui` quando disponível.
- expo-blur fornece fallback visual quando Liquid Glass não está disponível.
- NativeSheet usa BottomSheet SwiftUI em Development Build iOS, detents configuráveis e drag indicator visível; o fallback usa Gesture Handler e Reanimated.
- NativeCardContextMenu usa ContextMenu nativo no iOS.
- NativeButton usa Button SwiftUI para manter estado pressionado, haptics e aparência do sistema.
- ProgressiveBlur usa APIs públicas Expo de blur, gradiente e máscara.

## Demonstração

Início, Coleções, Buscar e Ajustes usam textos e cartões fictícios. A tela de detalhe valida navegação, toolbar e swipe-back. O design atual não implementa persistência de fotos, links ou textos.