const {contextBridge, ipcRenderer} = require('electron');
const names = ['snapshot','connect','connectNetrc','createToken','listProjects','addProjects','listGroups','saveGroup','removeGroup','disconnect','addProject','removeProject','settings','setNotifications','refresh','openWidget','closeWidget','setWidgetView','windowAction','openExternal'];
const api = Object.fromEntries(names.map(name => [name, async payload => {
  const result = await ipcRenderer.invoke(`desk:${name}`, payload);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}]));
api.onUpdate = callback => {
  const listener = (_, data) => callback(data);
  ipcRenderer.on('desk:update', listener);
  return () => ipcRenderer.removeListener('desk:update', listener);
};
api.onNotice = callback => {
  const listener = (_, message) => callback(message);
  ipcRenderer.on('desk:notice', listener);
  return () => ipcRenderer.removeListener('desk:notice', listener);
};
contextBridge.exposeInMainWorld('desk', api);
