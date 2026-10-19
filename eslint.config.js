import { builtinModules } from 'node:module';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['out/**', 'release/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...new Set([...builtinModules, ...builtinModules.map((name) => 'node:' + name), 'electron'])].map(
            (name) => ({
              name,
              message: 'Use the typed window.wave bridge; renderer code cannot import Electron or Node APIs.',
            }),
          ),
        },
      ],
    },
  },
  {
    files: ['src/main/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Property[key.name='nodeIntegration'][value.value=true], Property[key.value='nodeIntegration'][value.value=true]",
          message: 'Renderer Node integration must remain disabled.',
        },
        {
          selector:
            "Property[key.name='contextIsolation'][value.value=false], Property[key.value='contextIsolation'][value.value=false]",
          message: 'Keep Electron context isolation enabled.',
        },
        {
          selector: "Property[key.name='sandbox'][value.value=false], Property[key.value='sandbox'][value.value=false]",
          message: 'Keep renderer sandboxing enabled.',
        },
      ],
    },
  },
  {
    files: ['src/preload/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='ipcRenderer'][callee.property.name='sendSync']",
          message: 'Expose asynchronous typed IPC methods instead of blocking the renderer.',
        },
      ],
    },
  },
  { files: ['src/renderer/**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks }, rules: hooks.configs.recommended.rules },
);
