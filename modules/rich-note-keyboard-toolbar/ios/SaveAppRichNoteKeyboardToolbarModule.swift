import ExpoModulesCore
import Combine
import SwiftUI
import UIKit

private final class RichNoteToolbarModel: ObservableObject {
  @Published var colorScheme: ColorScheme?
  var sendAction: ((String) -> Void)?
}

private struct RichNoteKeyboardToolbarContent: View {
  @ObservedObject var model: RichNoteToolbarModel

  private let controlSize: CGFloat = 44

  var body: some View {
    HStack(spacing: 2) {
      Menu {
        menuAction("Texto normal", symbol: "text.alignleft", action: "format.body")
        menuAction("Título", symbol: "textformat.size.larger", action: "format.title")
        menuAction("Subtítulo", symbol: "textformat.size", action: "format.subtitle")
        Divider()
        menuAction("Negrito", symbol: "bold", action: "format.bold")
        menuAction("Itálico", symbol: "italic", action: "format.italic")
        menuAction("Sublinhado", symbol: "underline", action: "format.underline")
        Divider()
        menuAction("Lista com marcadores", symbol: "list.bullet", action: "format.bullet")
        menuAction("Lista numerada", symbol: "list.number", action: "format.numbered")
      } label: {
        toolbarSymbol("textformat", label: "Formatação")
      }
      .accessibilityLabel("Formatação")

      toolbarButton("checklist", label: "Inserir checklist", action: "insertChecklist")
      toolbarButton("photo", label: "Inserir imagem", action: "insertImage")
      toolbarButton("link", label: "Inserir link", action: "insertLink")

      Menu {
        menuAction("Lista com marcadores", symbol: "list.bullet", action: "format.bullet")
        menuAction("Lista numerada", symbol: "list.number", action: "format.numbered")
        menuAction("Remover formatação", symbol: "textformat", action: "format.clear")
        Divider()
        menuAction("Inserir link", symbol: "link", action: "insertLink")
      } label: {
        toolbarSymbol("ellipsis", label: "Mais opções")
      }
      .accessibilityLabel("Mais opções")

      toolbarButton("keyboard.chevron.compact.down", label: "Recolher teclado", action: "dismissKeyboard")
    }
    .padding(.horizontal, 5)
    .frame(width: 300, height: 56)
    .background {
      if #available(iOS 26.0, *) {
        Capsule()
          .fill(.clear)
          .glassEffect(.regular.interactive(), in: Capsule())
      } else {
        Capsule()
          .fill(.regularMaterial)
          .overlay {
            Capsule().strokeBorder(Color.primary.opacity(0.09), lineWidth: 0.5)
          }
      }
    }
    .preferredColorScheme(model.colorScheme)
  }

  private func toolbarButton(_ symbol: String, label: String, action: String) -> some View {
    Button {
      model.sendAction?(action)
    } label: {
      toolbarSymbol(symbol, label: label)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }

  private func toolbarSymbol(_ symbol: String, label: String) -> some View {
    Image(systemName: symbol)
      .font(.system(size: 18, weight: .medium))
      .frame(width: controlSize, height: controlSize)
      .contentShape(Rectangle())
      .accessibilityLabel(label)
  }

  private func menuAction(_ title: String, symbol: String, action: String) -> some View {
    Button {
      model.sendAction?(action)
    } label: {
      Label(title, systemImage: symbol)
    }
  }
}

private final class RichNoteToolbarPassthroughView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard !isHidden, isUserInteractionEnabled,
          let hitView = super.hitTest(point, with: event), hitView !== self else {
      return nil
    }
    return hitView
  }
}

public final class SaveAppRichNoteKeyboardToolbarView: ExpoView {
  let onAction = EventDispatcher()

