import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'tools/**', '.superpowers/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts', 'src/audio/director.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'three', message: 'O core e o director são puros: sem three.' }], patterns: ['three/*'] },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'navigator'].map((name) => ({
          name,
          message: 'O core e o director são puros: sem APIs do navegador.',
        })),
      ],
    },
  },
);
