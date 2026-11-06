// Dev server for an app using the AF packages from the workspace: `tsc --watch` keeps their output (out/) current,
// and `ng serve` does not prebundle them (angular.json: prebundle.exclude), so it reloads on changes.
// Run from the app folder: node ../serve.mjs [ng serve options]
// Watched are the @answerfield/* packages the app depends on (also through each other) that are folders of this
// checkout with a tsconfig.json; the others come prebuilt from node_modules.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../packages');
const read = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const own = (manifest) => Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })
    .filter(name => name.startsWith('@answerfield/'));

/** Package name to folder, for every package folder of this checkout. */
const folders = new Map(existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter(e => e.isDirectory() && existsSync(join(root, e.name, 'package.json')))
        .map(e => [read(join(root, e.name)).name, join(root, e.name)])
    : []);

const found = new Set();
const pending = own(read(process.cwd()));
while (pending.length) {
    const name = pending.pop();
    if (found.has(name) || !folders.has(name)) continue;
    found.add(name);
    pending.push(...own(read(folders.get(name))));
}
const packages = [...found].map(name => folders.get(name)).filter(dir => existsSync(join(dir, 'tsconfig.json'))).sort();

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const tsc = packages.length ? run('npx', ['tsc', '-b', '--watch', '--preserveWatchOutput', ...packages]) : undefined;
const ng = run('npx', ['ng', 'serve', ...process.argv.slice(2)]);
const stop = () => { tsc?.kill(); ng.kill(); };
ng.on('exit', code => { tsc?.kill(); process.exit(code ?? 0); });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
