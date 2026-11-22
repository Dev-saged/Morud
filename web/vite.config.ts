import react from '@vitejs/plugin-react';
import { readFileSync, existsSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

// رقم الإصدار وملخص «ما الجديد» من version.json وdocs/releases، ورقم بناء فريد لكل نشر
const version = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8')).version as string;
const build = process.env.GITHUB_RUN_NUMBER ?? String(Math.floor(Date.now() / 1000));
function notes(): { headline: string; items: string[] } {
  const f = new URL(`../docs/releases/v${version}.md`, import.meta.url);
  if (!existsSync(f)) return { headline: '', items: [] };
  const md = readFileSync(f, 'utf8');
  const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1').trim();
  const headline = clean((md.match(/^# (.+)$/m)?.[1] ?? '').split('—').slice(1).join('—') || '');
  const items = [...md.matchAll(/^- (.+)$/gm)].slice(0, 4).map((m) => clean(m[1]!).split(':')[0]!.split('.')[0]!);
  return { headline, items };
}

/** يكتب version.json في البناء: الواجهة تقارنه بما تعمل عليه لتعرض «تحديث متاح». */
function versionFile(): Plugin {
  return {
    name: 'mawred-version',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, build, ...notes() }) }); },
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(version), __APP_BUILD__: JSON.stringify(build) },
  server: { fs: { allow: ['..'] } },
  build: {
    target: 'es2022', sourcemap: false,
    // Firebase وReact في ملفات ثابتة تبقى في كاش المتصفح بين الإصدارات؛ التحديث ينزّل كود مورد فقط
    rollupOptions: { output: { manualChunks(id) { if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase'; if (id.includes('node_modules/react')) return 'react'; return undefined; } } },
  },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'] },
});
