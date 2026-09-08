import {packager} from '@electron/packager';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);
if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('Build the Ubuntu amd64 package on Linux x64.');
}
await exec('dpkg-deb', ['--version']);
const output = path.join(root, 'release');
const [application] = await packager({
  dir: root,
  name: 'PipelineDesk',
  executableName: 'pipeline-desk',
  platform: 'linux',
  arch: 'x64',
  electronVersion: pkg.devDependencies.electron,
  download: {checksums: require('electron/checksums.json')},
  out: output,
  overwrite: true,
  asar: true,
  prune: true,
  ignore: /^\/(tests|scripts|packaging|release|\.github|\.impeccable|\.test-profile)(\/|$)/
});
const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-desk-deb-'));
const target = path.join(output, `pipeline-desk_${pkg.version}_amd64.deb`);
try {
  async function write(relative, contents, mode = 0o644) {
    const file = path.join(staging, relative);
    await fs.mkdir(path.dirname(file), {recursive: true});
    await fs.writeFile(file, contents, {mode});
  }
  await fs.mkdir(path.join(staging, 'opt'), {recursive: true});
  await fs.cp(application, path.join(staging, 'opt/pipeline-desk'), {recursive: true});
  // Use user namespaces through the AppArmor profile, not a setuid executable.
  await fs.chmod(path.join(staging, 'opt/pipeline-desk/chrome-sandbox'), 0o755);
  await write('usr/bin/pipeline-desk', '#!/bin/sh\nexec /opt/pipeline-desk/pipeline-desk --ozone-platform=x11 "$@"\n', 0o755);
  await write('usr/share/applications/pipeline-desk.desktop', await fs.readFile(path.join(root, 'packaging/linux/pipeline-desk.desktop')));
  await write('usr/share/icons/hicolor/scalable/apps/pipeline-desk.svg', await fs.readFile(path.join(root, 'assets/icon.svg')));
  await write('etc/apparmor.d/pipeline-desk', await fs.readFile(path.join(root, 'packaging/linux/pipeline-desk.apparmor')));
  await write('DEBIAN/conffiles', '/etc/apparmor.d/pipeline-desk\n');
  for (const script of ['postinst', 'postrm']) {
    await write(`DEBIAN/${script}`, await fs.readFile(path.join(root, 'packaging/linux', script)), 0o755);
  }
  const {stdout: size} = await exec('du', ['-sk', path.join(staging, 'opt')]);
  await write('DEBIAN/control', `Package: pipeline-desk
Version: ${pkg.version}
Section: devel
Priority: optional
Architecture: amd64
Maintainer: Pipeline Desk contributors <noreply@github.com>
Homepage: https://github.com/B-a-t-0-n/pipeline-desk
Installed-Size: ${Number.parseInt(size, 10)}
Depends: apparmor (>= 4.0), libgtk-3-0t64, libnss3, libnspr4, libasound2t64, libgbm1, libdrm2, libx11-6, libxcb1, libxcomposite1, libxdamage1, libxext6, libxfixes3, libxrandr2, libxkbcommon0, libdbus-1-3, libatk1.0-0t64, libatk-bridge2.0-0t64, libatspi2.0-0t64, libcups2t64, libsecret-1-0, libnotify4, libexpat1, libglib2.0-0t64, libc6 (>= 2.35), libstdc++6, libgcc-s1, dbus-user-session, gnome-keyring, xwayland
Recommends: gnome-shell-extension-appindicator
Description: GitLab pipeline widgets for Ubuntu
 Monitor GitLab pipelines and stages in pinned desktop windows.
 Supports Ubuntu 24.04 LTS amd64 using X11 or XWayland.
`);
  await exec('dpkg-deb', ['--root-owner-group', '-Zxz', '--build', staging, target], {maxBuffer: 1024 * 1024});
  console.log(target);
} finally {
  await fs.rm(staging, {recursive: true, force: true});
}
