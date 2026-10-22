const fs = require('fs');
const path = require('path');
const { createRunOncePlugin, withDangerousMod } = require('expo/config-plugins');

const PATCH_MARKERS = {
  prop: 'Starter: hidesBottomBarWhenPushed prop',
  setter: 'Starter: hidesBottomBarWhenPushed setter',
  update: 'Starter: hidesBottomBarWhenPushed update',
  sharedToolbarHeader: 'Starter: shared tab toolbar header',
  sharedToolbarController: 'Starter: shared tab toolbar controller',
  sharedToolbarIndex: 'Starter: shared tab toolbar index',
  sharedToolbarViewController: 'Starter: shared tab toolbar view controller',
  sharedToolbarTabSelection: 'Starter: shared tab toolbar UITab selection',
  sharedToolbarTransitionObserver: 'Starter: shared tab toolbar transition observer',
  sharedToolbarShouldSelect: 'Starter: shared tab toolbar should select',
  sharedToolbarFlush: 'Starter: shared tab toolbar flush',
  sharedToolbarConfigImport: 'Starter: shared tab toolbar config import',
  sharedToolbarConfig: 'Starter: shared tab toolbar config helpers',
  sharedToolbarConfigHelpers: 'Starter: shared tab toolbar config helpers',
  sharedToolbarConfigHidden: 'Starter: shared tab toolbar config hidden',
  sharedToolbarConfigVisible: 'Starter: shared tab toolbar config visible',
  sharedToolbarPopStaging: 'Starter: shared toolbar pop destination staging',
  sharedToolbarPopMethod: 'Starter: shared toolbar pop staging method',
  homeToolbarSemanticComparison: 'Starter: Home toolbar semantic comparison',
  homeToolbarReplacementPolicy: 'Starter: Home toolbar replacement policy',
  initialHomeReplaceStaging: 'Starter: initial Splash Home toolbar staging',
  initialHomeReplaceRegistration: 'Starter: initial Splash Home registration guard',
  initialHomeReplaceHelpers: 'Starter: initial Home toolbar ownership helpers',
};

const LEGACY_SHARED_TOOLBAR_TRANSITION_GUARD = `  BOOL isTransitionCompletion = [reason isEqualToString:@"navigation-did-show"];
  if (!isTransitionCompletion && (sharedNavigationController.transitionCoordinator != nil ||
                                 nestedNavigationController.transitionCoordinator != nil)) {
    return; // UIKit owns the in-flight morph; didShow reconciles the actual destination.
  }`;

const SHARED_TOOLBAR_TRANSITION_GUARD = `  BOOL isNavigationTransitionCompletion = [reason isEqualToString:@"navigation-did-show"];
  BOOL isTabTransitionCompletion = [reason isEqualToString:@"tab-transition-completion"];
  BOOL isTransitionCompletion = isNavigationTransitionCompletion || isTabTransitionCompletion;
  if (!isNavigationTransitionCompletion &&
      (sharedNavigationController.transitionCoordinator != nil ||
       nestedNavigationController.transitionCoordinator != nil)) {
    return; // UIKit owns the in-flight navigation morph; didShow reconciles the destination.
  }
  id<UIViewControllerTransitionCoordinator> tabTransitionCoordinator = self.transitionCoordinator;
  if (tabTransitionCoordinator == nil && !isNavigationTransitionCompletion) {
    tabTransitionCoordinator = viewController.transitionCoordinator;
  }
  if (!isTabTransitionCompletion && tabTransitionCoordinator != nil) {
    RNSObserveSharedToolbarTabTransition(self, viewController);
    return; // UIKit owns the in-flight morph; native completion reconciles the selected destination.
  }`;

const SHARED_TOOLBAR_NAVIGATION_OPERATION_HELPER = `#import <objc/runtime.h>

static char RNSSharedToolbarStableNavigationStackKey;

static NSString *RNSSharedToolbarNavigationOperation(
    UINavigationController *navigationController,
    NSArray<UIViewController *> *previousStack,
    UIViewController *toViewController,
    UIViewController **fromViewControllerOut)
{
  if (fromViewControllerOut != NULL) *fromViewControllerOut = nil;
  if (previousStack.count == 0) return @"initial";

  UIViewController *fromViewController = previousStack.lastObject;
  if (fromViewControllerOut != NULL) *fromViewControllerOut = fromViewController;
  NSUInteger fromIndex = [previousStack indexOfObjectIdenticalTo:fromViewController];
  NSUInteger toIndex = [previousStack indexOfObjectIdenticalTo:toViewController];
  NSArray<UIViewController *> *currentStack = navigationController.viewControllers;

  if (toIndex != NSNotFound && fromIndex != NSNotFound && toIndex < fromIndex) {
    return @"pop";
  }

  BOOL previousStackIsPrefix = currentStack.count > previousStack.count;
  for (NSUInteger index = 0; previousStackIsPrefix && index < previousStack.count; index++) {
    previousStackIsPrefix = currentStack[index] == previousStack[index];
  }
  if (toIndex == NSNotFound && previousStackIsPrefix) return @"push";
  if (toIndex == NSNotFound && fromIndex == previousStack.count - 1 &&
      [currentStack indexOfObjectIdenticalTo:toViewController] != NSNotFound) {
    return @"replace";
  }
  return @"other";
}`;

function ensureSharedToolbarPopMethodDeclaration(headerPath) {
  const contents = fs.readFileSync(headerPath, 'utf8');
  const declaration =
    '- (NSString *)stageSharedToolbarItemsForNavigationPopInNavigationController:' +
    '(UINavigationController *)navigationController fromViewController:' +
    '(UIViewController *)fromViewController toViewController:(UIViewController *)toViewController;';
  if (contents.includes(declaration)) return;
  const anchor = '- (void)synchronizeSharedNavigationBarWithReason:(NSString *)reason;';
  if (!contents.includes(anchor)) {
    throw new Error(`Não foi possível declarar o staging da toolbar em ${headerPath}.`);
  }
  fs.writeFileSync(headerPath, contents.replace(anchor, `${anchor}\n${declaration}`));
}

function ensureSharedToolbarNavigationOperationHelper(stackPath) {
  const contents = fs.readFileSync(stackPath, 'utf8');
  if (contents.includes('static NSString *RNSSharedToolbarNavigationOperation(')) return;
  const anchor =
    'static RNSTabBarController *RNSFindSharedToolbarTabsController(' +
    'UIViewController *controller)';
  if (!contents.includes(anchor)) {
    throw new Error(`Não foi possível preparar a pilha de navegação em ${stackPath}.`);
  }
  fs.writeFileSync(
    stackPath,
    contents.replace(anchor, `${SHARED_TOOLBAR_NAVIGATION_OPERATION_HELPER}\n\n${anchor}`),
  );
}

function patchFile(filePath, needle, replacement, marker) {
  const contents = fs.readFileSync(filePath, 'utf8');

  if (contents.includes(marker)) return;

  if (!contents.includes(needle)) {
    throw new Error(`Não foi possível aplicar a integração de tab bar em ${filePath}.`);
  }

  const markedReplacement = replacement.includes(marker)
    ? replacement
    : `// ${marker}\n${replacement}`;

  fs.writeFileSync(filePath, contents.replace(needle, markedReplacement));
}

function replaceMarkedPatchFragment(
  filePath,
  marker,
  previousFragment,
  currentFragment,
  knownCurrentFragments = [],
) {
  const contents = fs.readFileSync(filePath, 'utf8');
  const markerIndex = contents.indexOf(marker);

  if (markerIndex === -1) return;

  const previousIndex = contents.indexOf(previousFragment, markerIndex);
  if (previousIndex !== -1) {
    const updatedContents =
      contents.slice(0, previousIndex) +
      currentFragment +
      contents.slice(previousIndex + previousFragment.length);
    fs.writeFileSync(filePath, updatedContents);
    return;
  }

  if (
    contents.indexOf(currentFragment, markerIndex) !== -1 ||
    knownCurrentFragments.some((fragment) => contents.indexOf(fragment, markerIndex) !== -1)
  ) {
    return;
  }

  throw new Error(
    `Não foi possível atualizar a integração de toolbar marcada (${marker}) em ${filePath}.`,
  );
}

function upgradeSharedToolbarUITabResolvers(controller) {
  replaceMarkedPatchFragment(
    controller,
    'Starter: shared toolbar ownership capture',
    'for (UIViewController *tab in self.viewControllers)',
    'for (UIViewController *tab in [self installedScreenControllers])',
    [
      'NSArray<RNSTabsScreenViewController *> *installedControllers = [self installedScreenControllers];\n' +
        '  for (NSUInteger tabIndex = 0; tabIndex < installedControllers.count; tabIndex++)',
    ],
  );
  replaceMarkedPatchFragment(
    controller,
    'Starter: shared tab toolbar index',
    'if (selectedIndex < self.viewControllers.count) {\n    [self prepareSharedNavigationBarForViewController:self.viewControllers[selectedIndex] reason:@"tab-selection-index"];\n  }',
    'NSArray<RNSTabsScreenViewController *> *installedControllers = [self installedScreenControllers];\n  if (selectedIndex < installedControllers.count) {\n    [self prepareSharedNavigationBarForViewController:installedControllers[selectedIndex] reason:@"tab-selection-index"];\n  }',
  );
  replaceMarkedPatchFragment(
    controller,
    'Starter: shared tab toolbar controller',
    'NSInteger tabIndex = [self.viewControllers indexOfObject:viewController];',
    'NSInteger tabIndex = [[self installedScreenControllers] indexOfObject:viewController];',
  );
  replaceMarkedPatchFragment(
    controller,
    'Starter: Home toolbar replacement policy',
    'BOOL isSelectedHomeTab = tabIndex == 0 && self.selectedIndex == (NSUInteger)tabIndex;',
    'BOOL isSelectedHomeTab = tabIndex == 0 && [self isScreenControllerCurrentlySelected:viewController];',
  );
  replaceMarkedPatchFragment(
    controller,
    'Starter: shared toolbar ownership reconcile',
    '(isTransitionCompletion || (self.selectedViewController == viewController &&',
    '(isTransitionCompletion || ([self isScreenControllerCurrentlySelected:viewController] &&',
  );
  replaceMarkedPatchFragment(
    controller,
    'Starter: shared tab toolbar controller',
    'if (self.selectedViewController != nil) {\n    [self prepareSharedNavigationBarForViewController:self.selectedViewController reason:reason];\n  }',
    'UIViewController *selectedViewController = [self effectiveSelectedViewController];\n  if (selectedViewController != nil) {\n    [self prepareSharedNavigationBarForViewController:selectedViewController reason:reason];\n  }',
  );
}

function upgradeSharedToolbarTabTransition(controller) {
  const contents = fs.readFileSync(controller, 'utf8');
  const markerIndex = contents.indexOf('Starter: shared toolbar ownership transition');
  if (markerIndex === -1) return;

  const hasCurrentGuard =
    contents.indexOf('BOOL isNavigationTransitionCompletion =', markerIndex) !== -1 &&
    contents.indexOf(
      'id<UIViewControllerTransitionCoordinator> tabTransitionCoordinator = self.transitionCoordinator;',
      markerIndex,
    ) !== -1 &&
    contents.indexOf('RNSObserveSharedToolbarTabTransition(self, viewController);', markerIndex) !==
      -1;
  if (hasCurrentGuard) return;

  replaceMarkedPatchFragment(
    controller,
    'Starter: shared toolbar ownership transition',
    LEGACY_SHARED_TOOLBAR_TRANSITION_GUARD,
    SHARED_TOOLBAR_TRANSITION_GUARD,
  );
}