  private let model = RichNoteToolbarModel()
  private var isActive = true
  private weak var attachedWindow: UIWindow?
  private weak var parentController: UIViewController?
  private var overlayView: RichNoteToolbarPassthroughView?
  private var hostingController: UIHostingController<RichNoteKeyboardToolbarContent>?
  private var overlayConstraints: [NSLayoutConstraint] = []
  private var toolbarConstraints: [NSLayoutConstraint] = []

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    isAccessibilityElement = false
    model.sendAction = { [weak self] action in
      self?.onAction(["action": action])
    }
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    guard let window else {
      detachToolbar()
      return
    }
    attachToolbar(to: window)
  }

  func setActive(_ active: Bool) {
    isActive = active
    hostingController?.view.isHidden = !active
  }

  func setColorScheme(_ value: String) {
    switch value {
    case "dark": model.colorScheme = .dark
    case "light": model.colorScheme = .light
    default: model.colorScheme = nil
    }
  }

  private func attachToolbar(to window: UIWindow) {
    guard let parent = nearestViewController(in: window) else { return }
    guard attachedWindow !== window || parentController !== parent || hostingController == nil else { return }
    detachToolbar()

    parent.loadViewIfNeeded()
    let parentView = parent.view!

    let overlay = RichNoteToolbarPassthroughView()
    overlay.translatesAutoresizingMaskIntoConstraints = false
    overlay.backgroundColor = .clear
    overlay.clipsToBounds = false
    overlay.isAccessibilityElement = false
    overlay.accessibilityViewIsModal = false
    parentView.addSubview(overlay)
    overlayConstraints = [
      overlay.leadingAnchor.constraint(equalTo: parentView.leadingAnchor),
      overlay.trailingAnchor.constraint(equalTo: parentView.trailingAnchor),
      overlay.topAnchor.constraint(equalTo: parentView.topAnchor),
      overlay.bottomAnchor.constraint(equalTo: parentView.bottomAnchor),
    ]
    NSLayoutConstraint.activate(overlayConstraints)

    parentView.keyboardLayoutGuide.usesBottomSafeArea = true
    parentView.keyboardLayoutGuide.followsUndockedKeyboard = true

    let host = UIHostingController(rootView: RichNoteKeyboardToolbarContent(model: model))
    host.view.backgroundColor = .clear
    host.view.isOpaque = false
    host.view.translatesAutoresizingMaskIntoConstraints = false
    host.view.isHidden = !isActive
    parent.addChild(host)
    overlay.addSubview(host.view)
    toolbarConstraints = [
      host.view.centerXAnchor.constraint(equalTo: parentView.safeAreaLayoutGuide.centerXAnchor),
      host.view.widthAnchor.constraint(equalToConstant: 300),
      host.view.widthAnchor.constraint(lessThanOrEqualTo: parentView.safeAreaLayoutGuide.widthAnchor, constant: -16),
      host.view.heightAnchor.constraint(equalToConstant: 60),
      host.view.bottomAnchor.constraint(equalTo: parentView.keyboardLayoutGuide.topAnchor, constant: -8),
    ]
    NSLayoutConstraint.activate(toolbarConstraints)
    host.didMove(toParent: parent)

    parentView.bringSubviewToFront(overlay)
    attachedWindow = window
    parentController = parent
    overlayView = overlay
    hostingController = host
  }

  private func nearestViewController(in window: UIWindow) -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController {
        return controller
      }
      responder = current.next
    }
    return window.rootViewController
  }

  private func detachToolbar() {
    NSLayoutConstraint.deactivate(toolbarConstraints)
    NSLayoutConstraint.deactivate(overlayConstraints)
    toolbarConstraints.removeAll()
    overlayConstraints.removeAll()

    if let hostingController {
      hostingController.willMove(toParent: nil)
      hostingController.view.removeFromSuperview()
      hostingController.removeFromParent()
    }
    overlayView?.removeFromSuperview()
    hostingController = nil
    overlayView = nil
    parentController = nil
    attachedWindow = nil
  }
}

public final class SaveAppRichNoteKeyboardToolbarModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SaveAppRichNoteKeyboardToolbar")

    View(SaveAppRichNoteKeyboardToolbarView.self) {
      Name("Dock")
      Events("onAction")

      Prop("active", true) { (view: SaveAppRichNoteKeyboardToolbarView, active: Bool) in
        view.setActive(active)
      }

      Prop("colorScheme", "system") { (view: SaveAppRichNoteKeyboardToolbarView, colorScheme: String) in
        view.setColorScheme(colorScheme)
      }
    }
  }
}
