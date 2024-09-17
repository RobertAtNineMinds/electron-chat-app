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
let accumulatedResponse = '';
let conversationHistory = [];

function addMessage(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `alert ${isUser ? 'alert-primary' : 'alert-secondary'} mb-3`;
    messageDiv.innerHTML = marked.parse(content);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    hljs.highlightAll();

    // Add message to conversation history
    conversationHistory.push({ role: isUser ? 'user' : 'assistant', content });

    return messageDiv;
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        addMessage(message, true);
        messageInput.value = '';

        try {
            currentMessageDiv = addMessage('', false);
            accumulatedResponse = ''; // Reset accumulated response

            // Send the entire conversation history
            const fullResponse = await window.electronAPI.chat(conversationHistory);
            
            const savedId = await window.electronAPI.saveConversation({
                parentId: currentConversationId,
                content: JSON.stringify({ history: conversationHistory })
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
    conversationHistory = [];
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
        if (content.history) {
            // New format with full history
            content.history.forEach(msg => {
                addMessage(msg.content, msg.role === 'user');
            });
        } else {
            // Old format with user and AI messages
            addMessage(content.user, true);
            addMessage(content.ai);
        }
    });
}

// Handle streaming updates
window.electronAPI.onChatStreamUpdate((event, partialResponse) => {
    if (currentMessageDiv) {
        accumulatedResponse += partialResponse;
        
        // Check if we have a complete markdown block or code block
        if (isCompleteBlock(accumulatedResponse)) {
            currentMessageDiv.innerHTML = marked.parse(accumulatedResponse);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            hljs.highlightAll();
        }
    }
});

// Helper function to check if we have a complete block
function isCompleteBlock(text) {
    // Check for complete code blocks
    const codeBlockRegex = /```[\s\S]*?```/g;
    const completeCodeBlocks = text.match(codeBlockRegex) || [];
    
    // Check for complete paragraphs (separated by double newlines)
    const paragraphRegex = /(.+\n\n|.+$)/g;
    const completeParagraphs = text.match(paragraphRegex) || [];
    
    // If we have any complete blocks, return true
    return completeCodeBlocks.length > 0 || completeParagraphs.length > 0;
}

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