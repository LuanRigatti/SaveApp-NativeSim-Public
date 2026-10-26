export function triggerChecklistHaptic(feedback: () => Promise<void>): void {
  try {
    void feedback().catch(() => undefined);
  } catch {
    // Haptics are optional and must never block a checklist action.
  }
}
