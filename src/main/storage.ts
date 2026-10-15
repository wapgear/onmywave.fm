import { defaultDJPlaybackSettings, normalizeDJPlaybackSettings } from '../shared/dj-playback';
import { defaultNewsTransitionSettings, normalizeNewsTransitionSettings } from '../shared/news-transitions';
import { NEWS_TEXT_MODEL } from '../shared/types';
import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultWorkflowDraft, isWorkflowDraft, normalizeWorkflowDraft } from '../shared/workflow';
import type { LocalState, ListeningRoom, RoomProfile } from '../shared/types';
import { readSharedProviderKey, writeSharedProviderKey } from './keychain';

export type StoredConnection = {
  id: string; serverUrl: string; userId: string; userName: string; token: string;
  serverVersion: string; selectedLibraryIds: string[];
};
const emptyState = (): LocalState => ({ djPlayback: defaultDJPlaybackSettings(), roomProfiles: [{ enabled: true, id: 'default-room', name: 'My room', room: { djId: null, sourceIds: [] }, mood: '', workflowDraft: defaultWorkflowDraft() }], activeRoomProfileId: 'default-room', newsTransitions: defaultNewsTransitionSettings(), djs: [], vibe: '', playback: null, sources: [], listeningRoom: { djId: null, sourceIds: [] }, workflowDraft: defaultWorkflowDraft() });
let localState: LocalState | undefined;
let writes = Promise.resolve();
const location = (name: string) => join(app.getPath('userData'), name);
type KeyProvider = 'openai' | 'elevenlabs' | 'twitter';
const providerKeys = new Map<KeyProvider, string | null>();
const sessionOnlyKeys = new Set<KeyProvider>();
let keyWrites = Promise.resolve();
async function readProviderKey(provider: KeyProvider): Promise<string | null> {
  const shared = provider === 'twitter' ? null : await readSharedProviderKey(provider);
  if (shared) { providerKeys.set(provider, shared); sessionOnlyKeys.delete(provider); return shared; }
  if (providerKeys.has(provider)) return providerKeys.get(provider)!;
  let key: string | null = null;
  try { if (safeStorage.isEncryptionAvailable()) key = safeStorage.decryptString(await readFile(location(`${provider}-key.enc`))); } catch { /* No saved key. */ }
  providerKeys.set(provider, key);
  return key;
}
async function providerKeyStatus(provider: KeyProvider) {
  return { configured: Boolean(await readProviderKey(provider)), sessionOnly: sessionOnlyKeys.has(provider) };
}
function writeProviderKey(provider: KeyProvider, key: string | null) {
  const next = keyWrites.then(async () => {
    if (provider !== 'twitter') await writeSharedProviderKey(provider, key);
    if (!key || !safeStorage.isEncryptionAvailable()) {
      await unlink(location(`${provider}-key.enc`)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      providerKeys.set(provider, key);
      if (key) sessionOnlyKeys.add(provider); else sessionOnlyKeys.delete(provider);
    } else {
      await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
      const temp = location(`${provider}-key.${randomUUID()}.tmp`);
      await writeFile(temp, safeStorage.encryptString(key), { mode: 0o600 });
      await rename(temp, location(`${provider}-key.enc`));
      providerKeys.set(provider, key);
      sessionOnlyKeys.delete(provider);
    }
    return providerKeyStatus(provider);
  });
  keyWrites = next.then(() => {}, () => {});
  return next;
}
export const readOpenAIKey = () => readProviderKey('openai');
export const openAIKeyStatus = () => providerKeyStatus('openai');
export const writeOpenAIKey = (key: string | null) => writeProviderKey('openai', key);
export const readElevenLabsKey = () => readProviderKey('elevenlabs');
export const elevenLabsKeyStatus = () => providerKeyStatus('elevenlabs');
export const writeElevenLabsKey = (key: string | null) => writeProviderKey('elevenlabs', key);

export const readTwitterKey = () => readProviderKey('twitter');
export const twitterKeyStatus = () => providerKeyStatus('twitter');
export const writeTwitterKey = (key: string | null) => writeProviderKey('twitter', key);

async function atomicWrite(name: string, content: string) {
  await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
  const target = location(name);
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, content, { mode: 0o600 });
  await rename(temp, target);
}

export async function readConnection(): Promise<StoredConnection | null> {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const encrypted = await readFile(location('connection.enc'));
    const record = JSON.parse(safeStorage.decryptString(encrypted)) as StoredConnection;
    if (typeof record.token !== 'string' || typeof record.serverUrl !== 'string' || typeof record.userId !== 'string'
      || typeof record.id !== 'string' || typeof record.userName !== 'string' || typeof record.serverVersion !== 'string'
      || !Array.isArray(record.selectedLibraryIds) || !record.selectedLibraryIds.every(id => typeof id === 'string')) return null;
    return record;
  } catch { return null; }
}

export async function writeConnection(record: StoredConnection | null): Promise<boolean> {
  if (!record) {
    await unlink(location('connection.enc')).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return true;
  }
  if (!safeStorage.isEncryptionAvailable()) return false;
  await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
  const temp = location(`connection.${randomUUID()}.enc.tmp`);
  await writeFile(temp, safeStorage.encryptString(JSON.stringify(record)), { mode: 0o600 });
  await rename(temp, location('connection.enc'));
  return true;
}

