import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'tools/**', '.superpowers/**'] },
  ...tseslint.configs.recommended,
  {
    files: [
      'src/core/**/*.ts',
      'src/sim/**/*.ts',
      'src/audio/director.ts',
      'src/net/room-code.ts',
      'src/net/protocol.ts',
      'src/net/snapshots.ts',
      'src/net/host-rules.ts',
      'src/input/stick.ts',
      'src/input/touch.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'three', message: 'Os módulos puros (core, sim, net e director) não importam three.' }], patterns: ['three/*'] },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'navigator'].map((name) => ({
          name,
          message: 'Os módulos puros (core, sim, net e director) não usam APIs do navegador.',
        })),
      ],
    },
  },
);
