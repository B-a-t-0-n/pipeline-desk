const path = require('node:path');

function configurePlatform(app, platform = process.platform, argv = process.argv.slice(1)) {
  if (platform !== 'linux') return true;
  // Pinning, programmatic resizing and restoring coordinates require X11.
  // On Ubuntu's Wayland desktop this uses the system XWayland server.
  if (app.commandLine.getSwitchValue('ozone-platform') !== 'x11') {
    app.relaunch({args: [...argv, '--ozone-platform=x11']});
    app.exit(0);
    return false;
  }
  app.commandLine.appendSwitch('class', 'pipeline-desk');
  app.setDesktopName('pipeline-desk.desktop');
  return true;
}

function windowIcon(directory, platform = process.platform) {
  return path.join(directory, '../assets', platform === 'win32' ? 'icon.ico' : 'icon.png');
}

function dismissOverview(window, platform = process.platform) {
  // GNOME can have no tray host, even when Electron successfully creates a Tray.
  // Keep the overview reachable from the dock and Alt+Tab on Linux.
  if (platform === 'linux') window.minimize();
  else window.hide();
}

function restoreOverview(window) {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

module.exports = {configurePlatform, windowIcon, dismissOverview, restoreOverview};
