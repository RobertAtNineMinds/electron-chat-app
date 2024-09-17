const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const chatContainer = document.getElementById('chatContainer');
const conversationList = document.getElementById('conversationList');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyButton = document.getElementById('saveApiKeyButton');
const apiKeySection = document.getElementById('apiKeySection');
const updateApiKeyLink = document.getElementById('updateApiKeyLink');

let currentConversationId = null;
let currentMessageDiv = null;

function addMessage(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `alert ${isUser ? 'alert-primary' : 'alert-secondary'} mb-3`;
    messageDiv.innerHTML = marked.parse(content);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    hljs.highlightAll();
    return messageDiv;
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        addMessage(message, true);
        messageInput.value = '';

        try {
            currentMessageDiv = addMessage('', false);
            const fullResponse = await window.electronAPI.chat(message);
            
            const savedId = await window.electronAPI.saveConversation({
                parentId: currentConversationId,
                content: JSON.stringify({ user: message, ai: fullResponse })
            });
            
            if (!currentConversationId) {
                currentConversationId = savedId;
                await loadConversations();
            }
        } catch (error) {
            console.error('Error:', error);
            addMessage('Error: Unable to get a response.');
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
    conversations.forEach(conv => {
        const convButton = document.createElement('button');
        convButton.className = 'btn btn-outline-secondary w-100 mb-2';
        convButton.textContent = `Conversation ${conv.id}`;
        convButton.addEventListener('click', () => loadConversation(conv.id));
        conversationList.appendChild(convButton);
    });
}

async function loadConversation(id) {
    currentConversationId = id;
    chatContainer.innerHTML = '';
    const conversations = await window.electronAPI.getConversations();
    const conversationChain = [];
    let currentId = id;

    while (currentId) {
        const conv = conversations.find(c => c.id === currentId);
        if (conv) {
            conversationChain.unshift(conv);
            currentId = conv.parent_id;
        } else {
            break;
        }
    }

    conversationChain.forEach(conv => {
        const content = JSON.parse(conv.content);
        addMessage(content.user, true);
        addMessage(content.ai);
    });
}

// Handle streaming updates
window.electronAPI.onChatStreamUpdate((event, partialResponse) => {
    if (currentMessageDiv) {
        currentMessageDiv.innerHTML += marked.parse(partialResponse);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        hljs.highlightAll();
    }
});

// New function to check API key status
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

// Event listener for update API key link
updateApiKeyLink.addEventListener('click', () => {
    apiKeySection.style.display = 'block';
    updateApiKeyLink.style.display = 'none';
});

// Initial check for API key status
checkApiKeyStatus();

loadConversations();