const SAVED_CONTENT_ROUTE = /^\/(?:documents|folders|links|photos|texts|videos)\/[^/]+\/?$/;
const CHECKLIST_ROUTE = /^\/checklists\/(?:compose|[^/]+)\/?$/;

/**
 * Keep Home toolbar items mounted while a saved-content, checklist, or folder
 * route is pushed above the tabs, so Native Stack can restore them on pop.
 */
export function shouldKeepHomeToolbarItemsMounted(pathname: string): boolean {
  return pathname === '/' || SAVED_CONTENT_ROUTE.test(pathname) || CHECKLIST_ROUTE.test(pathname);
}
