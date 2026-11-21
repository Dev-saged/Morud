// يجد مساحة KV باسم معيّن أو ينشئها، ويطبع معرّفها (ليس سراً)
import { execFileSync } from 'node:child_process';
const title = process.argv[2] ?? 'mawred-kv';
const run = (...a) => execFileSync('npx', ['wrangler', ...a], { encoding: 'utf8', cwd: 'worker' });
const list = JSON.parse(run('kv', 'namespace', 'list'));
let ns = list.find((n) => n.title === title);
if (!ns) { run('kv', 'namespace', 'create', title); ns = JSON.parse(run('kv', 'namespace', 'list')).find((n) => n.title === title); }
if (!ns) { console.error('تعذّر إنشاء مساحة KV'); process.exit(1); }
console.log(ns.id);
