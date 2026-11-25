/** Serialize journal writes across tabs; backend mutation receipts make retries idempotent. */
export async function withWorkspaceLock<T>(write: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('ems-workspace-journal', write);
  return write();
}
