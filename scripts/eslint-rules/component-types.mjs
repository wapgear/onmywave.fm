import { basename } from 'node:path';


export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Keep exported and multiline renderer types in colocated type files.' },
    schema: [],
    messages: {
      extract: 'Move {{name}} to {{file}}. Only single-line, non-exported local types may stay here.',
    },
  },
  create(context) {
    const file = basename(context.filename).replace(/(?:\.(?:component|page))?\.tsx?$/, '.types.ts');
    const exportedNames = new Set();
    const multiline = (node) => node.loc.start.line !== node.loc.end.line;
    const report = (node, name) => context.report({ node, messageId: 'extract', data: { name, file } });
    const checkDeclaration = (node) => {
      const exported =
        node.parent.type === 'ExportNamedDeclaration' ||
        node.parent.type === 'ExportDefaultDeclaration' ||
        (node.parent.type === 'Program' && exportedNames.has(node.id.name));
      if (exported || multiline(node)) report(node, node.id.name);
    };
    const checkProps = (node) => {
      let owner = node;
      while (owner.parent?.type === 'CallExpression') owner = owner.parent;
      const name = node.id?.name ?? (owner.parent?.type === 'VariableDeclarator' ? owner.parent.id.name : undefined);
      if (!name || !/^[A-Z]/.test(name)) return;
      for (const parameter of node.params) {
        const type = parameter.typeAnnotation?.typeAnnotation;
        if (type && ['TSTypeLiteral', 'TSIntersectionType'].includes(type.type) && multiline(type)) {
          report(type, `${name}Props`);
        }
      }
    };
    return {
      Program(node) {
        for (const statement of node.body) {
          if (statement.type === 'ExportNamedDeclaration' && !statement.source) {
            for (const specifier of statement.specifiers) exportedNames.add(specifier.local.name);
          }
          if (statement.type === 'ExportDefaultDeclaration' && statement.declaration.type === 'Identifier') {
            exportedNames.add(statement.declaration.name);
          }
        }
      },
      TSTypeAliasDeclaration: checkDeclaration,
      TSInterfaceDeclaration: checkDeclaration,
      FunctionDeclaration: checkProps,
      FunctionExpression: checkProps,
      ArrowFunctionExpression: checkProps,
    };
  },
};
