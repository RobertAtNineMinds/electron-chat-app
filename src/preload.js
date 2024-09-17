const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chat: (conversationHistory) => ipcRenderer.invoke('chat', conversationHistory),
  saveConversation: (data) => ipcRenderer.invoke('saveConversation', data),
  getConversations: () => ipcRenderer.invoke('getConversations'),
  setApiKey: (apiKey) => ipcRenderer.invoke('setApiKey', apiKey),
  isApiKeySet: () => ipcRenderer.invoke('isApiKeySet'),
  onChatStreamUpdate: (callback) => ipcRenderer.on('chatStreamUpdate', callback)
});