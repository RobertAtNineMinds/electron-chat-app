const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chat: (conversationId, conversationHistory) => ipcRenderer.invoke('chat', conversationId, conversationHistory),
  createConversation: (title, parentId) => ipcRenderer.invoke('createConversation', title, parentId),
  saveMessage: (data) => ipcRenderer.invoke('saveMessage', data),
  getConversations: () => ipcRenderer.invoke('getConversations'),
  getMessages: (conversationId) => ipcRenderer.invoke('getMessages', conversationId),
  setApiKey: (apiKey) => ipcRenderer.invoke('setApiKey', apiKey),
  isApiKeySet: () => ipcRenderer.invoke('isApiKeySet'),
  onChatStreamUpdate: (callback) => ipcRenderer.on('chatStreamUpdate', callback),
  deleteConversation: (id) => ipcRenderer.invoke('deleteConversation', id),
  deleteAllConversations: () => ipcRenderer.invoke('deleteAllConversations'),
  updateConversationTitle: (id, newTitle) => ipcRenderer.invoke('updateConversationTitle', id, newTitle),
  getConversation: (id) => ipcRenderer.invoke('getConversation', id),  
});