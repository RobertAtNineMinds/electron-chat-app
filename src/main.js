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
    console.log(app.getPath('userData'));
    const db = new sqlite3.Database(path.join(app.getPath('userData'), 'conversations.db'));
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        parent_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES conversations (id)
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER,
        parent_id INTEGER,
        role TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
      )`);
    });
    db.close();
  }

  ipcMain.handle('chat', async (event, conversationId, conversationHistory) => {
    try {
      // Filter out the 'depth' and 'parentId' properties from each message
      let filteredMessages = conversationHistory.map(({ role, content }) => ({ role, content }));
  
      // Ensure alternating roles
      filteredMessages = filteredMessages.reduce((acc, current, index) => {
        if (index === 0 || current.role !== acc[acc.length - 1].role) {
          acc.push(current);
        } else {
          acc[acc.length - 1].content += '\n\n' + current.content;
        }
        return acc;
      }, []);
  
      // Ensure the last message is from the user
      if (filteredMessages[filteredMessages.length - 1].role !== 'user') {
        filteredMessages.pop();
      }
  
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
  
      // Save the assistant's response
      // await saveMessage(conversationId, null, 'assistant', fullResponse);
  
      return fullResponse;
    } catch (error) {
      console.error('Error calling Anthropic API:', error);
      return 'Sorry, there was an error processing your request.';
    }
  });
  

  ipcMain.handle('createConversation', async (event, title, parentId = null) => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(path.join(app.getPath('userData'), 'conversations.db'));
      db.run('INSERT INTO conversations (title, parent_id) VALUES (?, ?)', [title, parentId], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
      db.close();
    });
  });
  
  ipcMain.handle('saveMessage', async (event, { conversationId, parentId, role, content }) => {
    return saveMessage(conversationId, parentId, role, content);
  });

  function saveMessage(conversationId, parentId, role, content) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(path.join(app.getPath('userData'), 'conversations.db'));
      db.run('INSERT INTO messages (conversation_id, parent_id, role, content) VALUES (?, ?, ?, ?)',
        [conversationId, parentId, role, content],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
      db.close();
    });
  }

  ipcMain.handle('getConversations', () => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(path.join(app.getPath('userData'), 'conversations.db'));
      db.all('SELECT * FROM conversations ORDER BY created_at DESC', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
      db.close();
    });
  });

  ipcMain.handle('getMessages', (event, conversationId) => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(path.join(app.getPath('userData'), 'conversations.db'));
      db.all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', [conversationId], (err, rows) => {
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

  ipcMain.handle('deleteAllConversations', () => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(path.join(app.getPath('userData'), 'conversations.db'));
      db.serialize(() => {
        db.run('DELETE FROM messages', (err) => {
          if (err) reject(err);
        });
        db.run('DELETE FROM conversations', function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        });
      });
      db.close();
    });
  });

})();