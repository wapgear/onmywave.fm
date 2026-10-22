import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import type { ListeningRoom, PreparedNewsRequest } from '../../../shared/types';
import type { WorkflowDraft } from '../../../shared/workflow';
import { unwrap } from '../../api';
import { Button } from '../../components/Button/Button.component';
import { ConfigurationTabs } from '../../components/ConfigurationTabs/ConfigurationTabs.component';
import { Dialog, DialogActions, ErrorNotice, PageHeading, errorMessage } from '../../components/Shared';
import { useDJPlayback } from '../../dj-playback';
import { confirmLocalState } from '../../local-state-cache';
import { NewsRecoveryPanel, useNewsRecovery } from '../../NewsRecovery';
import { useRetryFocus } from '../../useRetryFocus';
import { WorkflowPreferences } from '../Settings/components/WorkflowPreferences.component';
import type { PreparationIssue } from '../Settings/components/WorkflowPreferences.types';
import { NewsBucket } from './components/NewsBucket.component';
import { PreparedTakes } from './components/PreparedTakes.component';
import { RoomSetup } from './components/RoomSetup.component';
import type { RoomSetupDraft, StationsPageProps } from './Stations.types';

import './Stations.styles.css';

function preparationOrigin(request: PreparedNewsRequest) {
  const origin = request.origin;
  if (!origin) return 'Original profile and time not recorded';
  return `${origin.kind === 'automatic' ? 'Automatic' : 'Manual'} · ${origin.profileName ?? 'Original profile unavailable'} · ${new Date(origin.startedAt).toLocaleString()}`;
}

