const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {configurePlatform, windowIcon, dismissOverview, restoreOverview} = require('../electron/platform.cjs');

test('an X11 process registers Linux desktop integration without restarting', () => {
  const calls = [];
  assert.equal(configurePlatform({commandLine:{getSwitchValue:()=> 'x11',appendSwitch:(...args)=>calls.push(args)},setDesktopName:name=>calls.push([name])}, 'linux'),true);
  assert.deepEqual(calls, [['class','pipeline-desk'], ['pipeline-desk.desktop']]);
});
test('direct Linux startup relaunches with X11 on the process command line', () => {
  const calls=[];
  const app={commandLine:{getSwitchValue:()=>''},relaunch:options=>calls.push(options),exit:code=>calls.push(code)};
  assert.equal(configurePlatform(app,'linux',['/path to/project','--example']),false);
  assert.deepEqual(calls,[{args:['/path to/project','--example','--ozone-platform=x11']},0]);
});
test('Windows startup does not receive Linux switches', () => {
  configurePlatform({}, 'win32');
});
test('Linux windows use PNG icons; Windows retains ICO', () => {
  assert.equal(path.extname(windowIcon(__dirname, 'linux')), '.png');
  assert.equal(path.extname(windowIcon(__dirname, 'win32')), '.ico');
});
test('closing the Linux overview remains recoverable without a tray host', () => {
  const actions = [];
  const window = {minimize:()=>actions.push('minimize'),hide:()=>actions.push('hide')};
  dismissOverview(window, 'linux');
  dismissOverview(window, 'win32');
  assert.deepEqual(actions, ['minimize', 'hide']);
});
test('reopening restores a minimized overview before focusing it', () => {
  const actions = [];
  restoreOverview({isMinimized:()=>true,restore:()=>actions.push('restore'),show:()=>actions.push('show'),focus:()=>actions.push('focus')});
  assert.deepEqual(actions, ['restore', 'show', 'focus']);
});
