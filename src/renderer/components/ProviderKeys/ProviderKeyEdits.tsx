import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { unwrap } from '../../api';

type Provider = 'openai' | 'elevenlabs' | 'twitter';

const statusKeys = { openai: 'aiStatus', elevenlabs: 'elevenLabsStatus', twitter: 'twitterStatus' } as const;

function useEdit(provider: Provider, sessionId: string | null) {
  const client = useQueryClient();
  const [draft, setDraft] = useState('');
  const session = useRef(sessionId);
  const revision = useRef(0);
  const submission = useRef<{ value: string | null; revision: number } | null>(null);
  const queryKey = [statusKeys[provider]];
  const mutationKey = ['providerKey', provider];
  const pending = useIsMutating({ mutationKey, exact: true }) > 0;
  const save = useMutation({
    mutationKey,
    meta: { aiOperation: true },
    onMutate: async () => {
      const input = submission.current;
      if (!input) throw new Error('Choose a provider key change before saving.');
      await client.cancelQueries({ queryKey, exact: true });
      return { revision: input.revision };
    },
    mutationFn: async () => {
      const input = submission.current;
      if (!input) throw new Error('Choose a provider key change before saving.');
      return unwrap(
        await (provider === 'openai'
          ? window.wave.setOpenAiKey(input.value)
          : provider === 'elevenlabs'
            ? window.wave.setElevenLabsKey(input.value)
            : window.wave.setTwitterKey(input.value)),
      );
    },
    onSuccess: async (value, _variables, context) => {
      await client.cancelQueries({ queryKey, exact: true });
      client.setQueryData(queryKey, value);
      if (context?.revision === revision.current) setDraft('');
    },
    onError: () => {
      void client
        .cancelQueries({ queryKey, exact: true })
        .then(() => client.invalidateQueries({ queryKey, exact: true }));
    },
    onSettled: () => {
      submission.current = null;
    },
  });
  const { reset } = save;

  useLayoutEffect(() => {
    if (session.current === sessionId) return;
    session.current = sessionId;
    ++revision.current;
    setDraft('');
    reset();
  }, [sessionId, reset]);

  return {
    draft,
    pending,
    error: save.error,
    queryKey,
    setDraft(value: string) {
      if (submission.current || pending) return;
      save.reset();
      setDraft(value);
    },
    submit(value: string | null) {
      if (submission.current || pending || (value !== null && !value.trim())) return;
      submission.current = { value, revision: revision.current };
      save.mutate();
    },
  };
}

const ProviderKeyEdits = createContext<Record<Provider, ReturnType<typeof useEdit>> | null>(null);

export function ProviderKeyEditsProvider({ sessionId, children }: { sessionId: string | null; children: ReactNode }) {
  const openai = useEdit('openai', sessionId);
  const elevenlabs = useEdit('elevenlabs', sessionId);
  const twitter = useEdit('twitter', sessionId);

  return <ProviderKeyEdits.Provider value={{ openai, elevenlabs, twitter }}>{children}</ProviderKeyEdits.Provider>;
}

export function useProviderKeyEdit(provider: Provider) {
  const edits = useContext(ProviderKeyEdits);
  if (!edits) throw new Error('Provider key editing requires its app owner.');
  return edits[provider];
}
