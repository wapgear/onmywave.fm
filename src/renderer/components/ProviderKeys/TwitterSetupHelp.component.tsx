import { useState } from 'react';
import { unwrap } from '../../api';
import { ErrorNotice } from '../Shared';
import './TwitterSetupHelp.styles.css';

export function TwitterSetupHelp() {
  const [error, setError] = useState<Error | null>(null);
  async function open(url: string) {
    setError(null);
    try { unwrap(await window.wave.openSource(url)); }
    catch (cause) { setError(cause instanceof Error ? cause : new Error('Could not open the setup guide.')); }
  }
  return <details className="twitter-setup-help">
    <summary>How do I get a Twitter / X token?</summary>
    <p>Twitter requires developer setup. Your usual X login alone does not connect it. RSS and Hacker News work without a source token.</p>
    <ol>
      <li>Open the <button type="button" className="twitter-help-link" onClick={() => void open('https://developer.x.com/')}>X developer console</button>, sign in, and complete developer account setup.</li>
      <li>Create or select an app. Open its <strong>Keys and tokens</strong> page, then generate or copy the <strong>Bearer Token</strong>.</li>
      <li>Paste the Bearer Token into Twitter / X under <strong>Settings → Provider keys</strong> and save it. An API key or access token is a different credential.</li>
      <li>Check that the app can use <strong>recent search</strong> and has API credits. X API usage is paid separately from this app; review the current cost before preparing Twitter news.</li>
    </ol>
    <p>Saving a token stores it; access is checked when you prepare news.</p>
    <div className="twitter-help-links"><button type="button" onClick={() => void open('https://docs.x.com/fundamentals/authentication/oauth-2-0/bearer-tokens')}>Official token guide ↗</button><button type="button" onClick={() => void open('https://docs.x.com/x-api/getting-started/pricing')}>API pricing ↗</button></div>
    <ErrorNotice error={error} />
  </details>;
}
