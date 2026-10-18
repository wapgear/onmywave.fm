import { useRef, useState } from 'react';
import { unwrap } from '../../api';
import './TwitterSetupHelp.styles.css';

const links = { console: 'https://developer.x.com/', token: 'https://docs.x.com/fundamentals/authentication/oauth-2-0/bearer-tokens', pricing: 'https://docs.x.com/x-api/getting-started/pricing' };

export function TwitterSetupHelp() {
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const request = useRef(0);
  async function open(url: string) {
    const current = ++request.current;
    setErrorUrl(null);
    try { unwrap(await window.wave.openSource(url)); }
    catch { if (current === request.current) setErrorUrl(url); }
  }
  const feedback = (url: string) => errorUrl === url ? <span className="twitter-help-error" role="alert">Could not open this page. Try again.</span> : null;
  return <details className="twitter-setup-help">
    <summary>How do I get a Twitter / X token?</summary>
    <p>Twitter requires developer setup. Your usual X login alone does not connect it. RSS and Hacker News work without a source token.</p>
    <ol>
      <li><div className="twitter-help-console"><button type="button" className="twitter-help-link" onClick={() => void open(links.console)}>X developer console</button>{feedback(links.console)}</div>Sign in and complete developer account setup.</li>
      <li>Create or select an app. Open its <strong>Keys and tokens</strong> page, then generate or copy the <strong>Bearer Token</strong>.</li>
      <li>Paste the Bearer Token into Twitter / X under <strong>Settings → Provider keys</strong> and save it. An API key or access token is a different credential.</li>
      <li>Check that the app can use <strong>recent search</strong> and has API credits. X API usage is paid separately from this app; review the current cost before preparing Twitter news.</li>
    </ol>
    <p>Saving a token stores it; access is checked when you prepare news.</p>
    <div className="twitter-help-links"><div className="twitter-help-action"><button type="button" onClick={() => void open(links.token)}>Official token guide ↗</button>{feedback(links.token)}</div><div className="twitter-help-action"><button type="button" onClick={() => void open(links.pricing)}>API pricing ↗</button>{feedback(links.pricing)}</div></div>
  </details>;
}
