/* global describe, expect, test */

const {
  getHomeFolderItemKey,
  getHomeFolderItemType,
  filterHomeFolderItems,
} = require('../src/features/home-folders/homeFolderTypes');
const { buildHomeGalleryEntries } = require('../src/features/home-content/homeFeed');
const { getHomeSingleLineTitle } = require('../src/features/home-content/homeSingleLinePresentation');
const {
  getHomeListMetrics,
  getHomeViewLayout,
} = require('../src/features/home-content/homeViewMode');
const {
  getBoundedChecklistTaskInputHeight,
  getChecklistCheckboxTopOffset,
} = require('../src/features/home-content/checklistTaskRowLayout');
const {
  CHECKLIST_TASK_MAX_LENGTH,
  normalizeChecklistTaskText,
  withChecklistTaskCompletionState,
} = require('../src/features/home-content/checklistTypes');
const { readFileSync } = require('node:fs');
const { getChecklistPreviewSize } = require('../src/features/home-content/checklistPreviewLayout');

const checklist = {
  id: 41,
  contentType: 'checklist',
  title: 'Por fazer',
  createdAt: new Date(2026, 9, 25, 10).getTime(),
  updatedAt: new Date(2026, 9, 25, 10).getTime(),
  totalTaskCount: 4,
  completedTaskCount: 1,
  previewTasks: [
    { text: 'Testar Face ID', isCompleted: false },
    { text: 'Organizar documentos', isCompleted: true },
  ],
};

const checklistPreviewTheme = {
  spacing: { xxs: 4, sm: 12, md: 16 },
  typography: {
    headline: { lineHeight: 22 },
    subheadline: { lineHeight: 20 },
    caption: { lineHeight: 16 },
  },
};

