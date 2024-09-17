const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const chatContainer = document.getElementById('chatContainer');
const conversationList = document.getElementById('conversationList');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyButton = document.getElementById('saveApiKeyButton');
const apiKeySection = document.getElementById('apiKeySection');
const updateApiKeyLink = document.getElementById('updateApiKeyLink');
const newConversationBtn = document.getElementById('newConversationBtn');
const deleteAllConversationsBtn = document.getElementById('deleteAllConversationsBtn');

let currentConversationId = null;
let currentMessageDiv = null;
let accumulatedResponse = '';
const conversationTitle = document.getElementById('conversationTitle');
const titleInput = document.getElementById('titleInput');

function makeConversationTitleEditable() {
    conversationTitle.classList.add('d-none');
    titleInput.value = conversationTitle.textContent;
    titleInput.classList.remove('d-none');
    titleInput.focus();
}

function updateConversationTitle() {
    const newTitle = titleInput.value.trim();
    if (newTitle) {
        conversationTitle.textContent = newTitle;
        window.electronAPI.updateConversationTitle(currentConversationId, newTitle);
    }
    conversationTitle.classList.remove('d-none');
    titleInput.classList.add('d-none');
}

conversationTitle.addEventListener('click', makeConversationTitleEditable);

titleInput.addEventListener('blur', updateConversationTitle);
titleInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        updateConversationTitle();
    }
});

function createMessageDiv(content, isUser = false, messageId = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `alert ${isUser ? 'alert-primary' : 'alert-secondary'} mb-3`;
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = marked.parse(content);
    messageDiv.appendChild(contentDiv);

    if (!isUser) {
        const branchButton = document.createElement('button');
        branchButton.className = 'btn btn-sm btn-outline-primary mt-2';
        branchButton.innerHTML = '<i class="bi bi-diagram-2"></i> Branch';
        branchButton.addEventListener('click', () => branchConversation(messageId));
        messageDiv.appendChild(branchButton);
    }

    return messageDiv;
}


async function branchConversation(messageId) {
    const messages = await window.electronAPI.getMessages(currentConversationId);
    const branchIndex = messages.findIndex(msg => msg.id === messageId);
    const branchMessages = messages.slice(0, branchIndex + 1);

    const newConversationId = await window.electronAPI.createConversation('Branched Conversation', currentConversationId);

    for (const msg of branchMessages) {
        await window.electronAPI.saveMessage({
            conversationId: newConversationId,
            parentId: msg.parent_id,
            role: msg.role,
            content: msg.content
        });
    }

    await loadConversations();
    loadConversation(newConversationId);
}

function addMessage(content, isUser = false, messageId = null) {
    const messageDiv = createMessageDiv(content, isUser, messageId);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    hljs.highlightAll();
    return messageDiv;
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
      const userMessageDiv = addMessage(message, true);
      messageInput.value = '';
  
      try {
        if (!currentConversationId) {
          currentConversationId = await window.electronAPI.createConversation('New Conversation');
          await loadConversations();
        }
  
        const userMessageId = await window.electronAPI.saveMessage({
          conversationId: currentConversationId,
          parentId: null,
          role: 'user',
          content: message
        });
  
        currentMessageDiv = addMessage('', false);
        accumulatedResponse = '';
  
        const messages = await window.electronAPI.getMessages(currentConversationId);
        
        // Ensure the last message is from the user
        if (messages[messages.length - 1].role !== 'user') {
          messages.push({ role: 'user', content: message });
        }
        
        const fullResponse = await window.electronAPI.chat(currentConversationId, messages);
        
        const assistantMessageId = await window.electronAPI.saveMessage({
          conversationId: currentConversationId,
          parentId: userMessageId,
          role: 'assistant',
          content: fullResponse
        });
  
        // Update the current message div with the branch button
        chatContainer.removeChild(currentMessageDiv);
        addMessage(fullResponse, false, assistantMessageId);
      } catch (error) {
        console.error('Error:', error);
        addMessage('Error: Unable to get a response.', false);
      } finally {
        currentMessageDiv = null;
      }
    }
  }
  

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

saveApiKeyButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
        await window.electronAPI.setApiKey(apiKey);
        apiKeyInput.value = '';
        alert('API Key saved successfully!');
        checkApiKeyStatus();
    }
});