function validStoredProfile(value: unknown): value is RoomProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as RoomProfile;
  return typeof profile.id === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(profile.id)
    && typeof profile.name === 'string' && !!profile.name.trim() && profile.name.length <= 80
    && typeof profile.mood === 'string' && profile.mood.length <= 20_000 && isWorkflowDraft(profile.workflowDraft)
    && !!profile.room && (profile.room.djId === null || typeof profile.room.djId === 'string')
    && Array.isArray(profile.room.sourceIds) && profile.room.sourceIds.length <= 20 && profile.room.sourceIds.every(id => typeof id === 'string');
}

function synchronizeRoomProfiles(state: LocalState): LocalState {
  const cleanRoom = (room: ListeningRoom): ListeningRoom => ({
    djId: state.djs.some(dj => dj.id === room.djId) ? room.djId : null,
    sourceIds: [...new Set(room.sourceIds)].filter(id => state.sources.some(source => source.id === id)),
  });
  const listeningRoom = cleanRoom(state.listeningRoom);
  const roomProfiles = state.roomProfiles.map(profile => profile.id === state.activeRoomProfileId
    ? { ...profile, room: listeningRoom, mood: state.vibe, workflowDraft: state.workflowDraft }
    : { ...profile, room: cleanRoom(profile.room) });
  const selected = roomProfiles.find(room => room.id === state.djPlayback.roomId);
  const valid = selected?.enabled && state.djs.some(dj => dj.id === selected.room.djId) && selected.room.sourceIds.length > 0 && selected.room.sourceIds.every(id => state.sources.some(source => source.id === id)) && selected.mood.trim();
  return { ...state, listeningRoom, roomProfiles, djPlayback: valid ? state.djPlayback : { ...state.djPlayback, enabled: false, roomId: selected?.id ?? null } };
}

export async function getLocalState(): Promise<LocalState> {
  if (!localState) {
    try {
      const value = JSON.parse(await readFile(location('local-state.json'), 'utf8'));
      const djs: LocalState['djs'] = Array.isArray(value.djs) ? value.djs.map((dj: LocalState['djs'][number]) => ({ ...dj, news: dj.news ? { ...dj.news, speechEngine: 'elevenlabs-v4', textModel: NEWS_TEXT_MODEL } : undefined })) : [];
      const migrated = [...new Set<string>(djs.flatMap((dj: LocalState['djs'][number]) => dj.news?.feedUrls || []))].map((url, index) => ({ id: `legacy-source-${index + 1}`, name: url, url }));
      const sources = Array.isArray(value.sources) ? value.sources : migrated;
      const onlyDj = djs.length === 1 ? djs[0] : null;
      const base: Omit<LocalState, 'roomProfiles' | 'activeRoomProfileId' | 'djPlayback'> = { newsTransitions: normalizeNewsTransitionSettings(value.newsTransitions), djs, vibe: typeof value.vibe === 'string' ? value.vibe : '', playback: value.playback ?? null, sources, workflowDraft: normalizeWorkflowDraft(value.workflowDraft),
        listeningRoom: value.listeningRoom && Array.isArray(value.listeningRoom.sourceIds) ? value.listeningRoom : { djId: onlyDj?.id ?? null, sourceIds: sources.filter((source: LocalState['sources'][number]) => onlyDj?.news?.feedUrls.includes(source.url)).map((source: LocalState['sources'][number]) => source.id) } };
      const profiles: RoomProfile[] = Array.isArray(value.roomProfiles) ? value.roomProfiles.filter(validStoredProfile).slice(0, 100).map((profile: RoomProfile) => ({ ...profile, enabled: profile.enabled !== false, name: profile.name.trim(), workflowDraft: normalizeWorkflowDraft(profile.workflowDraft) })) : [];
      const uniqueProfiles = profiles.filter((profile, index) => profiles.findIndex(other => other.id === profile.id) === index);
      if (!uniqueProfiles.length) uniqueProfiles.push({ enabled: true, id: 'default-room', name: 'My room', room: base.listeningRoom, mood: base.vibe, workflowDraft: base.workflowDraft });
      const active = uniqueProfiles.find(profile => profile.id === value.activeRoomProfileId) ?? uniqueProfiles[0];
      const djPlayback = normalizeDJPlaybackSettings(value.djPlayback);
      localState = synchronizeRoomProfiles({ ...base, djPlayback, roomProfiles: uniqueProfiles, activeRoomProfileId: active.id, listeningRoom: active.room, vibe: active.mood, workflowDraft: active.workflowDraft });
    } catch { localState = emptyState(); }
  }
  return structuredClone(localState!);
}

export function updateLocalState(patch: Partial<LocalState> | ((state: LocalState) => Partial<LocalState>)): Promise<void> {
  const next = writes.then(async () => {
    const current = await getLocalState();
    const state = synchronizeRoomProfiles({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) });
    await atomicWrite('local-state.json', JSON.stringify(state));
    localState = state;
  });
  writes = next.catch(() => {});
  return next;
}
