import SwiftUI
import ExpoModulesCore
import ExpoUI
import OSLog

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
  @State private var lastLoggedQuickSaveStatus: String?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  private let diagnosticLogger = Logger(subsystem: "com.luanrigatti.saveapp", category: "quick-save.renderer")

  private var quickSaveIsProcessing: Bool {
    diagnosticStatus == "processing"
  }

  private var quickSaveIsSuccess: Bool {
    diagnosticStatus == "queued"
  }

  private var quickSaveIsFailure: Bool {
    diagnosticStatus == "invalid" || diagnosticStatus == "failed"
  }

  private var quickSaveIsQueuedDuplicate: Bool {
    diagnosticStatus == "alreadyQueued" || diagnosticStatus == "alreadySaved"
  }

  private var diagnosticStatus: String {
    switch props.label {
    case "Salvar link": return "ready"
    case "Salvando link": return "processing"
    case "Adicionado à fila": return "queued"
    case "Link já guardado": return "alreadyQueued"
    case "Já salvo na biblioteca": return "alreadySaved"
    case "Link inválido": return "invalid"
    case "Não foi possível salvar": return "failed"
    default: return "unknown"
    }
  }

  private func logObservedStatusIfChanged() {
    let status = diagnosticStatus
    guard lastLoggedQuickSaveStatus != status else { return }
    lastLoggedQuickSaveStatus = status
    diagnosticLogger.notice("event=renderer.status.observed state=\(status, privacy: .public)")
  }

  private var quickSaveBackground: Color {
    if quickSaveIsSuccess {
      return Color(red: 0.13, green: 0.45, blue: 0.27)
    }
    if quickSaveIsQueuedDuplicate {
      return Color(white: 0.30)
    }
    if quickSaveIsFailure {
      return Color(red: 0.62, green: 0.22, blue: 0.21)
    }
    return .clear
  }

  private var quickSaveSymbolForStatus: String {
    switch diagnosticStatus {
    case "invalid": return "exclamationmark"
    case "failed": return "xmark"
    default: return "checkmark"
    }
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
          if quickSaveIsProcessing {
            Circle()
              .trim(from: 0.08, to: 0.92)
              .stroke(Color.white, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
              .frame(width: 44, height: 44)
              .rotationEffect(.degrees(-90))
              .accessibilityHidden(true)
          } else if quickSaveIsSuccess || quickSaveIsQueuedDuplicate || quickSaveIsFailure {
            Circle()
              .fill(quickSaveBackground)
              .overlay {
                if reduceMotion {
                  Image(systemName: quickSaveSymbolForStatus)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .accessibilityHidden(true)
                } else {
                  Image(systemName: quickSaveSymbolForStatus)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .contentTransition(.symbolEffect(.replace))
                    .symbolEffect(.bounce, value: quickSaveIsSuccess)
                    .accessibilityHidden(true)
                }
              }
          } else {
            Circle()
              .stroke(Color.white, lineWidth: 2)
              .overlay {
                Image(systemName: "checkmark")
                  .font(.system(size: 18, weight: .medium))
                  .foregroundStyle(.white)
                  .accessibilityHidden(true)
              }
          }
        }
        .frame(width: 44, height: 44)
        .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(props.label ?? "Salvar link")
      .disabled(quickSaveIsProcessing)
      .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: diagnosticStatus)
      .padding(.top, 8)
      .onAppear { logObservedStatusIfChanged() }
      .onChange(of: diagnosticStatus) { _, _ in logObservedStatusIfChanged() }
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
