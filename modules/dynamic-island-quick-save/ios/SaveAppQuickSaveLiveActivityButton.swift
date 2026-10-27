import SwiftUI
import ExpoModulesCore
import ExpoUI

final class ButtonProps: ExpoUI.ButtonProps {
  @Field var source: String?
  @Field var target: String?
  @Field var entryIndex: Int?
  @Field var environmentString: String?
}

@available(iOS 17.0, *)
struct WidgetButtonView: ExpoSwiftUI.View {
  @ObservedObject var props: ButtonProps

  var body: some View {
    SwiftUI.Button(
      role: props.role?.toNativeRole(),
      intent: WidgetUserInteraction(
        source: props.source,
        target: props.target,
        entryIndex: props.entryIndex,
        environmentString: props.environmentString
      )
    ) {
      if let label = props.label {
        if let systemImage = props.systemImage {
          Label(title: { Text(label) }, icon: { Image(systemName: systemImage) })
        } else {
          Text(label)
        }
      } else {
        Children()
      }
    }
  }
}

@available(iOS 17.0, *)
struct LiveActivityButtonView: ExpoSwiftUI.View {
  @ObservedObject var props: ButtonProps

  private var quickSaveSymbol: String {
    props.systemImage ?? "arrow.down.to.line"
  }

  private var quickSaveIsProcessing: Bool {
    quickSaveSymbol == "hourglass"
  }

  private var quickSaveIsSuccess: Bool {
    quickSaveSymbol == "checkmark"
  }

  private var quickSaveIsFailure: Bool {
    quickSaveSymbol == "exclamationmark" || quickSaveSymbol == "arrow.clockwise"
  }

  private var quickSaveBackground: Color {
    if quickSaveIsSuccess {
      return Color(red: 0.17, green: 0.45, blue: 0.29)
    }
    if quickSaveIsFailure {
      return Color(red: 0.62, green: 0.22, blue: 0.21)
    }
    return Color(white: 0.18)
  }

  @ViewBuilder
  private var label: some View {
    if let label = props.label {
      if let systemImage = props.systemImage {
        Label(title: { Text(label) }, icon: { Image(systemName: systemImage) })
      } else {
        Text(label)
      }
    } else {
      Children()
    }
  }

  var body: some View {
    if props.target == saveAppQuickSaveTarget {
      SwiftUI.Button(
        role: props.role?.toNativeRole(),
        intent: SaveLinkQuickSaveIntent(activityID: props.source)
      ) {
        ZStack {
          RoundedRectangle(cornerRadius: 10, style: .circular)
            .fill(quickSaveBackground)
            .overlay {
              RoundedRectangle(cornerRadius: 10, style: .circular)
                .strokeBorder(Color.white.opacity(0.09), lineWidth: 0.5)
            }

          if quickSaveIsProcessing {
            ProgressView()
              .controlSize(.small)
              .tint(.white)
              .accessibilityHidden(true)
          } else {
            Image(systemName: quickSaveSymbol)
              .font(.system(size: 20, weight: .semibold))
              .foregroundStyle(.white)
              .contentTransition(.symbolEffect(.replace))
              .symbolEffect(.bounce, value: quickSaveIsSuccess)
          }
        }
        .frame(width: 44, height: 44)
        .contentShape(RoundedRectangle(cornerRadius: 10, style: .circular))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(props.label ?? "Salvar link")
      .disabled(quickSaveIsProcessing)
      .animation(.easeInOut(duration: 0.2), value: quickSaveSymbol)
      .padding(.top, 8)
    } else {
      SwiftUI.Button(
        role: props.role?.toNativeRole(),
        intent: LiveActivityUserInteraction(
          source: props.source,
          target: props.target
        )
      ) {
        label
      }
    }
  }
}
