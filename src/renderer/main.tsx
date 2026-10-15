import React from 'react';
import ReactDOM from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/manrope/600.css';
import App from './App';
import './styles.css';
function onError(error: unknown) { if ((error as { code?: string })?.code === 'unauthorized') window.dispatchEvent(new Event('wave:auth-expired')); }
const queryClient = new QueryClient({ queryCache: new QueryCache({ onError: (error, query) => { if (!query.meta?.aiOperation) onError(error); } }), mutationCache: new MutationCache({ onError: (error, _variables, _context, mutation) => { if (!mutation.options.meta?.authAttempt && !mutation.options.meta?.aiOperation) onError(error); } }), defaultOptions: { queries: { staleTime: 30_000, retry: (count, error) => count < 1 && !['unauthorized', 'forbidden', 'invalid', 'not-found'].includes((error as { code?: string }).code ?? ''), refetchOnWindowFocus: false }, mutations: { retry: false } } });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>);
