/* global afterEach, beforeEach, describe, expect, jest, test */

const { DatabaseSync } = require("node:sqlite");

const mockChecklistDatabase = { current: null };

jest.mock(
  "@/features/photos/photoLibrary",
  () => ({
    getSaveAppDatabase: async () => mockChecklistDatabase.current,
  }),
  { virtual: true },
);

const {
  CHECKLIST_SCHEMA_VERSION,
  ensureChecklistSchema,
} = require("../src/features/home-content/checklistSchemaMigration");
const checklistLibrary = require("../src/features/home-content/checklistLibrary");
const {
  ChecklistLibraryError,
} = require("../src/features/home-content/checklistTypes");

function createDatabaseAdapter({ failOnAssociationRebuild = false } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const adapter = {
    failOnTaskInsert: false,
    async execAsync(source) {
      sqlite.exec(source);
    },
    async runAsync(source, ...parameters) {
      const result = sqlite.prepare(source).run(...parameters);
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async getFirstAsync(source, ...parameters) {
      return sqlite.prepare(source).get(...parameters) ?? null;
    },
    async getAllAsync(source, ...parameters) {
      return sqlite.prepare(source).all(...parameters);
    },
    async withExclusiveTransactionAsync(callback) {
      // Expo SQLite 58 runs exclusive transactions on another connection;
      // model that connection's default foreign-key setting in this adapter.
      sqlite.exec("PRAGMA foreign_keys = OFF;");
      sqlite.exec("BEGIN IMMEDIATE;");
      const transaction = {
        async execAsync(source) {
          if (
            failOnAssociationRebuild &&
            /CREATE TABLE saved_folder_items \(/i.test(source)
          ) {
            throw new Error("simulated association-table rebuild failure");
          }
          sqlite.exec(source);
        },
        async runAsync(source, ...parameters) {
          if (
            adapter.failOnTaskInsert &&
            /INSERT INTO saved_checklist_items/i.test(source)
          ) {
            throw new Error("simulated initial-task insert failure");
          }
          const result = sqlite.prepare(source).run(...parameters);
          return {
            changes: Number(result.changes),
            lastInsertRowId: Number(result.lastInsertRowid),
          };
        },
        async getFirstAsync(source, ...parameters) {
          return sqlite.prepare(source).get(...parameters) ?? null;
        },
        async getAllAsync(source, ...parameters) {
          return sqlite.prepare(source).all(...parameters);
        },
      };

      try {
        await callback(transaction);
        sqlite.exec("COMMIT;");
      } catch (error) {
        sqlite.exec("ROLLBACK;");
        throw error;
      } finally {
        sqlite.exec("PRAGMA foreign_keys = ON;");
      }
    },
    close() {
      sqlite.close();
    },
    sqlite,
  };

  return adapter;
}

function seedFolderSchemaV5(database) {
  database.sqlite.exec(`
    CREATE TABLE saveapp_schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
    INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (4, 400), (5, 500);
    CREATE TABLE saved_folders (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      color TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_protected INTEGER NOT NULL DEFAULT 0 CHECK (is_protected IN (0, 1))
    );
    INSERT INTO saved_folders (id, name, normalized_name, created_at, updated_at)
      VALUES ('folder-a', 'Pessoal', 'pessoal', 100, 100);
    CREATE TABLE photos (id INTEGER PRIMARY KEY, media_type TEXT NOT NULL);
    CREATE TABLE saved_content (id INTEGER PRIMARY KEY, content_type TEXT NOT NULL);
    CREATE TABLE saved_documents (id INTEGER PRIMARY KEY);
    INSERT INTO photos VALUES (1, 'photo'), (2, 'video');
    INSERT INTO saved_content VALUES (3, 'link'), (4, 'text');
    INSERT INTO saved_documents VALUES (5);
    CREATE TABLE saved_folder_items (
      item_type TEXT NOT NULL CHECK (item_type IN ('photo', 'video', 'link', 'text', 'document')),
      item_id TEXT NOT NULL,
      folder_id TEXT NOT NULL REFERENCES saved_folders(id) ON DELETE CASCADE,
      PRIMARY KEY (item_type, item_id)
    );
    CREATE INDEX saved_folder_items_folder_idx
      ON saved_folder_items(folder_id, item_type, item_id);
    INSERT INTO saved_folder_items VALUES
      ('photo', '1', 'folder-a'), ('video', '2', 'folder-a'),
      ('link', '3', 'folder-a'), ('text', '4', 'folder-a'),
      ('document', '5', 'folder-a');
    CREATE TRIGGER saved_folder_items_photo_delete
    AFTER DELETE ON photos
    BEGIN
      DELETE FROM saved_folder_items
      WHERE item_type = OLD.media_type AND item_id = CAST(OLD.id AS TEXT);
    END;
    CREATE TRIGGER saved_folder_items_content_delete
    AFTER DELETE ON saved_content
    BEGIN
      DELETE FROM saved_folder_items
      WHERE item_type = OLD.content_type AND item_id = CAST(OLD.id AS TEXT);
    END;
    CREATE TRIGGER saved_folder_items_document_delete
    AFTER DELETE ON saved_documents
    BEGIN
      DELETE FROM saved_folder_items
      WHERE item_type = 'document' AND item_id = CAST(OLD.id AS TEXT);
    END;
  `);
}

function readAssociations(database) {
  return database.sqlite
    .prepare(
      "SELECT item_type, item_id, folder_id FROM saved_folder_items ORDER BY item_type, item_id;",
    )
    .all();
}

function addRecentlyDeletedChecklistColumns(database) {
  database.sqlite.exec(`
    ALTER TABLE saved_checklists ADD COLUMN deleted_at INTEGER;
    ALTER TABLE saved_checklists ADD COLUMN deleted_folder_id TEXT;
  `);
}

describe("checklist SQLite schema migration", () => {
  let database;

  beforeEach(() => {
    database = createDatabaseAdapter();
    seedFolderSchemaV5(database);
    mockChecklistDatabase.current = database;
  });

  afterEach(() => {
    mockChecklistDatabase.current = null;
    database.close();
  });

  test("adds structured checklist tables and preserves all folder associations, indexes, and existing delete triggers", async () => {
    const originalAssociations = readAssociations(database);
    const originalTriggers = database.sqlite
      .prepare(
        `SELECT name, sql FROM sqlite_master WHERE type = 'trigger'
       AND name IN ('saved_folder_items_photo_delete', 'saved_folder_items_content_delete', 'saved_folder_items_document_delete')
       ORDER BY name;`,
      )
      .all();

    await ensureChecklistSchema(database);
    addRecentlyDeletedChecklistColumns(database);

    expect(readAssociations(database)).toEqual(originalAssociations);
    expect(
      database.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'saved_folder_items' AND name = 'saved_folder_items_folder_idx';",
        )
        .get(),
    ).toBeTruthy();
    expect(
      database.sqlite
        .prepare(
          `SELECT name, sql FROM sqlite_master WHERE type = 'trigger'
       AND name IN ('saved_folder_items_photo_delete', 'saved_folder_items_content_delete', 'saved_folder_items_document_delete')
       ORDER BY name;`,
        )
        .all(),
    ).toEqual(originalTriggers);

    await database.runAsync("DELETE FROM photos WHERE id = 1;");
    await database.runAsync("DELETE FROM saved_content WHERE id = 3;");
    await database.runAsync("DELETE FROM saved_documents WHERE id = 5;");
    expect(readAssociations(database)).toEqual([
      { item_type: "text", item_id: "4", folder_id: "folder-a" },
      { item_type: "video", item_id: "2", folder_id: "folder-a" },
    ]);

    expect(
      database.sqlite
        .prepare(
          "SELECT version FROM saveapp_schema_migrations WHERE version = ?;",
        )
        .get(CHECKLIST_SCHEMA_VERSION),
    ).toEqual({ version: CHECKLIST_SCHEMA_VERSION });
    expect(() =>
      database.sqlite
        .prepare(
          "INSERT INTO saved_folder_items VALUES ('unsupported', '9', 'folder-a');",
        )
        .run(),
    ).toThrow();

    const checklistId = await checklistLibrary.createSavedChecklist(
      "  Pessoal  ",
      ["Organizar arquivos"],
    );
    await database.runAsync(
      "INSERT INTO saved_folder_items (item_type, item_id, folder_id) VALUES ('checklist', ?, 'folder-a');",
      String(checklistId),
    );
    await database.runAsync(
      "DELETE FROM saved_checklists WHERE id = ?;",
      checklistId,
    );
    expect(
      database.sqlite
        .prepare(
          "SELECT item_id FROM saved_folder_items WHERE item_type = 'checklist';",
        )
        .all(),
    ).toEqual([]);
  });

  test("is idempotent and leaves a checklist task cascade intact", async () => {
    await ensureChecklistSchema(database);
    await ensureChecklistSchema(database);
    addRecentlyDeletedChecklistColumns(database);

    const checklistId = await checklistLibrary.createSavedChecklist("Compras", [
      "Leite",
    ]);
    expect(
      database.sqlite
        .prepare(
          "SELECT version FROM saveapp_schema_migrations WHERE version = ?;",
        )
        .get(CHECKLIST_SCHEMA_VERSION),
    ).toEqual({ version: CHECKLIST_SCHEMA_VERSION });

    await database.runAsync(
      "DELETE FROM saved_checklists WHERE id = ?;",
      checklistId,
    );
    expect(
      database.sqlite
        .prepare("SELECT id FROM saved_checklist_items WHERE checklist_id = ?;")
        .all(checklistId),
    ).toEqual([]);
    expect(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM saveapp_schema_migrations WHERE version = ?;",
        )
        .get(CHECKLIST_SCHEMA_VERSION).count,
    ).toBe(1);
  });

  test("v7 increases task text capacity while preserving rows, IDs, metadata, and AUTOINCREMENT state", async () => {
    database.sqlite.exec(`
      CREATE TABLE saved_checklists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE saved_checklist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checklist_id INTEGER NOT NULL REFERENCES saved_checklists(id) ON DELETE CASCADE,
        text TEXT NOT NULL CHECK (length(trim(text)) BETWEEN 1 AND 1000),
        is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
        position INTEGER NOT NULL CHECK (position >= 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX saved_checklist_items_order_idx
        ON saved_checklist_items(checklist_id, position, id);
      INSERT INTO saved_checklists (id, title, created_at, updated_at)
        VALUES (4, 'Legada v6', 100, 200);
      INSERT INTO saved_checklist_items
        (id, checklist_id, text, is_completed, position, created_at, updated_at)
        VALUES (7, 4, 'Primeira tarefa com parágrafo', 1, 0, 110, 120),
               (8, 4, 'Segunda tarefa', 0, 1, 130, 140),
               (25, 4, 'ID removido mantém sequência', 0, 2, 150, 160);
      DELETE FROM saved_checklist_items WHERE id = 25;
      INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (6, 600);
    `);

    await ensureChecklistSchema(database);
    addRecentlyDeletedChecklistColumns(database);

    const rebuiltRows = database.sqlite.prepare(
      `SELECT id, checklist_id, text, is_completed, position, created_at, updated_at
       FROM saved_checklist_items ORDER BY position, id;`,
    ).all();
    expect(rebuiltRows).toEqual([
      { id: 7, checklist_id: 4, text: 'Primeira tarefa com parágrafo', is_completed: 1, position: 0, created_at: 110, updated_at: 120 },
      { id: 8, checklist_id: 4, text: 'Segunda tarefa', is_completed: 0, position: 1, created_at: 130, updated_at: 140 },
    ]);
    expect(database.sqlite.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'saved_checklist_items';",
    ).get().sql).toMatch(/BETWEEN 1 AND 10000/);

    const longText = 'parágrafo longo '.repeat(500);
    const added = await checklistLibrary.addSavedChecklistTask(4, longText);
    expect(added.id).toBeGreaterThan(25);
    const checklistAfterAdd = await checklistLibrary.getSavedChecklist(4);
    expect(checklistAfterAdd.tasks[2].text).toBe(longText);
    expect(checklistAfterAdd.tasks.map((task) => task.position)).toEqual([0, 1, 2]);
    expect(database.sqlite.prepare(
      'SELECT version FROM saveapp_schema_migrations WHERE version = 7;',
    ).get()).toEqual({ version: 7 });
  });

  test("refuses to run before the folder v5 migration", async () => {
    database.sqlite.exec(
      "DELETE FROM saveapp_schema_migrations WHERE version = 5;",
    );
    await expect(ensureChecklistSchema(database)).rejects.toThrow(
      "CHECKLIST_FOLDER_SCHEMA_V5_REQUIRED",
    );
    expect(
      database.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_checklists';",
        )
        .get(),
    ).toBeUndefined();
  });

  test("rolls back the complete migration if rebuilding folder associations fails", async () => {
    database.close();
    database = createDatabaseAdapter({ failOnAssociationRebuild: true });
    seedFolderSchemaV5(database);
    const originalAssociations = readAssociations(database);

    await expect(ensureChecklistSchema(database)).rejects.toThrow(
      "simulated association-table rebuild failure",
    );

    expect(readAssociations(database)).toEqual(originalAssociations);
    expect(
      database.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_checklists';",
        )
        .get(),
    ).toBeUndefined();
    expect(
      database.sqlite
        .prepare(
          "SELECT version FROM saveapp_schema_migrations WHERE version = ?;",
        )
        .get(CHECKLIST_SCHEMA_VERSION),
    ).toBeUndefined();
    expect(
      database.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'saved_folder_items_folder_idx';",
        )
        .get(),
    ).toBeTruthy();
  });
});

