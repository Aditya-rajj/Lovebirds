let currentUser = "";
let partnerName = "";
let pollInterval;
let presenceInterval;

// Core Engine Variables
let processedMessages = new Set(); // Tracks all loaded messages so we never duplicate
let locallySentMessages = []; // Prevents your own sent messages from double-rendering
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

// Time Formatter for WhatsApp style timestamps
function formatTime(ms) {
  const date = new Date(ms);
  let hours = date.getHours();
  let minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; 
  minutes = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minutes} ${ampm}`;
}

// 1. Profile Selection
function selectProfile(name) {
  currentUser = name;
  partnerName = name === 'Aditya' ? 'Sharu' : 'Aditya';
  document.getElementById('verify-name').innerText = name;
  document.getElementById('verify-profile-img').src = `https://api.dicebear.com/7.x/initials/svg?seed=${name}&backgroundColor=000000&textColor=ffffff`;
  otpInputs.forEach(input => input.value = '');
  switchScreen(screenProfile, screenAuth);
  setTimeout(() => otpInputs[0].focus(), 100);
}

function goBackToProfile() { switchScreen(screenAuth, screenProfile); }

// 2. OTP Logic
otpInputs.forEach((input, index) => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && input.value === '') {
      if (index > 0) { otpInputs[index - 1].focus(); otpInputs[index - 1].value = ''; }
    }
  });
  input.addEventListener('input', () => {
    if (input.value && index < otpInputs.length - 1) otpInputs[index + 1].focus();
    if (index === otpInputs.length - 1 && input.value !== '') verifyCode();
  });
});

// 3. Verification
async function verifyCode() {
  let enteredCode = Array.from(otpInputs).map(i => i.value).join('');
  try {
    const res = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: enteredCode })
    });
    const data = await res.json();
    
    if (data.success) {
      document.getElementById('chat-partner-name').innerText = partnerName;
      switchScreen(screenAuth, screenChat);
      
      // Load History immediately and start polling
      fetchMessages();
      pollInterval = setInterval(fetchMessages, 3000);
      
      // Ping presence
      sendMetaStatus('ONLINE');
      presenceInterval = setInterval(() => sendMetaStatus('ONLINE'), 20000);
    } else { triggerShake(); }
  } catch (err) { triggerShake(); }
}

function triggerShake() {
  const authCard = document.querySelector('.auth-card');
  authCard.style.animation = "none";
  authCard.offsetHeight; 
  authCard.style.animation = "shake 0.4s";
  otpInputs.forEach(input => input.value = '');
  otpInputs[0].focus();
}

// 4. Meta Statuses (Typing / Online)
async function sendMetaStatus(type) {
  try {
    await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: "", sender: currentUser, isMeta: type })
    });
  } catch (err) {}
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
  
  // Track this so we don't render it twice when it fetches back from Telegram
  locallySentMessages.push(text);
  displayMessage(text, "sent", formatTime(Date.now()));

  try {
    await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, sender: currentUser, isMeta: false })
    });
  } catch(err) {}
}

async function sendPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    displayMessage("🖼️ Image sent...", "sent", formatTime(Date.now())); 
    try {
      await fetch('/api/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: e.target.result, sender: currentUser })
      });
    } catch(err) {}
  };
  reader.readAsDataURL(file);
}

// 6. Fetching Chat History (FIXED: Offset=0 keeps history for offline partner)
async function fetchMessages() {
  try {
    // Sending offset=0 tells Telegram NOT to delete messages, holding them for 24h
    const response = await fetch(`/api/chat?offset=0`);
    const data = await response.json();
    
    if (data.ok && data.result.length > 0) {
      // Sort messages chronologically just in case
      data.result.sort((a, b) => a.message.date - b.message.date);

      data.result.forEach(update => {
        if (!update.message) return;
        
        // Skip messages we already loaded to prevent looping UI
        const msgId = update.message.message_id;
        if (processedMessages.has(msgId)) return;
        processedMessages.add(msgId);
        
        let text = update.message.text || update.message.caption || "";
        let timestamp = update.message.date * 1000;
        
        if (text.startsWith("[")) {
          let closingBracket = text.indexOf("]");
          let senderRaw = text.substring(1, closingBracket);
          
          if (text.startsWith("[META_")) {
            handleMetaMessage(text, timestamp);
          } else {
            const actualMessage = text.substring(closingBracket + 1).trim();
            const timeStr = formatTime(timestamp);
            
            // Log Last Seen if message is from Partner
            if (senderRaw === partnerName) {
              if (timestamp > partnerLastSeenTime) partnerLastSeenTime = timestamp;
              
              if(update.message.photo) {
                displayMessage("🖼️ " + actualMessage, "received", timeStr);
              } else {
                displayMessage(actualMessage, "received", timeStr);
              }
            } 
            // Render our own historical messages (cross-device support)
            else if (senderRaw === currentUser) {
              // Ignore if we just sent it on this specific screen
              const localIdx = locallySentMessages.indexOf(actualMessage);
              if (localIdx > -1) {
                locallySentMessages.splice(localIdx, 1);
              } else {
                if(update.message.photo) {
                  displayMessage("🖼️ " + actualMessage, "sent", timeStr);
                } else {
                  displayMessage(actualMessage, "sent", timeStr);
                }
              }
            }
          }
        }
      });
      updateLastSeenUI();
    }
  } catch (error) {}
}

function handleMetaMessage(text, timestamp) {
  const parts = text.replace("[", "").replace("]", "").split("_");
  if(parts.length < 3) return;
  const type = parts[1];
  const sender = parts[2];

  if (sender === partnerName) {
    if (timestamp > partnerLastSeenTime) partnerLastSeenTime = timestamp; 
    
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
  }
}

// 7. Last Seen Logic (FIXED: Calculates from history properly)
function updateLastSeenUI() {
  if (isPartnerTyping) {
    statusText.innerText = "typing...";
    statusText.style.color = "#4caf50";
    return;
  }

  if (partnerLastSeenTime === 0) {
    statusText.innerText = "Offline";
    statusText.style.color = "#888888";
    return;
  }

  const secondsSinceLastSeen = (Date.now() - partnerLastSeenTime) / 1000;
  
  if (secondsSinceLastSeen < 45) { // 45 sec buffer for online status
    statusText.innerText = "Online";
    statusText.style.color = "#4caf50"; 
  } else {
    statusText.innerText = `Last seen at ${formatTime(partnerLastSeenTime)}`;
    statusText.style.color = "#a8a8a8";
  }
}

setInterval(() => {
  if (partnerLastSeenTime > 0) updateLastSeenUI();
}, 20000);

// 8. UI Rendering (FIXED: Supports WhatsApp timestamps)
function displayMessage(text, type, timeStr) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${type}`;
  
  // HTML layout for message + timestamp
  msgDiv.innerHTML = `
    <span>${text}</span>
    <span class="msg-time">${timeStr}</span>
  `;
  
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
  
  // Wipe session memory so logging in as the other person works properly
  processedMessages.clear();
  partnerLastSeenTime = 0;
  chatBox.innerHTML = `
    <div id="typing-indicator" class="typing-indicator-wrapper hidden">
      <div class="typing-bubble">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
    </div>
  `; 
  
  typingGlow.classList.remove('active');
  switchScreen(screenChat, screenProfile);
}

document.getElementById('message-input').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') sendMessage();
});
          
