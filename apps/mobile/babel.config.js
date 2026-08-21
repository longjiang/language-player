module.exports = function (api) {
  api.cache(true);
  const glyphTextPlugin = ({ types: t }) => ({
    visitor: {
      Program(path, state) {
        // Only transform app source. React Native's own dependency files also
        // contain <Text> elements; injecting an app alias into node_modules
        // makes Metro try to resolve that alias from the dependency directory.
        if (!state.filename || /[\\/]node_modules[\\/]/.test(state.filename)) return;
        // GlyphText itself deliberately renders NativeText directly.
        if (/[\\/]components[\\/]GlyphText\.[jt]sx$/.test(state.filename)) return;

        let hasTextElement = false;
        path.traverse({
          JSXOpeningElement(elementPath) {
            if (elementPath.node.name.type === 'JSXIdentifier' && elementPath.node.name.name === 'Text') {
              hasTextElement = true;
            }
          },
        });
        if (!hasTextElement) return;

        path.traverse({
          JSXIdentifier(identifierPath) {
            const parent = identifierPath.parentPath.node;
            if (
              identifierPath.node.name === 'Text' &&
              (t.isJSXOpeningElement(parent) || t.isJSXClosingElement(parent)) &&
              t.isJSXIdentifier(parent.name)
            ) {
              identifierPath.node.name = 'GlyphText';
            }
          },
        });

        path.unshiftContainer(
          'body',
          t.importDeclaration(
            [t.importSpecifier(t.identifier('GlyphText'), t.identifier('GlyphText'))],
            t.stringLiteral('@/components/GlyphText'),
          ),
        );
      },
    },
  });

  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [glyphTextPlugin],
  };
};