describe("structured checklist library", () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseAdapter();
    seedFolderSchemaV5(database);
    await ensureChecklistSchema(database);
    addRecentlyDeletedChecklistColumns(database);
    mockChecklistDatabase.current = database;
  });

  afterEach(() => {
    mockChecklistDatabase.current = null;
    database.close();
    jest.restoreAllMocks();
  });

  test("creates a list and nonblank initial tasks atomically and returns efficient summaries with task completion previews", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const checklistId = await checklistLibrary.createSavedChecklist(
      "  Por fazer  ",
      [
        " Testar Face ID ",
        "   ",
        "Organizar documentos",
        "Ajustar Splash Screen",
      ],
    );
    const checklist = await checklistLibrary.getSavedChecklist(checklistId);

    expect(checklist.title).toBe("Por fazer");
    expect(checklist.tasks.map((task) => task.text)).toEqual([
      " Testar Face ID ",
      "Organizar documentos",
      "Ajustar Splash Screen",
    ]);
    expect(
      checklist.tasks.every(
        (task) => Number.isSafeInteger(task.id) && task.id > 0,
      ),
    ).toBe(true);
    expect(checklist.tasks.map((task) => task.position)).toEqual([0, 1, 2]);

    const summaries = await checklistLibrary.listSavedChecklists();
    expect(summaries).toEqual([
      expect.objectContaining({
        id: checklist.id,
        title: "Por fazer",
        totalTaskCount: 3,
        completedTaskCount: 0,
        previewTasks: [
          { text: " Testar Face ID ", isCompleted: false },
          { text: "Organizar documentos", isCompleted: false },
          { text: "Ajustar Splash Screen", isCompleted: false },
        ],
      }),
    ]);
    expect(summaries[0].previewTasks).toHaveLength(3);
  });

  test("loads up to five ordered preview tasks with persisted completion in one catalog query", async () => {
    const checklistId = await checklistLibrary.createSavedChecklist("Prévia", [
      "Tarefa A",
      "Tarefa B",
      "Tarefa C",
      "Tarefa D",
      "Tarefa E",
      "Tarefa F",
    ]);
    const checklist = await checklistLibrary.getSavedChecklist(checklistId);
    await checklistLibrary.setSavedChecklistTaskCompleted(checklistId, checklist.tasks[1].id, true);
    await checklistLibrary.setSavedChecklistTaskCompleted(checklistId, checklist.tasks[4].id, true);
    const emptyChecklistId = await checklistLibrary.createSavedChecklist("Sem tarefas");
    const catalogQuery = jest.spyOn(database, "getAllAsync");

    const summaries = await checklistLibrary.listSavedChecklists();
    const previewSummary = summaries.find((summary) => summary.id === checklistId);
    const emptySummary = summaries.find((summary) => summary.id === emptyChecklistId);

    expect(catalogQuery).toHaveBeenCalledTimes(1);
    expect(previewSummary).toMatchObject({
      totalTaskCount: 6,
      completedTaskCount: 2,
      previewTasks: [
        { text: "Tarefa A", isCompleted: false },
        { text: "Tarefa B", isCompleted: true },
        { text: "Tarefa C", isCompleted: false },
        { text: "Tarefa D", isCompleted: false },
        { text: "Tarefa E", isCompleted: true },
      ],
    });
    expect(previewSummary.previewTasks).toHaveLength(5);
    expect(emptySummary).toMatchObject({ totalTaskCount: 0, previewTasks: [] });
  });

  test("rejects blank titles and task updates without persisting blank tasks", async () => {
    await expect(
      checklistLibrary.createSavedChecklist("   "),
    ).rejects.toMatchObject({
      code: "invalid-title",
    });
    const checklistId =
      await checklistLibrary.createSavedChecklist("Checklist");
    await expect(
      checklistLibrary.addSavedChecklistTask(checklistId, "  "),
    ).rejects.toMatchObject({
      code: "invalid-task",
    });
    await expect(
      checklistLibrary.updateSavedChecklistTitle(checklistId, "   "),
    ).rejects.toBeInstanceOf(ChecklistLibraryError);
    expect(await checklistLibrary.getSavedChecklist(checklistId)).toMatchObject(
      {
        totalTaskCount: 0,
        tasks: [],
      },
    );
  });

  test("assigns the first added task position zero when the checklist is empty", async () => {
    const checklistId = await checklistLibrary.createSavedChecklist("Vazia");

    const firstTask = await checklistLibrary.addSavedChecklistTask(checklistId, "Primeira tarefa");
    const checklist = await checklistLibrary.getSavedChecklist(checklistId);

    expect(firstTask.position).toBe(0);
    expect(checklist.tasks.map((task) => task.text)).toEqual(["Primeira tarefa"]);
    expect(checklist.tasks.map((task) => task.position)).toEqual([0]);
  });

  test("rolls back list creation if an initial task cannot be inserted", async () => {
    database.failOnTaskInsert = true;

    await expect(
      checklistLibrary.createSavedChecklist("Atomic", ["First task"]),
    ).rejects.toThrow("simulated initial-task insert failure");
    expect(
      database.sqlite
        .prepare("SELECT COUNT(*) AS count FROM saved_checklists;")
        .get().count,
    ).toBe(0);
    expect(
      database.sqlite
        .prepare("SELECT COUNT(*) AS count FROM saved_checklist_items;")
        .get().count,
    ).toBe(0);
  });

  test("updates titles and task text while completion leaves the Home timestamp unchanged", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1000);
    const checklistId = await checklistLibrary.createSavedChecklist("Antes", [
      "Primeira",
    ]);
    const checklist = await checklistLibrary.getSavedChecklist(checklistId);
    const originalUpdatedAt = checklist.updatedAt;

    Date.now.mockReturnValue(2000);
    const completed = await checklistLibrary.toggleSavedChecklistTask(
      checklistId,
      checklist.tasks[0].id,
      true,
    );
    expect(completed).toMatchObject({ isCompleted: true, updatedAt: 2000 });
    expect(
      (await checklistLibrary.getSavedChecklist(checklistId)).updatedAt,
    ).toBe(originalUpdatedAt);
    expect(await checklistLibrary.listSavedChecklists()).toMatchObject([
      { completedTaskCount: 1, totalTaskCount: 1 },
    ]);

    Date.now.mockReturnValue(3000);
    expect(
      await checklistLibrary.updateSavedChecklistTaskText(
        checklistId,
        completed.id,
        "  Texto revisado  ",
      ),
    ).toBe(true);
    expect(
      (await checklistLibrary.getSavedChecklist(checklistId)).tasks[0].text,
    ).toBe("  Texto revisado  ");
    expect(
      (await checklistLibrary.getSavedChecklist(checklistId)).updatedAt,
    ).toBe(3000);

    Date.now.mockReturnValue(4000);
    expect(
      await checklistLibrary.updateSavedChecklistTitle(
        checklistId,
        "  Depois  ",
      ),
    ).toBe(true);
    const renamed = await checklistLibrary.getSavedChecklist(checklistId);
    expect(renamed).toMatchObject({ title: "Depois", updatedAt: 4000 });
    expect(renamed.tasks[0]).toMatchObject({
      id: completed.id,
      isCompleted: true,
    });
  });

  test("appends consecutive additions in SQLite and preserves the order after reopening and deletion", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1000);
    const checklistId = await checklistLibrary.createSavedChecklist("Ordem", [
      "A",
      "B",
    ]);
    const checklist = await checklistLibrary.getSavedChecklist(checklistId);
    const [taskA, taskB] = checklist.tasks;

    Date.now.mockReturnValue(2000);
    const taskC = await checklistLibrary.addSavedChecklistTask(checklistId, "C");
    Date.now.mockReturnValue(3000);
    const taskD = await checklistLibrary.addSavedChecklistTask(checklistId, "D");
    const afterConsecutiveAdds = await checklistLibrary.getSavedChecklist(checklistId);
    expect(
      afterConsecutiveAdds.tasks.map((task) => task.text),
    ).toEqual(["A", "B", "C", "D"]);
    expect(
      afterConsecutiveAdds.tasks.map((task) => task.id),
    ).toEqual([taskA.id, taskB.id, taskC.id, taskD.id]);
    expect(afterConsecutiveAdds.tasks.map((task) => task.position)).toEqual([0, 1, 2, 3]);

    const reopenedChecklist = await checklistLibrary.getSavedChecklist(checklistId);
    expect(reopenedChecklist.tasks.map((task) => task.text)).toEqual(["A", "B", "C", "D"]);
    expect(reopenedChecklist.tasks.map((task) => task.position)).toEqual([0, 1, 2, 3]);

    expect(
      await checklistLibrary.deleteSavedChecklistTask(checklistId, taskC.id),
    ).toBe(true);
    const afterDelete = await checklistLibrary.getSavedChecklist(checklistId);
    expect(afterDelete.tasks.map((task) => task.id)).toEqual([taskA.id, taskB.id, taskD.id]);
    expect(afterDelete.tasks.map((task) => task.position)).toEqual([0, 1, 2]);
    expect(
      await checklistLibrary.deleteSavedChecklistTask(checklistId, taskC.id),
    ).toBe(false);
  });

  test("round-trips thousands of task characters and paragraph breaks through SQLite", async () => {
    const longText = [
      "Introdução com acentos: ação, iCloud e privacidade.",
      "Parágrafo 2. ".repeat(240),
      "• Item A.\n• Item B. ".repeat(180),
      "Conclusão preservada.",
    ].join("\n\n");
    expect(longText.length).toBeGreaterThan(4000);

    const checklistId = await checklistLibrary.createSavedChecklist("Texto longo", [longText]);
    const created = (await checklistLibrary.getSavedChecklist(checklistId)).tasks[0];
    expect((await checklistLibrary.getSavedChecklist(checklistId)).tasks[0].text).toBe(longText);

    const editedText = `\n${longText}\n\nFim da edição.\n`;
    await checklistLibrary.updateSavedChecklistTaskText(checklistId, created.id, editedText);
    expect((await checklistLibrary.getSavedChecklist(checklistId)).tasks[0].text).toBe(editedText);
  });

  test("deletes a checklist with its tasks and removes its folder association", async () => {
    const checklistId = await checklistLibrary.createSavedChecklist("Privada", [
      "Não vazar",
    ]);
    await database.runAsync(
      "INSERT INTO saved_folder_items (item_type, item_id, folder_id) VALUES ('checklist', ?, 'folder-a');",
      String(checklistId),
    );

    await expect(
      checklistLibrary.deleteSavedChecklist(checklistId, null),
    ).rejects.toMatchObject({ code: "folder-assignment-changed" });
    expect(await checklistLibrary.getSavedChecklist(checklistId)).not.toBeNull();

    expect(
      await checklistLibrary.deleteSavedChecklist(checklistId, "folder-a"),
    ).toBe(true);
    expect(await checklistLibrary.getSavedChecklist(checklistId)).toBeNull();
    expect(
      database.sqlite
        .prepare("SELECT id FROM saved_checklist_items WHERE checklist_id = ?;")
        .all(checklistId),
    ).toEqual([]);
    expect(
      database.sqlite
        .prepare(
          "SELECT item_id FROM saved_folder_items WHERE item_type = 'checklist' AND item_id = ?;",
        )
        .all(String(checklistId)),
    ).toEqual([]);
    expect(await checklistLibrary.deleteSavedChecklist(checklistId)).toBe(
      false,
    );
  });
});
