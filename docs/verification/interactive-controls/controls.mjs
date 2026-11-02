import React from 'react';
      import { createRoot } from 'react-dom/client';
      import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
const { Button } = await import('../../../src/renderer/components/Button/Button.component.tsx');
      import '../../../src/renderer/styles.css';
      import '../../../src/renderer/themes.css';
      const h = React.createElement;
      createRoot(document.getElementById('controls')).render(
        h(React.Fragment, null,
          h('h1', null, 'Control states'),
          h('p', null, 'Actual shared Button and production styles. Actions have no side effects.'),
          h('section', { 'aria-label': 'Button variants' },
            ...['secondary', 'primary', 'destructive', 'ghost', 'link'].map(variant => h(Button, { key: variant, id: variant, variant, type: 'button' }, variant))),
          h('section', { 'aria-label': 'Unavailable actions' },
            h(Button, { id: 'disabled-link', variant: 'link', disabled: true }, 'Disabled link'),
            h(Button, { id: 'aria-disabled-link', variant: 'link', 'aria-disabled': 'true' }, 'Unavailable link')),
          h('section', { 'aria-label': 'Wrapping' },
            h(Button, { id: 'wrapped-link', variant: 'link', style: { maxWidth: 160 } }, 'Manage hosts and host instructions')),
          h('details', null, h('summary', { id: 'disclosure' }, 'Disclosure'), h('p', null, 'Disclosure content')),
          h('section', { 'aria-label': 'Intentional failing target' },
            h(Button, { id: 'broken-link', variant: 'link', style: { minHeight: 12, height: 12, padding: 0, fontSize: 10, lineHeight: '12px' } }, 'Broken fixture'))
        )
      );
