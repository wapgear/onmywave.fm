import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useIsMutating, useMutation } from '@tanstack/react-query';
import type { Connection } from '../../shared/types';
import { unwrap } from '../api';

export type ConnectionTransition = (source: HTMLButtonElement | null, operation: () => Promise<Connection | undefined>) => Promise<void>;
export type LibrarySelectionDone = (connection: Connection) => void | false | Promise<void | false>;
type Submission = { ids: string[]; accountId: string; revision: number; done: LibrarySelectionDone };
function useSelection(connection: Connection | null, expired: boolean) {
  const [selected, setSelected] = useState(connection?.selectedLibraryIds ?? []);
  const active = useRef(false);
  const revision = useRef(0);
  const submitting = useRef(false);
  const current = useRef({ accountId: connection?.id, expired });
  useLayoutEffect(() => { current.current = { accountId: connection?.id, expired }; });
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const pending = useIsMutating({ mutationKey: ['selectLibraries', connection?.id] }) > 0;
  const save = useMutation({
    mutationKey: ['selectLibraries', connection?.id],
    mutationFn: async ({ ids }: Submission) => unwrap(await window.wave.selectLibraries(ids)),
    onSuccess: async (value, input) => {
      if (!active.current || input.revision !== revision.current || value.id !== input.accountId || current.current.accountId !== input.accountId) return;
      setSelected(value.selectedLibraryIds);
      if (!current.current.expired) await input.done(value);
    },
    onSettled: () => { submitting.current = false; },
  });
  return {
    selected, pending, error: save.error,
    toggle(id: string) {
      if (submitting.current || pending) return;
      save.reset();
      setSelected(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id]);
    },
    async submit(ids: string[], done: Submission['done']): Promise<Connection | undefined> {
      if (submitting.current || pending || !connection || !ids.length) return;
      submitting.current = true;
      let applied = false;
      const input: Submission = { ids: [...ids], accountId: connection.id, revision: revision.current, done: async value => { applied = (await done(value)) !== false; } };
      const value = await save.mutateAsync(input);
      return applied && active.current && input.revision === revision.current && value.id === input.accountId
        && current.current.accountId === input.accountId && !current.current.expired ? value : undefined;
    },
    reset(value: Connection) {
      ++revision.current;
      save.reset();
      setSelected([...value.selectedLibraryIds]);
    },
  };
}
const LibrarySelection = createContext<ReturnType<typeof useSelection> | null>(null);
export function LibrarySelectionProvider({ connection, expired, children }: { connection: Connection | null; expired: boolean; children: ReactNode }) {
  const selection = useSelection(connection, expired);
  return <LibrarySelection.Provider value={selection}>{children}</LibrarySelection.Provider>;
}
export function useLibrarySelection() {
  const selection = useContext(LibrarySelection);
  if (!selection) throw new Error('Library selection requires an account session.');
  return selection;
}
