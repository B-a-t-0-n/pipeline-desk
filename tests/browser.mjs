import {chromium} from 'playwright';

export function launchBrowser() {
  const executablePath = process.env.PIPELINE_DESK_BROWSER_EXECUTABLE;
  return chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
}
