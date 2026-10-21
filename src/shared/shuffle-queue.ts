export const SHUFFLE_WINDOW_SIZE = 50;

export const SHUFFLE_REFILL_THRESHOLD = 10;

export type ShufflePlan = {
  upcoming: string[];
  history: string[];
  cursor: number;
  visited: Set<string>;
};

export type ShuffleSnapshot = { upcoming: number[]; history: number[]; cursor: number; visited: number[] };

/** Validate persisted indices against the canonical occurrence order. */
export function isShuffleSnapshot(value: unknown, queueLength: number, currentIndex: number): value is ShuffleSnapshot {
  if (!Number.isInteger(queueLength) || queueLength < 0 || !Number.isInteger(currentIndex)) return false;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  if (Object.keys(snapshot).some((key) => !['upcoming', 'history', 'cursor', 'visited'].includes(key))) return false;
  if (
    !Array.isArray(snapshot.upcoming) ||
    !Array.isArray(snapshot.history) ||
    !Array.isArray(snapshot.visited) ||
    !Number.isInteger(snapshot.cursor)
  )
    return false;
  const upcoming = snapshot.upcoming;
  const history = snapshot.history;
  const visited = snapshot.visited;
  if (
    upcoming.length > SHUFFLE_WINDOW_SIZE ||
    history.length > Math.max(1, queueLength) ||
    visited.length > queueLength
  )
    return false;
  const validIndex = (index: unknown): index is number =>
    Number.isInteger(index) && (index as number) >= 0 && (index as number) < queueLength;
  if (
    !Array.from(upcoming).every(validIndex) ||
    !Array.from(history).every(validIndex) ||
    !Array.from(visited).every(validIndex)
  )
    return false;
  if (new Set(upcoming).size !== upcoming.length || new Set(visited).size !== visited.length) return false;
  const visitedSet = new Set(visited as number[]);
  if (upcoming.some((index) => visitedSet.has(index))) return false;
  const cursor = snapshot.cursor as number;
  if (queueLength === 0) return upcoming.length === 0 && history.length === 0 && visited.length === 0 && cursor === -1;
  return (
    currentIndex >= 0 &&
    currentIndex < queueLength &&
    visited.length > 0 &&
    history.length > 0 &&
    cursor >= 0 &&
    cursor < history.length &&
    history[cursor] === currentIndex
  );
}

