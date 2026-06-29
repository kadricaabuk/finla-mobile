import * as esbuild from './node_modules/esbuild/lib/main.js';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';

mkdirSync('dist', { recursive: true });

const shared = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  jsx: 'automatic',
  platform: 'browser',
  target: 'es2020',
};

await esbuild.build({ ...shared, format: 'esm', outfile: 'dist/index.esm.js' });
await esbuild.build({ ...shared, format: 'cjs', outfile: 'dist/index.cjs.js' });

execSync(
  'node ../node_modules/typescript/bin/tsc --project tsconfig.json --emitDeclarationOnly',
  { stdio: 'inherit' }
);

console.log('✓ finla-web-ds build complete');
