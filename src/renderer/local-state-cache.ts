import { replaceEqualDeep, type QueryClient } from '@tanstack/react-query';
import type { LocalStateSnapshot } from '../shared/types';

export function retainNewestLocalState(previous: unknown, incoming: unknown) {
  const current = previous as LocalStateSnapshot | undefined;
  const next = incoming as LocalStateSnapshot | undefined;
  return current && next && current.revision > next.revision ? current : replaceEqualDeep(previous, incoming);
}

export async function confirmLocalState(client: QueryClient, saved: LocalStateSnapshot) {
  await client.cancelQueries({ queryKey: ['localState'], exact: true });
  client.setQueryData<LocalStateSnapshot>(['localState'], current => current ? retainNewestLocalState(current, saved) as LocalStateSnapshot : current);
}
