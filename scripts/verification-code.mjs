import { registerHooks } from 'node:module';
import { URL } from 'node:url';

import { transformSync } from 'esbuild';
import { parseSync, Visitor } from 'rolldown/utils';

const sourceRoot = new URL('../src/', import.meta.url).href;

function registerFixtureImports() {
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!context.parentURL?.startsWith(sourceRoot)) return nextResolve(specifier, context);
      // Preserve the original ESM imports' package conditions in CommonJS fixtures.
      const conditions = [...context.conditions.filter((condition) => condition !== 'require'), 'import'];
      return nextResolve(specifier, { ...context, conditions });
    },
  });
}

function compile(source, filename = 'fixture.ts') {
  return transformSync(source, {
    sourcefile: filename,
    loader: filename.endsWith('.tsx') ? 'tsx' : 'ts',
    format: 'cjs',
    target: 'es2022',
    tsconfigRaw: { compilerOptions: { useDefineForClassFields: true } },
  }).code;
}

function parse(source, filename = 'fixture.tsx') {
  const result = parseSync(filename, source, { lang: filename.endsWith('.tsx') ? 'tsx' : 'ts' });
  if (result.errors.length) {
    throw new SyntaxError(`${filename}: ${result.errors.map((error) => error.message).join('\n')}`);
  }
  return result.program;
}

export { compile, parse, Visitor, registerFixtureImports };