export function StationsPage({
  configDraft,
  setConfigDraft,
  configureSources,
  configureDJ,
  configureSettings,
}: StationsPageProps) {
  const newsRecovery = useNewsRecovery();
  const newsRecoveryReady = newsRecovery.status.phase === 'ready';
  const client = useQueryClient();
  const configurationPending = useIsMutating({ mutationKey: ['roomConfiguration'] }) > 0;
  const cancelInFlight = useRef(false);
  const [cancelFocus, setCancelFocus] = useState<{
    element: HTMLButtonElement;
    requestId: string;
    kind: 'cancel' | 'retry';
  } | null>(null);
  const saveSubmission = useRef(false);
  const workflowActionInFlight = useRef(false);
  const availabilityInput = useRef<HTMLInputElement>(null);
  const progressStopButton = useRef<HTMLButtonElement>(null);
  const [availabilityFocused, setAvailabilityFocused] = useState<HTMLInputElement | null>(null);
  const [progressStopFocused, setProgressStopFocused] = useState<HTMLButtonElement | null>(null);
  const configurationMutation = {
    mutationKey: ['roomConfiguration'],
    onMutate: () =>
      setConfigDraft((current) => ({ ...current, operationError: undefined, operationErrorTarget: undefined })),
    onError: (error: unknown) =>
      setConfigDraft((current) => ({
        ...current,
        operationError: errorMessage(error),
        operationErrorTarget: undefined,
      })),
  };
  const automation = useDJPlayback();
  const state = useQuery({
    queryKey: ['localState'],
    queryFn: async () => unwrap(await window.wave.getLocalState()),
    enabled: newsRecoveryReady,
    refetchInterval: newsRecoveryReady ? 10000 : false,
  });
  const library = useQuery({
    queryKey: ['preparedNews'],
    queryFn: async () => unwrap(await window.wave.getPreparedNews()),
    enabled: newsRecoveryReady,
    refetchInterval: (query) =>
      newsRecoveryReady && query.state.data?.requests.some((value) => value.status === 'running')
        ? 1000
        : newsRecoveryReady
          ? 10000
          : false,
  });
  const { setup, moodDraft } = configDraft;
  const setSetup = (setup: ListeningRoom | null) => setConfigDraft((current) => ({ ...current, setup }));
  const setMoodDraft = (moodDraft: string | null) => setConfigDraft((current) => ({ ...current, moodDraft }));
  const requestHistory = useRef<HTMLDetailsElement>(null);
  const tab = ['news', 'host', 'prepare', 'settings'].includes(configDraft.tab ?? '')
    ? 'settings'
    : configDraft.tab === 'saved'
      ? 'saved'
      : 'bucket';
  const setTab = (tab: string) => setConfigDraft((current) => ({ ...current, tab }));
  const heading = useRef<HTMLHeadingElement>(null);
  const stateRetryFocus = useRetryFocus({
    ownerKey: 'room:localState',
    target: () => heading.current,
    canFocusSuccess: () => newsRecoveryReady && state.isSuccess && !state.isFetching,
  });
  const bucketRetryFocus = useRetryFocus({
    ownerKey: `room:news:${tab}`,
    target: () => document.getElementById('room-panel-bucket'),
    canFocusSuccess: () => newsRecoveryReady && tab === 'bucket' && library.isSuccess && !library.isFetching,
  });
  const settingsRetryFocus = useRetryFocus({
    ownerKey: `room:settings-news:${tab}`,
    target: () => document.getElementById('room-panel-settings'),
    canFocusSuccess: () => newsRecoveryReady && tab === 'settings' && library.isSuccess && !library.isFetching,
  });
  const savedRetryFocus = useRetryFocus({
    ownerKey: `room:saved-news:${tab}`,
    target: () => document.getElementById('room-panel-saved'),
    canFocusSuccess: () => newsRecoveryReady && tab === 'saved' && library.isSuccess && !library.isFetching,
  });
  const aiStatus = useQuery({
    queryKey: ['aiStatus'],
    meta: { aiOperation: true },
    queryFn: async () => unwrap(await window.wave.getAiStatus()),
    enabled: newsRecoveryReady,
  });
  const elevenStatus = useQuery({
    queryKey: ['elevenLabsStatus'],
    meta: { aiOperation: true },
    queryFn: async () => unwrap(await window.wave.getElevenLabsStatus()),
    enabled: newsRecoveryReady,
  });
  const preparationStatusUnknown = library.isPending || !!library.error || state.isPending || !!state.error;
  const latestStoredRequest = library.data?.requests.at(-1);
  const preparationHistory = library.data?.requests.filter((value) => value.status !== 'complete') ?? [];
  const [historyLimit, setHistoryLimit] = useState(10);
  const restoredInterruption =
    !preparationStatusUnknown &&
    state.data &&
    latestStoredRequest?.status === 'interrupted' &&
    !state.data.roomProfiles.some(
      (profile) => profile.workflowDraft.newsLastRun?.requestId === latestStoredRequest.requestId,
    )
      ? latestStoredRequest
      : null;
  const cancellationPending = useIsMutating({ mutationKey: ['newsCancellation'] }) > 0;
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const profileNameInput = useRef<HTMLInputElement>(null);
  const profileSubmission = useRef(false);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState('');
  const activeProfile = state.data?.roomProfiles.find((value) => value.id === state.data.activeRoomProfileId);
  const rawRoom = setup ?? activeProfile?.room ?? { djId: null, sourceIds: [] };
  const room = state.data
    ? {
        djId: state.data.djs.some((dj) => dj.id === rawRoom.djId) ? rawRoom.djId : null,
        sourceIds: rawRoom.sourceIds.filter((id) => state.data!.sources.some((source) => source.id === id)),
      }
    : rawRoom;
  const mood = moodDraft ?? activeProfile?.mood ?? '';
  const sources = state.data?.sources ?? [];
  const xStatus = useQuery({
    queryKey: ['twitterStatus'],
    queryFn: async () => unwrap(await window.wave.getTwitterStatus()),
    enabled: room.sourceIds.some((id) => sources.find((source) => source.id === id)?.kind === 'twitter'),
  });
  const dj = state.data?.djs.find((value) => value.id === room.djId);
  const newsInterests =
    configDraft.newsInterests ?? activeProfile?.workflowDraft.newsInterests ?? dj?.news?.interests ?? '';
  const setNewsInterests = (newsInterests: string) => setConfigDraft((current) => ({ ...current, newsInterests }));
  const sameSources = (left: string[], right: string[]) =>
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  const unsavedSetup =
    !!state.data &&
    !!activeProfile &&
    (room.djId !== activeProfile.room.djId ||
      !sameSources(room.sourceIds, activeProfile.room.sourceIds) ||
      mood !== activeProfile.mood ||
      newsInterests !==
        (activeProfile.workflowDraft.newsInterests ??
          state.data.djs.find((value) => value.id === activeProfile.room.djId)?.news?.interests ??
          ''));
  const workflowPatch =
    configDraft.workflow?.roomId === activeProfile?.id ? (configDraft.workflow?.patch ?? null) : null;
  const workflowDraft = { ...activeProfile?.workflowDraft, ...workflowPatch };
  const workflowDirty =
    !!workflowPatch &&
    Object.entries(workflowPatch).some(
      ([key, value]) => activeProfile?.workflowDraft[key as keyof WorkflowDraft] !== value,
    );
  const updateWorkflow = (patch: Partial<WorkflowDraft>) => {
    if (!activeProfile) return;
    setConfigDraft((current) => ({
      ...current,
      workflow: {
        roomId: activeProfile.id,
        patch: { ...(current.workflow?.roomId === activeProfile.id ? current.workflow.patch : {}), ...patch },
      },
    }));
  };
  const validSources =
    room.sourceIds.length > 0 &&
    room.sourceIds.length <= 20 &&
    room.sourceIds.every((id) => sources.some((source) => source.id === id));
  const ready = !!dj && validSources && !!mood.trim();
  const chosenSources = sources.filter((value) => room.sourceIds.includes(value.id));
  const xKeyRequired = chosenSources.some((value) => value.kind === 'twitter');
  const workflowReady =
    !!activeProfile?.enabled &&
    ready &&
    !!dj?.news &&
    aiStatus.data?.configured === true &&
    elevenStatus.data?.configured === true &&
    (!xKeyRequired || xStatus.data?.configured === true);
  const workflowStatusLoading = aiStatus.isPending || elevenStatus.isPending || (xKeyRequired && xStatus.isPending);
  const workflowStatusError = aiStatus.error || elevenStatus.error || (xKeyRequired && xStatus.error);
  const setupDirty = unsavedSetup || workflowDirty;
  function focusSetup(selector: string) {
    const target = document.querySelector<HTMLElement>(selector);
    target?.scrollIntoView({ block: 'center' });
    target?.focus({ preventScroll: true });
  }
  const preparationIssues: PreparationIssue[] = [
    ...(room.sourceIds.length === 0
      ? [
          {
            message: 'Choose at least one news source.',
            action: {
              label: sources.length ? 'Review sources' : 'Manage sources',
              run: () => {
                if (sources.length) focusSetup('.room-sources input');
                else configureSources();
              },
            },
          },
        ]
      : []),
    ...(room.sourceIds.length > 0 && !validSources
      ? [
          {
            message: 'Some selected sources are unavailable or the selection exceeds the 20-source limit.',
            action: { label: 'Review sources', run: () => focusSetup('.room-sources input') },
          },
        ]
      : []),
    ...(!dj?.news
      ? [
          {
            message: dj
              ? 'This DJ needs saved news voice settings.'
              : state.data?.djs.length
                ? 'Choose a saved DJ.'
                : 'Add your first DJ.',
            action: {
              label: dj ? 'Manage DJ' : state.data?.djs.length ? 'Review DJ' : 'Manage DJs',
              run: () =>
                dj || !state.data?.djs.length ? configureDJ() : focusSetup('.room-host-choice .filter-select-trigger'),
            },
          },
        ]
      : []),
    ...(!mood.trim()
      ? [
          {
            message: 'Add a mood for the host.',
            action: { label: 'Review mood', run: () => focusSetup('#station-mood') },
          },
        ]
      : []),
    ...(aiStatus.data?.configured === false
      ? [{ message: 'OpenAI key is missing.', action: { label: 'Provider keys', run: configureSettings } }]
      : []),
    ...(elevenStatus.data?.configured === false
      ? [{ message: 'ElevenLabs key is missing.', action: { label: 'Provider keys', run: configureSettings } }]
      : []),
    ...(xKeyRequired && xStatus.data?.configured === false
      ? [
          {
            message: 'X bearer token is missing for the selected X source.',
            action: { label: 'Provider keys', run: configureSettings },
          },
        ]
      : []),
    ...(!activeProfile?.enabled
      ? [
          {
            message: 'This profile is not available for preparation or playback.',
            action: {
              label: 'Review room options',
              run: () => {
                const options = document.querySelector<HTMLDetailsElement>('.room-advanced');
                if (options) {
                  options.open = true;
                  options.querySelector('summary')?.focus();
                  options.scrollIntoView({ block: 'center' });
                }
              },
            },
          },
        ]
      : []),
  ];
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['preparedNews'] });
  }
  const persist = useMutation({
    ...configurationMutation,
    onError: undefined,
    mutationFn: async (includeWorkflow: boolean) => {
      const submittedDraft = configDraft;
      const latest = unwrap(await window.wave.getLocalState());
      const latestProfile = latest.roomProfiles.find((value) => value.id === latest.activeRoomProfileId);
      if (!latestProfile || latest.activeRoomProfileId !== activeProfile?.id)
        throw new Error('The active room changed before these settings were saved. Review the room and try again.');
      const workflow =
        includeWorkflow && configDraft.workflow?.roomId === latest.activeRoomProfileId
          ? configDraft.workflow.patch
          : {};
      await confirmLocalState(
        client,
        unwrap(
          await window.wave.saveWorkflowDraft({
            expectedProfileId: latest.activeRoomProfileId,
            workflowDraft: { ...latestProfile.workflowDraft, ...workflow, newsInterests },
            room,
            mood: mood.trim(),
          }),
        ),
      );
      await client.invalidateQueries({ queryKey: ['localState'] });
      setConfigDraft((current) => ({
        ...current,
        ...(current.stopError === submittedDraft.stopError ? { stopError: undefined } : {}),
        ...(current.setup === submittedDraft.setup ? { setup: null } : {}),
        ...(current.moodDraft === submittedDraft.moodDraft ? { moodDraft: null } : {}),
        ...(current.newsInterests === submittedDraft.newsInterests ? { newsInterests: undefined } : {}),
        ...(includeWorkflow && current.workflow === submittedDraft.workflow ? { workflow: undefined } : {}),
      }));
    },
  });
  async function persistSetup(includeWorkflow = false) {
    await persist.mutateAsync(includeWorkflow);
  }
  const resume = useMutation({
    ...configurationMutation,
    mutationFn: async () => {
      const latest = unwrap(await window.wave.getLocalState());
      if (latest.activeRoomProfileId !== activeProfile?.id)
        throw new Error('The active room changed. Reopen its settings before resuming preparation.');
      const profile = latest.roomProfiles.find((value) => value.id === latest.activeRoomProfileId);
      if (!profile) throw new Error('The active room is unavailable. Refresh and try again.');
      const missing = await getWorkflowReadinessError();
      if (missing) throw new Error(missing);
      const current = unwrap(await window.wave.getLocalState());
      if (current.activeRoomProfileId !== profile.id)
        throw new Error('The active room changed. Reopen its settings before resuming preparation.');
      await confirmLocalState(
        client,
        unwrap(
          await window.wave.saveWorkflowDraft({
            expectedProfileId: profile.id,
            workflowDraft: profile.workflowDraft,
            room: profile.room,
            mood: profile.mood,
            resumePreparation: true,
          }),
        ),
      );
      await client.invalidateQueries({ queryKey: ['localState'] });
    },
    onError: (error) =>
      setConfigDraft((current) => ({
        ...current,
        operationError: errorMessage(error),
        operationErrorTarget: 'resume',
      })),
    onSettled: () => {
      workflowActionInFlight.current = false;
    },
  });
  async function getWorkflowReadinessError(): Promise<string | null> {
    const latest = unwrap(await window.wave.getLocalState());
    const selected = latest.sources.filter((value) => room.sourceIds.includes(value.id));
    const host = latest.djs.find((value) => value.id === room.djId);
    const missing: string[] = [];
    if (!selected.length || selected.length !== room.sourceIds.length) missing.push('select an available news source');
    if (!host?.news) missing.push('choose a saved DJ with news voice settings');
    if (!mood.trim()) missing.push('add a host mood');
    if (missing.length) return `Before enabling preparation, ${missing.join(', ')}.`;
    try {
      const [text, voice, x] = await Promise.all([
        window.wave.getAiStatus().then(unwrap),
        window.wave.getElevenLabsStatus().then(unwrap),
        selected.some((value) => value.kind === 'twitter')
          ? window.wave.getTwitterStatus().then(unwrap)
          : Promise.resolve({ configured: true, sessionOnly: false }),
      ]);
      const keys: string[] = [];
      if (!text.configured) keys.push('OpenAI');
      if (!voice.configured) keys.push('ElevenLabs');
      if (!x.configured) keys.push('X');
      return keys.length
        ? `Add the ${keys.join(' and ')} ${keys.length === 1 ? 'key' : 'keys'} in Provider keys before enabling preparation.`
        : null;
    } catch {
      return 'Provider key status could not be checked. Retry the status check before enabling preparation.';
    }
  }
  const save = useMutation({
    ...configurationMutation,
    mutationFn: async () => {
      if (workflowDraft.newsEnabled) {
        const missing = await getWorkflowReadinessError();
        if (missing) throw new Error(missing);
      }
      await persistSetup(true);
    },
    onError: (error: unknown) =>
      setConfigDraft((current) => ({ ...current, operationError: errorMessage(error), operationErrorTarget: 'setup' })),
    onSettled: () => {
      saveSubmission.current = false;
    },
  });
  const source = useMutation({ mutationFn: async (url: string) => unwrap(await window.wave.openSource(url)) });
  const running = library.data?.requests.find((value) => value.status === 'running');
  const cancel = useMutation({
    mutationKey: ['newsCancellation'],
    meta: { aiOperation: true },
    onMutate: (input) =>
      setConfigDraft((current) => ({
        ...current,
        preparationCancelError: undefined,
        preparationCancellation: { requestId: input.requestId, acknowledged: false },
      })),
    mutationFn: async (input: { requestId: string }) => {
      unwrap(await window.wave.cancelPreparedNews(input.requestId));
      await refresh();
    },
    onSuccess: (_result, input) =>
      setConfigDraft((current) =>
        current.preparationCancellation?.requestId === input.requestId
          ? { ...current, preparationCancellation: { ...current.preparationCancellation, acknowledged: true } }
          : current,
      ),
    onError: (error) => setConfigDraft((current) => ({ ...current, preparationCancelError: errorMessage(error) })),
    onSettled: () => {
      cancelInFlight.current = false;
    },
  });
  function cancelPreparation(retry = false, expectedRequestId?: string) {
    const target = running ? { requestId: running.requestId } : null;
    if (
      !target ||
      (expectedRequestId && expectedRequestId !== target.requestId) ||
      cancelInFlight.current ||
      cancellationPending ||
      (!retry &&
        configDraft.preparationCancellation?.requestId === target.requestId &&
        configDraft.preparationCancellation.acknowledged)
    )
      return;
    cancelInFlight.current = true;
    cancel.mutate(target);
  }
  const preparing = !!running;
  const runningProfiles = running
    ? (state.data?.roomProfiles.filter(
        (profile) =>
          profile.workflowDraft.newsLastRun?.requestId === running.requestId &&
          profile.workflowDraft.newsLastRun.outcome === 'running',
      ) ?? [])
    : [];
  const runningProfile = runningProfiles.length === 1 ? runningProfiles[0] : undefined;
  const turnOff = useMutation({
    mutationKey: ['roomConfiguration'],
    onMutate: (input) =>
      setConfigDraft((current) => ({ ...current, stopError: undefined, stopErrorOrigin: input.origin })),
    mutationFn: async (input: {
      roomId: string;
      name: string;
      workflow: RoomSetupDraft['workflow'];
      origin: 'settings' | 'progress';
    }) => {
      await confirmLocalState(client, unwrap(await window.wave.disableNewsPreparation(input.roomId)));
    },
    onSuccess: async (_result, input) => {
      await Promise.all([client.invalidateQueries({ queryKey: ['localState'] }), refresh()]);
      setConfigDraft((current) => {
        if (current.workflow !== input.workflow || current.workflow?.roomId !== input.roomId) return current;
        const patch = { ...current.workflow.patch };
        delete patch.newsEnabled;
        return { ...current, workflow: Object.keys(patch).length ? { roomId: input.roomId, patch } : undefined };
      });
      setProfileNotice(`Automatic preparation turned off for ${input.name}. Other unsaved edits are kept.`);
    },
    onError: (error, input) =>
      setConfigDraft((current) => ({
        ...current,
        stopError: `Could not turn off preparation for ${input.name}. ${error instanceof Error ? error.message : 'Try again.'}`,
        stopErrorOrigin: input.origin,
      })),
    onSettled: () => {
      workflowActionInFlight.current = false;
    },
  });
  const profiles = useMutation({
    ...configurationMutation,
    mutationFn: async (action: { kind: 'copy' } | { kind: 'switch'; id: string; saveChanges: boolean }) => {
      if (action.kind === 'copy') {
        const latest = unwrap(await window.wave.getLocalState());
        const latestProfile = latest.roomProfiles.find((value) => value.id === latest.activeRoomProfileId);
        if (!latestProfile || latest.activeRoomProfileId !== activeProfile?.id)
          throw new Error('The active room changed. Review its settings before saving a copy.');
        const workflow = configDraft.workflow?.roomId === latest.activeRoomProfileId ? configDraft.workflow.patch : {};
        await confirmLocalState(
          client,
          unwrap(
            await window.wave.saveRoomProfile({
              name: profileName.trim(),
              room,
              mood: mood.trim(),
              workflowDraft: { ...latestProfile.workflowDraft, ...workflow, newsInterests },
            }),
          ),
        );
      } else {
        if (action.saveChanges) await persistSetup(true);
        await confirmLocalState(client, unwrap(await window.wave.activateRoomProfile(action.id)));
      }
      await client.invalidateQueries({ queryKey: ['localState'] });
      if (action.kind === 'copy') {
        setNewProfileOpen(false);
        setProfileName('');
        setProfileNotice(
          `Saved ${profileName.trim()} with preparation off. Choose it from Setup profile, then use Review room options to make it available.`,
        );
      } else {
        setConfigDraft((current) => ({
          setup: null,
          moodDraft: null,
          tab: current.tab,
          preparationCancelError: current.preparationCancelError,
        }));
        setSwitchTarget(null);
        setProfileNotice('Room switched. Saved news and audio history are unchanged.');
      }
    },
    onSettled: () => {
      profileSubmission.current = false;
    },
  });
  const enableProfile = useMutation({
    ...configurationMutation,
    mutationFn: async (input: { id: string; enabled: boolean }) => {
      await confirmLocalState(client, unwrap(await window.wave.setRoomProfileEnabled(input)));
      await client.invalidateQueries({ queryKey: ['localState'] });
    },
    onError: (error) =>
      setConfigDraft((current) => ({
        ...current,
        operationError: errorMessage(error),
        operationErrorTarget: 'availability',
      })),
    onSettled: () => {
      workflowActionInFlight.current = false;
    },
  });
  const setupBusy =
    preparationStatusUnknown || cancellationPending || configurationPending || (!!running && !runningProfile);
  const busy =
    setupBusy ||
    preparing ||
    turnOff.isPending ||
    save.isPending ||
    resume.isPending ||
    profiles.isPending ||
    enableProfile.isPending;
  const ownsAvailabilityFocus = availabilityFocused !== null && document.activeElement === availabilityFocused;
  const ownsProgressStopFocus =
    progressStopFocused !== null && tab !== 'settings' && document.activeElement === progressStopFocused;
  const showProgressStop =
    tab !== 'settings' &&
    !!activeProfile &&
    ((!!activeProfile.workflowDraft.newsEnabled && runningProfile?.id === activeProfile.id) || ownsProgressStopFocus);
  const ownsCancelFocus = cancelFocus !== null && document.activeElement === cancelFocus.element;
  const ownsCancelAction = (kind: 'cancel' | 'retry') => ownsCancelFocus && cancelFocus?.kind === kind;
  const currentCancelId = running?.requestId;
  const oldCancelFocus = ownsCancelFocus && !!currentCancelId && cancelFocus?.requestId !== currentCancelId;
  const cancellation = configDraft.preparationCancellation;
  const cancellationRecord =
    cancellation && library.data?.requests.find((value) => value.requestId === cancellation.requestId);
  const cancellationWaiting =
    !!cancellation?.acknowledged &&
    cancellation.requestId === currentCancelId &&
    cancellationRecord?.status === 'running';
  const cancellationFinished =
    cancellationRecord?.status === 'complete' ||
    cancellationRecord?.status === 'skipped' ||
    cancellationRecord?.status === 'partial-coverage';
  const cancelLabel = oldCancelFocus
    ? 'Previous preparation ended'
    : cancellationPending
      ? 'Requesting cancellation…'
      : !preparing
        ? cancellationFinished
          ? 'Preparation finished'
          : 'Preparation stopped'
        : cancellationWaiting
          ? 'Cancellation requested'
          : runningProfile
            ? `Cancel this check for ${runningProfile.name}`
            : 'Cancel preparation';
  const localCancelError =
    configDraft.preparationCancelError &&
    cancellation?.requestId === (ownsCancelFocus ? cancelFocus?.requestId : currentCancelId)
      ? configDraft.preparationCancelError
      : undefined;
  const cancelUnavailable = oldCancelFocus || cancellationPending || !preparing || cancellationWaiting;

  useLayoutEffect(() => {
    if (
      localCancelError &&
      ownsCancelFocus &&
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      cancelFocus?.element.checkVisibility()
    )
      cancelFocus.element.closest('.room-cancel-action')?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [localCancelError, ownsCancelFocus, cancelFocus]);

  function turnOffPreparation(origin: 'settings' | 'progress') {
    if (
      workflowActionInFlight.current ||
      configurationPending ||
      !newsRecoveryReady ||
      !activeProfile?.workflowDraft.newsEnabled
    )
      return;
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
    if (
      !(focused instanceof HTMLElement) ||
      !focused.checkVisibility() ||
      document.visibilityState !== 'visible' ||
      !document.hasFocus()
    )
      return;
    if (
      (configDraft.operationErrorTarget === 'availability' &&
        configDraft.operationError &&
        focused === availabilityInput.current) ||
      (configDraft.stopErrorOrigin === 'progress' && configDraft.stopError && focused === progressStopButton.current)
    ) {
      focused
        .closest('.room-availability, .room-active-progress')
        ?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }, [
    configDraft.operationErrorTarget,
    configDraft.operationError,
    configDraft.stopErrorOrigin,
    configDraft.stopError,
  ]);

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
    profiles.reset();
    setProfileNotice('');
    if (setupDirty) setSwitchTarget(id);
    else changeProfile({ kind: 'switch', id, saveChanges: false });
  }
  function openPreparation() {
    setTab('settings');
  }
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
    setHistoryLimit((limit) => limit + 10);
    requestAnimationFrame(() => {
      const row = firstOlder ? document.getElementById(`preparation-request-${firstOlder.requestId}`) : null;
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'center' });
    });
  }

  return (
    <>
      <PageHeading headingRef={heading} title="News bucket" />
      {newsRecovery.status.phase !== 'ready' ? (
        <NewsRecoveryPanel />
      ) : (
        <>
          <div className="listening-room">
            {state.isPending && (
              <p className="loading" role="status">
                Opening your room…
              </p>
            )}
            <ErrorNotice
              error={state.error}
              retryRef={stateRetryFocus.retryRef}
              retrying={state.isFetching}
              retry={() => stateRetryFocus.retry(() => state.refetch())}
            />
            {state.data && (
              <>
                <div className="room-profile-bar">
                  <label htmlFor="room-profile">
                    Setup profile
                    <select
                      id="room-profile"
                      value={state.data.activeRoomProfileId}
                      disabled={busy}
                      onChange={(event) => chooseProfile(event.target.value)}
                    >
                      {state.data.roomProfiles.map((value) => (
                        <option key={value.id} value={value.id}>
                          {value.name}
                          {value.id === state.data?.activeRoomProfileId ? ' · Active' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={busy}
                    onClick={() => {
                      profiles.reset();
                      setProfileName('');
                      setNewProfileOpen(true);
                    }}
                  >
                    Save as new
                  </button>
                </div>
                {activeProfile && (
                  <div className="room-availability">
                    <details className="room-advanced">
                      <summary>Advanced room options</summary>
                      <label className="room-dj-enabled">
                        <input
                          key={activeProfile.id}
                          ref={availabilityInput}
                          type="checkbox"
                          checked={activeProfile.enabled}
                          disabled={busy && !ownsAvailabilityFocus}
                          aria-disabled={busy || undefined}
                          aria-busy={enableProfile.isPending || undefined}
                          onFocus={(event) => setAvailabilityFocused(event.currentTarget)}
                          onBlur={() => setAvailabilityFocused(null)}
                          onClick={(event) => {
                            if (workflowActionInFlight.current || busy) event.preventDefault();
                          }}
                          onKeyDown={(event) => {
                            if (
                              (workflowActionInFlight.current || busy) &&
                              (event.key === ' ' || event.key === 'Enter')
                            )
                              event.preventDefault();
                          }}
                          onChange={(event) => setProfileAvailability(event.target.checked)}
                        />
                        Make this profile available for DJ playback and preparation
                      </label>
                      {enableProfile.isPending && enableProfile.variables.id === activeProfile.id && (
                        <p className="form-hint" role="status">
                          Making this profile {enableProfile.variables.enabled ? 'available' : 'unavailable'}… Its saved
                          setting stays shown until confirmed.
                        </p>
                      )}
                    </details>
                    <ErrorNotice
                      error={
                        configDraft.operationErrorTarget === 'availability' && configDraft.operationError
                          ? new Error(configDraft.operationError)
                          : null
                      }
                    />
                  </div>
                )}
                {configurationPending && (
                  <p className="form-hint" role="status">
                    Updating room settings… You can keep browsing and listening.
                  </p>
                )}

                <ErrorNotice
                  error={
                    configDraft.stopError &&
                    (configDraft.stopErrorOrigin === 'settings' ? tab !== 'settings' : !showProgressStop)
                      ? new Error(configDraft.stopError)
                      : null
                  }
                />
                {profileNotice && (
                  <p className="form-hint room-profile-notice" role="status">
                    {profileNotice}
                  </p>
                )}
                {!newProfileOpen &&
                  !switchTarget &&
                  configDraft.operationErrorTarget !== 'availability' &&
                  !(
                    tab === 'settings' &&
                    (configDraft.operationErrorTarget === 'setup' || configDraft.operationErrorTarget === 'resume')
                  ) && (
                    <ErrorNotice error={configDraft.operationError ? new Error(configDraft.operationError) : null} />
                  )}
                <ConfigurationTabs
                  id="room"
                  label="News bucket and configuration"
                  tabs={[
                    { id: 'bucket', label: 'News bucket' },
                    { id: 'settings', label: 'Settings' },
                    { id: 'saved', label: 'Saved audio' },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
                {restoredInterruption && tab !== 'saved' && (
                  <div className="notice">
                    <span role="status">
                      <strong>
                        A previous {restoredInterruption.kind === 'script' ? 'text' : 'audio'} preparation did not
                        finish.
                      </strong>{' '}
                      {preparationOrigin(restoredInterruption)}. It was not restarted automatically. A provider request
                      may have been charged. Review its saved status before resuming automatic preparation in News
                      settings.
                    </span>
                    <button aria-controls="preparation-history" onClick={reviewPreparationHistory}>
                      Review preparation history
                    </button>
                  </div>
                )}
                {setupDirty && tab !== 'settings' && (
                  <div className="room-unsaved">
                    <p>Unsaved room and preparation settings.</p>
                    <button onClick={() => setTab('settings')}>Review settings</button>
                  </div>
                )}
              </>
            )}
            {state.data && (
              <section
                id="room-panel-bucket"
                role="tabpanel"
                aria-labelledby="room-tab-bucket"
                hidden={tab !== 'bucket'}
                tabIndex={0}
              >
                <ErrorNotice
                  error={library.error}
                  retryRef={bucketRetryFocus.retryRef}
                  retrying={library.isFetching}
                  retry={() => bucketRetryFocus.retry(() => library.refetch())}
                />
                {library.isPending && (
                  <p className="loading" role="status">
                    Opening the news bucket…
                  </p>
                )}
                {library.data && preparationStatusUnknown && (
                  <p className="form-hint" role="status">
                    {library.isPending || library.error
                      ? 'Saved news and preparation history could not be confirmed. Showing the last loaded recordings, script records, and article history.'
                      : 'Automatic preparation status could not be refreshed. Recordings below are matched against the last saved profile.'}{' '}
                    Retry the failed status check before editing setup.
                  </p>
                )}
                {library.data && (
                  <NewsBucket
                    library={library.data}
                    localState={state.data}
                    automation={automation}
                    profileStatusUnknown={state.isPending || !!state.error}
                    savedNewsStale={preparationStatusUnknown}
                    openSource={(url) => source.mutate(url)}
                    openPreparation={openPreparation}
                  />
                )}
                <ErrorNotice error={source.error} />
              </section>
            )}
            {(preparing || ownsProgressStopFocus || ownsCancelFocus) && (
              <div className="news-progress room-active-progress">
                {preparing && <LoaderCircle className="spinning" size={17} aria-hidden="true" />}
                <span role="status">
                  {!preparing
                    ? ownsCancelFocus
                      ? cancellationFinished
                        ? 'Preparation finished before cancellation was confirmed.'
                        : 'Preparation stopped. A provider request may have been charged.'
                      : activeProfile?.workflowDraft.newsEnabled
                        ? 'Automatic preparation remains on.'
                        : 'Automatic preparation turned off.'
                    : runningProfile
                      ? `Preparing news for ${runningProfile.name}…`
                      : 'Preparing…'}
                </span>
                {(preparing || ownsCancelFocus) && (
                  <div className="room-cancel-action">
                    {(preparing || ownsCancelAction('cancel')) && (
                      <button
                        disabled={cancelUnavailable && !ownsCancelAction('cancel')}
                        aria-disabled={cancelUnavailable || undefined}
                        aria-busy={cancellationPending || undefined}
                        onFocus={(event) =>
                          setCancelFocus({
                            element: event.currentTarget,
                            requestId: currentCancelId ?? cancellation?.requestId ?? '',
                            kind: 'cancel',
                          })
                        }
                        onBlur={() => setCancelFocus(null)}
                        onClick={() => {
                          if (!cancelUnavailable)
                            cancelPreparation(
                              false,
                              ownsCancelAction('cancel') ? cancelFocus?.requestId : currentCancelId,
                            );
                        }}
                      >
                        {cancelLabel}
                      </button>
                    )}
                    {((cancellationWaiting &&
                      cancellationRecord?.status === 'running' &&
                      cancellation?.requestId === currentCancelId) ||
                      ownsCancelAction('retry')) && (
                      <button
                        className="room-link"
                        disabled={(cancellationPending || !preparing || oldCancelFocus) && !ownsCancelAction('retry')}
                        aria-disabled={cancellationPending || !preparing || oldCancelFocus || undefined}
                        aria-busy={cancellationPending || undefined}
                        onFocus={(event) =>
                          setCancelFocus({
                            element: event.currentTarget,
                            requestId: cancellation?.requestId ?? currentCancelId ?? '',
                            kind: 'retry',
                          })
                        }
                        onBlur={() => setCancelFocus(null)}
                        onClick={() => {
                          if (!cancellationPending && preparing && !oldCancelFocus)
                            cancelPreparation(
                              true,
                              ownsCancelAction('retry') ? cancelFocus?.requestId : cancellation?.requestId,
                            );
                        }}
                      >
                        {cancellationPending
                          ? 'Retrying cancellation…'
                          : oldCancelFocus
                            ? 'Previous preparation ended'
                            : !preparing
                              ? cancellationFinished
                                ? 'Preparation finished'
                                : 'Preparation stopped'
                              : 'Retry cancellation'}
                      </button>
                    )}
                    <ErrorNotice error={localCancelError ? new Error(localCancelError) : null} />
                  </div>
                )}
                {showProgressStop && (
                  <div className="room-progress-stop">
                    <button
                      ref={progressStopButton}
                      disabled={
                        (!newsRecoveryReady || configurationPending || !activeProfile?.workflowDraft.newsEnabled) &&
                        !ownsProgressStopFocus
                      }
                      aria-disabled={
                        !newsRecoveryReady ||
                        configurationPending ||
                        !activeProfile?.workflowDraft.newsEnabled ||
                        undefined
                      }
                      aria-busy={(turnOff.isPending && turnOff.variables.origin === 'progress') || undefined}
                      onFocus={(event) => setProgressStopFocused(event.currentTarget)}
                      onBlur={() => setProgressStopFocused(null)}
                      onClick={() => turnOffPreparation('progress')}
                    >
                      {turnOff.isPending && turnOff.variables.origin === 'progress'
                        ? 'Turning off…'
                        : activeProfile?.workflowDraft.newsEnabled
                          ? 'Turn off automatic preparation'
                          : 'Automatic preparation off'}
                    </button>
                    <ErrorNotice
                      error={
                        configDraft.stopErrorOrigin === 'progress' && configDraft.stopError
                          ? new Error(configDraft.stopError)
                          : null
                      }
                    />
                  </div>
                )}
              </div>
            )}
            {runningProfile && !preparationStatusUnknown && (
              <p className="form-hint">
                This check keeps its original sources, host, mood and interests. Saved setup changes apply to future
                checks.
              </p>
            )}
            {configDraft.preparationCancelError && !localCancelError && (
              <div>
                <p className="form-hint">Cancellation could not be confirmed for an earlier preparation.</p>
                <ErrorNotice error={new Error(configDraft.preparationCancelError)} />
              </div>
            )}
            <section
              id="room-panel-settings"
              role="tabpanel"
              aria-labelledby="room-tab-settings"
              hidden={tab !== 'settings'}
              tabIndex={0}
              className="room-preparation"
            >
              <ErrorNotice
                error={library.error}
                retryRef={settingsRetryFocus.retryRef}
                retrying={library.isFetching}
                retry={() => settingsRetryFocus.retry(() => library.refetch())}
              />
              {preparationStatusUnknown && (
                <p className="form-hint" role="status">
                  Preparation activity must be confirmed before editing setup. Wait for status to load, or retry the
                  failed status check.
                </p>
              )}
              {state.data && (
                <RoomSetup
                  sources={sources}
                  djs={state.data.djs}
                  room={room}
                  mood={mood}
                  newsInterests={newsInterests}
                  busy={setupBusy}
                  setSetup={setSetup}
                  setMoodDraft={setMoodDraft}
                  setNewsInterests={setNewsInterests}
                  configureSources={configureSources}
                  configureDJ={configureDJ}
                />
              )}
              {activeProfile && (
                <WorkflowPreferences
                  key={activeProfile.id}
                  active={tab === 'settings'}
                  resuming={resume.isPending}
                  resumeError={
                    configDraft.operationErrorTarget === 'resume' && configDraft.operationError
                      ? new Error(configDraft.operationError)
                      : null
                  }
                  stopError={
                    configDraft.stopErrorOrigin === 'settings' && configDraft.stopError
                      ? new Error(configDraft.stopError)
                      : null
                  }
                  room={activeProfile}
                  value={workflowDraft as WorkflowDraft}
                  dirty={setupDirty}
                  disabled={setupBusy}
                  saving={save.isPending}
                  saveError={
                    configDraft.operationErrorTarget === 'setup' && configDraft.operationError
                      ? new Error(configDraft.operationError)
                      : null
                  }
                  activationReady={workflowReady}
                  statusLoading={workflowStatusLoading}
                  statusError={workflowStatusError}
                  profileStatusUnknown={state.isPending || !!state.error}
                  issues={preparationIssues}
                  onChange={updateWorkflow}
                  onSave={() => {
                    if (saveSubmission.current || save.isPending || configurationPending) return;
                    saveSubmission.current = true;
                    save.mutate();
                  }}
                  onResume={resumePreparation}
                  onTurnOff={() => turnOffPreparation('settings')}
                  stopping={turnOff.isPending}
                  stopDisabled={configurationPending}
                  onRetryStatus={() => {
                    void aiStatus.refetch();
                    void elevenStatus.refetch();
                    if (xKeyRequired) void xStatus.refetch();
                  }}
                />
              )}
              {setupDirty && (
                <p className="form-hint">
                  Save setup and preparation together to keep these choices in this room profile.
                </p>
              )}
            </section>
            <section
              id="room-panel-saved"
              role="tabpanel"
              aria-labelledby="room-tab-saved"
              hidden={tab !== 'saved'}
              tabIndex={0}
            >
              <ErrorNotice
                error={library.error}
                retryRef={savedRetryFocus.retryRef}
                retrying={library.isFetching}
                retry={() => savedRetryFocus.retry(() => library.refetch())}
              />
              {library.isPending && (
                <p className="loading" role="status">
                  Opening saved audio…
                </p>
              )}
              {library.data && <PreparedTakes active={tab === 'saved'} library={library.data} refresh={refresh} />}
              {!!preparationHistory.length && (
                <details id="preparation-history" className="room-request-history" ref={requestHistory}>
                  <summary>Preparation history</summary>
                  {preparationHistory
                    .slice(-historyLimit)
                    .reverse()
                    .map((value) => (
                      <p
                        key={value.requestId}
                        id={`preparation-request-${value.requestId}`}
                        tabIndex={-1}
                        role="group"
                        aria-labelledby={`preparation-label-${value.requestId}`}
                        aria-describedby={`preparation-origin-${value.requestId} preparation-detail-${value.requestId}`}
                      >
                        <strong id={`preparation-label-${value.requestId}`}>
                          {value.kind === 'script' ? 'News text' : 'Audio take'} ·{' '}
                          {value.status === 'skipped'
                            ? 'No relevant story'
                            : value.status === 'partial-coverage'
                              ? 'Incomplete source coverage'
                              : value.status}
                        </strong>
                        <span id={`preparation-origin-${value.requestId}`}>{preparationOrigin(value)}</span>
                        <span id={`preparation-detail-${value.requestId}`}>
                          {value.error ||
                            (value.status === 'skipped'
                              ? 'No audio was generated for this attempt.'
                              : 'No automatic provider retry. Completed results remain in saved audio.')}
                        </span>
                      </p>
                    ))}
                  {preparationHistory.length > historyLimit && (
                    <button className="room-link" onClick={showOlderPreparations}>
                      Show older preparations
                    </button>
                  )}
                </details>
              )}
            </section>
          </div>
          {newProfileOpen && (
            <Dialog
              title="Save a new listening room"
              close={closeProfileDialogs}
              closeDisabled={profiles.isPending}
              initialFocusRef={profileNameInput}
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  changeProfile({ kind: 'copy' });
                }}
              >
                <label>
                  Name
                  <input
                    ref={profileNameInput}
                    autoFocus
                    required
                    maxLength={80}
                    readOnly={busy}
                    value={profileName}
                    onChange={(event) => {
                      if (profileSubmission.current || busy) return;
                      profiles.reset();
                      setProfileName(event.target.value);
                    }}
                    placeholder="Evening technology"
                  />
                </label>
                <p className="form-hint">
                  Copies your setup with automatic preparation off. Choose the new room, then make it available in
                  Advanced room options before enabling preparation or DJ breaks. You can finish incomplete setup later.
                </p>
                <ErrorNotice error={profiles.error} />
                <DialogActions>
                  <Button type="button" aria-disabled={profiles.isPending || undefined} onClick={closeProfileDialogs}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!profileName.trim()}
                    aria-disabled={busy || undefined}
                    aria-busy={profiles.isPending || undefined}
                  >
                    {profiles.isPending ? 'Saving…' : 'Save room'}
                  </Button>
                </DialogActions>
              </form>
            </Dialog>
          )}
          {switchTarget && (
            <Dialog title="Switch listening rooms?" close={closeProfileDialogs} closeDisabled={profiles.isPending}>
              <p>
                You have unsaved changes to {activeProfile?.name ?? 'your current room'}. Save them before switching, or
                discard them. Saved scripts and recordings stay unchanged.
              </p>
              <ErrorNotice error={profiles.error} />
              <DialogActions>
                <Button aria-disabled={profiles.isPending || undefined} onClick={closeProfileDialogs}>
                  Cancel
                </Button>
                <Button
                  aria-disabled={busy || undefined}
                  onClick={() => changeProfile({ kind: 'switch', id: switchTarget, saveChanges: false })}
                >
                  Discard and switch
                </Button>
                <Button
                  variant="primary"
                  aria-disabled={busy || undefined}
                  aria-busy={profiles.isPending || undefined}
                  onClick={() => changeProfile({ kind: 'switch', id: switchTarget, saveChanges: true })}
                >
                  {profiles.isPending ? 'Switching…' : 'Save and switch'}
                </Button>
              </DialogActions>
            </Dialog>
          )}
        </>
      )}
    </>
  );
}
