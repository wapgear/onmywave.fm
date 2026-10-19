import { builtinModules } from 'node:module';

import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import hooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

import componentTypes from './scripts/eslint-rules/component-types.mjs';


const restrictedRendererModules = [
  ...new Set([...builtinModules, ...builtinModules.map((name) => 'node:' + name), 'electron']),
];

const synchronousIpc = [
  {
    selector: "CallExpression[callee.property.name='sendSync'], CallExpression[callee.property.value='sendSync']",
    message: 'Use asynchronous typed IPC instead of synchronous IPC.',
  },
  {
    selector:
      "AssignmentExpression[left.property.name='returnValue'], AssignmentExpression[left.property.value='returnValue']",
    message: 'Use asynchronous IPC handlers instead of synchronous event.returnValue replies.',
  },
];

const memoDeclaration = {
  selector:
    'VariableDeclaration[declarations.0.init.callee.name=/^(useMemo|useCallback|memo)$/], VariableDeclaration[declarations.0.init.callee.object.name="React"][declarations.0.init.callee.property.name=/^(useMemo|useCallback|memo)$/]',
};

const effectStatement = {
  selector:
    'ExpressionStatement[expression.callee.name=/^(useEffect|useLayoutEffect|useInsertionEffect)$/], ExpressionStatement[expression.callee.object.name="React"][expression.callee.property.name=/^(useEffect|useLayoutEffect|useInsertionEffect)$/]',
};

const topLevelFunction = {
  selector:
    'Program > :matches(FunctionDeclaration, ClassDeclaration, ExportNamedDeclaration[declaration.type=/^(FunctionDeclaration|ClassDeclaration)$/], ExportDefaultDeclaration[declaration.type=/^(FunctionDeclaration|ClassDeclaration)$/], VariableDeclaration[declarations.0.init.type=/^(ArrowFunctionExpression|FunctionExpression)$/], ExportNamedDeclaration[declaration.declarations.0.init.type=/^(ArrowFunctionExpression|FunctionExpression)$/])',
};

const jsxReturn = { selector: 'ReturnStatement[argument.type=/^(JSXElement|JSXFragment)$/]' };

export default tseslint.config(
  { ignores: ['out/**', 'release/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        {
          blankLine: 'always',
          prev: { selector: 'Program > :not(ImportDeclaration)' },
          next: { selector: 'Program > :not(ImportDeclaration)' },
        },
        { blankLine: 'always', prev: '*', next: topLevelFunction },
        { blankLine: 'always', prev: topLevelFunction, next: '*' },
        { blankLine: 'always', prev: '*', next: memoDeclaration },
        { blankLine: 'always', prev: memoDeclaration, next: '*' },
        { blankLine: 'always', prev: '*', next: effectStatement },
        { blankLine: 'always', prev: effectStatement, next: '*' },
        { blankLine: 'always', prev: '*', next: jsxReturn },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedRendererModules.map((name) => ({
            name,
            message: 'Use the typed window.wave bridge; renderer code cannot import Electron or Node APIs.',
          })),
          patterns: [
            {
              group: ['node:*', 'electron/*', '@electron/remote', '@electron/remote/*'],
              message: 'Use the typed window.wave bridge.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: [
            'ImportExpression[source.value=/^node:/]',
            'ImportExpression[source.value=/^electron\\//]',
            'ImportExpression[source.value=/^@electron\\/remote/]',
            ...restrictedRendererModules.map((name) => `ImportExpression[source.value=${JSON.stringify(name)}]`),
          ].join(', '),
          message:
            'Renderer code must use the typed window.wave bridge instead of dynamically importing Node or Electron.',
        },
      ],
    },
  },
  {
    files: ['src/main/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...synchronousIpc,
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
        {
          selector:
            "Property[key.name='webSecurity'][value.value=false], Property[key.value='webSecurity'][value.value=false]",
          message: 'Keep Electron web security enabled.',
        },
        {
          selector:
            'Property[key.name=/^(allowRunningInsecureContent|experimentalFeatures|nodeIntegrationInWorker|nodeIntegrationInSubFrames|webviewTag)$/][value.value=true], Property[key.value=/^(allowRunningInsecureContent|experimentalFeatures|nodeIntegrationInWorker|nodeIntegrationInSubFrames|webviewTag)$/][value.value=true]',
          message: 'Do not enable insecure content, experimental features, additional Node integration, or webviews.',
        },
      ],
    },
  },
  {
    files: ['src/preload/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...synchronousIpc] },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ignores: ['**/*.types.ts', '**/*.d.ts'],
    plugins: { local: { rules: { 'component-types': componentTypes } } },
    rules: { 'local/component-types': 'error' },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: { ...hooks.configs.recommended.rules, 'react-hooks/component-hook-factories': 'error' },
  },
);
