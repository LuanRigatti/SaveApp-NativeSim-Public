export type ReconciledActivity = {
  end: (dismissalPolicy: 'immediate') => Promise<void>;
};

export type ActivityReconcilerAdapter = {
  getInstances: () => readonly ReconciledActivity[] | Promise<readonly ReconciledActivity[]>;
  start: () => void | Promise<void>;
};

/** Serializes lifecycle changes and keeps at most one activity for this feature. */
export function createActivityReconciler(adapter: ActivityReconcilerAdapter) {
  let queue: Promise<void> = Promise.resolve();

  return (enabled: boolean): Promise<void> => {
    const operation = queue.then(async () => {
      const instances = await adapter.getInstances();
      if (!enabled) {
        await Promise.all(instances.map((instance) => instance.end('immediate')));
        return;
      }

      if (instances.length === 0) {
        await adapter.start();
        return;
      }

      await Promise.all(instances.slice(1).map((instance) => instance.end('immediate')));
    });

    queue = operation.catch(() => undefined);
    return operation;
  };
}
