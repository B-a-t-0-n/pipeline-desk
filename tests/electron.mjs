import {_electron as electron} from 'playwright';
import {fileURLToPath} from 'node:url';

export function launchElectron(options) {
  const preload = options.executablePath ? [] : ['--require', fileURLToPath(new URL('./fixtures/system-keyring.cjs', import.meta.url))];
  return electron.launch({...options, chromiumSandbox:true, args:[...preload, ...(options.args || [])]});
}

export async function overviewPage(app) {
  await app.firstWindow();
  // Restored widgets may finish loading before the overview on Linux.
  for (let attempt=0; attempt<100; attempt++) {
    const page=app.windows().find(page=>page.url().includes('/ui/index.html')&&!new URL(page.url()).searchParams.has('widget'));
    if (page) return page;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error('Overview did not open.');
}