function patchSharedToolbarOwnership(screensRoot) {
  const header = path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.h');
  const controller = path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.mm');
  const config = path.join(screensRoot, 'ios', 'RNSScreenStackHeaderConfig.mm');
  const stack = path.join(screensRoot, 'ios', 'RNSScreenStack.mm');
  const patch = (file, needle, replacement, name) =>
    patchFile(file, needle, replacement, `Starter: shared toolbar ownership ${name}`);

  patchFile(
    controller,
    '#import "RNSTabBarController.h"',
    '#import "RNSTabBarController.h"\n#import "RNSScreen.h"',
    'Starter: initial Home route identity import',
  );

  upgradeSharedToolbarUITabResolvers(controller);
  upgradeSharedToolbarTabTransition(controller);

  patch(
    controller,
    '@property (nonatomic, readwrite) BOOL shouldProgressStateOnMoreNavigationControllerPush;',
    `@property (nonatomic, readwrite) BOOL shouldProgressStateOnMoreNavigationControllerPush;\n- (nonnull NSArray<RNSTabsScreenViewController *> *)installedScreenControllers;\n- (nullable UIViewController *)effectiveSelectedViewController;\n- (BOOL)isScreenControllerCurrentlySelected:(nonnull UIViewController *)screenController;\n- (NSString *)initialHomeToolbarReplaceEligibilityForViewController:(UIViewController *)viewController\n                                              navigationController:(UINavigationController *)navigationController\n                                         sharedNavigationController:(UINavigationController * _Nullable * _Nullable)sharedNavigationControllerOut\n                                          tabsScreenViewController:(UIViewController * _Nullable * _Nullable)tabsScreenViewControllerOut\n                                               fromViewController:(UIViewController * _Nullable * _Nullable)fromViewControllerOut;\n- (NSString *)stageInitialHomeToolbarItemsForViewController:(UIViewController *)viewController\n                                       navigationController:(UINavigationController *)navigationController\n                                                  leftItems:(NSArray<UIBarButtonItem *> *)leftItems\n                                                 rightItems:(NSArray<UIBarButtonItem *> *)rightItems;\n- (BOOL)shouldSkipInitialHomeToolbarRegistration:(UIBarButtonItem *)item\n                                  fromViewController:(UIViewController *)viewController\n                                 navigationController:(UINavigationController *)navigationController\n                                                 side:(NSString *)side;`,
    'resolvers',
  );

  patch(
    header,
    '- (void)synchronizeSharedNavigationBarWithReason:(NSString *)reason;',
    `- (void)synchronizeSharedNavigationBarWithReason:(NSString *)reason;
- (void)captureSharedToolbarItemsFromViewController:(UIViewController *)viewController navigationController:(UINavigationController *)navigationController;
- (BOOL)shouldSkipSharedToolbarItemRegistration:(UIBarButtonItem *)item
                             fromViewController:(UIViewController *)viewController
                            navigationController:(UINavigationController *)navigationController
                                            side:(NSString *)side
                    sourceNavigationBarWasHidden:(BOOL)sourceNavigationBarWasHidden;
- (NSDictionary<NSString *, NSArray<UIBarButtonItem *> *> *)sourceToolbarRegistrationItemsForViewController:(UIViewController *)viewController
                                                                                     navigationController:(UINavigationController *)navigationController
                                                                                                  leftItems:(NSArray<UIBarButtonItem *> *)leftItems
                                                                                                 rightItems:(NSArray<UIBarButtonItem *> *)rightItems
                                                                                       skippedSharedLeftItems:(NSArray<UIBarButtonItem *> *)skippedSharedLeftItems
                                                                                      skippedSharedRightItems:(NSArray<UIBarButtonItem *> *)skippedSharedRightItems;`,
    'capture-header',
  );
  patch(
    controller,
    'static UINavigationController *RNSFindNestedNavigationController(UIViewController *rootViewController)\n{',
    `// Retained configuration is not a second UIKit navigation-item owner.
static char RNSSharedToolbarMaterializedItemsKey;
static char RNSSharedToolbarPendingMaterializedItemsKey;

static BOOL RNSSharedToolbarItemsNeedAttachment(NSArray<UIBarButtonItem *> *items, UINavigationBar *bar)
{
  if (bar.window == nil) return NO; // Initial presentation is reconciled at didShow.
  for (UIBarButtonItem *item in items) {
    UIView *view = item.customView;
    if (view != nil && !view.hidden && view.alpha > 0 &&
        (view.window != bar.window || ![view isDescendantOfView:bar])) return YES;
  }
  return NO;
}

static char RNSSharedToolbarExperimentSkippedRepairRolesKey;

static inline NSString *RNSCurrentToolbarMorphExperimentVariant(void)
{
  id variant = NSBundle.mainBundle.infoDictionary[@"StarterToolbarMorphExperimentVariant"];
  return [variant isEqual:@"B"] ? @"B" : @"A";
}

static inline NSString *RNSRoleForToolbarMorphIdentifier(NSString *identifier)
{
  if ([identifier isEqualToString:@"toolbar-morph:home-search"] ||
      [identifier hasPrefix:@"home-toolbar-item:search:"]) return @"home-search";
  if ([identifier isEqualToString:@"toolbar-morph:settings-profile"]) return @"settings-profile";
  return nil;
}

static inline NSString *RNSFindToolbarMorphRoleInView(UIView *view, NSUInteger depth)
{
  if (view == nil || depth > 8) return nil;
  NSString *role = RNSRoleForToolbarMorphIdentifier(view.accessibilityIdentifier);
  if (role != nil) return role;
  for (UIView *child in view.subviews) {
    role = RNSFindToolbarMorphRoleInView(child, depth + 1);
    if (role != nil) return role;
  }
  return nil;
}

static inline NSString *RNSRoleForToolbarMorphItem(UIBarButtonItem *item)
{
  return RNSFindToolbarMorphRoleInView(item.customView, 0);
}

static BOOL RNSShouldSkipSharedToolbarExperimentRepairOnce(
    RNSTabBarController *controller,
    NSArray<UIBarButtonItem *> *items,
    NSString *reason)
{
  if (controller == nil || items.count == 0 ||
      ![RNSCurrentToolbarMorphExperimentVariant() isEqualToString:@"B"]) {
    return NO;
  }

  NSString *role = nil;
  for (UIBarButtonItem *item in items) {
    NSString *itemRole = RNSRoleForToolbarMorphItem(item);
    if (![itemRole isEqualToString:@"home-search"] &&
        ![itemRole isEqualToString:@"settings-profile"]) {
      return NO;
    }
    if (role != nil && ![role isEqualToString:itemRole]) {
      return NO;
    }
    role = itemRole;
  }

  NSMutableSet<NSString *> *skippedRoles =
      objc_getAssociatedObject(controller, &RNSSharedToolbarExperimentSkippedRepairRolesKey);
  if ([skippedRoles containsObject:role]) {
    return NO;
  }
  if (![reason isEqualToString:@"tab-transition-completion"]) return NO;
  if (skippedRoles == nil) {
    skippedRoles = [NSMutableSet set];
    objc_setAssociatedObject(
        controller,
        &RNSSharedToolbarExperimentSkippedRepairRolesKey,
        skippedRoles,
        OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }

  [skippedRoles addObject:role];
  return YES;
}

static UINavigationController *RNSFindNestedNavigationController(UIViewController *rootViewController)
{`,
    'attachment',
  );
  patch(
    controller,
    'static BOOL RNSSharedToolbarItemsNeedAttachment(NSArray<UIBarButtonItem *> *items, UINavigationBar *bar)\n{',
    `static char RNSSharedToolbarPendingTabTransitionKey;

static void RNSObserveSharedToolbarTabTransition(
    RNSTabBarController *controller,
    UIViewController *viewController)
{
  id<UIViewControllerTransitionCoordinator> transitionCoordinator =
      controller.transitionCoordinator ?: viewController.transitionCoordinator;
  if (transitionCoordinator == nil ||
      objc_getAssociatedObject(controller, &RNSSharedToolbarPendingTabTransitionKey) == transitionCoordinator) {
    return;
  }

  objc_setAssociatedObject(
      controller,
      &RNSSharedToolbarPendingTabTransitionKey,
      transitionCoordinator,
      OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  __weak RNSTabBarController *weakController = controller;
  __weak id<UIViewControllerTransitionCoordinator> weakTransitionCoordinator = transitionCoordinator;
  [transitionCoordinator animateAlongsideTransition:nil completion:^(id<UIViewControllerTransitionCoordinatorContext> context) {
    (void)context;
    RNSTabBarController *strongController = weakController;
    id<UIViewControllerTransitionCoordinator> completedCoordinator = weakTransitionCoordinator;
    if (strongController == nil || completedCoordinator == nil) return;

    if (objc_getAssociatedObject(strongController, &RNSSharedToolbarPendingTabTransitionKey) == completedCoordinator) {
      objc_setAssociatedObject(
          strongController,
          &RNSSharedToolbarPendingTabTransitionKey,
          nil,
          OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }

    UIViewController *selectedViewController = [strongController effectiveSelectedViewController];
    id<UIViewControllerTransitionCoordinator> activeCoordinator =
        strongController.transitionCoordinator ?: selectedViewController.transitionCoordinator;
    if (activeCoordinator != nil && activeCoordinator != completedCoordinator) {
      RNSObserveSharedToolbarTabTransition(strongController, selectedViewController);
      return;
    }

    [strongController synchronizeSharedNavigationBarWithReason:@"tab-transition-completion"];
  }];
}

static BOOL RNSSharedToolbarItemsNeedAttachment(NSArray<UIBarButtonItem *> *items, UINavigationBar *bar)
{`,
    PATCH_MARKERS.sharedToolbarTransitionObserver,
  );
  patch(
    controller,
    '- (void)prepareSharedNavigationBarForViewController:(UIViewController *)viewController reason:(NSString *)reason\n{',
    `// ${PATCH_MARKERS.initialHomeReplaceStaging}
- (NSString *)initialHomeToolbarReplaceEligibilityForViewController:(UIViewController *)viewController
                                              navigationController:(UINavigationController *)navigationController
                                         sharedNavigationController:(UINavigationController * _Nullable * _Nullable)sharedNavigationControllerOut
                                          tabsScreenViewController:(UIViewController * _Nullable * _Nullable)tabsScreenViewControllerOut
                                               fromViewController:(UIViewController * _Nullable * _Nullable)fromViewControllerOut
{
  if (sharedNavigationControllerOut != NULL) *sharedNavigationControllerOut = nil;
  if (tabsScreenViewControllerOut != NULL) *tabsScreenViewControllerOut = nil;
  if (fromViewControllerOut != NULL) *fromViewControllerOut = nil;
  if (viewController == nil || navigationController == nil ||
      navigationController.viewControllers.count != 1 || navigationController.topViewController != viewController) {
    return @"home_root_mismatch";
  }

  RNSTabsScreenViewController *homeTabViewController = nil;
  NSArray<RNSTabsScreenViewController *> *installedControllers = [self installedScreenControllers];
  if (installedControllers.count == 0 || installedControllers[0] == nil ||
      ![self isScreenControllerCurrentlySelected:installedControllers[0]] ||
      RNSFindNestedNavigationController(installedControllers[0]) != navigationController) {
    return @"home_tab_not_selected";
  }
  homeTabViewController = installedControllers[0];

  UIViewController *tabsScreenViewController = self.parentViewController;
  UINavigationController *sharedNavigationController = tabsScreenViewController.navigationController;
  if (tabsScreenViewController == nil || sharedNavigationController == nil ||
      ![tabsScreenViewController isKindOfClass:[RNSScreen class]]) {
    return @"shared_navigation_unavailable";
  }

  id<UIViewControllerTransitionCoordinator> rootTransitionCoordinator =
      sharedNavigationController.transitionCoordinator;
  if (rootTransitionCoordinator == nil) return @"root_transition_unavailable";

  UIViewController *fromViewController =
      [rootTransitionCoordinator viewControllerForKey:UITransitionContextFromViewControllerKey];
  UIViewController *toViewController =
      [rootTransitionCoordinator viewControllerForKey:UITransitionContextToViewControllerKey];
  RNSScreenView *sourceScreenView = [fromViewController isKindOfClass:[RNSScreen class]]
      ? [(RNSScreen *)fromViewController screenView] : nil;
  NSString *sourceScreenId = sourceScreenView.screenId;
  NSArray<UIViewController *> *sharedStackControllers = sharedNavigationController.viewControllers ?: @[];
  BOOL sharedStackIsSingleHomeRoot = sharedStackControllers.count == 1 &&
      sharedStackControllers[0] == tabsScreenViewController;
  BOOL sharedStackIsTransientSplashReplace = fromViewController != nil &&
      sharedStackControllers.count == 2 &&
      ((sharedStackControllers[0] == fromViewController &&
        sharedStackControllers[1] == tabsScreenViewController) ||
       (sharedStackControllers[1] == fromViewController &&
        sharedStackControllers[0] == tabsScreenViewController));
  BOOL isSplashIndexReplace = [sourceScreenId hasPrefix:@"index-"] &&
      toViewController == tabsScreenViewController &&
      (sharedStackIsSingleHomeRoot || sharedStackIsTransientSplashReplace) &&
      sharedNavigationController.topViewController == tabsScreenViewController;
  if (!isSplashIndexReplace) return @"not_splash_home_replace";
  if (!rootTransitionCoordinator.isAnimated || rootTransitionCoordinator.isInteractive ||
      rootTransitionCoordinator.isCancelled) {
    return @"incompatible_root_transition";
  }

  id<UIViewControllerTransitionCoordinator> tabTransitionCoordinator = self.transitionCoordinator;
  if (tabTransitionCoordinator != nil && tabTransitionCoordinator != rootTransitionCoordinator) {
    return @"incompatible_tab_transition";
  }
  id<UIViewControllerTransitionCoordinator> screenTransitionCoordinator = viewController.transitionCoordinator;
  if (screenTransitionCoordinator != nil && screenTransitionCoordinator != rootTransitionCoordinator &&
      screenTransitionCoordinator != navigationController.transitionCoordinator) {
    return @"incompatible_home_transition";
  }
  id<UIViewControllerTransitionCoordinator> nestedTransitionCoordinator = navigationController.transitionCoordinator;
  if (nestedTransitionCoordinator != nil && nestedTransitionCoordinator != rootTransitionCoordinator) {
    return @"incompatible_home_transition";
  }

  UINavigationBar *sharedNavigationBar = sharedNavigationController.navigationBar;
  UINavigationBar *sourceNavigationBar = navigationController.navigationBar;
  UIWindow *sharedWindow = sharedNavigationBar.window;
  if (sharedWindow == nil || sharedNavigationController.viewIfLoaded.window != sharedWindow ||
      tabsScreenViewController.viewIfLoaded.window != sharedWindow ||
      homeTabViewController.viewIfLoaded.window != sharedWindow ||
      viewController.viewIfLoaded.window != sharedWindow ||
      sourceNavigationBar.window != sharedWindow) {
    return @"shared_window_unavailable";
  }

  if (sharedNavigationControllerOut != NULL) *sharedNavigationControllerOut = sharedNavigationController;
  if (tabsScreenViewControllerOut != NULL) *tabsScreenViewControllerOut = tabsScreenViewController;
  if (fromViewControllerOut != NULL) *fromViewControllerOut = fromViewController;
  return @"eligible";
}

- (BOOL)shouldSkipInitialHomeToolbarRegistration:(UIBarButtonItem *)item
                                  fromViewController:(UIViewController *)viewController
                                 navigationController:(UINavigationController *)navigationController
                                                 side:(NSString *)side
{
  if (item == nil || item.customView == nil ||
      (![side isEqualToString:@"left"] && ![side isEqualToString:@"right"])) return NO;

  UINavigationController *sharedNavigationController = nil;
  UIViewController *tabsScreenViewController = nil;
  NSString *eligibility = [self initialHomeToolbarReplaceEligibilityForViewController:viewController
      navigationController:navigationController sharedNavigationController:&sharedNavigationController
      tabsScreenViewController:&tabsScreenViewController fromViewController:nil];
  if (![eligibility isEqualToString:@"eligible"]) return NO;

  UINavigationItem *sourceNavigationItem = viewController.navigationItem;
  UINavigationItem *destinationNavigationItem = tabsScreenViewController.navigationItem;
  NSDictionary *cachedItems = objc_getAssociatedObject(sourceNavigationItem, &RNSSharedToolbarMaterializedItemsKey);
  NSArray<UIBarButtonItem *> *cachedLeftItems = cachedItems[@"left"] ?: @[];
  NSArray<UIBarButtonItem *> *cachedRightItems = cachedItems[@"right"] ?: @[];
  NSArray<UIBarButtonItem *> *destinationLeftItems = destinationNavigationItem.leftBarButtonItems ?: @[];
  NSArray<UIBarButtonItem *> *destinationRightItems = destinationNavigationItem.rightBarButtonItems ?: @[];
  NSArray<UIBarButtonItem *> *sourceItems = [side isEqualToString:@"left"]
      ? (sourceNavigationItem.leftBarButtonItems ?: @[]) : (sourceNavigationItem.rightBarButtonItems ?: @[]);
  NSArray<UIBarButtonItem *> *cachedSideItems = [side isEqualToString:@"left"] ? cachedLeftItems : cachedRightItems;
  NSString *expectedSignature = [side isEqualToString:@"left"]
      ? @"home-toolbar-item:leading-anchor:44x44|" : @"home-toolbar-item:home-actions|";
  BOOL isCachedItem = NO;
  for (UIBarButtonItem *candidate in cachedSideItems) if (candidate == item) isCachedItem = YES;
  BOOL isOwnedByDestination = NO;
  for (UIBarButtonItem *candidate in ([side isEqualToString:@"left"] ? destinationLeftItems : destinationRightItems)) {
    if (candidate == item) isOwnedByDestination = YES;
  }
  BOOL sourceStillOwnsItem = NO;
  for (UIBarButtonItem *candidate in sourceItems) if (candidate == item) sourceStillOwnsItem = YES;
  if (!isCachedItem || !isOwnedByDestination || sourceStillOwnsItem ||
      !RNSHomeToolbarItemArraysHaveSameInstances(cachedLeftItems, destinationLeftItems) ||
      !RNSHomeToolbarItemArraysHaveSameInstances(cachedRightItems, destinationRightItems) ||
      ![RNSHomeToolbarItemSemanticSignature(item) hasPrefix:expectedSignature] ||
      !RNSHomeToolbarViewContainsAccessibilityIdentifier(item.customView,
          [side isEqualToString:@"left"] ? @"home-toolbar-item:leading-anchor:44x44" : @"home-toolbar-item:home-actions") ||
      ([side isEqualToString:@"right"] &&
       !RNSHomeToolbarViewContainsAccessibilityIdentifier(item.customView, @"toolbar-morph:home-search"))) {
    return NO;
  }

  for (RNSTabsScreenViewController *tabViewController in [self installedScreenControllers]) {
    UINavigationController *nestedController = RNSFindNestedNavigationController(tabViewController);
    for (UIViewController *screenController in nestedController.viewControllers) {
      UINavigationItem *owner = screenController.navigationItem;
      if (owner != sourceNavigationItem && owner != destinationNavigationItem &&
          RNSHomeToolbarNavigationItemContainsItem(owner, item)) return NO;
    }
  }
  for (UIViewController *screenController in sharedNavigationController.viewControllers) {
    UINavigationItem *owner = screenController.navigationItem;
    if (owner != destinationNavigationItem && RNSHomeToolbarNavigationItemContainsItem(owner, item)) return NO;
  }

  return YES;
}

// ${PATCH_MARKERS.initialHomeReplaceRegistration}
- (NSString *)stageInitialHomeToolbarItemsForViewController:(UIViewController *)viewController
                                       navigationController:(UINavigationController *)navigationController
                                                  leftItems:(NSArray<UIBarButtonItem *> *)leftItems
                                                 rightItems:(NSArray<UIBarButtonItem *> *)rightItems
{
  UINavigationController *sharedNavigationController = nil;
  UIViewController *tabsScreenViewController = nil;
  UIViewController *fromViewController = nil;
  NSString *eligibility = [self initialHomeToolbarReplaceEligibilityForViewController:viewController
      navigationController:navigationController sharedNavigationController:&sharedNavigationController
      tabsScreenViewController:&tabsScreenViewController fromViewController:&fromViewController];
  if (![eligibility isEqualToString:@"eligible"]) return eligibility;

  if (leftItems.count != 1 || rightItems.count != 1 || leftItems[0] == rightItems[0]) {
    return @"home_toolbar_identity_mismatch";
  }

  NSString *leftSignature = RNSHomeToolbarItemSemanticSignature(leftItems[0]) ?: @"";
  NSString *rightSignature = RNSHomeToolbarItemSemanticSignature(rightItems[0]) ?: @"";
  if (![leftSignature hasPrefix:@"home-toolbar-item:leading-anchor:44x44|"] ||
      ![rightSignature hasPrefix:@"home-toolbar-item:home-actions|"] ||
      !RNSHomeToolbarViewContainsAccessibilityIdentifier(leftItems[0].customView,
          @"home-toolbar-item:leading-anchor:44x44") ||
      !RNSHomeToolbarViewContainsAccessibilityIdentifier(rightItems[0].customView,
          @"home-toolbar-item:home-actions") ||
      !RNSHomeToolbarViewContainsAccessibilityIdentifier(rightItems[0].customView,
          @"toolbar-morph:home-search")) {
    return @"home_toolbar_identity_mismatch";
  }

  UINavigationItem *sourceNavigationItem = viewController.navigationItem;
  UINavigationItem *destinationNavigationItem = tabsScreenViewController.navigationItem;
  NSDictionary *cachedItems = objc_getAssociatedObject(sourceNavigationItem, &RNSSharedToolbarMaterializedItemsKey);
  NSArray<UIBarButtonItem *> *cachedLeftItems = cachedItems[@"left"] ?: @[];
  NSArray<UIBarButtonItem *> *cachedRightItems = cachedItems[@"right"] ?: @[];
  if (!RNSHomeToolbarItemArraysHaveSameInstances(cachedLeftItems, leftItems) ||
      !RNSHomeToolbarItemArraysHaveSameInstances(cachedRightItems, rightItems)) {
    return @"home_toolbar_cache_mismatch";
  }

  NSArray<UIBarButtonItem *> *sourceLeftItems = sourceNavigationItem.leftBarButtonItems ?: @[];
  NSArray<UIBarButtonItem *> *sourceRightItems = sourceNavigationItem.rightBarButtonItems ?: @[];
  NSArray<UIBarButtonItem *> *destinationLeftItems = destinationNavigationItem.leftBarButtonItems ?: @[];
  NSArray<UIBarButtonItem *> *destinationRightItems = destinationNavigationItem.rightBarButtonItems ?: @[];
  BOOL destinationIsEmpty = destinationLeftItems.count == 0 && destinationRightItems.count == 0;
  BOOL destinationAlreadyOwnsExactItems =
      RNSHomeToolbarItemArraysHaveSameInstances(destinationLeftItems, leftItems) &&
      RNSHomeToolbarItemArraysHaveSameInstances(destinationRightItems, rightItems);
  BOOL sourceOwnsExactItems = RNSHomeToolbarItemArraysHaveSameInstances(sourceLeftItems, leftItems) &&
      RNSHomeToolbarItemArraysHaveSameInstances(sourceRightItems, rightItems);
  BOOL sourceIsEmpty = sourceLeftItems.count == 0 && sourceRightItems.count == 0;
  if ((!destinationIsEmpty && !destinationAlreadyOwnsExactItems) ||
      (!sourceOwnsExactItems && !(sourceIsEmpty && destinationAlreadyOwnsExactItems))) {
    return @"home_toolbar_owner_conflict";
  }

  for (RNSTabsScreenViewController *tabViewController in [self installedScreenControllers]) {
    UINavigationController *nestedController = RNSFindNestedNavigationController(tabViewController);
    for (UIViewController *screenController in nestedController.viewControllers) {
      UINavigationItem *owner = screenController.navigationItem;
      if (owner == sourceNavigationItem || owner == destinationNavigationItem) continue;
      for (UIBarButtonItem *candidate in [leftItems arrayByAddingObjectsFromArray:rightItems]) {
        if (RNSHomeToolbarNavigationItemContainsItem(owner, candidate)) return @"home_toolbar_owner_conflict";
      }
    }
  }
  for (UIViewController *screenController in sharedNavigationController.viewControllers) {
    UINavigationItem *owner = screenController.navigationItem;
    if (owner == destinationNavigationItem) continue;
    for (UIBarButtonItem *candidate in [leftItems arrayByAddingObjectsFromArray:rightItems]) {
      if (RNSHomeToolbarNavigationItemContainsItem(owner, candidate)) return @"home_toolbar_owner_conflict";
    }
  }

  UIWindow *sharedWindow = sharedNavigationController.navigationBar.window;
  for (UIBarButtonItem *candidate in [leftItems arrayByAddingObjectsFromArray:rightItems]) {
    UIView *customView = candidate.customView;
    if (customView == nil || customView.window != sharedWindow || customView.hidden || customView.alpha <= 0 ||
        customView.bounds.size.width <= 0 || customView.bounds.size.height <= 0 ||
        ![customView isDescendantOfView:navigationController.navigationBar]) {
      return @"home_toolbar_attachment_unavailable";
    }
  }

  // Starter: initial Splash Home toolbar exclusive transfer
  if (sourceOwnsExactItems) {
    [sourceNavigationItem setLeftBarButtonItems:nil animated:NO];
    [sourceNavigationItem setRightBarButtonItems:nil animated:NO];
  }
  [navigationController setNavigationBarHidden:YES animated:NO];
  if (destinationIsEmpty) {
    [destinationNavigationItem setLeftBarButtonItems:leftItems animated:NO];
    [destinationNavigationItem setRightBarButtonItems:rightItems animated:NO];
  }
  // Starter: initial Splash Home toolbar transfer complete
  return @"initial_home_toolbar_staged";
}

- (void)captureSharedToolbarItemsFromViewController:(UIViewController *)viewController navigationController:(UINavigationController *)navigationController
{
  if (navigationController == nil || navigationController.viewControllers.count != 1 ||
      navigationController.topViewController != viewController) return;
  BOOL isTabSource = NO;
  NSArray<RNSTabsScreenViewController *> *installedControllers = [self installedScreenControllers];
  for (NSUInteger tabIndex = 0; tabIndex < installedControllers.count; tabIndex++) {
    UIViewController *tab = installedControllers[tabIndex];
    if (RNSFindNestedNavigationController(tab) == navigationController) {
      isTabSource = YES;
      break;
    }
  }
  if (!isTabSource) return; // Never capture the root Stack's placeholders or pushed screens.
  UINavigationItem *item = viewController.navigationItem;
  NSDictionary *materialized = @{@"left": item.leftBarButtonItems ?: @[], @"right": item.rightBarButtonItems ?: @[]};
  NSDictionary *pendingMaterialized = objc_getAssociatedObject(item, &RNSSharedToolbarPendingMaterializedItemsKey);
  if (pendingMaterialized != nil) {
    materialized = pendingMaterialized;
    objc_setAssociatedObject(item, &RNSSharedToolbarPendingMaterializedItemsKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  objc_setAssociatedObject(item, &RNSSharedToolbarMaterializedItemsKey, materialized, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  NSArray<UIBarButtonItem *> *leftItems = materialized[@"left"] ?: @[];
  NSArray<UIBarButtonItem *> *rightItems = materialized[@"right"] ?: @[];
  NSString *initialHomeStageResult = [self stageInitialHomeToolbarItemsForViewController:viewController
      navigationController:navigationController leftItems:leftItems rightItems:rightItems];
  if (![initialHomeStageResult isEqualToString:@"initial_home_toolbar_staged"]) {
    // Transfer registration before installation: the hidden source bar must not own these items.
    [item setLeftBarButtonItems:nil animated:NO];
    [item setRightBarButtonItems:nil animated:NO];
  }
}

- (BOOL)shouldSkipSharedToolbarItemRegistration:(UIBarButtonItem *)item
                             fromViewController:(UIViewController *)viewController
                            navigationController:(UINavigationController *)navigationController
                                            side:(NSString *)side
                    sourceNavigationBarWasHidden:(BOOL)sourceNavigationBarWasHidden
{
  if ([self shouldSkipInitialHomeToolbarRegistration:item fromViewController:viewController
      navigationController:navigationController side:side]) return YES;

  if (item == nil || item.customView == nil ||
      (![side isEqualToString:@"left"] && ![side isEqualToString:@"right"]) ||
      !sourceNavigationBarWasHidden || navigationController == nil ||
      !navigationController.navigationBarHidden || navigationController.viewControllers.count != 1 ||
      navigationController.topViewController != viewController || navigationController.transitionCoordinator != nil ||
      self.transitionCoordinator == nil) {
    return NO;
  }

  BOOL isInstalledTabRoot = NO;
  for (UIViewController *tabViewController in [self installedScreenControllers]) {
    if (RNSFindNestedNavigationController(tabViewController) == navigationController) {
      isInstalledTabRoot = YES;
      break;
    }
  }
  if (!isInstalledTabRoot) return NO;

  UIViewController *tabsScreenViewController = self.parentViewController;
  UINavigationController *sharedNavigationController = tabsScreenViewController.navigationController;
  if (sharedNavigationController == nil ||
      sharedNavigationController.topViewController != tabsScreenViewController ||
      sharedNavigationController.navigationBarHidden ||
      sharedNavigationController.transitionCoordinator != nil) {
    return NO;
  }

  UINavigationItem *sourceNavigationItem = viewController.navigationItem;
  UINavigationItem *sharedNavigationItem = tabsScreenViewController.navigationItem;
  UINavigationBar *sharedNavigationBar = sharedNavigationController.navigationBar;
  if (sourceNavigationItem == sharedNavigationItem || sharedNavigationBar.window == nil ||
      sharedNavigationBar.topItem != sharedNavigationItem) {
    return NO;
  }

  NSDictionary *materializedItems = objc_getAssociatedObject(sourceNavigationItem, &RNSSharedToolbarMaterializedItemsKey);
  NSArray<UIBarButtonItem *> *cachedItems = materializedItems[side];
  NSArray<UIBarButtonItem *> *sharedItems =
      [side isEqualToString:@"left"] ? sharedNavigationItem.leftBarButtonItems : sharedNavigationItem.rightBarButtonItems;
  NSArray<UIBarButtonItem *> *sourceItems =
      [side isEqualToString:@"left"] ? sourceNavigationItem.leftBarButtonItems : sourceNavigationItem.rightBarButtonItems;
  BOOL itemWasCaptured = NO;
  BOOL sharedNavigationItemOwnsItem = NO;
  BOOL sourceNavigationItemAlreadyOwnsItem = NO;
  for (UIBarButtonItem *candidate in cachedItems) {
    if (candidate == item) {
      itemWasCaptured = YES;
      break;
    }
  }
  for (UIBarButtonItem *candidate in sharedItems) {
    if (candidate == item) {
      sharedNavigationItemOwnsItem = YES;
      break;
    }
  }
  for (UIBarButtonItem *candidate in sourceItems) {
    if (candidate == item) {
      sourceNavigationItemAlreadyOwnsItem = YES;
      break;
    }
  }

  UIView *customView = item.customView;
  if (!itemWasCaptured || !sharedNavigationItemOwnsItem || sourceNavigationItemAlreadyOwnsItem ||
      customView.hidden || customView.alpha <= 0 || customView.window != sharedNavigationBar.window ||
      ![customView isDescendantOfView:sharedNavigationBar]) {
    return NO;
  }

  // Starter: shared toolbar owner re-registration suppressed
  return YES;
}

- (NSDictionary<NSString *, NSArray<UIBarButtonItem *> *> *)sourceToolbarRegistrationItemsForViewController:(UIViewController *)viewController
                                                                                     navigationController:(UINavigationController *)navigationController
                                                                                                  leftItems:(NSArray<UIBarButtonItem *> *)leftItems
                                                                                                 rightItems:(NSArray<UIBarButtonItem *> *)rightItems
                                                                                       skippedSharedLeftItems:(NSArray<UIBarButtonItem *> *)skippedSharedLeftItems
                                                                                      skippedSharedRightItems:(NSArray<UIBarButtonItem *> *)skippedSharedRightItems
{
  (void)navigationController;
  UINavigationItem *sourceNavigationItem = viewController.navigationItem;
  NSMutableArray<UIBarButtonItem *> *sourceLeftItems = [NSMutableArray arrayWithCapacity:leftItems.count];
  NSMutableArray<UIBarButtonItem *> *sourceRightItems = [NSMutableArray arrayWithCapacity:rightItems.count];
  for (UIBarButtonItem *item in leftItems) {
    BOOL skipRegistration = NO;
    for (UIBarButtonItem *sharedItem in skippedSharedLeftItems) {
      if (item == sharedItem) {
        skipRegistration = YES;
        break;
      }
    }
    if (!skipRegistration) [sourceLeftItems addObject:item];
  }
  for (UIBarButtonItem *item in rightItems) {
    BOOL skipRegistration = NO;
    for (UIBarButtonItem *sharedItem in skippedSharedRightItems) {
      if (item == sharedItem) {
        skipRegistration = YES;
        break;
      }
    }
    if (!skipRegistration) [sourceRightItems addObject:item];
  }

  BOOL didPreserveSharedOwner =
      !RNSHomeToolbarItemArraysHaveSameInstances(leftItems, sourceLeftItems) ||
      !RNSHomeToolbarItemArraysHaveSameInstances(rightItems, sourceRightItems);
  if (didPreserveSharedOwner) {
    NSDictionary *pendingMaterialized = @{
      @"left": [leftItems copy],
      @"right": [rightItems copy],
    };
    objc_setAssociatedObject(sourceNavigationItem, &RNSSharedToolbarPendingMaterializedItemsKey,
        pendingMaterialized, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  } else {
    objc_setAssociatedObject(sourceNavigationItem, &RNSSharedToolbarPendingMaterializedItemsKey,
        nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }

  return @{
    @"left": [sourceLeftItems copy],
    @"right": [sourceRightItems copy],
  };
}

- (void)prepareSharedNavigationBarForViewController:(UIViewController *)viewController reason:(NSString *)reason
{`,
    'capture',
  );
  patch(
    controller,
    '  if (nestedNavigationController != nil) {\n    // The nested stack remains',
    `${SHARED_TOOLBAR_TRANSITION_GUARD}

  if (nestedNavigationController != nil) {
    // The nested stack remains`,
    'transition',
  );
  patch(
    controller,
    '  NSArray<UIBarButtonItem *> *leftItems = sourceNavigationItem.leftBarButtonItems ?: @[];\n  NSArray<UIBarButtonItem *> *rightItems = sourceNavigationItem.rightBarButtonItems ?: @[];',
    `  NSDictionary *materializedItems = objc_getAssociatedObject(sourceNavigationItem, &RNSSharedToolbarMaterializedItemsKey);
  if (materializedItems == nil) {
    return; // Missing source is not a deliberate empty toolbar.
  }
  NSArray<UIBarButtonItem *> *leftItems = materializedItems[@"left"];
  NSArray<UIBarButtonItem *> *rightItems = materializedItems[@"right"];
`,
    'materialized-source',
  );
  patch(
    controller,
    '      !(isSelectedHomeTab && isHeaderMaterializationResync && areCompleteToolbarSetsSemanticallyEqual);',
    `      !(isSelectedHomeTab && isHeaderMaterializationResync && areCompleteToolbarSetsSemanticallyEqual) &&
      !isTransitionCompletion;`,
    'completion-animation',
  );
  patch(
    controller,
    '  [sharedNavigationController setNavigationBarHidden:NO animated:NO];\n}',
    `  [sharedNavigationController setNavigationBarHidden:NO animated:NO];
  UINavigationBar *bar = sharedNavigationController.navigationBar;
  BOOL canCheckAttachment = bar.window != nil &&
      (isTransitionCompletion || ([self isScreenControllerCurrentlySelected:viewController] &&
       nestedNavigationController.topViewController.viewIfLoaded.window != nil &&
       (!shouldAnimateToolbarItemReplacement ||
        (RNSHomeToolbarItemArraysHaveSameInstances(sharedLeftItems, leftItems) &&
         RNSHomeToolbarItemArraysHaveSameInstances(sharedRightItems, rightItems)))));
  if (canCheckAttachment) [bar layoutIfNeeded];
  BOOL repairLeft = canCheckAttachment && RNSSharedToolbarItemsNeedAttachment(leftItems, bar);
  BOOL repairRight = canCheckAttachment && RNSSharedToolbarItemsNeedAttachment(rightItems, bar);
  BOOL skipAttachmentRepairLeft = repairLeft &&
      RNSShouldSkipSharedToolbarExperimentRepairOnce(self, leftItems, reason);
  BOOL skipAttachmentRepairRight = repairRight &&
      RNSShouldSkipSharedToolbarExperimentRepairOnce(self, rightItems, reason);
  if (repairLeft || repairRight) {
    // Re-register only detached sides after exclusive ownership has been established.
    // This is synchronous lifecycle reconciliation, not a retry or an animated morph.
    if (repairLeft && !skipAttachmentRepairLeft) {
      [sharedNavigationItem setLeftBarButtonItems:nil animated:NO];
      [sharedNavigationItem setLeftBarButtonItems:leftItems animated:NO];
    }
    if (repairRight && !skipAttachmentRepairRight) {
      [sharedNavigationItem setRightBarButtonItems:nil animated:NO];
      [sharedNavigationItem setRightBarButtonItems:rightItems animated:NO];
    }
    if ((repairLeft && !skipAttachmentRepairLeft) ||
        (repairRight && !skipAttachmentRepairRight)) {
      [bar layoutIfNeeded];
    }
  }
}`,
    'reconcile',
  );
  patch(
    config,
    'static void RNSSynchronizeSharedTabToolbar(UIViewController *viewController, UINavigationController *navigationController)',
    'static void RNSSynchronizeSharedTabToolbar(UIViewController *viewController, UINavigationController *navigationController, BOOL didMaterialize)',
    'materialization-phase',
  );
  patch(
    config,
    `// ${PATCH_MARKERS.sharedToolbarConfigHidden}\n    RNSSynchronizeSharedTabToolbar(vc, navctr);`,
    `// ${PATCH_MARKERS.sharedToolbarConfigHidden}
    RNSSynchronizeSharedTabToolbar(vc, navctr, NO);`,
    'hidden-phase',
  );
  patch(
    config,
    `// ${PATCH_MARKERS.sharedToolbarConfigVisible}\n  RNSSynchronizeSharedTabToolbar(vc, navctr);`,
    `// ${PATCH_MARKERS.sharedToolbarConfigVisible}
  RNSSynchronizeSharedTabToolbar(vc, navctr, YES);`,
    'visible-phase',
  );
  patch(
    config,
    '  [tabsController synchronizeSharedNavigationBarWithReason:@"header-materialization/resync"];',
    `  if (didMaterialize) {
    [tabsController captureSharedToolbarItemsFromViewController:viewController navigationController:navigationController];
  }
  [tabsController synchronizeSharedNavigationBarWithReason:@"header-materialization/resync"];`,
    'materialization-capture',
  );

  patch(
    stack,
    '#import "RNSScreenStackHeaderConfig.h"',
    `#import "tabs/host/RNSTabBarController.h"
#import "RNSScreenStackHeaderConfig.h"`,
    'did-show-import',
  );
  patch(
    stack,
    '#import "RNSScreenStackHeaderConfig.h"',
    `#import "RNSScreenStackHeaderConfig.h"
${SHARED_TOOLBAR_NAVIGATION_OPERATION_HELPER}

static RNSTabBarController *RNSFindSharedToolbarTabsController(UIViewController *controller)
{
  if ([controller isKindOfClass:[RNSTabBarController class]]) return (RNSTabBarController *)controller;
  for (UIViewController *child in controller.childViewControllers) {
    RNSTabBarController *found = RNSFindSharedToolbarTabsController(child);
    if (found != nil) return found;
  }
  return nil;
}
`,
    'did-show-helper',
  );
  ensureSharedToolbarNavigationOperationHelper(stack);
  patch(
    stack,
    'withConfig:screenView.findHeaderConfig];',
    `withConfig:screenView.findHeaderConfig];
  // ${PATCH_MARKERS.sharedToolbarPopStaging}
  NSArray<UIViewController *> *previousStack =
      objc_getAssociatedObject(navigationController, &RNSSharedToolbarStableNavigationStackKey);
  UIViewController *fromViewController = nil;
  NSString *operation = RNSSharedToolbarNavigationOperation(
      navigationController, previousStack, viewController, &fromViewController);
  RNSTabBarController *tabsController = RNSFindSharedToolbarTabsController(viewController);
  UIViewController *ancestor = navigationController;
  while (ancestor != nil && tabsController == nil) {
    tabsController = RNSFindSharedToolbarTabsController(ancestor);
    ancestor = ancestor.parentViewController;
  }
  NSString *stageResult = @"not_pop";
  if ([operation isEqualToString:@"pop"]) {
    stageResult = tabsController == nil
        ? @"tabs_controller_unavailable"
        : [tabsController stageSharedToolbarItemsForNavigationPopInNavigationController:
              navigationController fromViewController:fromViewController toViewController:viewController];
  }
  // Starter: toolbar pop stage decision complete`,
    PATCH_MARKERS.sharedToolbarPopStaging,
  );
  patch(
    stack,
    '  [_controller.view setNeedsLayout];\n}\n#endif\n\n- (void)markChildUpdated',
    `  [_controller.view setNeedsLayout];
  RNSTabBarController *tabsController = nil;
  UIViewController *ancestor = navigationController;
  while (ancestor != nil && tabsController == nil) {
    tabsController = RNSFindSharedToolbarTabsController(ancestor);
    ancestor = ancestor.parentViewController;
  }
  [tabsController synchronizeSharedNavigationBarWithReason:@"navigation-did-show"];
}
#endif

- (void)markChildUpdated`,
    'did-show-reconcile',
  );
  patch(
    stack,
    '[tabsController synchronizeSharedNavigationBarWithReason:@"navigation-did-show"];',
    `[tabsController synchronizeSharedNavigationBarWithReason:@"navigation-did-show"];
  objc_setAssociatedObject(
      navigationController,
      &RNSSharedToolbarStableNavigationStackKey,
      [navigationController.viewControllers copy],
      OBJC_ASSOCIATION_RETAIN_NONATOMIC);`,
    'stable-navigation-stack-snapshot',
  );
}

