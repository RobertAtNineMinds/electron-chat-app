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
let conversationHistory = [];

function createMessageDiv(content, isUser = false, depth = 0) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `alert ${isUser ? 'alert-primary' : 'alert-secondary'} mb-3`;
    messageDiv.style.marginLeft = `${depth * 20}px`;
    messageDiv.innerHTML = marked.parse(content);
    return messageDiv;
}

function addBranchButton(messageDiv, content) {
    const branchButton = document.createElement('button');
    branchButton.className = 'btn btn-sm btn-outline-primary mt-2';
    branchButton.textContent = 'Branch from here';
    branchButton.addEventListener('click', () => createBranch(content));
    messageDiv.appendChild(branchButton);
}

function addMessage(content, isUser = false, depth = 0) {
    const messageDiv = createMessageDiv(content, isUser, depth);
    
    if (!isUser) {
        addBranchButton(messageDiv, content);
    }
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    hljs.highlightAll();

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

            // Add user message to conversation history
            conversationHistory.push({ role: 'user', content: message, depth: getCurrentDepth() });

            // Send the entire conversation history
            await window.electronAPI.chat(conversationHistory);
            
            // Add the full bot response to conversation history after streaming is complete
            conversationHistory.push({ role: 'assistant', content: accumulatedResponse, depth: getCurrentDepth() });
            
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
        const convDiv = document.createElement('div');
        convDiv.className = 'd-flex justify-content-between align-items-center mb-2';
        convDiv.style.marginLeft = `${depth * 20}px`;

        const convButton = document.createElement('button');
        convButton.className = 'btn btn-outline-secondary flex-grow-1 text-start';
        convButton.textContent = `Conversation ${conv.id}`;
        convButton.addEventListener('click', () => loadConversation(conv.id));

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
                const messageDiv = createMessageDiv(msg.content, msg.role === 'user', msg.depth);
                if (msg.role === 'assistant') {
                    addBranchButton(messageDiv, msg.content);
                }
                chatContainer.appendChild(messageDiv);
            });
            conversationHistory = content.history;
        } else {
            // Old format with user and AI messages
            addMessage(content.user, true, depth);
            const aiMessageDiv = createMessageDiv(content.ai, false, depth);
            addBranchButton(aiMessageDiv, content.ai);
            chatContainer.appendChild(aiMessageDiv);
            conversationHistory.push({ role: 'user', content: content.user, depth });
            conversationHistory.push({ role: 'assistant', content: content.ai, depth });
        }
        depth++;
    });
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
    hljs.highlightAll();
}

// Handle streaming updates
window.electronAPI.onChatStreamUpdate((event, partialResponse) => {
    if (currentMessageDiv) {
        accumulatedResponse += partialResponse;
        currentMessageDiv.innerHTML = marked.parse(accumulatedResponse);
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

// New function to start a new conversation
function startNewConversation() {
    currentConversationId = null;
    conversationHistory = [];
    chatContainer.innerHTML = '';
    addMessage("New conversation started. How can I help you?", false, 0);
}

// New function to delete a conversation
async function deleteConversation(id) {
    if (confirm(`Are you sure you want to delete conversation ${id}?`)) {
        await window.electronAPI.deleteConversation(id);
        if (currentConversationId === id) {
            startNewConversation();
        }
        await loadConversations();
    }
}

// New function to delete all conversations
async function deleteAllConversations() {
    if (confirm("Are you sure you want to delete all conversations? This action cannot be undone.")) {
        await window.electronAPI.deleteAllConversations();
        startNewConversation();
        await loadConversations();
    }
}

// Event listeners for new buttons
newConversationBtn.addEventListener('click', startNewConversation);
deleteAllConversationsBtn.addEventListener('click', deleteAllConversations);

// Initial check for API key status
checkApiKeyStatus();

// Load conversations and start a new one
loadConversations();
startNewConversation();