describe('checklist Home integration', () => {
  test('uses a stable checklist association key and joins the chronological feed', () => {
    expect(getHomeFolderItemType(checklist)).toBe('checklist');
    expect(getHomeFolderItemKey('checklist', checklist.id)).toBe('checklist:41');

    const entries = buildHomeGalleryEntries([checklist], new Date(2026, 9, 25, 12));
    expect(entries).toEqual([
      expect.objectContaining({ kind: 'day-separator', title: 'Hoje' }),
      expect.objectContaining({
        kind: 'content',
        id: 'content:checklist:41',
        content: expect.objectContaining({ title: 'Por fazer' }),
      }),
    ]);
  });

  test('hides protected checklist summaries from Todos even while unlocked', () => {
    const ordinary = { ...checklist, id: 42, title: 'Publica' };
    const protectedAssignments = new Map([['checklist:41', 'private-folder']]);
    const visible = filterHomeFolderItems(
      [checklist, ordinary],
      { kind: 'all-items' },
      protectedAssignments,
      new Set(['private-folder']),
      new Set(['private-folder']),
    );

    expect(visible.map((item) => item.id)).toEqual([42]);
  });

  test('supports unfiled and folder filters without converting lists into text content', () => {
    const assignments = new Map([['checklist:41', 'folder-a']]);
    expect(filterHomeFolderItems([checklist], { kind: 'unfiled' }, assignments)).toEqual([]);
    expect(filterHomeFolderItems([checklist], { kind: 'folder', folderId: 'folder-a' }, assignments)).toEqual([checklist]);
    expect(getHomeSingleLineTitle(checklist)).toBe('Por fazer');
  });

  test('keeps checklist cells within the existing five gallery layouts', () => {
    expect(['large', 'small', 'list', 'compact-list', 'single-line'].map(getHomeViewLayout)).toEqual([
      expect.objectContaining({ numColumns: 2, masonry: false }),
      expect.objectContaining({ numColumns: 2, masonry: false }),
      expect.objectContaining({ numColumns: 1, masonry: false }),
      expect.objectContaining({ numColumns: 1, masonry: false }),
      expect.objectContaining({ numColumns: 1, masonry: false }),
    ]);
  });

  test('sizes the checklist preview responsively and reserves more room for Dynamic Type', () => {
    const compact = getChecklistPreviewSize(390, 5, 7, 1, checklistPreviewTheme);
    const largeType = getChecklistPreviewSize(390, 5, 7, 1.5, checklistPreviewTheme);
    const narrow = getChecklistPreviewSize(320, 1, 1, 1, checklistPreviewTheme);
    const empty = getChecklistPreviewSize(390, 0, 0, 1, checklistPreviewTheme);

    expect(compact).toEqual({ width: 342, height: expect.any(Number) });
    expect(largeType.width).toBe(compact.width);
    expect(largeType.height).toBeGreaterThan(compact.height);
    expect(narrow.width).toBe(272);
    expect(empty.height).toBeGreaterThan(0);
  });

  test('adds a native read-only checklist preview without changing the route or context actions', () => {
    const gallerySource = readFileSync('src/components/photos/PhotoMasonryGallery.tsx', 'utf8');
    const previewComponent = readFileSync('src/components/homeContent/SavedChecklistPreviewContent.tsx', 'utf8');
    const checklistRendererStart = gallerySource.indexOf('const renderSavedChecklistItem');
    const checklistRenderer = gallerySource.slice(
      checklistRendererStart,
      gallerySource.indexOf('const renderItem =', checklistRendererStart),
    );

    expect(checklistRenderer).toMatch(/<Link asChild href=\{\{ pathname: '\/checklists\/\[id\]', params: \{ id: String\(checklist\.id\) \} \}\}>/);
    expect(checklistRenderer).toContain('<Link.Trigger>{trigger}</Link.Trigger>');
    expect(checklistRenderer).toContain('<Link.Preview style={checklistPreviewSize}>');
    expect(checklistRenderer).toContain('<SavedChecklistPreviewContent');
    expect(checklistRenderer).toContain('checklist={checklist}');
    expect(checklistRenderer.indexOf('<Link.Preview')).toBeLessThan(checklistRenderer.indexOf('<Link.Menu>'));
    expect(checklistRenderer).toMatch(/canRevealChecklistPreview = folderId == null \|\| \([\s\S]*?folder != null && \(!folder\.isProtected \|\| \(isAppActive && isFolderAuthorized\(folder\.id\)\)\)/);
    expect(checklistRenderer).toContain('Alterar pasta');
    expect(checklistRenderer).toContain('Remover da pasta');
    expect(checklistRenderer).toContain('renderSavedTagSubmenu(\'checklist\', checklist.id)');
    expect(checklistRenderer).toContain('Apagar lista');
    expect(previewComponent).toContain('task.isCompleted');
    expect(previewComponent).toContain('Nenhuma tarefa');
    expect(previewComponent).toMatch(/remainingTaskCount > 0[\s\S]*?tarefas/);
    expect(previewComponent).toContain('numberOfLines={1}');
    expect(previewComponent).not.toMatch(/Pressable|Touchable|TextInput|authorizeFolder|setTaskCompleted|Haptics|SQLite/);
  });

  test('reserves the standard single-line thumbnail slot for the checklist icon', () => {
    const gallerySource = readFileSync('src/components/photos/PhotoMasonryGallery.tsx', 'utf8');
    const checklistRenderer = gallerySource.slice(
      gallerySource.indexOf('const renderSavedChecklistItem'),
      gallerySource.indexOf('const renderItem =', gallerySource.indexOf('const renderSavedChecklistItem')),
    );
    const singleLineBranch = checklistRenderer.match(
      /const trigger = isSingleLineView \? \([\s\S]*?<\/Pressable>\s*\) : isListView \? \(/,
    )?.[0] ?? '';

    expect(singleLineBranch).not.toBe('');
    expect(getHomeListMetrics('single-line').thumbnailSize).toBe(34);
    expect(singleLineBranch).toMatch(/height: listThumbnailSize,[\s\S]*?width: listThumbnailSize/);
    expect(singleLineBranch).toMatch(/name="checkbox-outline" size=\{iconSize\}/);
    expect(checklistRenderer).toContain('const iconSize = isSingleLineView ? 18 : 23;');
  });

  test('bounds keyboard viewport measurements while allowing long task text to grow', () => {
    expect(getBoundedChecklistTaskInputHeight({
      availableWidth: 220,
      fontSize: 17,
      lineHeight: 22,
      measuredHeight: 720,
      text: 'Comprar leite',
    })).toBe(44);

    expect(getBoundedChecklistTaskInputHeight({
      availableWidth: 140,
      fontSize: 17,
      lineHeight: 22,
      measuredHeight: 120,
      text: 'Uma tarefa longa '.repeat(8),
    })).toBe(120);
  });

  test('aligns the checkbox with the first line for short, multiline, and scaled text', () => {
    expect(getChecklistCheckboxTopOffset({
      checkboxSize: 22,
      contentHeight: 22,
      firstLineHeight: 22,
      rowHeight: 44,
    })).toBe(11);

    expect(getChecklistCheckboxTopOffset({
      checkboxSize: 22,
      contentHeight: 66,
      firstLineHeight: 22,
      rowHeight: 44,
    })).toBe(0);

    expect(getChecklistCheckboxTopOffset({
      checkboxSize: 22,
      contentHeight: 32,
      firstLineHeight: 32,
      rowHeight: 44,
    })).toBe(11);

    expect(getChecklistCheckboxTopOffset({
      checkboxSize: 22,
      contentHeight: 64,
      firstLineHeight: 32,
      rowHeight: 44,
    })).toBe(5);
  });

  test('allows long multiline checklist text to grow according to the available width', () => {
    const text = 'Descrição extensa da tarefa com várias palavras e detalhes. '.repeat(12);
    const narrowHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: 160,
      fontSize: 17,
      lineHeight: 22,
      measuredHeight: 900,
      text,
    });
    const wideHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: 320,
      fontSize: 17,
      lineHeight: 22,
      measuredHeight: 900,
      text,
    });

    expect(narrowHeight).toBeGreaterThan(wideHeight);
    expect(wideHeight).toBeGreaterThan(44);
  });

  test('preserves multiline task text above one thousand characters and grows without line caps', () => {
    const text = [
      'SaveApp — futuro: sincronização local e segura.',
      'Objetivo: manter os dados disponíveis em cada dispositivo.',
      `${'- SQLite continua como armazenamento local.\n- A sincronização é opcional. '.repeat(45)}`,
      'Quando implementar: após validar a Development Build.',
    ].join('\n\n');

    expect(text.length).toBeGreaterThan(1000);
    expect(CHECKLIST_TASK_MAX_LENGTH).toBe(10_000);
    expect(normalizeChecklistTaskText(text)).toBe(text);
    expect(getBoundedChecklistTaskInputHeight({
      availableWidth: 180,
      fontSize: 17,
      lineHeight: 22,
      measuredHeight: 1000,
      text,
    })).toBeGreaterThan(22 * 5);
    expect(normalizeChecklistTaskText(`\n${text}\n`)).toBe(`\n${text}\n`);
    expect(() => normalizeChecklistTaskText(' \n\t ')).toThrow('invalid-task');
    expect(() => normalizeChecklistTaskText('x'.repeat(CHECKLIST_TASK_MAX_LENGTH + 1))).toThrow('task-too-long');
  });

  test('updates completion and progress together with an immutable task state', () => {
    const saved = {
      ...checklist,
      tasks: [
        { id: 1, checklistId: checklist.id, text: 'Primeira', isCompleted: false, position: 0, createdAt: 1, updatedAt: 1 },
        { id: 2, checklistId: checklist.id, text: 'Segunda', isCompleted: true, position: 1, createdAt: 2, updatedAt: 2 },
      ],
      totalTaskCount: 2,
      completedTaskCount: 1,
    };
    const completed = withChecklistTaskCompletionState(saved, 1, true);

    expect(completed).not.toBe(saved);
    expect(completed.tasks[0]).not.toBe(saved.tasks[0]);
    expect(completed.tasks.map((task) => task.isCompleted)).toEqual([true, true]);
    expect(completed.completedTaskCount).toBe(2);
    expect(saved.tasks[0].isCompleted).toBe(false);
    expect(withChecklistTaskCompletionState(completed, 1, false).completedTaskCount).toBe(1);
  });

  test('renders completed task text from the same state and applies optimistic updates before SQLite', () => {
    const rowSource = readFileSync('src/components/homeContent/ChecklistTaskRow.tsx', 'utf8');
    const routeSource = readFileSync('src/app/checklists/[id].tsx', 'utf8');
    expect(rowSource).toMatch(/textDecorationLine:\s*task\.isCompleted\s*\?\s*'line-through'/);
    expect(rowSource).toMatch(/<Text[\s\S]*?textDecorationLine:\s*task\.isCompleted/);
    expect(routeSource).toMatch(/updateLoadedChecklist\(checklist\.id,[\s\S]*?withChecklistTaskCompletionState[\s\S]*?const updated = await setTaskCompleted/);
    expect(routeSource).toMatch(/const valueToRestore = previousValue;[\s\S]*?valueToRestore !== null[\s\S]*?withChecklistTaskCompletionState\(current, task\.id, valueToRestore\)/);
  });

  test('keeps the Root Stack transparent and uses one read-only progressive checklist title', () => {
    const homeSource = readFileSync('src/app/(tabs)/index.tsx', 'utf8');
    const routeSource = readFileSync('src/app/checklists/[id].tsx', 'utf8');
    const rootSource = readFileSync('src/app/_layout.tsx', 'utf8');
    const providerSource = readFileSync('src/features/home-content/LocalChecklistLibraryProvider.tsx', 'utf8');

    const checklistStackStart = rootSource.indexOf('name="checklists/[id]"');
    const checklistStackEnd = rootSource.indexOf('<Stack.Screen', checklistStackStart + 1);
    const checklistStackSource = rootSource.slice(checklistStackStart, checklistStackEnd);
    expect(checklistStackSource).toContain("headerTitle: ''");
    expect(checklistStackSource).toContain('headerTransparent: true');
    expect(checklistStackSource).not.toContain('headerStyle:');
    expect(routeSource).toMatch(/<Stack\.Screen[\s\S]*?headerTitle: '',[\s\S]*?headerTransparent: true/);
    expect(routeSource).toContain('<ProgressiveCollapsibleScreen');
    expect(routeSource).toContain('nativeHeader');
    expect(routeSource).toContain('compactTitle={checklist?.title ?? \'\'}');
    expect(routeSource).toContain('{checklist?.title ?? \'\'}');
    expect(routeSource).toMatch(/theme\.typography\.largeTitle,[\s\S]*?fontSize:\s*theme\.typography\.largeTitle\.fontSize\s*\+\s*2/);
    expect(homeSource).toMatch(/theme\.typography\.largeTitle,[\s\S]*?fontSize:\s*theme\.typography\.largeTitle\.fontSize\s*\+\s*2/);
    expect(routeSource).not.toContain('{checklist.title}');
    expect(routeSource).not.toContain('accessibilityLabel="Título da lista"');
    expect(routeSource).not.toContain('titleDraft');
    expect(routeSource).not.toContain('saveTitle');
    expect(providerSource).toContain('updateTitle: (id: number, title: string) => Promise<boolean>');
  });

  test('keeps the protected checklist title behind the route authorization gate', () => {
    const routeSource = readFileSync('src/app/checklists/[id].tsx', 'utf8');
    const authorizationGate = routeSource.indexOf('routeAuthorization.isAuthorized ? (');
    const protectedContent = routeSource.indexOf('<ChecklistDetailContent id={id} />');
    const contentTitle = routeSource.indexOf('{checklist?.title ?? \'\'}');

    expect(authorizationGate).toBeGreaterThanOrEqual(0);
    expect(authorizationGate).toBeLessThan(protectedContent);
    expect(protectedContent).toBeLessThan(contentTitle);
  });

  test('does not show a Face ID checking gate for an unprotected checklist during a transient inactive state', () => {
    const routeSource = readFileSync('src/app/checklists/[id].tsx', 'utf8');
    const authorizationSource = readFileSync('src/features/home-folders/useHomeFolderAuthorization.ts', 'utf8');

    expect(routeSource).toContain('if (assignedFolderId != null && !authorization.isAuthorized)');
    expect(routeSource).not.toContain('assignedFolderId != null && (!authorization.isAuthorized || !isAppActive)');
    expect(authorizationSource).toMatch(/!folder\.isProtected \|\| isFolderAuthorized\(folderId\)/);
    expect(routeSource).toContain('routeAuthorization.isAuthorized ? (');
    expect(routeSource).toContain('lockEpoch !== epoch');
  });

  test('adds the native Add checklist action and routes checklist opens through the protected detail route', () => {
    const homeSource = readFileSync('src/app/(tabs)/index.tsx', 'utf8');
    const gallerySource = readFileSync('src/components/photos/PhotoMasonryGallery.tsx', 'utf8');
    const routeSource = readFileSync('src/app/checklists/[id].tsx', 'utf8');

    expect(homeSource).toMatch(/icon="checklist"[\s\S]*?Adicionar lista/);
    expect(gallerySource).toMatch(/contentType === 'checklist'[\s\S]*?renderSavedChecklistItem/);
    expect(routeSource).toMatch(/useHomeFolderItemAuthorization\('checklist', id\)/);
    expect(routeSource).toMatch(/getHomeFolderItemAssignment\('checklist', id\)/);
  });

  test('does not save a draft until the explicit create action runs', () => {
    const composerSource = readFileSync('src/app/checklists/compose.tsx', 'utf8');
    expect(composerSource).toMatch(/onPress=\{\(\) => void save\(\)\}/);
    expect(composerSource.match(/createChecklist\(/g)).toHaveLength(1);
    expect(composerSource).toMatch(/const save = useCallback\(async \(\) =>[\s\S]*?createChecklist\(\s*title,\s*checklistTasksForCreation\(tasks, pendingTaskTextRef\.current\),?\s*\)/);
  });

  test('keeps checklist deletion in the protected Home context menu, not the detail page', () => {
    const gallerySource = readFileSync('src/components/photos/PhotoMasonryGallery.tsx', 'utf8');
    const routeSource = readFileSync('src/app/checklists/[id].tsx', 'utf8');
    expect(gallerySource).toMatch(/currentFolderId === initialFolderId[\s\S]*?isAppActive && lockEpoch === operationEpoch/);
    expect(gallerySource).toMatch(/authorizeChecklistDelete\(checklist\.id\)[\s\S]*?deleteChecklist\(checklist\.id, authorization\.folderId\)/);
    expect(routeSource).not.toContain('deleteChecklist');
    expect(routeSource).not.toContain('Excluir lista');
  });
});