function patchSharedToolbarHeaderRegistration(screensRoot) {
  const headerConfig = path.join(screensRoot, 'ios', 'RNSScreenStackHeaderConfig.mm');

  patchFile(
    headerConfig,
    '  for (RNSScreenStackHeaderSubview *subview in config.reactSubviews) {',
    [
      '  NSMutableArray<UIBarButtonItem *> *toolbarMorphMaterializedLeftItems = [NSMutableArray array];',
      '  NSMutableArray<UIBarButtonItem *> *toolbarMorphMaterializedRightItems = [NSMutableArray array];',
      '  NSMutableArray<UIBarButtonItem *> *toolbarMorphSkippedSharedLeftItems = [NSMutableArray array];',
      '  NSMutableArray<UIBarButtonItem *> *toolbarMorphSkippedSharedRightItems = [NSMutableArray array];',
      '  RNSTabBarController *toolbarMorphTabsController = nil;',
      '  if ([navctr.tabBarController isKindOfClass:[RNSTabBarController class]]) {',
      '    toolbarMorphTabsController = static_cast<RNSTabBarController *>(navctr.tabBarController);',
      '  }',
      '  if (toolbarMorphTabsController == nil) {',
      '    UIViewController *toolbarMorphAncestor = navctr;',
      '    while (toolbarMorphAncestor != nil && toolbarMorphTabsController == nil) {',
      '      toolbarMorphTabsController = RNSFindTabBarControllerInViewController(toolbarMorphAncestor);',
      '      toolbarMorphAncestor = toolbarMorphAncestor.parentViewController;',
      '    }',
      '  }',
      '',
      '  // Starter: shared toolbar registration context',
      '  for (RNSScreenStackHeaderSubview *subview in config.reactSubviews) {',
    ].join('\n'),
    'Starter: shared toolbar registration context',
  );

  patchFile(
    headerConfig,
    [
      '      case RNSScreenStackHeaderSubviewTypeLeft: {',
      '        NSArray<UIBarButtonItem *> *currentItems = navitem.leftBarButtonItems ?: @[];',
      '        NSMutableArray<UIBarButtonItem *> *mutableItems = [currentItems mutableCopy];',
      '        [mutableItems addObject:[subview getUIBarButtonItem]];',
      '        navitem.leftBarButtonItems = mutableItems;',
      '        break;',
      '      }',
    ].join('\n'),
    [
      '      case RNSScreenStackHeaderSubviewTypeLeft: {',
      '        UIBarButtonItem *toolbarMorphItem = [subview getUIBarButtonItem];',
      '        [toolbarMorphMaterializedLeftItems addObject:toolbarMorphItem];',
      '        BOOL skipSharedOwnerRegistration =',
      '            [toolbarMorphTabsController shouldSkipSharedToolbarItemRegistration:toolbarMorphItem',
      '                fromViewController:vc navigationController:navctr side:@\"left\"',
      '                sourceNavigationBarWasHidden:wasHidden];',
      '        // Starter: shared toolbar registration decision left',
      '        if (skipSharedOwnerRegistration) {',
      '          [toolbarMorphSkippedSharedLeftItems addObject:toolbarMorphItem];',
      '        } else {',
      '          NSArray<UIBarButtonItem *> *currentItems = navitem.leftBarButtonItems ?: @[];',
      '          NSMutableArray<UIBarButtonItem *> *mutableItems = [currentItems mutableCopy];',
      '          [mutableItems addObject:toolbarMorphItem];',
      '          navitem.leftBarButtonItems = mutableItems;',
      '        }',
      '        break;',
      '      }',
    ].join('\n'),
    'Starter: shared toolbar left re-registration guard',
  );

  patchFile(
    headerConfig,
    [
      '      case RNSScreenStackHeaderSubviewTypeRight: {',
      '        NSArray<UIBarButtonItem *> *currentItems = navitem.rightBarButtonItems ?: @[];',
      '        NSMutableArray<UIBarButtonItem *> *mutableItems = [currentItems mutableCopy];',
      '        [mutableItems addObject:[subview getUIBarButtonItem]];',
      '        navitem.rightBarButtonItems = mutableItems;',
      '        break;',
      '      }',
    ].join('\n'),
    [
      '      case RNSScreenStackHeaderSubviewTypeRight: {',
      '        UIBarButtonItem *toolbarMorphItem = [subview getUIBarButtonItem];',
      '        [toolbarMorphMaterializedRightItems addObject:toolbarMorphItem];',
      '        BOOL skipSharedOwnerRegistration =',
      '            [toolbarMorphTabsController shouldSkipSharedToolbarItemRegistration:toolbarMorphItem',
      '                fromViewController:vc navigationController:navctr side:@\"right\"',
      '                sourceNavigationBarWasHidden:wasHidden];',
      '        // Starter: shared toolbar registration decision right',
      '        if (skipSharedOwnerRegistration) {',
      '          [toolbarMorphSkippedSharedRightItems addObject:toolbarMorphItem];',
      '        } else {',
      '          NSArray<UIBarButtonItem *> *currentItems = navitem.rightBarButtonItems ?: @[];',
      '          NSMutableArray<UIBarButtonItem *> *mutableItems = [currentItems mutableCopy];',
      '          [mutableItems addObject:toolbarMorphItem];',
      '          navitem.rightBarButtonItems = mutableItems;',
      '        }',
      '        break;',
      '      }',
    ].join('\n'),
    'Starter: shared toolbar right re-registration guard',
  );

  patchFile(
    headerConfig,
    [
      '  navitem.leftBarButtonItems = [config barButtonItemsFromConfigs:config.headerLeftBarButtonItems',
      '                                                withCurrentItems:navitem.leftBarButtonItems];',
      '  navitem.rightBarButtonItems = [config barButtonItemsFromConfigs:config.headerRightBarButtonItems',
      '                                                 withCurrentItems:navitem.rightBarButtonItems];',
    ].join('\n'),
    [
      '  NSArray<UIBarButtonItem *> *toolbarMorphDesiredLeftItems =',
      '      [config barButtonItemsFromConfigs:config.headerLeftBarButtonItems',
      '                      withCurrentItems:toolbarMorphMaterializedLeftItems];',
      '  NSArray<UIBarButtonItem *> *toolbarMorphDesiredRightItems =',
      '      [config barButtonItemsFromConfigs:config.headerRightBarButtonItems',
      '                      withCurrentItems:toolbarMorphMaterializedRightItems];',
      '  NSDictionary<NSString *, NSArray<UIBarButtonItem *> *> *toolbarMorphSourceItems = nil;',
      '  if (toolbarMorphSkippedSharedLeftItems.count > 0 || toolbarMorphSkippedSharedRightItems.count > 0) {',
      '    toolbarMorphSourceItems =',
      '        [toolbarMorphTabsController sourceToolbarRegistrationItemsForViewController:vc',
      '            navigationController:navctr leftItems:toolbarMorphDesiredLeftItems',
      '            rightItems:toolbarMorphDesiredRightItems skippedSharedLeftItems:toolbarMorphSkippedSharedLeftItems',
      '            skippedSharedRightItems:toolbarMorphSkippedSharedRightItems];',
      '  }',
      '  navitem.leftBarButtonItems = toolbarMorphSourceItems[@\"left\"] ?: toolbarMorphDesiredLeftItems;',
      '  navitem.rightBarButtonItems = toolbarMorphSourceItems[@\"right\"] ?: toolbarMorphDesiredRightItems;',
    ].join('\n'),
    'Starter: shared toolbar final registration guard',
  );
}

