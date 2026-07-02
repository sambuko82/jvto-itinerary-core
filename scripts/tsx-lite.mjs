#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, '.tmp', 'tsx-lite');
const tsPath = existsSync(join(root, 'node_modules', 'typescript', 'lib', 'typescript.js'))
  ? join(root, 'node_modules', 'typescript', 'lib', 'typescript.js')
  : '/root/.nvm/versions/node/v20.20.2/lib/node_modules/typescript/lib/typescript.js';
if (!existsSync(tsPath)) {
  console.error(`tsx-lite: TypeScript runtime not found at ${tsPath}`);
  process.exit(127);
}
const ts = await import(pathToFileURL(tsPath).href);
const args = process.argv.slice(2);
const isTest = args[0] === '--test';
const entryArgs = isTest ? args.slice(1) : args;

function listTs(dir) {
  const found = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of readdirSync(cur)) {
      if (name === 'node_modules' || name === '.git' || name === '.tmp') continue;
      const p = join(cur, name);
      const st = statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) found.push(p);
    }
  }
  return found;
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });
writeFileSync(join(outRoot, 'package.json'), '{"type":"module"}\n');
mkdirSync(join(outRoot, 'node_modules'), { recursive: true });
try { symlinkSync(join(root, 'vendor', 'zod-lite'), join(outRoot, 'node_modules', 'zod'), 'dir'); } catch {}
for (const file of await listTs(join(root, 'src'))) {
  const rel = relative(root, file).replace(/\.ts$/, '.js');
  const out = join(outRoot, rel);
  mkdirSync(dirname(out), { recursive: true });
  const src = readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, esModuleInterop: true, skipLibCheck: true }
  }).outputText;
  writeFileSync(out, js);
  writeFileSync(out.replace(/\.js$/, '.ts'), src);
}

const mapped = entryArgs.map((arg, i) => {
  if (arg.startsWith('src/') && arg.endsWith('.ts')) return join(outRoot, arg.replace(/\.ts$/, '.js'));
  if (i === 0 && arg.endsWith('.ts')) return join(outRoot, relative(root, resolve(arg)).replace(/\.ts$/, '.js'));
  return arg;
});
const nodeArgs = isTest ? ['--test', ...mapped] : mapped;
const result = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit', cwd: root, env: process.env });
process.exit(result.status ?? 1);
