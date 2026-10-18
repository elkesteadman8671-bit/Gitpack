import { build } from 'esbuild';
import { writeFile, readFile } from 'node:fs/promises';
const controller=await readFile('src/controller.js','utf8');
const render=await readFile('src/render.js','utf8');
const experience=await readFile('src/experience.js','utf8');
const markup={auth:await readFile('src/auth-panels.html','utf8'),workspace:await readFile('src/workspace-panels.html','utf8')};
await writeFile('dist/app.js','const EXPERIENCE_UI='+JSON.stringify(markup)+';\n'+controller.replace('// RENDER_FUNCTION_INSERTION_POINT',render).replace('// EXPERIENCE_CODE_INSERTION_POINT',experience));
let existing={};
try { const text=await readFile('dist/config.js','utf8');existing=JSON.parse(text.match(/Object\.freeze\((\{.*\})\)/s)?.[1]||'{}'); } catch {}
const url = process.env.SUPABASE_URL || existing.supabaseUrl || '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || existing.supabaseKey || '';
if (process.env.GITHUB_ACTIONS && (!url || !key)) throw new Error('Set repository variables SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before deployment.');
if (url || key) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) throw new Error('Expected an HTTPS Supabase project URL.');
  let publicKey = key.startsWith('sb_publishable_');
  if (!publicKey) {
    try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch {}
  }
  if (!publicKey) throw new Error('Only a publishable key or legacy anon key is allowed. Never use a service_role or secret key.');
  await writeFile('dist/config.js', `window.LIXING_CONFIG = Object.freeze(${JSON.stringify({supabaseUrl:url.replace(/\/$/,''),supabaseKey:key})});\n`);
}
await build({stdin:{contents:'export { createClient } from "@supabase/supabase-js"',resolveDir:process.cwd(),loader:'js'},bundle:true,format:'iife',globalName:'LixingSupabase',platform:'browser',target:'es2022',outfile:'dist/vendor.js',minify:true,legalComments:'eof'});
const pkg=JSON.parse(await readFile('node_modules/@supabase/supabase-js/package.json','utf8'));
await writeFile('dist/THIRD_PARTY_LICENSES.txt',`@supabase/supabase-js ${pkg.version} and its bundled dependencies\nSource: https://github.com/supabase/supabase-js\n\n`+await readFile('node_modules/@supabase/supabase-js/LICENSE','utf8'));
await writeFile('dist/.nojekyll','');
console.log('Built static app with Supabase JS '+pkg.version);
