/* global describe, expect, test */

const { readFileSync } = require('node:fs');
const {
  appendChecklistDraftTask,
  checklistTasksForCreation,
  removeChecklistDraftTask,
  toggleChecklistDraftTask,
  updateChecklistDraftTaskText,
} = require('../src/features/home-content/checklistDraftTasks');
const {
  CHECKLIST_COMPOSE_ROW_GAP,
  CHECKLIST_COMPOSE_ROW_MIN_HEIGHT,
  CHECKLIST_COMPOSE_TOUCH_TARGET,
  CHECKLIST_TASK_ROW_GAP,
  getChecklistComposeCheckboxCenters,
} = require('../src/features/home-content/checklistComposeLayout');

const composerSource = readFileSync('src/app/checklists/compose.tsx', 'utf8');
const taskRowSource = readFileSync('src/components/homeContent/ChecklistTaskRow.tsx', 'utf8');
const addTaskRowSource = readFileSync('src/components/homeContent/ChecklistAddTaskRow.tsx', 'utf8');
const savedDetailSource = readFileSync(require.resolve('../src/app/checklists/[id].tsx'), 'utf8');
const themeSizesSource = readFileSync('src/theme/sizes.ts', 'utf8');

describe('new checklist draft tasks', () => {
  test('starts empty and does not turn the add-task placeholder into a saved row', () => {
    expect(checklistTasksForCreation([])).toEqual([]);
    expect(composerSource).toContain('useState<ChecklistDraftTask[]>([])');
    expect(composerSource).toContain('<ChecklistAddTaskRow');
    expect(composerSource).toContain('onSubmit={addDraftTask}');
    expect(addTaskRowSource).toContain('if (!submittedText.trim() || submitInFlightRef.current) return');
  });

  test('adds ordered draft tasks once per stable id, edits them and preserves completion state', () => {
    let tasks = [];
    const first = { id: 1, text: 'Papel higiênico', isCompleted: false };
    const second = { id: 2, text: 'Buscar encomenda', isCompleted: false };

    tasks = appendChecklistDraftTask(tasks, first);
    tasks = appendChecklistDraftTask(tasks, first);
    tasks = appendChecklistDraftTask(tasks, second);
    tasks = updateChecklistDraftTaskText(tasks, 1, 'Comprar papel higiênico');
    tasks = toggleChecklistDraftTask(tasks, 2);

    expect(tasks).toEqual([
      { id: 1, text: 'Comprar papel higiênico', isCompleted: false },
      { id: 2, text: 'Buscar encomenda', isCompleted: true },
    ]);
    expect(composerSource).toContain('onToggle={() => toggleDraftTask(task.id)}');
    expect(taskRowSource).toContain('textDecorationLine: task.isCompleted ?');
  });

  test('removes a draft task without changing the order of the remaining tasks', () => {
    const tasks = [
      { id: 1, text: 'Primeira', isCompleted: false },
      { id: 2, text: 'Excluir', isCompleted: true },
      { id: 3, text: 'Última', isCompleted: false },
    ];

    expect(removeChecklistDraftTask(tasks, 2)).toEqual([tasks[0], tasks[2]]);
    expect(composerSource).toContain('createDraftTaskDeleteAction(task.id)');
    expect(composerSource).toContain("title: 'Excluir'");
  });

  test('keeps only nonblank tasks in the ordered save payload, including checked tasks', () => {
    const tasks = [
      { id: 1, text: 'A', isCompleted: true },
      { id: 2, text: '   ', isCompleted: false },
      { id: 3, text: 'B', isCompleted: false },
      { id: 4, text: '\n\t', isCompleted: true },
    ];

    expect(checklistTasksForCreation(tasks)).toEqual([
      { text: 'A', isCompleted: true },
      { text: 'B', isCompleted: false },
    ]);
    expect(composerSource).toContain('checklistTasksForCreation(tasks, pendingTaskTextRef.current)');
    expect(composerSource).toContain('usePreventRemove(hasDraft && !allowRouteRemoval, onPreventedRemoval)');
  });

  test('includes valid text still being edited in the final add-task row when saving without Return', () => {
    const tasks = [{ id: 1, text: 'Primeira', isCompleted: true }];

    expect(checklistTasksForCreation(tasks, 'Última tarefa')).toEqual([
      { text: 'Primeira', isCompleted: true },
      { text: 'Última tarefa', isCompleted: false },
    ]);
    expect(checklistTasksForCreation(tasks, '   ')).toEqual([
      { text: 'Primeira', isCompleted: true },
    ]);
    expect(composerSource).toContain('checklistTasksForCreation(tasks, pendingTaskTextRef.current)');
    expect(composerSource).toContain('pendingTaskText.trim().length > 0');
    expect(addTaskRowSource).toContain('onDraftChange?.(value)');
  });

  test('shares saved checklist task rows, uses the exact title placeholder and submits to the next input', () => {
    expect(composerSource).toContain('<ChecklistTaskRow');
    expect(composerSource).toContain('<ChecklistAddTaskRow');
    expect(composerSource).toContain('placeholder="Digite o título"');
    expect(composerSource).toContain('borderRadius: theme.radius.lg');
    expect(composerSource).toContain('focusRequest={addTaskFocusRequest}');
    expect(composerSource).toContain('onSubmitEditing={focusAddTaskInput}');
    expect(composerSource).toContain('disabled={isSaving}');
    expect(composerSource).toContain('onSubmitEditing={() => handleDraftTaskSubmit(task)}');
    expect(composerSource).not.toContain('backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, overflow: \'hidden\'');
    expect(composerSource).not.toContain('>+<');
    expect(taskRowSource).toContain("submitBehavior={onSubmitEditing ? 'submit' : undefined}");
    expect(addTaskRowSource).toContain('placeholder="Adicionar tarefa"');
  });

  test('shows one save action aligned to the right and no cancel action', () => {
    expect(composerSource).toContain("<View style={{ alignSelf: 'stretch', alignItems: 'flex-end' }}>");
    expect(composerSource).toContain('label={isSaving ? \'Salvando…\' : \'Salvar\'}');
    expect(composerSource).not.toContain('label="Cancelar"');
    expect(composerSource).not.toContain('Salvar lista');
    expect(composerSource).not.toContain("justifyContent: 'center'");
  });

  test('uses a measured 44pt center pitch for five tasks plus Add Task and compacts the previous 46pt layout', () => {
    const centers = getChecklistComposeCheckboxCenters(6);
    const pitches = centers.slice(1).map((center, index) => center - centers[index]);
    const previousPitch = CHECKLIST_COMPOSE_TOUCH_TARGET + 2;
    const previousSpan = previousPitch * (centers.length - 1);
    const compactSpan = centers[centers.length - 1] - centers[0];

    expect(CHECKLIST_COMPOSE_ROW_MIN_HEIGHT).toBe(CHECKLIST_COMPOSE_TOUCH_TARGET);
    expect(CHECKLIST_COMPOSE_ROW_GAP).toBe(0);
    expect(CHECKLIST_TASK_ROW_GAP).toBe(0);
    expect(CHECKLIST_COMPOSE_TOUCH_TARGET).toBe(44);
    expect(themeSizesSource).toContain('touchTargetMinimum: 44');
    expect(pitches).toEqual([44, 44, 44, 44, 44]);
    expect(pitches.every((pitch) => pitch >= CHECKLIST_COMPOSE_TOUCH_TARGET)).toBe(true);
    expect(pitches.map((pitch) => pitch - CHECKLIST_COMPOSE_TOUCH_TARGET)).toEqual([0, 0, 0, 0, 0]);
    expect(previousPitch).toBe(46);
    expect(previousSpan).toBe(230);
    expect(compactSpan).toBe(220);
    expect(compactSpan).toBeLessThan(previousSpan);

    expect(composerSource).toContain('gap: CHECKLIST_COMPOSE_ROW_GAP');
    expect(composerSource).toContain('minHeight: CHECKLIST_COMPOSE_ROW_MIN_HEIGHT');
    expect(composerSource).toContain('rowMinimumHeight={CHECKLIST_COMPOSE_ROW_MIN_HEIGHT}');
    expect(composerSource).toContain('verticalHitSlop={0}');
    expect(composerSource).toContain('checkboxHitTargetWidth={CHECKLIST_COMPOSE_TOUCH_TARGET}');
    expect(composerSource).toContain('checkboxColumnWidth={CHECKLIST_COMPOSE_TOUCH_TARGET}');
    expect(taskRowSource).toContain('height: theme.sizes.touchTargetMinimum');
    expect(taskRowSource).toContain('width: checkboxHitTargetWidth');
    expect(taskRowSource).toContain('left: checkboxHitTargetWidth >= theme.sizes.touchTargetMinimum ? 0 : 12');
    expect(taskRowSource).toContain('minHeight: rowHeight');
    expect(addTaskRowSource).toContain('minHeight: rowHeight');
    expect(addTaskRowSource).toContain('height: rowHeight');
    expect(addTaskRowSource).toContain('width: checkboxColumnWidth');
    expect(addTaskRowSource).toContain('rowMinimumHeight === undefined');
    expect(addTaskRowSource).toContain('minHeight: minimumTextHeight');
  });

  test('uses the same compact pitch in saved checklists and keeps independent 44pt vertical touch areas', () => {
    expect(savedDetailSource).toContain('gap: CHECKLIST_TASK_ROW_GAP');
    expect(savedDetailSource).toContain('verticalHitSlop={0}');
    expect(savedDetailSource).not.toContain('rowMinimumHeight=');
    expect(savedDetailSource).toContain('CHECKLIST_TASK_ROW_GAP');
    expect(taskRowSource).toContain('verticalHitSlop = 4');
    expect(taskRowSource).toContain('height: theme.sizes.touchTargetMinimum');
    expect(taskRowSource).toContain('paddingVertical: 0');
    expect(addTaskRowSource).toContain('minHeight: rowHeight');
    expect(addTaskRowSource).toContain('paddingVertical: 0');
  });
});
