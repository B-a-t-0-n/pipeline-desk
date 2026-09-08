import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const server = spawn(process.execPath, ['scripts/preview.mjs'], {cwd, stdio: ['ignore', 'pipe', 'inherit']});
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview server did not start.')), 10000);
    server.stdout.on('data', data => {
      if (String(data).includes('Pipeline Desk preview:')) {clearTimeout(timeout); resolve();}
    });
    server.once('error', error => {clearTimeout(timeout); reject(error);});
    server.once('exit', code => {clearTimeout(timeout); reject(new Error(`Preview server exited: ${code}`));});
  });
  for (const file of ['ui', 'setup', 'groups-ui', 'widget-views', 'full-group-layout', 'storage-electron', 'platform-electron']) {
    console.log(`Running ${file}`);
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`tests/${file}.mjs`], {cwd, stdio: 'inherit', timeout: 120000});
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${file} failed (${signal || code})`)));
    });
  }
} finally {
  server.kill();
}
