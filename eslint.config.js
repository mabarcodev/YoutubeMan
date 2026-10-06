import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.venv/**',
      'coverage/**',
      'videos/**',
      '**/salida/**',
      '**/revision/**',
      '**/.render-tmp/**',
    ],
  },
  js.configs.recommended,
  {
    // Herramientas y tests: Node. window/document/requestAnimationFrame aparecen dentro de page.evaluate(),
    // que se ejecuta en el navegador (y en algunos tests con un DOM falso).
    files: ['tools/**/*.mjs', 'tests/**/*.mjs', 'ejemplos/**/*.mjs', '*.js', '*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, window: 'readonly', document: 'readonly', requestAnimationFrame: 'readonly' },
    },
  },
  {
    // Motor, plantillas y escenas: navegador (y los módulos puros también se importan desde Node en los tests).
    files: ['engine/**/*.js', 'templates/**/*.js', 'smoke/**/*.js', 'ejemplos/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
];
