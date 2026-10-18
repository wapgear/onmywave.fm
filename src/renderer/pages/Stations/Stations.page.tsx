import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Headphones, LoaderCircle, Newspaper } from 'lucide-react';
import type { ApiError, ListeningRoom, NewsProgress, PreparedNewsRequest, PreparedNewsTake } from '../../../shared/types';
import { WaveError, unwrap } from '../../api';
import { confirmLocalState } from '../../local-state-cache';
import { Dialog, ErrorNotice, PageHeading, errorMessage } from '../../components/Shared';
import { FilterSelect } from '../../components/FilterSelect/FilterSelect.component';
import { InfoHelp } from '../../components/InfoHelp/InfoHelp.component';
import { ConfigurationTabs } from '../../components/ConfigurationTabs/ConfigurationTabs.component';
import { RoomSetup } from './components/RoomSetup.component';
import { PreparedTakes } from './components/PreparedTakes.component';
import { useDJPlayback } from '../../dj-playback';
import { useRetryFocus } from '../../useRetryFocus';
import { WorkflowPreferences, type PreparationIssue } from '../Settings/components/WorkflowPreferences.component';
import { NewsBucket } from './components/NewsBucket.component';
import type { WorkflowDraft } from '../../../shared/workflow';
import { NewsRecoveryPanel, useNewsRecovery } from '../../NewsRecovery';
import './Stations.styles.css';

