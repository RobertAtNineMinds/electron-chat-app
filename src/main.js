const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const sqlite3 = require('sqlite3').verbose();

let mainWindow;
let store;
let anthropic;

(async () => {
  const { default: Store } = await import('electron-store');
  store = new Store();
  anthropic = new Anthropic({ apiKey: store.get('apiKey') });

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }

  app.whenReady().then(() => {
    createWindow();
    initDatabase();

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
  });

  function initDatabase() {
    const db = new sqlite3.Database(path.join(app.getPath('userData'), 'conversations.db'));
    db.run(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
    db.close();
  }

  ipcMain.handle('chat', async (event, conversationHistory) => {
    try {
      // Filter out the 'depth' property from each message
      const filteredMessages = conversationHistory.map(({ role, content }) => ({ role, content }));

      const stream = await anthropic.messages.create({
        max_tokens: 1000,
        messages: filteredMessages,
        model: 'claude-3-5-sonnet-20240620',
        stream: true,
      });

      let fullResponse = '';
      for await (const messageStreamEvent of stream) {
        if (messageStreamEvent.type === 'content_block_delta') {
          const partialResponse = messageStreamEvent.delta.text;
          fullResponse += partialResponse;
          event.sender.send('chatStreamUpdate', partialResponse);
        }
      }

      return fullResponse;
    } catch (error) {
      console.error('Error calling Anthropic API:', error);
      return 'Sorry, there was an error processing your request.';
    }
  });

  ipcMain.handle('saveConversation', (event, { parentId, content }) => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(path.join(app.getPath('userData'), 'conversations.db'));
      db.run('INSERT INTO conversations (parent_id, content) VALUES (?, ?)', [parentId, content], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
      db.close();
    });
  });

  ipcMain.handle('getConversations', () => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(path.join(app.getPath('userData'), 'conversations.db'));
      db.all('SELECT * FROM conversations ORDER BY timestamp DESC', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
      db.close();
    });
  });

  ipcMain.handle('setApiKey', (event, apiKey) => {
    store.set('apiKey', apiKey);
    anthropic = new Anthropic({ apiKey });
  });

  ipcMain.handle('isApiKeySet', () => {
    const apiKey = store.get('apiKey');
    return !!apiKey && apiKey.trim() !== '';
  });

  // New handler for deleting a single conversation
  ipcMain.handle('deleteConversation', (event, id) => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(path.join(app.getPath('userData'), 'conversations.db'));
      db.run('DELETE FROM conversations WHERE id = ?', [id], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
      db.close();
    });
  });

  // New handler for deleting all conversations
  ipcMain.handle('deleteAllConversations', () => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(path.join(app.getPath('userData'), 'conversations.db'));
      db.run('DELETE FROM conversations', function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
      db.close();
    });
  });

})();