async function loadConversations() {
    const conversations = await window.electronAPI.getConversations();
    conversationList.innerHTML = '';

    const convMap = new Map();
    conversations.forEach(conv => convMap.set(conv.id, { ...conv, children: [] }));

    const rootConvs = [];
    convMap.forEach(conv => {
        if (conv.parent_id) {
            const parent = convMap.get(conv.parent_id);
            if (parent) parent.children.push(conv);
        } else {
            rootConvs.push(conv);
        }
    });

    function renderConversation(conv, level = 0) {
        const convDiv = document.createElement('div');
        convDiv.className = 'd-flex justify-content-between align-items-center mb-2';
        convDiv.style.paddingLeft = `${level * 20}px`;

        const convButton = document.createElement('button');
        convButton.className = 'btn btn-outline-secondary flex-grow-1 text-start conversation-button';
        convButton.textContent = conv.title || `Conversation ${conv.id}`;
        convButton.addEventListener('click', () => loadConversation(conv.id));

        // Highlight the current conversation
        if (conv.id === currentConversationId) {
            convButton.classList.add('active');
        }

        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn btn-danger btn-sm ms-2';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
        });

        convDiv.appendChild(convButton);
        convDiv.appendChild(deleteButton);
        conversationList.appendChild(convDiv);

        conv.children.forEach(child => renderConversation(child, level + 1));
    }

    rootConvs.forEach(conv => renderConversation(conv));
}

async function loadConversation(id) {
    currentConversationId = id;
    chatContainer.innerHTML = '';
    const messages = await window.electronAPI.getMessages(id);
    const conversation = await window.electronAPI.getConversation(id);
    
    conversationTitle.textContent = conversation.title || `Conversation ${conversation.id}`;

    messages.forEach(msg => {
        addMessage(msg.content, msg.role === 'user', msg.id);
    });
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
    hljs.highlightAll();

    await loadConversations();
}

window.electronAPI.onChatStreamUpdate((event, partialResponse) => {
    if (currentMessageDiv) {
      accumulatedResponse += partialResponse;
      const contentDiv = currentMessageDiv.querySelector('.message-content');
      contentDiv.innerHTML = marked.parse(accumulatedResponse);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      hljs.highlightAll();
    }
  });

async function checkApiKeyStatus() {
    const apiKeySet = await window.electronAPI.isApiKeySet();
    if (apiKeySet) {
        apiKeySection.style.display = 'none';
        updateApiKeyLink.style.display = 'inline';
    } else {
        apiKeySection.style.display = 'block';
        updateApiKeyLink.style.display = 'none';
    }
}

updateApiKeyLink.addEventListener('click', () => {
    apiKeySection.style.display = 'block';
    updateApiKeyLink.style.display = 'none';
});

async function startNewConversation() {
    currentConversationId = await window.electronAPI.createConversation('New Conversation');
    chatContainer.innerHTML = '';
    conversationTitle.textContent = 'New Conversation';
    addMessage("New conversation started. How can I help you?", false);
    await loadConversations();
    conversationList.scrollTop = conversationList.scrollHeight;
}

async function deleteConversation(id) {
    if (confirm(`Are you sure you want to delete this conversation?`)) {
        await window.electronAPI.deleteConversation(id);
        if (currentConversationId === id) {
            startNewConversation();
        }
        await loadConversations();
    }
}

async function deleteAllConversations() {
    if (confirm("Are you sure you want to delete all conversations? This action cannot be undone.")) {
        await window.electronAPI.deleteAllConversations();
        startNewConversation();
        await loadConversations();
    }
}

newConversationBtn.addEventListener('click', startNewConversation);
deleteAllConversationsBtn.addEventListener('click', deleteAllConversations);

async function loadLastConversation() {
    const conversations = await window.electronAPI.getConversations();
    if (conversations.length > 0) {
        // Load the most recent conversation
        loadConversation(conversations[0].id);
    } else {
        // If no conversations exist, show a welcome message
        chatContainer.innerHTML = '';
        addMessage("Welcome! Click 'New Conversation' to start chatting.", false);
    }
}

checkApiKeyStatus();
loadConversations();
loadLastConversation();