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

function addMessage(content, isUser = false, depth = 0) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `alert ${isUser ? 'alert-primary' : 'alert-secondary'} mb-3`;
    messageDiv.style.marginLeft = `${depth * 20}px`;
    messageDiv.innerHTML = marked.parse(content);
    
    if (!isUser) {
        const branchButton = document.createElement('button');
        branchButton.className = 'btn btn-sm btn-outline-primary mt-2';
        branchButton.textContent = 'Branch from here';
        branchButton.addEventListener('click', () => createBranch(content));
        messageDiv.appendChild(branchButton);
    }
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    hljs.highlightAll();

    // Add message to conversation history
    conversationHistory.push({ role: isUser ? 'user' : 'assistant', content, depth });

    return messageDiv;
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        addMessage(message, true, getCurrentDepth());
        messageInput.value = '';

        try {
            currentMessageDiv = addMessage('', false, getCurrentDepth());
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
            addMessage('Error: Unable to get a response.', false, getCurrentDepth());
        } finally {
            currentMessageDiv = null;
        }
    }
}

function getCurrentDepth() {
    return conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1].depth : 0;
}

async function createBranch(content) {
    // Clear the chat container and start a new branch
    chatContainer.innerHTML = '';
    conversationHistory = conversationHistory.slice(0, conversationHistory.findIndex(msg => msg.content === content) + 1);
    
    // Render the conversation up to the branching point
    conversationHistory.forEach(msg => addMessage(msg.content, msg.role === 'user', msg.depth));
    
    // Increment the depth for the new branch
    const newDepth = getCurrentDepth() + 1;
    
    // Save the new branch as a conversation
    const savedId = await window.electronAPI.saveConversation({
        parentId: currentConversationId,
        content: JSON.stringify({ history: conversationHistory })
    });
    
    currentConversationId = savedId;
    await loadConversations();
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
    const conversationMap = new Map();

    conversations.forEach(conv => {
        conversationMap.set(conv.id, { ...conv, children: [] });
    });

    conversations.forEach(conv => {
        if (conv.parent_id && conversationMap.has(conv.parent_id)) {
            conversationMap.get(conv.parent_id).children.push(conv.id);
        }
    });

    function renderConversation(convId, depth = 0) {
        const conv = conversationMap.get(convId);
        const convButton = document.createElement('button');
        convButton.className = 'btn btn-outline-secondary w-100 mb-2 text-start';
        convButton.style.paddingLeft = `${depth * 20 + 10}px`;
        convButton.textContent = `Conversation ${conv.id}`;
        convButton.addEventListener('click', () => loadConversation(conv.id));
        conversationList.appendChild(convButton);

        conv.children.forEach(childId => renderConversation(childId, depth + 1));
    }

    const rootConversations = conversations.filter(conv => !conv.parent_id);
    rootConversations.forEach(conv => renderConversation(conv.id));
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

    let depth = 0;
    conversationChain.forEach(conv => {
        const content = JSON.parse(conv.content);
        if (content.history) {
            // New format with full history
            content.history.forEach(msg => {
                addMessage(msg.content, msg.role === 'user', depth);
            });
        } else {
            // Old format with user and AI messages
            addMessage(content.user, true, depth);
            addMessage(content.ai, false, depth);
        }
        depth++;
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