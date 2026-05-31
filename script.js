let currentUser = "";
let partnerName = "";
let lastUpdateId = 0;
let pollInterval;
let presenceInterval;

// Presence Tracking
let partnerLastSeenTime = 0; 
let isPartnerTyping = false;
let typingTimeout;

// DOM Elements
const screenProfile = document.getElementById('screen-profile');
const screenAuth = document.getElementById('screen-auth');
const screenChat = document.getElementById('screen-chat');
const chatBox = document.getElementById('chat-box');
const otpInputs = document.querySelectorAll('.otp-input');
const statusText = document.querySelector('.status-text');
const typingIndicator = document.getElementById('typing-indicator');
const typingGlow = document.getElementById('typing-glow');
const messageInput = document.getElementById('message-input');

// 1. Profile Selection
function selectProfile(name) {
  currentUser = name;
  partnerName = name === 'Aditya' ? 'Sharu' : 'Aditya';
  
  document.getElementById('verify-name').innerText = name;
  document.getElementById('verify-profile-img').src = `https://ui-avatars.com/api/?name=${name}&background=ffffff&color=000000&size=200`;
  otpInputs.forEach(input => input.value = '');
  
  switchScreen(screenProfile, screenAuth);
  setTimeout(() => otpInputs[0].focus(), 100);
}

function goBackToProfile() { switchScreen(screenAuth, screenProfile); }

// 2. OTP Input Logic
otpInputs.forEach((input, index) => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && input.value === '') {
      if (index > 0) {
        otpInputs[index - 1].focus();
        otpInputs[index - 1].value = ''; 
      }
    }
  });
  input.addEventListener('input', () => {
    if (input.value && index < otpInputs.length - 1) otpInputs[index + 1].focus();
    if (index === otpInputs.length - 1 && input.value !== '') verifyCode();
  });
});

// 3. Secure Verification via Backend
async function verifyCode() {
  let enteredCode = Array.from(otpInputs).map(i => i.value).join('');
  
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: enteredCode })
    });

    const data = await res.json();
    
    if (data.success) {
      document.getElementById('chat-partner-name').innerText = partnerName;
      switchScreen(screenAuth, screenChat);
      
      // Start Chat Engine
      fetchMessages();
      pollInterval = setInterval(fetchMessages, 3000);
      
      // Broadcast Online Presence
      sendMetaStatus('ONLINE');
      presenceInterval = setInterval(() => sendMetaStatus('ONLINE'), 20000);
      updateLastSeenUI();
    } else {
      triggerShake();
    }
  } catch (err) {
    console.error("Auth Error", err);
    triggerShake();
  }
}

function triggerShake() {
  const authCard = document.querySelector('.auth-card');
  authCard.style.animation = "none";
  authCard.offsetHeight; 
  authCard.style.animation = "shake 0.4s";
  otpInputs.forEach(input => input.value = '');
  otpInputs[0].focus();
}

// 4. Meta Statuses (Typing & Online)
async function sendMetaStatus(type) {
  try {
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: "", sender: currentUser, isMeta: type })
    });
  } catch (err) { console.error("Presence sync failed", err); }
}

let lastTypingTime = 0;
messageInput.addEventListener('input', () => {
  const textLen = messageInput.value.trim().length;
  typingGlow.classList.toggle('active', textLen > 0);
  
  if (textLen > 0 && Date.now() - lastTypingTime > 3000) {
    sendMetaStatus('TYPING');
    lastTypingTime = Date.now();
  }
});

// 5. Sending Messages
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  
  messageInput.value = '';
  typingGlow.classList.remove('active');
  displayMessage(text, "sent");

  try {
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sender: currentUser, isMeta: false })
    });
  } catch(err) { console.error("Send failed", err); }
}

async function sendPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    displayMessage("🖼️ Image sent...", "sent"); 
    try {
      await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: e.target.result, sender: currentUser })
      });
    } catch(err) { console.error("Upload failed", err); }
  };
  reader.readAsDataURL(file);
}

// 6. Fetching Messages
async function fetchMessages() {
  try {
    const response = await fetch(`/api/chat?offset=${lastUpdateId + 1}`);
    const data = await response.json();
    
    if (data.ok && data.result.length > 0) {
      data.result.forEach(update => {
        lastUpdateId = update.update_id;
        
        if (update.message) {
          let text = update.message.text || update.message.caption || "";
          
          if (text.startsWith("[")) {
            if (text.startsWith("[META_")) {
              handleMetaMessage(text);
            } else {
              const closingBracket = text.indexOf("]");
              const sender = text.substring(1, closingBracket);
              const actualMessage = text.substring(closingBracket + 1).trim();
              
              if (sender === partnerName) {
                partnerLastSeenTime = Date.now(); 
                
                // If message has photo array from telegram, indicate image received
                if(update.message.photo) {
                  displayMessage("🖼️ " + actualMessage, "received");
                } else {
                  displayMessage(actualMessage, "received");
                }
                updateLastSeenUI();
              }
            }
          }
        }
      });
    }
  } catch (error) { console.error(error); }
}

function handleMetaMessage(text) {
  const parts = text.replace("[", "").replace("]", "").split("_");
  if(parts.length < 3) return;
  const type = parts[1];
  const sender = parts[2];

  if (sender === partnerName) {
    partnerLastSeenTime = Date.now(); 
    
    if (type === 'TYPING') {
      isPartnerTyping = true;
      typingIndicator.classList.remove('hidden');
      scrollToBottom();
      
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isPartnerTyping = false;
        typingIndicator.classList.add('hidden');
        updateLastSeenUI();
      }, 3000);
    }
    updateLastSeenUI();
  }
}

// 7. Last Seen Logic
function updateLastSeenUI() {
  if (isPartnerTyping) {
    statusText.innerText = "typing...";
    statusText.style.color = "#ffffff";
    return;
  }

  const secondsSinceLastSeen = (Date.now() - partnerLastSeenTime) / 1000;
  
  if (partnerLastSeenTime === 0) {
    statusText.innerText = "Connecting...";
    statusText.style.color = "#a8a8a8";
  } else if (secondsSinceLastSeen < 30) {
    statusText.innerText = "Active now";
    statusText.style.color = "#4caf50"; 
  } else {
    const date = new Date(partnerLastSeenTime);
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    minutes = minutes < 10 ? '0' + minutes : minutes;
    
    statusText.innerText = `Last seen at ${hours}:${minutes} ${ampm}`;
    statusText.style.color = "#a8a8a8";
  }
}

setInterval(() => {
  if (partnerLastSeenTime > 0) updateLastSeenUI();
}, 60000);

// 8. Helpers
function displayMessage(text, type) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${type}`;
  msgDiv.innerText = text;
  
  chatBox.insertBefore(msgDiv, typingIndicator);
  scrollToBottom();
}

function scrollToBottom() { setTimeout(() => chatBox.scrollTop = chatBox.scrollHeight, 50); }

function switchScreen(hideElement, showElement) {
  hideElement.classList.remove('active');
  showElement.classList.add('active');
}

function logout() {
  clearInterval(pollInterval);
  clearInterval(presenceInterval);
  chatBox.innerHTML = ''; 
  typingGlow.classList.remove('active');
  switchScreen(screenChat, screenProfile);
}

document.getElementById('message-input').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') sendMessage();
});