function sample<T>(values: T[], count: number): T[] {
  const result = [...values];
  const size = Math.min(count, result.length);
  for (let index = 0; index < size; index += 1) {
    const swap = index + Math.floor(Math.random() * (result.length - index));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result.slice(0, size);
}

function retainedCursor(
  history: string[],
  cursor: number,
  keep: (key: string) => boolean,
): { history: string[]; cursor: number } {
  const retained = history.filter(keep);
  const cursorPosition = history.slice(0, cursor + 1).filter(keep).length - 1;
  return { history: retained, cursor: Math.max(-1, cursorPosition) };
}

function appendHistory(plan: ShufflePlan, key: string, limit: number): ShufflePlan {
  const history = [...plan.history.slice(0, plan.cursor + 1), key].slice(-limit);
  return { ...plan, history, cursor: history.length - 1, visited: new Set([...plan.visited, key]) };
}

export function createShufflePlan(keys: string[], currentKey: string | null): ShufflePlan {
  const currentIsPresent = currentKey !== null && keys.includes(currentKey);
  const history = currentIsPresent ? [currentKey] : [];
  const visited = new Set(history);
  const upcoming = sample(
    keys.filter((key) => !visited.has(key)),
    SHUFFLE_WINDOW_SIZE,
  );
  return { upcoming, history, cursor: history.length - 1, visited };
}

/** Replenish the active cycle independently of replay through earlier history. */
export function refillShufflePlan(plan: ShufflePlan, keys: string[]): ShufflePlan {
  const available = new Set(keys);
  const upcoming = plan.upcoming.filter((key, index, items) => available.has(key) && items.indexOf(key) === index);
  const { history, cursor } = retainedCursor(plan.history, plan.cursor, (key) => available.has(key));
  const visited = new Set([...plan.visited].filter((key) => available.has(key)));
  const normalized: ShufflePlan = { upcoming, history, cursor: Math.max(-1, cursor), visited };
  if (upcoming.length > SHUFFLE_REFILL_THRESHOLD) return normalized;
  const planned = new Set(upcoming);
  const needed = Math.max(0, SHUFFLE_WINDOW_SIZE - upcoming.length);
  const candidates = keys.filter((key) => !visited.has(key) && !planned.has(key));
  return { ...normalized, upcoming: [...upcoming, ...sample(candidates, needed)] };
}

/** Select the next planned occurrence, replay forward history, or start a repeat-all cycle. */
export function nextShuffle(
  plan: ShufflePlan,
  keys: string[],
  currentKey: string | null,
  repeatAll: boolean,
): { plan: ShufflePlan; key: string | null } {
  plan = refillShufflePlan(plan, keys);
  const available = new Set(keys);
  const upcoming = plan.upcoming.filter((key) => available.has(key));
  const { history, cursor } = retainedCursor(plan.history, plan.cursor, (key) => available.has(key));
  const visited = new Set([...plan.visited].filter((key) => available.has(key)));
  const normalized: ShufflePlan = { upcoming, history, cursor: Math.max(-1, cursor), visited };

  while (normalized.cursor + 1 < normalized.history.length) {
    const nextCursor = normalized.cursor + 1;
    const key = normalized.history[nextCursor];
    if (available.has(key)) {
      const advanced: ShufflePlan = { ...normalized, cursor: nextCursor };
      return { plan: refillShufflePlan(advanced, keys), key };
    }
    normalized.history.splice(nextCursor, 1);
  }

  let nextKey = upcoming[0] ?? null;
  let nextUpcoming = upcoming.slice(nextKey ? 1 : 0);
  let nextVisited = visited;
  if (!nextKey && repeatAll && keys.length) {
    const first = sample(
      keys.filter((key) => key !== currentKey || keys.length === 1),
      1,
    )[0];
    nextKey = first ?? null;
    nextUpcoming = sample(
      keys.filter((key) => key !== first),
      SHUFFLE_WINDOW_SIZE,
    );
    nextVisited = new Set();
  }
  if (!nextKey) return { plan: { ...normalized, upcoming: nextUpcoming, visited: nextVisited }, key: null };

  const advanced = appendHistory(
    { ...normalized, upcoming: nextUpcoming, visited: nextVisited },
    nextKey,
    Math.max(1, keys.length),
  );
  const replenished = refillShufflePlan(advanced, keys);
  return { plan: replenished, key: nextKey };
}

/** Move history to a chosen occurrence while preserving a chosen future suffix. */
export function selectShuffle(plan: ShufflePlan, keys: string[], key: string): ShufflePlan {
  if (!keys.includes(key)) return plan;
  const upcomingIndex = plan.upcoming.indexOf(key);
  if (upcomingIndex >= 0) {
    const skipped = plan.upcoming.slice(0, upcomingIndex);
    const visited = new Set([...plan.visited, ...skipped, key]);
    const history = [...plan.history.slice(0, plan.cursor + 1), key].slice(-Math.max(1, keys.length));
    return { upcoming: plan.upcoming.slice(upcomingIndex + 1), history, cursor: history.length - 1, visited };
  }

  const historyIndex = plan.history.lastIndexOf(key);
  if (historyIndex >= 0) return { ...plan, cursor: historyIndex };

  const history = [...plan.history.slice(0, plan.cursor + 1), key].slice(-Math.max(1, keys.length));
  return { ...plan, history, cursor: history.length - 1, visited: new Set([...plan.visited, key]) };
}

/** Remove one queue occurrence from every plan structure and repair its history cursor. */
export function removeShuffle(plan: ShufflePlan, keys: string[], key: string): ShufflePlan {
  const available = new Set(keys);
  const { history, cursor } = retainedCursor(plan.history, plan.cursor, (item) => available.has(item) && item !== key);
  return {
    upcoming: plan.upcoming.filter((item) => available.has(item) && item !== key),
    history,
    cursor: Math.max(-1, cursor),
    visited: new Set([...plan.visited].filter((item) => available.has(item) && item !== key)),
  };
}

/** Move the history cursor backward without adding skipped plan items to history. */
export function previousShuffle(plan: ShufflePlan): { plan: ShufflePlan; key: string | null } {
  if (plan.cursor <= 0) return { plan, key: null };
  const cursor = plan.cursor - 1;
  return { plan: { ...plan, cursor }, key: plan.history[cursor] ?? null };
}
