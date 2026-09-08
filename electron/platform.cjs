const path = require('node:path');

function configurePlatform(app, platform = process.platform) {
  if (platform !== 'linux') return;
  // Pinning, programmatic resizing and restoring coordinates require X11.
  // On Ubuntu's Wayland desktop this uses the system XWayland server.
  app.commandLine.appendSwitch('ozone-platform', 'x11');
  app.commandLine.appendSwitch('class', 'pipeline-desk');
  app.setDesktopName('pipeline-desk.desktop');
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
