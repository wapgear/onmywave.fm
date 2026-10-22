import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/manrope/600.css';
import App from './App';
import { AppUpdates } from './components/AppUpdates/AppUpdates.component';
import { RenderErrorBoundary } from './components/RenderErrorBoundary/RenderErrorBoundary.component';
import { retainNewestLocalState } from './local-state-cache';
import { restoreTheme } from './theme';

import './styles.css';
import './themes.css';

restoreTheme();

function onError(error: unknown) {
  const failure = error as { code?: string; authRevision?: number };
  const connection = queryClient.getQueryData<import('../shared/types').Connection | null>(['connection']);
  if (failure?.code === 'unauthorized' && connection && failure.authRevision === connection.authRevision)
    window.dispatchEvent(new CustomEvent('wave:auth-expired', { detail: { authRevision: failure.authRevision } }));
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (!query.meta?.aiOperation) onError(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!mutation.options.meta?.authAttempt && !mutation.options.meta?.aiOperation) onError(error);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) =>
        count < 1 &&
        !['unauthorized', 'forbidden', 'invalid', 'not-found'].includes((error as { code?: string }).code ?? ''),
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

queryClient.setQueryDefaults(['localState'], { structuralSharing: retainNewestLocalState });

ReactDOM.createRoot(document.getElementById('root')!, {
  onCaughtError: () => console.error('[render-error] caught'),
  onUncaughtError: () => console.error('[render-error] uncaught'),
  onRecoverableError: () => console.error('[render-error] recoverable'),
}).render(
  <React.StrictMode>
    <RenderErrorBoundary scope="root">
      <QueryClientProvider client={queryClient}>
        <App />
        <AppUpdates />
      </QueryClientProvider>
    </RenderErrorBoundary>
  </React.StrictMode>,
);
