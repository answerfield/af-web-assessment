// Writes public/bundles/index.json from all *.bundle.json below public/bundles/ (no CLI needed).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../public/bundles');

function* files(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* files(path);
        else if (entry.name.endsWith('.bundle.json')) yield path;
    }
}

mkdirSync(out, { recursive: true });
const index = [];
for (const path of files(out)) {
    const json = readFileSync(path, 'utf8');
    const bundle = JSON.parse(json);
    // path as URL: always forward slashes (also on Windows)
    const file = relative(join(out, '..'), path).split(sep).join('/');
    for (const b of bundle.booklets ?? []) {
        index.push({ file, booklet: b.name, title: b.title ?? b.name, sha256: createHash('sha256').update(json).digest('hex') });
    }
}
index.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`${index.length} Testheft(e) in public/bundles/index.json`);
