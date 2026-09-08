import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
assert.equal(process.platform, 'linux');
const {version} = JSON.parse(await fs.readFile('package.json', 'utf8'));
const deb = path.resolve(`release/pipeline-desk_${version}_amd64.deb`);
const extracted = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-desk-package-check-'));
try {
  const {stdout: fields} = await exec('dpkg-deb', ['--field', deb, 'Package', 'Version', 'Architecture', 'Depends']);
  assert.match(fields, /Package: pipeline-desk/);
  assert.match(fields, /Architecture: amd64/);
  assert.match(fields, /apparmor \(>= 4\.0\)/);
  assert.match(fields, /gnome-keyring/);
  assert.match(fields, /xwayland/);
  const {stdout: contents} = await exec('dpkg-deb', ['--contents', deb]);
  assert.ok(contents.trim().split('\n').every(line => /root\/root/.test(line)), 'Package files must belong to root');
  assert.ok(!contents.split('\n').some(line => /^[^ ]*[sS]/.test(line)), 'Package must not contain setuid/setgid files');
  await exec('dpkg-deb', ['--extract', deb, extracted]);
  await exec('dpkg-deb', ['--control', deb, path.join(extracted, 'DEBIAN')]);
  const launcher = await fs.readFile(path.join(extracted, 'usr/bin/pipeline-desk'), 'utf8');
  assert.match(launcher, /exec \/opt\/pipeline-desk\/pipeline-desk --ozone-platform=x11 "\$@"/);
  assert.ok(!launcher.includes('--no-sandbox'));
  const desktop = path.join(extracted, 'usr/share/applications/pipeline-desk.desktop');
  await exec('desktop-file-validate', [desktop]);
  const profile = path.join(extracted, 'etc/apparmor.d/pipeline-desk');
  await exec('/sbin/apparmor_parser', ['--skip-kernel-load', '--skip-cache', profile]);
  for (const file of ['usr/bin/pipeline-desk', 'opt/pipeline-desk/pipeline-desk', 'DEBIAN/postinst', 'DEBIAN/postrm']) {
    assert.ok((await fs.stat(path.join(extracted, file))).mode & 0o111, `${file} must be executable`);
  }
  await exec('sh', ['-n', path.join(extracted, 'DEBIAN/postinst')]);
  await exec('sh', ['-n', path.join(extracted, 'DEBIAN/postrm')]);
  console.log('PASS: Debian metadata, dependencies, ownership, launcher, desktop entry and AppArmor profile.');
  const executablePath = process.env.PIPELINE_DESK_EXECUTABLE || path.join(extracted, 'opt/pipeline-desk/pipeline-desk');
  const result = await exec(process.execPath, ['tests/package-smoke.mjs'], {
    env: {...process.env, PIPELINE_DESK_EXECUTABLE: executablePath},
    timeout: 120000,
    maxBuffer: 1024 * 1024
  });
  process.stdout.write(result.stdout);
} finally {
  await fs.rm(extracted, {recursive: true, force: true});
}