export type RoomDraft = { scriptId: string; script: string } | null;
type AudioCompletion = { requestId: string; takeId: string; reused: boolean; profileName?: string; reviewError?: string; reconciled?: boolean };
export type RoomSetupDraft = { audioCompletion?: AudioCompletion; manualCompletion?: { request: Preparation; profileName?: string }; preparationCancellation?: { requestId: string; acknowledged: boolean; beforeDispatch: boolean }; setup: ListeningRoom | null; moodDraft: string | null; newsInterests?: string; workflow?: { roomId: string; patch: Partial<WorkflowDraft> }; stopError?: string; stopErrorOrigin?: 'settings' | 'progress'; operationError?: string; operationErrorTarget?: 'setup' | 'resume' | 'availability'; manualPreparation?: ManualPreparation; preparationCancelError?: string; tab?: string };
type ScriptReplacement = { kind: 'load'; draft: NonNullable<RoomDraft>; reveal: boolean } | { kind: 'prepare' };
type PreparationInput = { kind: 'script'; input: { profileId?: string; requestId: string; djId: string; sourceIds: string[] } } | { kind: 'audio'; input: { profileId?: string; requestId: string; scriptId: string; script: string; djId: string; newVariation?: boolean } };
type Preparation = PreparationInput & { reconcile?: boolean };
type PreparationOperation = { request: Preparation; control: { controller: AbortController; dispatched: boolean } };
type ManualPreparation = PreparationOperation & { pending: boolean; progress?: NewsProgress; error?: ApiError; cancelRequested?: boolean; profileName?: string };
function preparationOrigin(request: PreparedNewsRequest) {
  const origin = request.origin;
  if (!origin) return 'Original profile and time not recorded';
  return `${origin.kind === 'automatic' ? 'Automatic' : 'Manual'} · ${origin.profileName ?? 'Original profile unavailable'} · ${new Date(origin.startedAt).toLocaleString()}`;
}
export function StationsPage({ draft, setDraft, configDraft, setConfigDraft, configureSources, configureDJ, configureSettings }: {
  draft: RoomDraft; setDraft: Dispatch<SetStateAction<RoomDraft>>; configDraft: RoomSetupDraft; setConfigDraft: Dispatch<SetStateAction<RoomSetupDraft>>; configureSources: () => void; configureDJ: () => void; configureSettings: () => void;
}) {
  const newsRecovery = useNewsRecovery();
  const newsRecoveryReady = newsRecovery.status.phase === 'ready';
  const client = useQueryClient();
  const configurationPending = useIsMutating({ mutationKey: ['roomConfiguration'] }) > 0;
  const preparationInFlight = useRef(false);
  const cancelInFlight = useRef(false);
  const [manualToolsOpen, setManualToolsOpen] = useState(false);
  const [manualFocus, setManualFocus] = useState<{ key: 'text' | 'audio' | 'variation' | 'reconcile'; element: HTMLButtonElement } | null>(null);
  const [cancelFocus, setCancelFocus] = useState<{ element: HTMLButtonElement; requestId: string; kind: 'cancel' | 'retry' } | null>(null);
  const preparationPending = useIsMutating({ mutationKey: ['manualPreparation'] }) > 0;
  const saveSubmission = useRef(false);
  const workflowActionInFlight = useRef(false);
  const availabilityInput = useRef<HTMLInputElement>(null);
  const progressStopButton = useRef<HTMLButtonElement>(null);
  const [availabilityFocused, setAvailabilityFocused] = useState<HTMLInputElement | null>(null);
  const [progressStopFocused, setProgressStopFocused] = useState<HTMLButtonElement | null>(null);
  const configurationMutation = {
    mutationKey: ['roomConfiguration'],
    onMutate: () => setConfigDraft(current => ({ ...current, operationError: undefined, operationErrorTarget: undefined })),
    onError: (error: unknown) => setConfigDraft(current => ({ ...current, operationError: errorMessage(error), operationErrorTarget: undefined })),
  };
  const automation = useDJPlayback();
  const state = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()), enabled: newsRecoveryReady, refetchInterval: newsRecoveryReady ? 10000 : false });
  const library = useQuery({ queryKey: ['preparedNews'], queryFn: async () => unwrap(await window.wave.getPreparedNews()), enabled: newsRecoveryReady, refetchInterval: query => newsRecoveryReady && query.state.data?.requests.some(value => value.status === 'running') ? 1000 : newsRecoveryReady ? 10000 : false });
  const { setup, moodDraft } = configDraft;
  const setSetup = (setup: ListeningRoom | null) => setConfigDraft(current => ({ ...current, setup }));
  const setMoodDraft = (moodDraft: string | null) => setConfigDraft(current => ({ ...current, moodDraft }));
  const manualTools = useRef<HTMLDetailsElement>(null);
  const requestHistory = useRef<HTMLDetailsElement>(null);
  const tab = ['news', 'host', 'prepare', 'settings'].includes(configDraft.tab ?? '') ? 'settings' : configDraft.tab === 'saved' ? 'saved' : 'bucket';
  const setTab = (tab: string) => setConfigDraft(current => ({ ...current, tab }));
  const heading = useRef<HTMLHeadingElement>(null);
  const stateRetryFocus = useRetryFocus({ ownerKey: 'room:localState', target: () => heading.current, canFocusSuccess: () => newsRecoveryReady && state.isSuccess && !state.isFetching });
  const bucketRetryFocus = useRetryFocus({ ownerKey: `room:news:${tab}`, target: () => document.getElementById('room-panel-bucket'), canFocusSuccess: () => newsRecoveryReady && tab === 'bucket' && library.isSuccess && !library.isFetching });
  const settingsRetryFocus = useRetryFocus({ ownerKey: `room:settings-news:${tab}`, target: () => document.getElementById('room-panel-settings'), canFocusSuccess: () => newsRecoveryReady && tab === 'settings' && library.isSuccess && !library.isFetching });
  const savedRetryFocus = useRetryFocus({ ownerKey: `room:saved-news:${tab}`, target: () => document.getElementById('room-panel-saved'), canFocusSuccess: () => newsRecoveryReady && tab === 'saved' && library.isSuccess && !library.isFetching });
  const aiRetryFocus = useRetryFocus({ ownerKey: `room:ai-status:${tab}`, target: () => manualTools.current?.querySelector('summary') ?? null, canFocusSuccess: () => newsRecoveryReady && tab === 'settings' && aiStatus.isSuccess && !aiStatus.isFetching });
  const elevenRetryFocus = useRetryFocus({ ownerKey: `room:voice-status:${tab}`, target: () => manualTools.current?.querySelector('summary') ?? null, canFocusSuccess: () => newsRecoveryReady && tab === 'settings' && elevenStatus.isSuccess && !elevenStatus.isFetching });
  const aiStatus = useQuery({ queryKey: ['aiStatus'], meta: { aiOperation: true }, queryFn: async () => unwrap(await window.wave.getAiStatus()), enabled: newsRecoveryReady });
  const elevenStatus = useQuery({ queryKey: ['elevenLabsStatus'], meta: { aiOperation: true }, queryFn: async () => unwrap(await window.wave.getElevenLabsStatus()), enabled: newsRecoveryReady });
  const manual = configDraft.manualPreparation;
  const manualPending = manual?.pending === true;
  const lastRequest = manual?.request;
  const checkingSavedResult = manualPending && lastRequest?.reconcile === true;
  const preparationError = manual?.error ? new WaveError(manual.error) : null;
  const preparationStatusUnknown = library.isPending || !!library.error || state.isPending || !!state.error;
  const latestStoredRequest = library.data?.requests.at(-1);
  const preparationHistory = library.data?.requests.filter(value => value.status !== 'complete') ?? [];
  const [historyLimit, setHistoryLimit] = useState(10);
  const restoredInterruption = !preparationStatusUnknown && state.data && !manual && latestStoredRequest?.status === 'interrupted'
    && !state.data.roomProfiles.some(profile => profile.workflowDraft.newsLastRun?.requestId === latestStoredRequest.requestId) ? latestStoredRequest : null;
  const cancellationPending = useIsMutating({ mutationKey: ['newsCancellation'] }) > 0;
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const profileNameInput = useRef<HTMLInputElement>(null);
  const profileSubmission = useRef(false);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState('');
  const [scriptReplacement, setScriptReplacement] = useState<ScriptReplacement | null>(null);
  useEffect(() => window.wave.onNewsProgress(value => {
    setConfigDraft(current => current.manualPreparation?.pending && current.manualPreparation.request.input.requestId === value.requestId
      ? { ...current, manualPreparation: { ...current.manualPreparation, progress: value } } : current);
  }), [setConfigDraft]);
  const rawRoom = setup ?? state.data?.listeningRoom ?? { djId: null, sourceIds: [] };
  const room = state.data ? { djId: state.data.djs.some(dj => dj.id === rawRoom.djId) ? rawRoom.djId : null, sourceIds: rawRoom.sourceIds.filter(id => state.data!.sources.some(source => source.id === id)) } : rawRoom;
  const mood = moodDraft ?? state.data?.vibe ?? '';
  const sources = state.data?.sources ?? [];
  const xStatus = useQuery({ queryKey: ['twitterStatus'], queryFn: async () => unwrap(await window.wave.getTwitterStatus()), enabled: room.sourceIds.some(id => sources.find(source => source.id === id)?.kind === 'twitter') });
  const dj = state.data?.djs.find(value => value.id === room.djId);
  const newsInterests = configDraft.newsInterests ?? state.data?.workflowDraft.newsInterests ?? dj?.news?.interests ?? '';
  const setNewsInterests = (newsInterests: string) => setConfigDraft(current => ({ ...current, newsInterests }));
  const sameSources = (left: string[], right: string[]) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  const unsavedSetup = !!state.data && (room.djId !== state.data.listeningRoom.djId || !sameSources(room.sourceIds, state.data.listeningRoom.sourceIds)
    || mood !== state.data.vibe || newsInterests !== (state.data.workflowDraft.newsInterests ?? state.data.djs.find(value => value.id === state.data.listeningRoom.djId)?.news?.interests ?? ''));
  const activeProfile = state.data?.roomProfiles.find(value => value.id === state.data.activeRoomProfileId);
  const workflowPatch = configDraft.workflow?.roomId === activeProfile?.id ? configDraft.workflow?.patch ?? null : null;
  const workflowDraft = { ...activeProfile?.workflowDraft, ...workflowPatch };
  const workflowDirty = !!workflowPatch && Object.entries(workflowPatch).some(([key, value]) => activeProfile?.workflowDraft[key as keyof WorkflowDraft] !== value);
  const updateWorkflow = (patch: Partial<WorkflowDraft>) => {
    if (!activeProfile) return;
    setConfigDraft(current => ({ ...current, workflow: { roomId: activeProfile.id, patch: { ...(current.workflow?.roomId === activeProfile.id ? current.workflow.patch : {}), ...patch } } }));
  };
  const latestScript = library.data?.scripts.at(-1);
  const editing = draft ?? (latestScript ? { scriptId: latestScript.id, script: latestScript.script } : null);
  const scriptRecord = library.data?.scripts.find(value => value.id === editing?.scriptId);
  const scriptDirty = !!draft && (!scriptRecord || draft.script !== scriptRecord.script);
  const selectedTake = library.data?.takes.find(value => value.id === library.data?.selectedTakeId);
  const finite = dj?.news?.speechEngine === 'elevenlabs-v4';
  const words = editing?.script.trim().split(/\s+/u).filter(Boolean).length ?? 0;
  const validSources = room.sourceIds.length > 0 && room.sourceIds.length <= 20 && room.sourceIds.every(id => sources.some(source => source.id === id));
  const ready = !!dj && validSources && !!mood.trim();
  const audioKeyReady = elevenStatus.data?.configured;
  const textKeyReady = aiStatus.data?.configured;
  const chosenSources = sources.filter(value => room.sourceIds.includes(value.id));
  const xKeyRequired = chosenSources.some(value => value.kind === 'twitter');
  const workflowReady = !!activeProfile?.enabled && ready && !!dj?.news
    && textKeyReady === true && audioKeyReady === true && (!xKeyRequired || xStatus.data?.configured === true);
  const workflowStatusLoading = aiStatus.isPending || elevenStatus.isPending || (xKeyRequired && xStatus.isPending);
  const workflowStatusError = aiStatus.error || elevenStatus.error || (xKeyRequired && xStatus.error);
  const setupDirty = unsavedSetup || workflowDirty;
  function focusSetup(selector: string) {
    const target = document.querySelector<HTMLElement>(selector);
    target?.scrollIntoView({ block: 'center' });
    target?.focus({ preventScroll: true });
  }
  const preparationIssues: PreparationIssue[] = [
    ...(room.sourceIds.length === 0 ? [{ message: 'Choose at least one news source.', action: { label: sources.length ? 'Review sources' : 'Manage sources', run: () => { if (sources.length) focusSetup('.room-sources input'); else configureSources(); } } }] : []),
    ...(room.sourceIds.length > 0 && !validSources ? [{ message: 'Some selected sources are unavailable or the selection exceeds the 20-source limit.', action: { label: 'Review sources', run: () => focusSetup('.room-sources input') } }] : []),
    ...(!dj?.news ? [{ message: dj ? 'This DJ needs saved news voice settings.' : state.data?.djs.length ? 'Choose a saved DJ.' : 'Add your first DJ.', action: { label: dj ? 'Manage DJ' : state.data?.djs.length ? 'Review DJ' : 'Manage DJs', run: () => dj || !state.data?.djs.length ? configureDJ() : focusSetup('.room-host-choice .filter-select-trigger') } }] : []),
    ...(!mood.trim() ? [{ message: 'Add a mood for the host.', action: { label: 'Review mood', run: () => focusSetup('#station-mood') } }] : []),
    ...(aiStatus.data?.configured === false ? [{ message: 'OpenAI key is missing.', action: { label: 'Provider keys', run: configureSettings } }] : []),
    ...(elevenStatus.data?.configured === false ? [{ message: 'ElevenLabs key is missing.', action: { label: 'Provider keys', run: configureSettings } }] : []),
    ...(xKeyRequired && xStatus.data?.configured === false ? [{ message: 'X bearer token is missing for the selected X source.', action: { label: 'Provider keys', run: configureSettings } }] : []),
    ...(!activeProfile?.enabled ? [{ message: 'This profile is not available for preparation or playback.', action: { label: 'Review room options', run: () => { const options = document.querySelector<HTMLDetailsElement>('.room-advanced'); if (options) { options.open = true; options.querySelector('summary')?.focus(); options.scrollIntoView({ block: 'center' }); } } } }] : []),
  ];
  async function refresh() { await client.invalidateQueries({ queryKey: ['preparedNews'] }); }
  const persist = useMutation({ ...configurationMutation, onError: undefined, mutationFn: async (includeWorkflow: boolean) => {
    const submittedDraft = configDraft;
    const latest = unwrap(await window.wave.getLocalState());
    if (latest.activeRoomProfileId !== activeProfile?.id) throw new Error('The active room changed before these settings were saved. Review the room and try again.');
    const workflow = includeWorkflow && configDraft.workflow?.roomId === latest.activeRoomProfileId ? configDraft.workflow.patch : {};
    await confirmLocalState(client, unwrap(await window.wave.saveWorkflowDraft({ expectedProfileId: latest.activeRoomProfileId, workflowDraft: { ...latest.workflowDraft, ...workflow, newsInterests }, room, mood: mood.trim() })));
    await client.invalidateQueries({ queryKey: ['localState'] });
    setConfigDraft(current => ({ ...current,
      ...(current.stopError === submittedDraft.stopError ? { stopError: undefined } : {}),
      ...(current.setup === submittedDraft.setup ? { setup: null } : {}),
      ...(current.moodDraft === submittedDraft.moodDraft ? { moodDraft: null } : {}),
      ...(current.newsInterests === submittedDraft.newsInterests ? { newsInterests: undefined } : {}),
      ...(includeWorkflow && current.workflow === submittedDraft.workflow ? { workflow: undefined } : {}),
    }));
  } });
  async function persistSetup(includeWorkflow = false) { await persist.mutateAsync(includeWorkflow); }
  const resume = useMutation({ ...configurationMutation, mutationFn: async () => {
    const latest = unwrap(await window.wave.getLocalState());
    if (latest.activeRoomProfileId !== activeProfile?.id) throw new Error('The active room changed. Reopen its settings before resuming preparation.');
    const profile = latest.roomProfiles.find(value => value.id === latest.activeRoomProfileId);
    if (!profile) throw new Error('The active room is unavailable. Refresh and try again.');
    const missing = await getWorkflowReadinessError();
    if (missing) throw new Error(missing);
    const current = unwrap(await window.wave.getLocalState());
    if (current.activeRoomProfileId !== profile.id) throw new Error('The active room changed. Reopen its settings before resuming preparation.');
    await confirmLocalState(client, unwrap(await window.wave.saveWorkflowDraft({ expectedProfileId: profile.id, workflowDraft: profile.workflowDraft, room: profile.room, mood: profile.mood, resumePreparation: true })));
    await client.invalidateQueries({ queryKey: ['localState'] });
  }, onError: error => setConfigDraft(current => ({ ...current, operationError: errorMessage(error), operationErrorTarget: 'resume' })), onSettled: () => { workflowActionInFlight.current = false; } });
  async function getWorkflowReadinessError(): Promise<string | null> {
    const latest = unwrap(await window.wave.getLocalState());
    const selected = latest.sources.filter(value => room.sourceIds.includes(value.id));
    const host = latest.djs.find(value => value.id === room.djId);
    const missing: string[] = [];
    if (!selected.length || selected.length !== room.sourceIds.length) missing.push('select an available news source');
    if (!host?.news) missing.push('choose a saved DJ with news voice settings');
    if (!mood.trim()) missing.push('add a host mood');
    if (missing.length) return `Before enabling preparation, ${missing.join(', ')}.`;
    try {
      const [text, voice, x] = await Promise.all([
        window.wave.getAiStatus().then(unwrap),
        window.wave.getElevenLabsStatus().then(unwrap),
        selected.some(value => value.kind === 'twitter') ? window.wave.getTwitterStatus().then(unwrap) : Promise.resolve({ configured: true, sessionOnly: false }),
      ]);
      const keys: string[] = [];
      if (!text.configured) keys.push('OpenAI');
      if (!voice.configured) keys.push('ElevenLabs');
      if (!x.configured) keys.push('X');
      return keys.length ? `Add the ${keys.join(' and ')} ${keys.length === 1 ? 'key' : 'keys'} in Provider keys before enabling preparation.` : null;
    } catch {
      return 'Provider key status could not be checked. Retry the status check before enabling preparation.';
    }
  }
  const save = useMutation({ ...configurationMutation, mutationFn: async () => {
    if (workflowDraft.newsEnabled) {
      const missing = await getWorkflowReadinessError();
      if (missing) throw new Error(missing);
    }
    await persistSetup(true);
  }, onError: (error: unknown) => setConfigDraft(current => ({ ...current, operationError: errorMessage(error), operationErrorTarget: 'setup' })), onSettled: () => { saveSubmission.current = false; } });
  const source = useMutation({ mutationFn: async (url: string) => unwrap(await window.wave.openSource(url)) });
  const prepare = useMutation({
    mutationKey: ['manualPreparation'],
    meta: { aiOperation: true },
    mutationFn: async ({ request, control }: PreparationOperation) => {
      if (!newsRecoveryReady) throw new Error('News data is unavailable. Recover it before starting preparation.');
      const draftAtStart = draft;
      try {
        if (request.kind === 'script' && !request.reconcile) await persistSetup();
        if (control.controller.signal.aborted) throw new Error('Preparation canceled before generation. No provider request was sent.');
        control.dispatched = true;
        setConfigDraft(current => current.manualPreparation?.control === control ? { ...current, manualPreparation: { ...current.manualPreparation } } : current);
        if (request.kind === 'script') {
          const result = unwrap(await window.wave.prepareNewsScript({ ...request.input, reconcileOnly: request.reconcile === true }));
          setDraft(current => current === draftAtStart ? { scriptId: result.id, script: result.script } : current);
        } else {
          const take = unwrap(await window.wave.renderNewsTake({ ...request.input, reconcileOnly: request.reconcile === true }));
          setConfigDraft(current => current.manualPreparation?.control === control ? { ...current, audioCompletion: {
            requestId: request.input.requestId, takeId: take.id, reused: take.requestId !== request.input.requestId, profileName: current.manualPreparation.profileName, reconciled: request.reconcile === true,
          } } : current);
        }
      } finally { await refresh(); }
    },
    onSuccess: (_result, { request, control }) => setConfigDraft(current => current.manualPreparation?.control === control ? { ...current, manualCompletion: { request, profileName: current.manualPreparation.profileName }, manualPreparation: undefined } : current),
    onError: (error, { control }) => setConfigDraft(current => current.manualPreparation?.control === control ? { ...current, manualPreparation: { ...current.manualPreparation, pending: false,
      error: { code: error instanceof WaveError ? error.code : 'server', message: errorMessage(error) } } } : current),
    onSettled: () => { preparationInFlight.current = false; },
  });
  function startPreparation(request: Preparation) {
    if (preparationInFlight.current || preparationPending || !newsRecoveryReady || busy || manualPending || cancellationPending) return;
    preparationInFlight.current = true;
    const capturedRequest = structuredClone(request);
    if (!request.reconcile) capturedRequest.input.profileId = activeProfile?.id;
    const operation = { request: capturedRequest, control: { controller: new AbortController(), dispatched: false } };
    setConfigDraft(current => ({ ...current, audioCompletion: undefined, manualCompletion: undefined, preparationCancellation: undefined, manualPreparation: { ...operation, pending: true, profileName: request.reconcile ? manual?.profileName : activeProfile?.name }, preparationCancelError: undefined }));
    prepare.mutate(operation);
  }
  const noStory = preparationError?.code === 'no-news' || preparationError?.code === 'partial-coverage';
  const running = library.data?.requests.find(value => value.status === 'running');
  const cancel = useMutation({ mutationKey: ['newsCancellation'], meta: { aiOperation: true },
    onMutate: input => setConfigDraft(current => ({ ...current, preparationCancelError: undefined, preparationCancellation: { requestId: input.requestId, acknowledged: false, beforeDispatch: !!input.control && !input.control.dispatched } })),
    mutationFn: async (input: { requestId: string; control?: PreparationOperation['control'] }) => {
      if (input.control) {
        input.control.controller.abort();
        setConfigDraft(current => current.manualPreparation && current.manualPreparation.control === input.control ? { ...current, manualPreparation: { ...current.manualPreparation, cancelRequested: true } } : current);
        if (input.control.dispatched) unwrap(await window.wave.cancelPreparedNews(input.requestId));
      } else unwrap(await window.wave.cancelPreparedNews(input.requestId));
      await refresh();
    },
    onSuccess: (_result, input) => setConfigDraft(current => current.preparationCancellation?.requestId === input.requestId ? { ...current, preparationCancellation: { ...current.preparationCancellation, acknowledged: true } } : current),
    onError: (error, input) => setConfigDraft(current => ({ ...current, preparationCancelError: errorMessage(error), ...(input.control && current.manualPreparation?.control === input.control ? { manualPreparation: { ...current.manualPreparation!, cancelRequested: false } } : {}) })),
    onSettled: () => { cancelInFlight.current = false; },
  });
  function cancelPreparation(retry = false, expectedRequestId?: string) {
    const target = manualPending && manual ? { requestId: manual.request.input.requestId, control: manual.control } : running ? { requestId: running.requestId } : null;
    if (!target || (expectedRequestId && expectedRequestId !== target.requestId) || cancelInFlight.current || cancellationPending || (!retry && configDraft.preparationCancellation?.requestId === target.requestId && configDraft.preparationCancellation.acknowledged)) return;
    cancelInFlight.current = true;
    cancel.mutate(target);
  }
  const preparing = manualPending || !!running;
  const runningProfiles = running ? state.data?.roomProfiles.filter(profile => profile.workflowDraft.newsLastRun?.requestId === running.requestId && profile.workflowDraft.newsLastRun.outcome === 'running') ?? [] : [];
  const runningProfile = runningProfiles.length === 1 ? runningProfiles[0] : undefined;
  const turnOff = useMutation({ mutationKey: ['roomConfiguration'], onMutate: input => setConfigDraft(current => ({ ...current, stopError: undefined, stopErrorOrigin: input.origin })), mutationFn: async (input: { roomId: string; name: string; workflow: RoomSetupDraft['workflow']; origin: 'settings' | 'progress' }) => {
    await confirmLocalState(client, unwrap(await window.wave.disableNewsPreparation(input.roomId)));
  }, onSuccess: async (_result, input) => {
    await Promise.all([client.invalidateQueries({ queryKey: ['localState'] }), refresh()]);
    setConfigDraft(current => {
      if (current.workflow !== input.workflow || current.workflow?.roomId !== input.roomId) return current;
      const patch = { ...current.workflow.patch };
      delete patch.newsEnabled;
      return { ...current, workflow: Object.keys(patch).length ? { roomId: input.roomId, patch } : undefined };
    });
    setProfileNotice(`Automatic preparation turned off for ${input.name}. Other unsaved edits are kept.`);
  }, onError: (error, input) => setConfigDraft(current => ({ ...current, stopError: `Could not turn off preparation for ${input.name}. ${error instanceof Error ? error.message : 'Try again.'}`, stopErrorOrigin: input.origin })), onSettled: () => { workflowActionInFlight.current = false; } });
  const profiles = useMutation({ ...configurationMutation, mutationFn: async (action: { kind: 'copy' } | { kind: 'switch'; id: string; saveChanges: boolean }) => {
    if (action.kind === 'copy') {
      const latest = unwrap(await window.wave.getLocalState());
      const workflow = configDraft.workflow?.roomId === latest.activeRoomProfileId ? configDraft.workflow.patch : {};
      await confirmLocalState(client, unwrap(await window.wave.saveRoomProfile({ name: profileName.trim(), room, mood: mood.trim(), workflowDraft: { ...latest.workflowDraft, ...workflow, newsInterests } })));
    } else {
      if (action.saveChanges) await persistSetup(true);
      await confirmLocalState(client, unwrap(await window.wave.activateRoomProfile(action.id)));
    }
    await client.invalidateQueries({ queryKey: ['localState'] });
    if (action.kind === 'copy') {
      setNewProfileOpen(false); setProfileName('');
      setProfileNotice(`Saved ${profileName.trim()} with preparation off. Choose it from Setup profile, then use Review room options to make it available.`);
    } else {
      setConfigDraft(current => ({ setup: null, moodDraft: null, tab: current.tab, audioCompletion: current.audioCompletion, manualPreparation: current.manualPreparation, preparationCancelError: current.preparationCancelError }));
      setSwitchTarget(null);
      setProfileNotice('Room switched. Your script and selected audio are unchanged.');
    }
  }, onSettled: () => { profileSubmission.current = false; } });
  const enableProfile = useMutation({ ...configurationMutation, mutationFn: async (input: { id: string; enabled: boolean }) => {
    await confirmLocalState(client, unwrap(await window.wave.setRoomProfileEnabled(input)));
    await client.invalidateQueries({ queryKey: ['localState'] });
  }, onError: error => setConfigDraft(current => ({ ...current, operationError: errorMessage(error), operationErrorTarget: 'availability' })), onSettled: () => { workflowActionInFlight.current = false; } });
  const setupBusy = preparationStatusUnknown || cancellationPending || configurationPending || manualPending || (!!running && !runningProfile);
  const busy = setupBusy || preparing || turnOff.isPending || save.isPending || resume.isPending || profiles.isPending || enableProfile.isPending;
  const ownsAvailabilityFocus = availabilityFocused !== null && document.activeElement === availabilityFocused;
  const ownsProgressStopFocus = progressStopFocused !== null && tab !== 'settings' && document.activeElement === progressStopFocused;
  const showProgressStop = tab !== 'settings' && !!activeProfile && ((!!activeProfile.workflowDraft.newsEnabled && runningProfile?.id === activeProfile.id) || ownsProgressStopFocus);
  const ownsManualFocus = (key: NonNullable<typeof manualFocus>['key']) => (key === 'reconcile' || tab === 'settings' && manualToolsOpen) && manualFocus?.key === key && document.activeElement === manualFocus.element;
  const ownsCancelFocus = cancelFocus !== null && document.activeElement === cancelFocus.element;
  const ownsCancelAction = (kind: 'cancel' | 'retry') => ownsCancelFocus && cancelFocus?.kind === kind;
  const currentCancelId = manualPending ? manual?.request.input.requestId : running?.requestId;
  const oldCancelFocus = ownsCancelFocus && !!currentCancelId && cancelFocus?.requestId !== currentCancelId;
  const manualRequest = manual?.request ?? configDraft.manualCompletion?.request;
  const manualAction = manualRequest?.reconcile ? 'reconcile' : manualRequest?.kind === 'script' ? 'text' : manualRequest?.input.newVariation ? 'variation' : 'audio';
  const ownsManualActionFocus = manualFocus !== null && ownsManualFocus(manualFocus.key);
  const cancellation = configDraft.preparationCancellation;
  const cancellationRecord = cancellation && library.data?.requests.find(value => value.requestId === cancellation.requestId);
  const cancellationWaiting = !!cancellation?.acknowledged && cancellation.requestId === currentCancelId && (manualPending && manual?.request.input.requestId === cancellation.requestId || cancellationRecord?.status === 'running');
  const cancellationFinished = cancellationRecord?.status === 'complete' || cancellationRecord?.status === 'skipped' || cancellationRecord?.status === 'partial-coverage';
  const cancelLabel = oldCancelFocus ? 'Previous preparation ended' : cancellationPending ? 'Requesting cancellation…' : !preparing ? cancellationFinished ? 'Preparation finished' : 'Preparation stopped' : cancellationWaiting ? 'Cancellation requested' : !manualPending && runningProfile ? `Cancel this check for ${runningProfile.name}` : 'Cancel preparation';
  const localCancelError = configDraft.preparationCancelError && cancellation?.requestId === (ownsCancelFocus ? cancelFocus?.requestId : currentCancelId) ? configDraft.preparationCancelError : undefined;
  const cancelUnavailable = oldCancelFocus || cancellationPending || !preparing || cancellationWaiting;
  const localManualFeedback = tab === 'settings' && manualToolsOpen;
  const manualErrorMessage = manual?.error?.message;
  useLayoutEffect(() => {
    if (!manualErrorMessage || !ownsManualActionFocus || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const element = manualFocus?.element;
    if (element?.checkVisibility()) element.closest('.room-manual-action, .room-manual-feedback')?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [manualErrorMessage, ownsManualActionFocus, manualFocus]);
  useLayoutEffect(() => {
    if (localCancelError && ownsCancelFocus && document.visibilityState === 'visible' && document.hasFocus() && cancelFocus?.element.checkVisibility()) cancelFocus.element.closest('.room-cancel-action')?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [localCancelError, ownsCancelFocus, cancelFocus]);
  function turnOffPreparation(origin: 'settings' | 'progress') {
    if (workflowActionInFlight.current || configurationPending || !newsRecoveryReady || !activeProfile?.workflowDraft.newsEnabled) return;
    workflowActionInFlight.current = true;
    turnOff.mutate({ roomId: activeProfile.id, name: activeProfile.name, workflow: configDraft.workflow, origin });
  }
  function resumePreparation() {
    if (workflowActionInFlight.current || configurationPending || resume.isPending) return;
    workflowActionInFlight.current = true;
    resume.mutate();
  }
  function setProfileAvailability(enabled: boolean) {
    if (workflowActionInFlight.current || busy || !activeProfile || enabled === activeProfile.enabled) return;
    workflowActionInFlight.current = true;
    enableProfile.mutate({ id: activeProfile.id, enabled });
  }
  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !focused.checkVisibility() || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    if ((configDraft.operationErrorTarget === 'availability' && configDraft.operationError && focused === availabilityInput.current)
      || (configDraft.stopErrorOrigin === 'progress' && configDraft.stopError && focused === progressStopButton.current)) {
      focused.closest('.room-availability, .room-active-progress')?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }, [configDraft.operationErrorTarget, configDraft.operationError, configDraft.stopErrorOrigin, configDraft.stopError]);
  function changeProfile(action: { kind: 'copy' } | { kind: 'switch'; id: string; saveChanges: boolean }) {
    if (profileSubmission.current || busy || (action.kind === 'copy' && !profileName.trim())) return;
    profileSubmission.current = true;
    profiles.mutate(action);
  }
  function closeProfileDialogs() {
    if (profileSubmission.current || profiles.isPending) return;
    setNewProfileOpen(false);
    setSwitchTarget(null);
  }
  function chooseProfile(id: string) {
    if (profileSubmission.current || busy || id === state.data?.activeRoomProfileId) return;
    profiles.reset(); setProfileNotice('');
    if (setupDirty) setSwitchTarget(id);
    else changeProfile({ kind: 'switch', id, saveChanges: false });
  }
  function prepareText(confirmed = false) {
    if (!ready || !room.djId || !textKeyReady) return;
    if (scriptDirty && !confirmed) { setScriptReplacement({ kind: 'prepare' }); return; }
    cancel.reset();
    startPreparation({ kind: 'script', input: { requestId: crypto.randomUUID(), djId: room.djId, sourceIds: [...room.sourceIds] } });
  }
  function renderTake(newVariation = false) {
    if (!editing || !room.djId || !finite || !audioKeyReady || !words || words > 55) return;
    cancel.reset();
    startPreparation({ kind: 'audio', input: { requestId: crypto.randomUUID(), scriptId: editing.scriptId, script: editing.script.trim(), djId: room.djId, newVariation } });
  }
  const sourceSnapshot = (values: typeof sources) => JSON.stringify([...values].sort((a, b) => a.id.localeCompare(b.id)));
  const differs = selectedTake && (selectedTake.script !== editing?.script || JSON.stringify(selectedTake.renderingDJ) !== JSON.stringify(dj) || selectedTake.provenance.mood !== mood || (selectedTake.provenance.newsInterests ?? selectedTake.provenance.dj.news?.interests ?? '') !== newsInterests || sourceSnapshot(selectedTake.provenance.sources) !== sourceSnapshot(chosenSources));
  function revealScriptEditor() {
    setTab('settings');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (manualTools.current) manualTools.current.open = true;
      manualTools.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
      manualTools.current?.querySelector<HTMLTextAreaElement>('#news-draft')?.focus({ preventScroll: true });
    }));
  }
  function applyScript(next: NonNullable<RoomDraft>, reveal: boolean) {
    setDraft(next);
    if (reveal) revealScriptEditor();
  }
  function requestScript(next: NonNullable<RoomDraft>, reveal = true) {
    if (scriptDirty && (editing?.scriptId !== next.scriptId || editing.script !== next.script)) setScriptReplacement({ kind: 'load', draft: next, reveal });
    else applyScript(next, reveal);
  }
  function loadDraft(take: PreparedNewsTake) { requestScript({ scriptId: take.scriptId, script: take.script }); }
  function loadScriptDraft(script: { id: string; script: string }) { requestScript({ scriptId: script.id, script: script.script }); }
  const audioCompletion = configDraft.audioCompletion;
  const reviewInFlight = useRef(false);
  const reviewPending = useIsMutating({ mutationKey: ['savedTakeReview'] }) > 0;
  const [reviewFocused, setReviewFocused] = useState<HTMLButtonElement | null>(null);
  const ownsReviewFocus = reviewFocused !== null && document.activeElement === reviewFocused;
  const [confirmedReview, setConfirmedReview] = useState<{ requestId: string; takeId: string } | null>(null);
  const { retryRef: reviewRetryRef, retry: retryReviewFocus } = useRetryFocus({
    ownerKey: `saved-take-review:${audioCompletion?.requestId}:${audioCompletion?.takeId}:${activeProfile?.id}:${newsRecoveryReady}`,
    target: () => audioCompletion ? document.getElementById(`prepared-take-${audioCompletion.takeId}`) : null,
    canFocusSuccess: () => !!audioCompletion && tab === 'saved' && library.isSuccess && !library.isFetching
      && confirmedReview?.requestId === audioCompletion.requestId && confirmedReview.takeId === audioCompletion.takeId
      && library.data.takes.some(take => take.id === audioCompletion.takeId),
  });
  const reviewAudio = useMutation({ mutationKey: ['savedTakeReview'],
    mutationFn: async (completion: AudioCompletion) => {
      const result = await library.refetch();
      if (result.error) throw new Error('Your audio result was saved, but saved takes could not be refreshed. Try reviewing it again.');
      if (!result.data?.takes.some(take => take.id === completion.takeId)) throw new Error('The completed take could not be found in saved audio. Try reviewing it again.');
    },
    onMutate: completion => {
      setConfirmedReview(null);
      setConfigDraft(current => current.audioCompletion?.requestId === completion.requestId && current.audioCompletion.takeId === completion.takeId
        ? { ...current, audioCompletion: { ...current.audioCompletion, reviewError: undefined } } : current);
    },
    onSuccess: (_result, completion) => setConfirmedReview({ requestId: completion.requestId, takeId: completion.takeId }),
    onError: (error, completion) => setConfigDraft(current => current.audioCompletion?.requestId === completion.requestId && current.audioCompletion.takeId === completion.takeId
      ? { ...current, audioCompletion: { ...current.audioCompletion, reviewError: errorMessage(error) } } : current),
  });
  function reviewSavedTake(completion: AudioCompletion) {
    if (reviewInFlight.current || reviewPending || reviewAudio.isPending) return;
    reviewInFlight.current = true;
    void retryReviewFocus(async () => {
      try { await reviewAudio.mutateAsync(completion); return { isError: false }; }
      catch { return { isError: true }; }
    }, undefined, () => { reviewInFlight.current = false; });
    setTab('saved');
  }
  useLayoutEffect(() => {
    if (audioCompletion?.reviewError && ownsReviewFocus && document.visibilityState === 'visible' && document.hasFocus() && reviewFocused?.checkVisibility()) reviewFocused.closest('.room-audio-result')?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [audioCompletion?.reviewError, ownsReviewFocus, reviewFocused]);
  function openPreparation() { setTab('settings'); }
  function reviewPreparationHistory() {
    setTab('saved');
    requestAnimationFrame(() => {
      if (!requestHistory.current) return;
      requestHistory.current.open = true;
      requestHistory.current.querySelector('summary')?.focus({ preventScroll: true });
      requestHistory.current.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  }
  function showOlderPreparations() {
    const firstOlder = preparationHistory.at(-historyLimit - 1);
    setHistoryLimit(limit => limit + 10);
    requestAnimationFrame(() => {
      const row = firstOlder ? document.getElementById(`preparation-request-${firstOlder.requestId}`) : null;
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'center' });
    });
  }
  const audioResult = audioCompletion && !manualPending && <div className="room-audio-result">
    <div className="notice"><span role="status">{audioCompletion.reconciled ? 'Saved audio result found' : audioCompletion.reused ? 'Matching saved audio reused' : 'Audio take saved'} · {audioCompletion.profileName ?? 'Previous setup'}. Review it to listen or choose it for a DJ break.</span><button ref={reviewRetryRef} className="room-review-take" disabled={reviewPending && !ownsReviewFocus} aria-disabled={reviewPending || undefined} aria-busy={reviewPending || undefined} onFocus={event => setReviewFocused(event.currentTarget)} onBlur={() => setReviewFocused(null)} onClick={() => reviewSavedTake(audioCompletion)}>{reviewPending ? 'Opening saved take…' : 'Review saved take'}</button></div>
    <ErrorNotice error={audioCompletion.reviewError ? new Error(audioCompletion.reviewError) : null} />
  </div>;
  const manualFeedback = manualRequest && <div className="room-manual-feedback room-background-error">
    <p className="form-hint">Manual preparation · {manual?.profileName ?? configDraft.manualCompletion?.profileName ?? 'Previous setup'}</p>
    {manualPending && <p className="form-hint" role="status">{checkingSavedResult ? `Checking saved ${manualRequest.kind === 'script' ? 'text' : 'audio'}… No new provider request.` : manual?.progress?.message ?? (manual?.control.dispatched ? `Preparing ${manualRequest.kind === 'script' ? 'text' : 'audio'}…` : 'Saving setup before preparation…')}</p>}
    {preparationError && (noStory || (manual?.cancelRequested && !manual.control.dispatched) ? <p className="form-hint" role="status">{preparationError.message}</p> : <ErrorNotice error={preparationError} />)}
    {configDraft.manualCompletion && <p className="form-hint" role="status">{manualRequest.reconcile ? `Saved ${manualRequest.kind === 'script' ? 'text' : 'audio'} result found. No new provider request.` : manualRequest.kind === 'script' ? 'News text prepared. Review the script below before generating audio.' : 'Audio preparation finished. Review the saved take below.'}</p>}
    <div className="room-actions">{((!noStory && manual?.control.dispatched && (preparationError || checkingSavedResult)) || ownsManualFocus('reconcile')) && <button className="room-link" disabled={(busy || !preparationError) && !ownsManualFocus('reconcile')} aria-disabled={busy || !preparationError || undefined} aria-busy={checkingSavedResult || undefined} onFocus={event => setManualFocus({ key: 'reconcile', element: event.currentTarget })} onBlur={() => setManualFocus(null)} onClick={() => { if (!busy && preparationError && manual) startPreparation({ ...manual.request, reconcile: true }); }}>{checkingSavedResult ? `Checking saved ${manualRequest.kind === 'script' ? 'text' : 'audio'}…` : configDraft.manualCompletion?.request.reconcile ? 'Saved result found' : 'Check saved result for this request'}</button>}{preparationError && !localManualFeedback && <button className="room-link" onClick={() => { setTab('settings'); requestAnimationFrame(() => { if (manualTools.current) { manualTools.current.open = true; manualTools.current.querySelector('summary')?.focus(); manualTools.current.scrollIntoView({ block: 'start' }); } }); }}>Review preparation</button>}</div>
  </div>;
  return <>
    <PageHeading headingRef={heading} title="News bucket" />
    {newsRecovery.status.phase !== 'ready' ? <NewsRecoveryPanel /> : <>
    <div className="listening-room">
      {state.isPending && <p className="loading" role="status">Opening your room…</p>}
      <ErrorNotice error={state.error} retryRef={stateRetryFocus.retryRef} retrying={state.isFetching} retry={() => stateRetryFocus.retry(() => state.refetch())} />
      {state.data && <><div className="room-profile-bar"><label htmlFor="room-profile">Setup profile<select id="room-profile" value={state.data.activeRoomProfileId} disabled={busy} onChange={event => chooseProfile(event.target.value)}>{state.data.roomProfiles.map(value => <option key={value.id} value={value.id}>{value.name}{value.id === state.data?.activeRoomProfileId ? ' · Active' : ''}</option>)}</select></label><button disabled={busy} onClick={() => { profiles.reset(); setProfileName(''); setNewProfileOpen(true); }}>Save as new</button></div>
      {activeProfile && <div className="room-availability"><details className="room-advanced"><summary>Advanced room options</summary><label className="room-dj-enabled"><input key={activeProfile.id} ref={availabilityInput} type="checkbox" checked={activeProfile.enabled} disabled={busy && !ownsAvailabilityFocus} aria-disabled={busy || undefined} aria-busy={enableProfile.isPending || undefined} onFocus={event => setAvailabilityFocused(event.currentTarget)} onBlur={() => setAvailabilityFocused(null)} onClick={event => { if (workflowActionInFlight.current || busy) event.preventDefault(); }} onKeyDown={event => { if ((workflowActionInFlight.current || busy) && (event.key === ' ' || event.key === 'Enter')) event.preventDefault(); }} onChange={event => setProfileAvailability(event.target.checked)} />Make this profile available for DJ playback and preparation</label>{enableProfile.isPending && enableProfile.variables.id === activeProfile.id && <p className="form-hint" role="status">Making this profile {enableProfile.variables.enabled ? 'available' : 'unavailable'}… Its saved setting stays shown until confirmed.</p>}</details><ErrorNotice error={configDraft.operationErrorTarget === 'availability' && configDraft.operationError ? new Error(configDraft.operationError) : null} /></div>}
      {configurationPending && <p className="form-hint" role="status">Updating room settings… You can keep browsing and listening.</p>}
      <p className="form-hint">Choose a profile to edit its sources, host, and preparation settings. Playback can use a different profile.</p>
      <ErrorNotice error={configDraft.stopError && (configDraft.stopErrorOrigin === 'settings' ? tab !== 'settings' : !showProgressStop) ? new Error(configDraft.stopError) : null} />
      {profileNotice && <p className="form-hint room-profile-notice" role="status">{profileNotice}</p>}
      {!newProfileOpen && !switchTarget && configDraft.operationErrorTarget !== 'availability' && !(tab === 'settings' && (configDraft.operationErrorTarget === 'setup' || configDraft.operationErrorTarget === 'resume')) && <ErrorNotice error={configDraft.operationError ? new Error(configDraft.operationError) : null} />}
      <ConfigurationTabs id="room" label="News bucket and configuration" tabs={[{ id: 'bucket', label: 'News bucket' }, { id: 'settings', label: 'Settings' }, { id: 'saved', label: 'Saved audio' }]} value={tab} onChange={setTab} />
      {restoredInterruption && tab !== 'saved' && <div className="notice"><span role="status"><strong>A previous {restoredInterruption.kind === 'script' ? 'text' : 'audio'} preparation did not finish.</strong> {preparationOrigin(restoredInterruption)}. It was not restarted automatically. A provider request may have been charged. Review its saved status before starting a new attempt.</span><button aria-controls="preparation-history" onClick={reviewPreparationHistory}>Review preparation history</button></div>}
      {setupDirty && tab !== 'settings' && <div className="room-unsaved"><p>Unsaved room and preparation settings.</p><button onClick={() => setTab('settings')}>Review settings</button></div>}
      </>}
      {state.data && <section id="room-panel-bucket" role="tabpanel" aria-labelledby="room-tab-bucket" hidden={tab !== 'bucket'} tabIndex={0}>
        <ErrorNotice error={library.error} retryRef={bucketRetryFocus.retryRef} retrying={library.isFetching} retry={() => bucketRetryFocus.retry(() => library.refetch())} />
        {library.isPending && <p className="loading" role="status">Opening the news bucket…</p>}
        {library.data && preparationStatusUnknown && <p className="form-hint" role="status">{library.isPending || library.error
          ? 'Saved news and manual preparation activity could not be confirmed. Showing the last loaded recordings, drafts and article history.'
          : 'Automatic preparation status could not be refreshed. Recordings below are matched against the last saved profile.'} Retry the failed status check before editing setup.</p>}
        {library.data && <NewsBucket library={library.data} localState={state.data} automation={automation} profileStatusUnknown={state.isPending || !!state.error} savedNewsStale={preparationStatusUnknown} openSource={url => source.mutate(url)} openPreparation={openPreparation} openDraft={loadScriptDraft} />}
        <ErrorNotice error={source.error} />
      </section>}
      {(preparing || ownsProgressStopFocus || ownsCancelFocus) && <div className="news-progress room-active-progress">{preparing && <LoaderCircle className="spinning" size={17} aria-hidden="true" />}<span role="status">{!preparing ? ownsCancelFocus ? cancellationFinished ? 'Preparation finished before cancellation was confirmed.' : cancellation?.beforeDispatch ? 'Preparation stopped before generation. No provider request was sent.' : 'Preparation stopped. A provider request may have been charged.' : activeProfile?.workflowDraft.newsEnabled ? 'Automatic preparation remains on.' : 'Automatic preparation turned off.' : manualPending ? manual.cancelRequested ? 'Cancellation requested. Waiting for preparation to stop…' : checkingSavedResult ? `Checking saved ${lastRequest?.kind === 'audio' ? 'audio' : 'text'} for ${manual.profileName ?? 'your room'}… No new provider request.` : manual.progress?.message ?? (manual.control.dispatched ? `Preparing ${lastRequest?.kind === 'audio' ? 'audio' : 'text'} for ${manual.profileName ?? 'your room'}…` : 'Saving setup before preparation…') : runningProfile ? `Preparing news for ${runningProfile.name}…` : 'Preparing…'}</span>{(preparing || ownsCancelFocus) && <div className="room-cancel-action">{(preparing || ownsCancelAction('cancel')) && <button disabled={cancelUnavailable && !ownsCancelAction('cancel')} aria-disabled={cancelUnavailable || undefined} aria-busy={cancellationPending || undefined} onFocus={event => setCancelFocus({ element: event.currentTarget, requestId: currentCancelId ?? cancellation?.requestId ?? '', kind: 'cancel' })} onBlur={() => setCancelFocus(null)} onClick={() => { if (!cancelUnavailable) cancelPreparation(false, ownsCancelAction('cancel') ? cancelFocus?.requestId : currentCancelId); }}>{cancelLabel}</button>}{(cancellationWaiting && cancellationRecord?.status === 'running' && cancellation?.requestId === currentCancelId || ownsCancelAction('retry')) && <button className="room-link" disabled={(cancellationPending || !preparing || oldCancelFocus) && !ownsCancelAction('retry')} aria-disabled={cancellationPending || !preparing || oldCancelFocus || undefined} aria-busy={cancellationPending || undefined} onFocus={event => setCancelFocus({ element: event.currentTarget, requestId: cancellation?.requestId ?? currentCancelId ?? '', kind: 'retry' })} onBlur={() => setCancelFocus(null)} onClick={() => { if (!cancellationPending && preparing && !oldCancelFocus) cancelPreparation(true, ownsCancelAction('retry') ? cancelFocus?.requestId : cancellation?.requestId); }}>{cancellationPending ? 'Retrying cancellation…' : oldCancelFocus ? 'Previous preparation ended' : !preparing ? cancellationFinished ? 'Preparation finished' : 'Preparation stopped' : 'Retry cancellation'}</button>}<ErrorNotice error={localCancelError ? new Error(localCancelError) : null} /></div>}{showProgressStop && <div className="room-progress-stop"><button ref={progressStopButton} disabled={(!newsRecoveryReady || configurationPending || !activeProfile?.workflowDraft.newsEnabled) && !ownsProgressStopFocus} aria-disabled={!newsRecoveryReady || configurationPending || !activeProfile?.workflowDraft.newsEnabled || undefined} aria-busy={turnOff.isPending && turnOff.variables.origin === 'progress' || undefined} onFocus={event => setProgressStopFocused(event.currentTarget)} onBlur={() => setProgressStopFocused(null)} onClick={() => turnOffPreparation('progress')}>{turnOff.isPending && turnOff.variables.origin === 'progress' ? 'Turning off…' : activeProfile?.workflowDraft.newsEnabled ? 'Turn off automatic preparation' : 'Automatic preparation off'}</button><ErrorNotice error={configDraft.stopErrorOrigin === 'progress' && configDraft.stopError ? new Error(configDraft.stopError) : null} /></div>}</div>}
      {runningProfile && !preparationStatusUnknown && !manualPending && <p className="form-hint">This check keeps its original sources, host, mood and interests. Saved setup changes apply to future checks.</p>}
      {configDraft.preparationCancelError && !localCancelError && <div><p className="form-hint">Cancellation could not be confirmed for an earlier preparation.</p><ErrorNotice error={new Error(configDraft.preparationCancelError)} /></div>}
      {!localManualFeedback && manualFeedback}
      <section id="room-panel-settings" role="tabpanel" aria-labelledby="room-tab-settings" hidden={tab !== 'settings'} tabIndex={0} className="room-preparation">
      <ErrorNotice error={library.error} retryRef={settingsRetryFocus.retryRef} retrying={library.isFetching} retry={() => settingsRetryFocus.retry(() => library.refetch())} />
      {preparationStatusUnknown && <p className="form-hint" role="status">Preparation activity must be confirmed before editing setup. Wait for status to load, or retry the failed status check.</p>}
      {state.data && <RoomSetup sources={sources} djs={state.data.djs} room={room} mood={mood} newsInterests={newsInterests} busy={setupBusy} setSetup={setSetup} setMoodDraft={setMoodDraft} setNewsInterests={setNewsInterests} configureSources={configureSources} configureDJ={configureDJ} />}
      {activeProfile && <WorkflowPreferences key={activeProfile.id} active={tab === 'settings'} resuming={resume.isPending} resumeError={configDraft.operationErrorTarget === 'resume' && configDraft.operationError ? new Error(configDraft.operationError) : null} stopError={configDraft.stopErrorOrigin === 'settings' && configDraft.stopError ? new Error(configDraft.stopError) : null} room={activeProfile} value={workflowDraft as WorkflowDraft} dirty={setupDirty} disabled={setupBusy} saving={save.isPending} saveError={configDraft.operationErrorTarget === 'setup' && configDraft.operationError ? new Error(configDraft.operationError) : null} activationReady={workflowReady} statusLoading={workflowStatusLoading} statusError={workflowStatusError} profileStatusUnknown={state.isPending || !!state.error} issues={preparationIssues} onChange={updateWorkflow} onSave={() => { if (saveSubmission.current || save.isPending || configurationPending) return; saveSubmission.current = true; save.mutate(); }} onResume={resumePreparation} onTurnOff={() => turnOffPreparation('settings')} stopping={turnOff.isPending} stopDisabled={configurationPending} onRetryStatus={() => { void aiStatus.refetch(); void elevenStatus.refetch(); if (xKeyRequired) void xStatus.refetch(); }} />}
      {setupDirty && <p className="form-hint">Save setup and preparation together to keep these choices in this room profile.</p>}
      {(!textKeyReady || !audioKeyReady) && <p className="form-hint">News preparation needs OpenAI and ElevenLabs keys. <button className="room-link" onClick={configureSettings}>Provider keys</button></p>}
      <details className="room-script room-testing-tools" ref={manualTools} onToggle={event => setManualToolsOpen(event.currentTarget.open)}><summary>Testing tools · Prepare a story manually</summary><div className="room-script-content" aria-labelledby="script-title"><div className="room-section-heading"><div><span className="eyebrow">Manual testing</span><h2 id="script-title">Prepare a story</h2></div><InfoHelp label="About manual preparation"><p>Use these tools to test a script or voice. Text and audio requests use your provider accounts and save completed results locally.</p><p>DJ playback only picks saved recordings. The news workflow prepares stories on its own schedule.</p></InfoHelp></div><p>Prepare text, review it, then generate an audio take.</p><p className="form-hint">Manual text preparation uses OpenAI outside automatic preparation limits. It can incur charges even when no recording is made.</p>
        <div className="room-manual-action"><button className="primary" disabled={(busy || !ready || !textKeyReady) && !ownsManualFocus('text')} aria-disabled={busy || !ready || !textKeyReady || undefined} aria-busy={manualPending && manualAction === 'text' || undefined} onFocus={event => setManualFocus({ key: 'text', element: event.currentTarget })} onBlur={() => setManualFocus(null)} onClick={() => { if (!busy && ready && textKeyReady) prepareText(); }}><Newspaper size={15} />{manualPending && manualAction === 'text' ? 'Preparing text…' : 'Prepare news text'}</button>{localManualFeedback && manualRequest?.kind === 'script' && manualFeedback}</div>
        {!ready && <p className="form-hint">Choose sources and a DJ, and describe your station mood first.</p>}
        {ready && !textKeyReady && <p className="notice">{aiStatus.isPending ? 'Checking OpenAI key…' : aiStatus.error ? 'OpenAI key status unavailable.' : 'Add an OpenAI key to prepare text.'} <button className="room-link" onClick={configureSettings}>Open Settings</button></p>}
        <ErrorNotice error={aiStatus.error} retryRef={aiRetryFocus.retryRef} retrying={aiStatus.isFetching} retry={() => aiRetryFocus.retry(() => aiStatus.refetch())} />{dj?.news?.speechEngine === 'elevenlabs-v4' && <ErrorNotice error={elevenStatus.error} retryRef={elevenRetryFocus.retryRef} retrying={elevenStatus.isFetching} retry={() => elevenRetryFocus.retry(() => elevenStatus.refetch())} />}

        {!!library.data?.scripts.length && <div className="room-saved-script"><FilterSelect label="Saved draft" value={editing?.scriptId ?? ''} choices={library.data.scripts.map(value => ({ value: value.id, label: `${value.provenance.dj.name} · ${new Date(value.createdAt).toLocaleString()}` })).reverse()} onChange={id => { const saved = library.data?.scripts.find(value => value.id === id); if (saved) requestScript({ scriptId: saved.id, script: saved.script }, false); }} disabled={busy} /></div>}
        {editing && <div className="room-script-editor"><label htmlFor="news-draft">Review the script</label><textarea id="news-draft" rows={5} maxLength={700} disabled={busy} value={editing.script} onChange={event => setDraft({ ...editing, script: event.target.value })} /><div className="room-script-meta"><span className={words > 55 ? 'danger' : ''}>{words} / 55 words</span><span>{scriptRecord ? new Date(scriptRecord.createdAt).toLocaleString() : 'Saved draft'}</span></div>{scriptRecord && <details><summary>Sources and preparation settings</summary><p className="form-hint">Prepared for {scriptRecord.provenance.dj.name} · {scriptRecord.provenance.mood}</p><p className="form-hint">News interests: {(scriptRecord.provenance.newsInterests ?? scriptRecord.provenance.dj.news?.interests) || 'Any topics from selected sources'}</p>{scriptRecord.articles.map(article => <p key={article.id} className="room-article"><button className="room-link" onClick={() => source.mutate(article.url)}>{article.title}</button><span>{article.source}{Number.isFinite(Date.parse(article.publishedAt ?? '')) ? ` · ${new Date(article.publishedAt!).toLocaleDateString()}` : ' · Date unavailable'}</span></p>)}{scriptRecord.warnings.map((warning, index) => <p className="form-hint" key={index}>{warning}</p>)}</details>}
          <div className="room-section-heading room-render-heading"><div><span className="eyebrow">Manual audio</span><h3>Generate a complete take</h3></div><Headphones size={19} /></div>{!finite && <p className="notice">Configure ElevenLabs in this DJ's voice settings. <button className="room-link" onClick={configureDJ}>Manage DJ in Settings</button></p>}
          {!audioKeyReady && <p className="notice">Add an ElevenLabs key before generating audio. <button className="room-link" onClick={configureSettings}>Open Settings</button></p>}
          <p className="form-hint">A new audio take uses ElevenLabs outside automatic preparation limits and can use credits or incur charges. Reusing or auditioning a saved take makes no provider request.</p><div className="room-manual-action"><div className="room-actions">{(['audio', 'variation'] as const).map(key => { const unavailable = busy || !finite || !audioKeyReady || !words || words > 55; return <button key={key} className={key === 'audio' ? 'primary' : undefined} disabled={!!unavailable && !ownsManualFocus(key)} aria-disabled={!!unavailable || undefined} aria-busy={manualPending && manualAction === key || undefined} onFocus={event => setManualFocus({ key, element: event.currentTarget })} onBlur={() => setManualFocus(null)} onClick={() => { if (!unavailable) renderTake(key === 'variation'); }}>{manualPending && manualAction === key ? 'Generating audio…' : key === 'audio' ? 'Generate audio take' : 'Generate another take'}</button>; })}</div>{localManualFeedback && manualRequest?.kind === 'audio' && manualFeedback}</div>
        </div>}
        <ErrorNotice error={source.error} />
      </div></details>
      </section>
      <section id="room-panel-saved" role="tabpanel" aria-labelledby="room-tab-saved" hidden={tab !== 'saved'} tabIndex={0}>
      {differs && <p className="notice">Your draft or setup differs from the selected take. Your saved choice remains unchanged.</p>}
        <ErrorNotice error={library.error} retryRef={savedRetryFocus.retryRef} retrying={library.isFetching} retry={() => savedRetryFocus.retry(() => library.refetch())} />
      {library.isPending && <p className="loading" role="status">Opening saved audio…</p>}
      {library.data && <PreparedTakes active={tab === 'saved'} library={library.data} refresh={refresh} loadDraft={loadDraft} />}
      {!!preparationHistory.length && <details id="preparation-history" className="room-request-history" ref={requestHistory}><summary>Preparation history</summary>{preparationHistory.slice(-historyLimit).reverse().map(value => <p key={value.requestId} id={`preparation-request-${value.requestId}`} tabIndex={-1} role="group" aria-labelledby={`preparation-label-${value.requestId}`} aria-describedby={`preparation-origin-${value.requestId} preparation-detail-${value.requestId}`}><strong id={`preparation-label-${value.requestId}`}>{value.kind === 'script' ? 'News text' : 'Audio take'} · {value.status === 'skipped' ? 'No relevant story' : value.status === 'partial-coverage' ? 'Incomplete source coverage' : value.status}</strong><span id={`preparation-origin-${value.requestId}`}>{preparationOrigin(value)}</span><span id={`preparation-detail-${value.requestId}`}>{value.error || (value.status === 'skipped' ? 'No audio was generated for this attempt.' : 'No automatic provider retry. Completed results remain in saved audio.')}</span></p>)}{preparationHistory.length > historyLimit && <button className="room-link" onClick={showOlderPreparations}>Show older preparations</button>}</details>}
      </section>
      {audioResult}
    </div>
    {scriptReplacement && <Dialog title="Replace edited script?" close={() => setScriptReplacement(null)}>
      <p>{scriptReplacement.kind === 'prepare' ? 'Preparing new text will replace your edited script if it succeeds. This request uses OpenAI outside automatic preparation limits and may incur charges. If preparation fails, your edited script stays here.' : 'Loading this saved script will replace your unsaved edits. Your saved scripts and recordings stay unchanged.'}</p>
      <div className="modal-actions"><button onClick={() => { setScriptReplacement(null); revealScriptEditor(); }}>Keep editing</button><button className="primary" onClick={() => {
        const replacement = scriptReplacement;
        setScriptReplacement(null);
        if (replacement.kind === 'prepare') prepareText(true);
        else applyScript(replacement.draft, replacement.reveal);
      }}>{scriptReplacement.kind === 'prepare' ? 'Prepare new text' : 'Replace draft'}</button></div>
    </Dialog>}
    {newProfileOpen && <Dialog title="Save a new listening room" close={closeProfileDialogs} closeDisabled={profiles.isPending} initialFocusRef={profileNameInput}><form onSubmit={event => { event.preventDefault(); changeProfile({ kind: 'copy' }); }}><label>Name<input ref={profileNameInput} autoFocus required maxLength={80} readOnly={busy} value={profileName} onChange={event => { if (profileSubmission.current || busy) return; profiles.reset(); setProfileName(event.target.value); }} placeholder="Evening technology" /></label><p className="form-hint">Copies your setup with automatic preparation off. Choose the new room, then make it available in Advanced room options before enabling preparation or DJ breaks. You can finish incomplete setup later.</p><ErrorNotice error={profiles.error} /><div className="modal-actions"><button type="button" aria-disabled={profiles.isPending || undefined} onClick={closeProfileDialogs}>Cancel</button><button className="primary" disabled={!profileName.trim()} aria-disabled={busy || undefined} aria-busy={profiles.isPending || undefined}>{profiles.isPending ? 'Saving…' : 'Save room'}</button></div></form></Dialog>}
    {switchTarget && <Dialog title="Switch listening rooms?" close={closeProfileDialogs} closeDisabled={profiles.isPending}><p>You have unsaved changes to {activeProfile?.name ?? 'your current room'}. Save them before switching, or discard them. Your script and selected audio stay unchanged.</p><ErrorNotice error={profiles.error} /><div className="modal-actions"><button aria-disabled={profiles.isPending || undefined} onClick={closeProfileDialogs}>Cancel</button><button aria-disabled={busy || undefined} onClick={() => changeProfile({ kind: 'switch', id: switchTarget, saveChanges: false })}>Discard and switch</button><button className="primary" aria-disabled={busy || undefined} aria-busy={profiles.isPending || undefined} onClick={() => changeProfile({ kind: 'switch', id: switchTarget, saveChanges: true })}>{profiles.isPending ? 'Switching…' : 'Save and switch'}</button></div></Dialog>}
    </>}
  </>;
}