function patchRNScreens(
  screensRoot = path.dirname(require.resolve('react-native-screens/package.json')),
) {
  if (require(path.join(screensRoot, 'package.json')).version !== '4.30.0') {
    throw new Error('A integração de toolbar foi validada para react-native-screens 4.30.0.');
  }

  patchFile(
    path.join(screensRoot, 'src', 'fabric', 'ScreenNativeComponent.ts'),
    '  nativeBackButtonDismissalEnabled?: boolean | undefined;\n',
    `  nativeBackButtonDismissalEnabled?: boolean | undefined;\n  // ${PATCH_MARKERS.prop}\n  hidesBottomBarWhenPushed?: boolean | undefined;\n`,
    PATCH_MARKERS.prop,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'RNSScreen.h'),
    '@property (nonatomic) BOOL gestureEnabled;\n',
    `@property (nonatomic) BOOL gestureEnabled;\n// ${PATCH_MARKERS.prop}\n@property (nonatomic) BOOL hidesBottomBarWhenPushed;\n`,
    PATCH_MARKERS.prop,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'RNSScreen.mm'),
    `- (void)setReplaceAnimation:(RNSScreenReplaceAnimation)replaceAnimation\n{\n  _replaceAnimation = replaceAnimation;\n}\n`,
    `// ${PATCH_MARKERS.setter}\n- (void)setHidesBottomBarWhenPushed:(BOOL)hidesBottomBarWhenPushed\n{\n  _hidesBottomBarWhenPushed = hidesBottomBarWhenPushed;\n  _controller.hidesBottomBarWhenPushed = hidesBottomBarWhenPushed;\n}\n\n- (void)setReplaceAnimation:(RNSScreenReplaceAnimation)replaceAnimation\n{\n  _replaceAnimation = replaceAnimation;\n}\n`,
    PATCH_MARKERS.setter,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'RNSScreen.mm'),
    '  [self setGestureEnabled:newScreenProps.gestureEnabled];\n',
    `  [self setGestureEnabled:newScreenProps.gestureEnabled];\n\n  // ${PATCH_MARKERS.update}\n  if (newScreenProps.hidesBottomBarWhenPushed != oldScreenProps.hidesBottomBarWhenPushed) {\n    [self setHidesBottomBarWhenPushed:newScreenProps.hidesBottomBarWhenPushed];\n  }\n`,
    PATCH_MARKERS.update,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.h'),
    '- (void)tearDown;\n',
    `- (void)tearDown;\n\n// ${PATCH_MARKERS.sharedToolbarHeader}\n- (void)prepareSharedNavigationBarForViewController:(UIViewController *)viewController reason:(NSString *)reason;\n- (void)synchronizeSharedNavigationBarWithReason:(NSString *)reason;\n- (NSString *)stageSharedToolbarItemsForNavigationPopInNavigationController:(UINavigationController *)navigationController fromViewController:(UIViewController *)fromViewController toViewController:(UIViewController *)toViewController;\n`,
    PATCH_MARKERS.sharedToolbarHeader,
  );
  ensureSharedToolbarPopMethodDeclaration(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.h'),
  );

  patchFile(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.mm'),
    '#pragma mark - Signals\n',
    `// ${PATCH_MARKERS.sharedToolbarController}\nstatic UINavigationController *RNSFindNestedNavigationController(UIViewController *rootViewController)\n{\n  for (UIViewController *childViewController in rootViewController.childViewControllers) {\n    if ([childViewController isKindOfClass:[UINavigationController class]]) {\n      return static_cast<UINavigationController *>(childViewController);\n    }\n\n    UINavigationController *nestedNavigationController =\n        RNSFindNestedNavigationController(childViewController);\n    if (nestedNavigationController != nil) {\n      return nestedNavigationController;\n    }\n  }\n\n  return nil;\n}\n\n- (void)prepareSharedNavigationBarForViewController:(UIViewController *)viewController reason:(NSString *)reason\n{\n  NSInteger tabIndex = [[self installedScreenControllers] indexOfObject:viewController];\n  if (![viewController isKindOfClass:[RNSTabsScreenViewController class]]) {\n    return;\n  }\n\n  UIViewController *tabsScreenViewController = self.parentViewController;\n  UINavigationController *sharedNavigationController = tabsScreenViewController.navigationController;\n  if (sharedNavigationController == nil ||\n      sharedNavigationController.topViewController != tabsScreenViewController) {\n    return;\n  }\n\n  UINavigationController *nestedNavigationController =\n      RNSFindNestedNavigationController(viewController);\n  BOOL isTabRoot = nestedNavigationController == nil || nestedNavigationController.viewControllers.count <= 1;\n\n  if (!isTabRoot) {\n    [sharedNavigationController setNavigationBarHidden:YES animated:NO];\n    [nestedNavigationController setNavigationBarHidden:NO animated:NO];\n    return;\n  }\n\n  if (nestedNavigationController != nil) {\n    // The nested stack remains the source of the native items, but its root bar must not\n    // compete with the single shared bar owned by the (tabs) screen.\n    [nestedNavigationController setNavigationBarHidden:YES animated:NO];\n  }\n\n  UINavigationItem *sharedNavigationItem = sharedNavigationController.topViewController.navigationItem;\n  UINavigationItem *sourceNavigationItem = nestedNavigationController.topViewController.navigationItem;\n  NSArray<UIBarButtonItem *> *leftItems = sourceNavigationItem.leftBarButtonItems ?: @[];\n  NSArray<UIBarButtonItem *> *rightItems = sourceNavigationItem.rightBarButtonItems ?: @[];\n\n  if (![sharedNavigationItem.leftBarButtonItems isEqualToArray:leftItems]) {\n    [sharedNavigationItem setLeftBarButtonItems:leftItems animated:YES];\n  }\n  if (![sharedNavigationItem.rightBarButtonItems isEqualToArray:rightItems]) {\n    [sharedNavigationItem setRightBarButtonItems:rightItems animated:YES];\n  }\n\n  // Items are installed before the shared bar is revealed or the tab controller changes\n  // its visible child, so UIKit can animate the same UINavigationBar transition.\n  [sharedNavigationController setNavigationBarHidden:NO animated:NO];\n}\n\n- (void)synchronizeSharedNavigationBarWithReason:(NSString *)reason\n{\n  UIViewController *selectedViewController = [self effectiveSelectedViewController];\n  if (selectedViewController != nil) {\n    [self prepareSharedNavigationBarForViewController:selectedViewController reason:reason];\n  }\n}\n\n#pragma mark - Signals\n`,
    PATCH_MARKERS.sharedToolbarController,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.mm'),
    `- (void)synchronizeSharedNavigationBarWithReason:(NSString *)reason
{
  UIViewController *selectedViewController = [self effectiveSelectedViewController];
  if (selectedViewController != nil) {
    [self prepareSharedNavigationBarForViewController:selectedViewController reason:reason];
  }
}

#pragma mark - Signals`,
    `static NSArray<UIBarButtonItem *> *RNSSharedToolbarItemsByRemovingInstances(
    NSArray<UIBarButtonItem *> *items,
    NSArray<UIBarButtonItem *> *itemsToRemove)
{
  NSMutableArray<UIBarButtonItem *> *remainingItems = [NSMutableArray arrayWithCapacity:items.count];
  for (UIBarButtonItem *item in items) {
    BOOL shouldRemove = NO;
    for (UIBarButtonItem *candidate in itemsToRemove) {
      if (item == candidate) {
        shouldRemove = YES;
        break;
      }
    }
    if (!shouldRemove) [remainingItems addObject:item];
  }
  return [remainingItems copy];
}

// ${PATCH_MARKERS.sharedToolbarPopMethod}
- (void)synchronizeSharedNavigationBarWithReason:(NSString *)reason
{
  UIViewController *selectedViewController = [self effectiveSelectedViewController];
  if (selectedViewController != nil) {
    [self prepareSharedNavigationBarForViewController:selectedViewController reason:reason];
  }
}

- (NSString *)stageSharedToolbarItemsForNavigationPopInNavigationController:(UINavigationController *)navigationController
                                                         fromViewController:(UIViewController *)fromViewController
                                                           toViewController:(UIViewController *)toViewController
{
  if (navigationController == nil || fromViewController == nil || toViewController == nil) {
    return @"navigation_context_unavailable";
  }

  UIViewController *tabsScreenViewController = self.parentViewController;
  UINavigationController *sharedNavigationController = tabsScreenViewController.navigationController;
  UIViewController *selectedTabViewController = [self effectiveSelectedViewController];
  if (selectedTabViewController == nil) return @"shared_navigation_context_unavailable";
  NSInteger selectedTabIndex = [[self installedScreenControllers] indexOfObject:selectedTabViewController];
  UINavigationController *selectedNestedNavigationController =
      RNSFindNestedNavigationController(selectedTabViewController);
  BOOL sharedTabsControllerIsTop = sharedNavigationController != nil &&
      sharedNavigationController.topViewController == tabsScreenViewController;
  if (sharedNavigationController == nil ||
      selectedNestedNavigationController == nil) {
    return @"shared_navigation_context_unavailable";
  }

  UINavigationItem *sourceNavigationItem = nil;
  UINavigationItem *destinationNavigationItem = toViewController.navigationItem;
  NSString *successResult = nil;
  BOOL isHomeSharedRootPop = navigationController == sharedNavigationController &&
      sharedTabsControllerIsTop && toViewController == tabsScreenViewController && selectedTabIndex == 0 &&
      selectedNestedNavigationController.viewControllers.count == 1 &&
      selectedNestedNavigationController.topViewController ==
          selectedNestedNavigationController.viewControllers.firstObject;
  BOOL isSettingsSharedRootPop = navigationController == sharedNavigationController &&
      toViewController == tabsScreenViewController && selectedTabIndex == 3 &&
      selectedNestedNavigationController.viewControllers.count == 1 &&
      selectedNestedNavigationController.topViewController ==
          selectedNestedNavigationController.viewControllers.firstObject;
  BOOL isFinanceSharedRootPop = navigationController == sharedNavigationController &&
      toViewController == tabsScreenViewController && selectedTabIndex == 1 &&
      selectedNestedNavigationController.viewControllers.count == 1 &&
      selectedNestedNavigationController.topViewController ==
          selectedNestedNavigationController.viewControllers.firstObject;
  BOOL isSettingsNestedRootPop = navigationController == selectedNestedNavigationController &&
      sharedTabsControllerIsTop &&
      toViewController == selectedNestedNavigationController.viewControllers.firstObject &&
      selectedNestedNavigationController.viewControllers.count == 1 && selectedTabIndex == 3;

  if (isHomeSharedRootPop) {
    sourceNavigationItem = selectedNestedNavigationController.topViewController.navigationItem;
    successResult = @"staged_home_root";
  } else if (isSettingsSharedRootPop) {
    sourceNavigationItem = selectedNestedNavigationController.topViewController.navigationItem;
    destinationNavigationItem = tabsScreenViewController.navigationItem;
    successResult = @"staged_settings_root";
  } else if (isFinanceSharedRootPop) {
    sourceNavigationItem = selectedNestedNavigationController.topViewController.navigationItem;
    destinationNavigationItem = tabsScreenViewController.navigationItem;
    successResult = @"staged_finance_root";
  } else if (isSettingsNestedRootPop) {
    if (!sharedNavigationController.navigationBarHidden) return @"settings_shared_bar_visible";
    sourceNavigationItem = toViewController.navigationItem;
    successResult = @"staged_settings_root";
  } else {
    return @"not_target_root_pop";
  }

  NSDictionary *materializedItems =
      objc_getAssociatedObject(sourceNavigationItem, &RNSSharedToolbarMaterializedItemsKey);
  if (materializedItems == nil) return @"root_items_unavailable";

  NSArray<UIBarButtonItem *> *leftItems = materializedItems[@"left"] ?: @[];
  NSArray<UIBarButtonItem *> *rightItems = materializedItems[@"right"] ?: @[];
  if (leftItems.count == 0 && rightItems.count == 0) return @"root_items_empty";

  UINavigationItem *sharedNavigationItem = tabsScreenViewController.navigationItem;
  BOOL isSettingsOrFinanceSharedRootPop = isSettingsSharedRootPop || isFinanceSharedRootPop;
  if (isSettingsOrFinanceSharedRootPop && sourceNavigationItem != destinationNavigationItem) {
    // The cached toolbar is metadata, not an owner. Release only these exact item instances
    // from the tab-root navigation item before transferring them to the shared navigation item.
    NSArray<UIBarButtonItem *> *remainingSourceLeftItems =
        RNSSharedToolbarItemsByRemovingInstances(sourceNavigationItem.leftBarButtonItems ?: @[], leftItems);
    NSArray<UIBarButtonItem *> *remainingSourceRightItems =
        RNSSharedToolbarItemsByRemovingInstances(sourceNavigationItem.rightBarButtonItems ?: @[], rightItems);
    if (!RNSHomeToolbarItemArraysHaveSameInstances(
            sourceNavigationItem.leftBarButtonItems ?: @[], remainingSourceLeftItems)) {
      [sourceNavigationItem setLeftBarButtonItems:remainingSourceLeftItems.count > 0
          ? remainingSourceLeftItems : nil animated:NO];
    }
    if (!RNSHomeToolbarItemArraysHaveSameInstances(
            sourceNavigationItem.rightBarButtonItems ?: @[], remainingSourceRightItems)) {
      [sourceNavigationItem setRightBarButtonItems:remainingSourceRightItems.count > 0
          ? remainingSourceRightItems : nil animated:NO];
    }
  }
  if (isSettingsNestedRootPop) {
    NSArray<UIBarButtonItem *> *remainingSharedLeftItems =
        RNSSharedToolbarItemsByRemovingInstances(sharedNavigationItem.leftBarButtonItems ?: @[], leftItems);
    NSArray<UIBarButtonItem *> *remainingSharedRightItems =
        RNSSharedToolbarItemsByRemovingInstances(sharedNavigationItem.rightBarButtonItems ?: @[], rightItems);
    if (!RNSHomeToolbarItemArraysHaveSameInstances(
            sharedNavigationItem.leftBarButtonItems ?: @[], remainingSharedLeftItems)) {
      [sharedNavigationItem setLeftBarButtonItems:remainingSharedLeftItems.count > 0
          ? remainingSharedLeftItems : nil animated:NO];
    }
    if (!RNSHomeToolbarItemArraysHaveSameInstances(
            sharedNavigationItem.rightBarButtonItems ?: @[], remainingSharedRightItems)) {
      [sharedNavigationItem setRightBarButtonItems:remainingSharedRightItems.count > 0
          ? remainingSharedRightItems : nil animated:NO];
    }
  }

  if (!RNSHomeToolbarItemArraysHaveSameInstances(
          destinationNavigationItem.leftBarButtonItems ?: @[], leftItems)) {
    [destinationNavigationItem setLeftBarButtonItems:leftItems.count > 0 ? leftItems : nil animated:NO];
  }
  if (!RNSHomeToolbarItemArraysHaveSameInstances(
          destinationNavigationItem.rightBarButtonItems ?: @[], rightItems)) {
    [destinationNavigationItem setRightBarButtonItems:rightItems.count > 0 ? rightItems : nil animated:NO];
  }

  return successResult;
}

#pragma mark - Signals`,
    PATCH_MARKERS.sharedToolbarPopMethod,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.mm'),
    'static UINavigationController *RNSFindNestedNavigationController(UIViewController *rootViewController)\n{',
    `// ${PATCH_MARKERS.homeToolbarSemanticComparison}\nstatic NSString *RNSFindHomeToolbarSemanticIdentifier(UIView *rootView)\n{\n  if (rootView == nil) {\n    return nil;\n  }\n  NSString *identifier = rootView.accessibilityIdentifier;\n  if ([identifier hasPrefix:@"home-toolbar-item:"]) {\n    return identifier;\n  }\n  for (UIView *subview in rootView.subviews) {\n    NSString *match = RNSFindHomeToolbarSemanticIdentifier(subview);\n    if (match != nil) {\n      return match;\n    }\n  }\n  return nil;\n}\n\nstatic NSString *RNSHomeToolbarItemSemanticSignature(UIBarButtonItem *item)\n{\n  NSString *identifier = RNSFindHomeToolbarSemanticIdentifier(item.customView);\n  if (identifier == nil || item.customView == nil) {\n    return nil;\n  }\n  return [NSString stringWithFormat:@"%@|class=%@|title=%@|label=%@|hint=%@|action=%@|enabled=%d|style=%ld|width=%.2f|viewClass=%@|viewSize=%@|hidden=%d|alpha=%.3f",\n      identifier,\n      NSStringFromClass(item.class),\n      item.title ?: @"nil",\n      item.accessibilityLabel ?: @"nil",\n      item.accessibilityHint ?: @"nil",\n      item.action == NULL ? @"nil" : NSStringFromSelector(item.action),\n      item.isEnabled,\n      (long)item.style,\n      item.width,\n      NSStringFromClass(item.customView.class),\n      NSStringFromCGSize(item.customView.bounds.size),\n      item.customView.hidden,\n      item.customView.alpha];\n}\n\nstatic BOOL RNSHomeToolbarItemArraysAreSemanticallyEqual(NSArray<UIBarButtonItem *> *first,\n                                                          NSArray<UIBarButtonItem *> *second)\n{\n  if (first.count != second.count) {\n    return NO;\n  }\n  for (NSUInteger index = 0; index < first.count; index++) {\n    NSString *firstSignature = RNSHomeToolbarItemSemanticSignature(first[index]);\n    NSString *secondSignature = RNSHomeToolbarItemSemanticSignature(second[index]);\n    if (firstSignature == nil || ![firstSignature isEqualToString:secondSignature]) {\n      return NO;\n    }\n  }\n  return YES;\n}\n\nstatic BOOL RNSHomeToolbarItemSetsAreSemanticallyEqual(NSArray<UIBarButtonItem *> *sourceLeft,\n                                                        NSArray<UIBarButtonItem *> *sourceRight,\n                                                        NSArray<UIBarButtonItem *> *sharedLeft,\n                                                        NSArray<UIBarButtonItem *> *sharedRight)\n{\n  return RNSHomeToolbarItemArraysAreSemanticallyEqual(sourceLeft, sharedLeft) &&\n      RNSHomeToolbarItemArraysAreSemanticallyEqual(sourceRight, sharedRight);\n}\n\nstatic BOOL RNSHomeToolbarItemArraysHaveSameInstances(NSArray<UIBarButtonItem *> *first,\n                                                       NSArray<UIBarButtonItem *> *second)\n{\n  if (first.count != second.count) {\n    return NO;\n  }\n  for (NSUInteger index = 0; index < first.count; index++) {\n    if (first[index] != second[index]) {\n      return NO;\n    }\n  }\n  return YES;\n}\n\nstatic UINavigationController *RNSFindNestedNavigationController(UIViewController *rootViewController)\n{`,
    PATCH_MARKERS.homeToolbarSemanticComparison,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.mm'),
    'static BOOL RNSHomeToolbarItemArraysAreSemanticallyEqual',
    `static BOOL RNSHomeToolbarViewContainsAccessibilityIdentifier(UIView *view, NSString *identifier)\n{\n  if (view == nil) return NO;\n  if ([view.accessibilityIdentifier isEqualToString:identifier]) return YES;\n  for (UIView *subview in view.subviews) {\n    if (RNSHomeToolbarViewContainsAccessibilityIdentifier(subview, identifier)) return YES;\n  }\n  return NO;\n}\n\nstatic BOOL RNSHomeToolbarNavigationItemContainsItem(UINavigationItem *navigationItem, UIBarButtonItem *candidate)\n{\n  if (navigationItem == nil || candidate == nil) return NO;\n  for (UIBarButtonItem *item in navigationItem.leftBarButtonItems ?: @[]) if (item == candidate) return YES;\n  for (UIBarButtonItem *item in navigationItem.rightBarButtonItems ?: @[]) if (item == candidate) return YES;\n  return NO;\n}\n\nstatic BOOL RNSHomeToolbarItemArraysAreSemanticallyEqual`,
    PATCH_MARKERS.initialHomeReplaceHelpers,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.mm'),
    `  if (![sharedNavigationItem.leftBarButtonItems isEqualToArray:leftItems]) {\n    [sharedNavigationItem setLeftBarButtonItems:leftItems animated:YES];\n  }\n  if (![sharedNavigationItem.rightBarButtonItems isEqualToArray:rightItems]) {\n    [sharedNavigationItem setRightBarButtonItems:rightItems animated:YES];\n  }`,
    `  // ${PATCH_MARKERS.homeToolbarReplacementPolicy}\n  NSArray<UIBarButtonItem *> *sharedLeftItems = sharedNavigationItem.leftBarButtonItems ?: @[];\n  NSArray<UIBarButtonItem *> *sharedRightItems = sharedNavigationItem.rightBarButtonItems ?: @[];\n  BOOL isSelectedHomeTab = tabIndex == 0 && [self isScreenControllerCurrentlySelected:viewController];\n  BOOL isHeaderMaterializationResync = [reason isEqualToString:@"header-materialization/resync"];\n  BOOL areCompleteToolbarSetsSemanticallyEqual = RNSHomeToolbarItemSetsAreSemanticallyEqual(\n      leftItems, rightItems, sharedLeftItems, sharedRightItems);\n  BOOL shouldAnimateToolbarItemReplacement =\n      !(isSelectedHomeTab && isHeaderMaterializationResync && areCompleteToolbarSetsSemanticallyEqual);\n\n  if (!RNSHomeToolbarItemArraysHaveSameInstances(sharedLeftItems, leftItems)) {\n    [sharedNavigationItem setLeftBarButtonItems:leftItems animated:shouldAnimateToolbarItemReplacement];\n  }\n  if (!RNSHomeToolbarItemArraysHaveSameInstances(sharedRightItems, rightItems)) {\n    [sharedNavigationItem setRightBarButtonItems:rightItems animated:shouldAnimateToolbarItemReplacement];\n  }`,
    PATCH_MARKERS.homeToolbarReplacementPolicy,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.mm'),
    '- (void)setSelectedIndex:(NSUInteger)selectedIndex\n{\n  [super setSelectedIndex:selectedIndex];\n',
    `// ${PATCH_MARKERS.sharedToolbarIndex}\n- (void)setSelectedIndex:(NSUInteger)selectedIndex\n{\n  NSArray<RNSTabsScreenViewController *> *installedControllers = [self installedScreenControllers];\n  if (selectedIndex < installedControllers.count) {\n    [self prepareSharedNavigationBarForViewController:installedControllers[selectedIndex] reason:@"tab-selection-index"];\n  }\n  [super setSelectedIndex:selectedIndex];\n`,
    PATCH_MARKERS.sharedToolbarIndex,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.mm'),
    '- (void)setSelectedViewController:(__kindof UIViewController *)selectedViewController\n{\n  [super setSelectedViewController:selectedViewController];\n',
    `// ${PATCH_MARKERS.sharedToolbarViewController}\n- (void)setSelectedViewController:(__kindof UIViewController *)selectedViewController\n{\n  if (selectedViewController != nil) {\n    [self prepareSharedNavigationBarForViewController:selectedViewController reason:@"programmatic-selection"];\n  }\n  [super setSelectedViewController:selectedViewController];\n`,
    PATCH_MARKERS.sharedToolbarViewController,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.mm'),
    '- (void)setSelectedTab:(UITab *)selectedTab API_AVAILABLE(ios(18.0))\n{\n  [super setSelectedTab:selectedTab];\n',
    `// ${PATCH_MARKERS.sharedToolbarTabSelection}\n- (void)setSelectedTab:(UITab *)selectedTab API_AVAILABLE(ios(18.0))\n{\n  if (selectedTab.viewController != nil) {\n    [self prepareSharedNavigationBarForViewController:selectedTab.viewController reason:@"programmatic-selection"];\n  }\n  [super setSelectedTab:selectedTab];\n`,
    PATCH_MARKERS.sharedToolbarTabSelection,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.mm'),
    '  _isHandlingExplicitSelectionUpdate = YES;\n  return YES;\n}\n\n- (void)tabBarController:(UITabBarController *)tabBarController\n',
    `  // ${PATCH_MARKERS.sharedToolbarShouldSelect}\n  [self prepareSharedNavigationBarForViewController:viewController reason:@"tab-selection-shouldSelect"];\n  _isHandlingExplicitSelectionUpdate = YES;\n  return YES;\n}\n\n- (void)tabBarController:(UITabBarController *)tabBarController\n`,
    PATCH_MARKERS.sharedToolbarShouldSelect,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'tabs', 'host', 'RNSTabBarController.mm'),
    '  [self updateOrientationIfNeeded];\n}\n\n/**\n * Update UIKit model and associated navigation state.\n',
    `  [self updateOrientationIfNeeded];\n  // ${PATCH_MARKERS.sharedToolbarFlush}\n  [self synchronizeSharedNavigationBarWithReason:@"container-resync"];\n}\n\n/**\n * Update UIKit model and associated navigation state.\n`,
    PATCH_MARKERS.sharedToolbarFlush,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'RNSScreenStackHeaderConfig.mm'),
    '#import "UINavigationBar+RNSUtility.h"\n',
    `#import "UINavigationBar+RNSUtility.h"\n#import "tabs/host/RNSTabBarController.h"\n// ${PATCH_MARKERS.sharedToolbarConfigImport}\n`,
    PATCH_MARKERS.sharedToolbarConfigImport,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'RNSScreenStackHeaderConfig.mm'),
    'namespace react = facebook::react;\n',
    `namespace react = facebook::react;\n\n// ${PATCH_MARKERS.sharedToolbarConfig}\nstatic RNSTabBarController *RNSFindTabBarControllerInViewController(UIViewController *rootViewController)\n{\n  if ([rootViewController isKindOfClass:[RNSTabBarController class]]) {\n    return static_cast<RNSTabBarController *>(rootViewController);\n  }\n\n  for (UIViewController *childViewController in rootViewController.childViewControllers) {\n    RNSTabBarController *tabsController =\n        RNSFindTabBarControllerInViewController(childViewController);\n    if (tabsController != nil) {\n      return tabsController;\n    }\n  }\n\n  return nil;\n}\n\nstatic void RNSSynchronizeSharedTabToolbar(UIViewController *viewController, UINavigationController *navigationController)\n{\n  RNSTabBarController *tabsController = nil;\n  if ([navigationController.tabBarController isKindOfClass:[RNSTabBarController class]]) {\n    tabsController = static_cast<RNSTabBarController *>(navigationController.tabBarController);\n  }\n\n  if (tabsController == nil) {\n    UIViewController *parentViewController = navigationController;\n    while (parentViewController != nil && tabsController == nil) {\n      tabsController = RNSFindTabBarControllerInViewController(parentViewController);\n      parentViewController = parentViewController.parentViewController;\n    }\n  }\n\n  if (tabsController == nil) {\n    tabsController = RNSFindTabBarControllerInViewController(viewController);\n  }\n\n  [tabsController synchronizeSharedNavigationBarWithReason:@"header-materialization/resync"];\n}\n`,
    PATCH_MARKERS.sharedToolbarConfigHelpers,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'RNSScreenStackHeaderConfig.mm'),
    '    [navctr setNavigationBarHidden:YES animated:animated];\n    return;\n',
    `    [navctr setNavigationBarHidden:YES animated:animated];\n    // ${PATCH_MARKERS.sharedToolbarConfigHidden}\n    RNSSynchronizeSharedTabToolbar(vc, navctr);\n    return;\n`,
    PATCH_MARKERS.sharedToolbarConfigHidden,
  );

  patchFile(
    path.join(screensRoot, 'ios', 'RNSScreenStackHeaderConfig.mm'),
    '    [self setAnimatedConfig:vc withConfig:config];\n  }\n}\n\n- (void)configureBackItem:',
    `    [self setAnimatedConfig:vc withConfig:config];\n  }\n\n  // ${PATCH_MARKERS.sharedToolbarConfigVisible}\n  RNSSynchronizeSharedTabToolbar(vc, navctr);\n}\n\n- (void)configureBackItem:`,
    PATCH_MARKERS.sharedToolbarConfigVisible,
  );
  patchSharedToolbarHeaderRegistration(screensRoot);
  patchSharedToolbarOwnership(screensRoot);
}

function withStarterToolbarSync(config) {
  return withDangerousMod(config, [
    'ios',
    (configWithMod) => {
      patchRNScreens();
      return configWithMod;
    },
  ]);
}

const withStarterToolbarSyncPlugin = createRunOncePlugin(
  withStarterToolbarSync,
  'with-rnscreens-hide-bottom-bar-when-pushed',
  '1.3.0',
);

Object.defineProperty(withStarterToolbarSyncPlugin, '__patchRNScreensForTests', {
  value: patchRNScreens,
});

module.exports = withStarterToolbarSyncPlugin;
