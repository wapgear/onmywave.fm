import { builtinModules } from 'node:module';

const restrictedRendererModules = [
  ...new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`), 'electron']),
];

const rendererDynamicImports = [
  'ImportExpression[source.value=/^node:/]',
  'ImportExpression[source.value=/^electron\\//]',
  'ImportExpression[source.value=/^@electron\\/remote/]',
  ...restrictedRendererModules.map((name) => `ImportExpression[source.value=${JSON.stringify(name)}]`),
].join(', ');

const synchronousIpc = [
  "CallExpression[callee.property.name='sendSync']",
  "CallExpression[callee.property.value='sendSync']",
  "AssignmentExpression[left.property.name='returnValue']",
  "AssignmentExpression[left.property.value='returnValue']",
];

const unsafeElectronOptions = [
  "Property[key.name='nodeIntegration'][value.value=true]",
  "Property[key.value='nodeIntegration'][value.value=true]",
  "Property[key.name='contextIsolation'][value.value=false]",
  "Property[key.value='contextIsolation'][value.value=false]",
  "Property[key.name='sandbox'][value.value=false]",
  "Property[key.value='sandbox'][value.value=false]",
  "Property[key.name='webSecurity'][value.value=false]",
  "Property[key.value='webSecurity'][value.value=false]",
  'Property[key.name=/^(allowRunningInsecureContent|experimentalFeatures|nodeIntegrationInWorker|nodeIntegrationInSubFrames|webviewTag)$/][value.value=true]',
  'Property[key.value=/^(allowRunningInsecureContent|experimentalFeatures|nodeIntegrationInWorker|nodeIntegrationInSubFrames|webviewTag)$/][value.value=true]',
];

function restrictedSyntax(selectors, message) {
  return {
    meta: {
      type: 'problem',
      docs: { description: message },
      schema: [],
      messages: { restricted: message },
    },
    create(context) {
      return Object.fromEntries(
        selectors.map((selector) => [
          selector,
          (node) => {
            context.report({ node, messageId: 'restricted' });
          },
        ]),
      );
    },
  };
}

export default {
  rules: {
    'renderer-dynamic-imports': restrictedSyntax(
      [rendererDynamicImports],
      'Renderer code must use the typed window.wave bridge instead of dynamically importing Node or Electron.',
    ),
    'synchronous-ipc': restrictedSyntax(
      synchronousIpc,
      'Use asynchronous typed IPC instead of synchronous IPC or event.returnValue replies.',
    ),
    'unsafe-electron-options': restrictedSyntax(
      unsafeElectronOptions,
      'Keep Electron renderer security options enabled and do not enable webviews or insecure features.',
    ),
  },
};
