// Playwright's development Electron loader forces --password-store=basic.
// Restore the real backend for our credential integration tests. Packaged
// launches do not load this fixture and exercise their normal startup path.
const {app} = require('electron');
if (process.platform === 'linux' && process.env.PIPELINE_DESK_TEST_KEYRING !== 'basic') {
  app.commandLine.removeSwitch('password-store');
}
