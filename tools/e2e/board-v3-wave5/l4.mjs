import { pathToFileURL } from 'node:url';
const WT = 'E:/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21';
global.window = global.window || {}; global.localStorage = { getItem: () => null, setItem() {} };
try { const { askErrorText } = await import(pathToFileURL(WT + '/app/ui/card/steps.js').href);
for (const code of ['already-handled', 'already_handled', 'not-open', 'no-steps', 'stale-steps', 'secret-refused', 'round-cap', 'other-thing'])
  for (const lang of ['en', 'ar']) console.log(code, lang, '=>', askErrorText(code, lang)); } catch (e) { console.log('IMPORT FAIL', e.message.slice(0, 200)); }
