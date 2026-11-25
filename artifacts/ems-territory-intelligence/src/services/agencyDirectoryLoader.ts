import type { Agency } from '../types';

export type DirectoryLoadStatus = {
  status: 'loading' | 'ready' | 'unavailable';
  loaded: number;
};
export type AgencyDirectoryPage = { agencies: Agency[]; cursor?: string };
type Listener = (records: Agency[], status: DirectoryLoadStatus) => void;

/** One paginated read per app session, shared across mounts and geography changes.
 * Failed reads resume at the last acknowledged page; they never mean an empty directory.
 */
export function createAgencyDirectoryLoader(fetchPage: (cursor?: string) => Promise<AgencyDirectoryPage>) {
  const records = new Map<string, Agency>();
  const listeners = new Set<Listener>();
  let cursor: string | undefined;
  let status: DirectoryLoadStatus['status'] = 'loading';
  let running: Promise<void> | undefined;
  const emit = (page: Agency[] = []) => {
    for (const listener of listeners) listener(page, { status, loaded: records.size });
  };
  const load = (): Promise<void> => {
    if (running) return running;
    if (status === 'ready') return Promise.resolve();
    status = 'loading';
    // Defer execution until running is assigned, including synchronous failures.
    running = Promise.resolve().then(async () => {
      emit();
      try {
        while (true) {
          const page = await fetchPage(cursor);
          if (page.cursor && page.cursor === cursor) throw new Error('Agency directory cursor did not advance.');
          for (const agency of page.agencies) records.set(agency.id, agency);
          cursor = page.cursor;
          if (!cursor) status = 'ready';
          emit(page.agencies);
          if (status === 'ready') break;
        }
      } catch {
        status = 'unavailable';
        emit();
      } finally {
        running = undefined;
      }
    });
    return running;
  };
  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      listener([...records.values()], { status, loaded: records.size });
      void load();
      return () => { listeners.delete(listener); };
    },
    retry: load,
  };
}

/** A late national page must not replace a newer state subscription revision. */
export function mergeDirectoryAgency(existing: Agency | undefined, incoming: Agency): Agency {
  if (existing?.isCloudPersisted && (existing._revision ?? 0) > (incoming._revision ?? 0)) return existing;
  const existingContactNotes = new Map((existing?.keyContacts ?? []).map((contact) => [contact.id, contact.notes]));
  return {
    ...existing,
    ...incoming,
    fieldNotes: incoming.fieldNotes ?? existing?.fieldNotes ?? [],
    followUpTasks: incoming.followUpTasks ?? existing?.followUpTasks,
    keyContacts: incoming.keyContacts?.map((contact) => ({
      ...contact,
      notes: contact.notes ?? existingContactNotes.get(contact.id),
    })) ?? existing?.keyContacts,
    installedFleet: { ...existing?.installedFleet, ...incoming.installedFleet },
    fleet: incoming.fleet ? { ...existing?.fleet, ...incoming.fleet } : existing?.fleet,
    factEvidence: { ...existing?.factEvidence, ...incoming.factEvidence },
  };
}
