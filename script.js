import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, push, onValue, set, serverTimestamp, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// YOU MUST PASTE YOUR FIREBASE CONFIG HERE IN STEP 4!
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const SECRET_KEY = "1234";
let currentUser = "";
let partnerName = "";

// DOM Elements
const screenProfile = document.getElementById('screen-profile');
const screenAuth = document.getElementById('screen-auth');
const screenChat = document.getElementById('screen-chat');
const chatBox = document.getElementById('chat-box');
const otpInputs = document.querySelectorAll('.otp-input');
const statusText = document.getElementById('status-text');
const messageInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');

// Format Timestamps (WhatsApp Style)
function formatTime(ms) {
  if (!ms) return '';
  const date = new Date(ms);
  let hours = date.getHours();
  let minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minutes} ${ampm}`;
}

// 1. Profile Selection
window.selectProfile = (name) => {
  currentUser = name;
  partnerName = name === 'Aditya' ? 'Shalu' : 'Aditya';
  document.getElementById('verify-name').innerText = name;
  document.getElementById('verify-profile-img').src = name === 'Aditya' ? 'aditya.jpg' : 'shalu.png';
  otpInputs.forEach(i => i.value = '');
  switchScreen(screenProfile, screenAuth);
  setTimeout(() => otpInputs[0].focus(), 100);
};

window.goBackToProfile = () => switchScreen(screenAuth, screenProfile);

// 2. OTP Logic
otpInputs.forEach((input, index) => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && input.value === '') {
      if (index > 0) { otpInputs[index - 1].focus(); otpInputs[index - 1].value = ''; }
    }
  });
  input.addEventListener('input', () => {
    if (input.value && index < otpInputs.length - 1) otpInputs[index + 1].focus();
    if (index === otpInputs.length - 1 && input.value !== '') window.verifyCode();
  });
});

window.verifyCode = () => {
  let enteredCode = Array.from(otpInputs).map(i => i.value).join('');
  if (enteredCode === SECRET_KEY) {
    document.getElementById('chat-partner-name').innerText = partnerName;
    switchScreen(screenAuth, screenChat);
    startChatEngine();
  } else {
    const authCard = document.querySelector('.auth-card');
    authCard.style.animation = "none";
    authCard.offsetHeight; 
    authCard.style.animation = "shake 0.4s";
    otpInputs.forEach(i => i.value = '');
    otpInputs[0].focus();
  }
};

// 3. The Firebase Chat Engine
function startChatEngine() {
  // Listen for Messages
  const messagesRef = ref(db, 'messages');
  onValue(messagesRef, (snapshot) => {
    chatBox.innerHTML = ''; // Clear box
    const data = snapshot.val();
    if (data) {
      Object.values(data).forEach(msg => {
        const type = msg.sender === currentUser ? 'sent' : 'received';
        displayMessage(msg.text, msg.image, type, msg.timestamp);
      });
    }
    chatBox.appendChild(typingIndicator); // Keep indicator at bottom
    scrollToBottom();
  });

  // Manage Online/Offline Presence
  const myPresenceRef = ref(db, `presence/${currentUser}`);
  const partnerPresenceRef = ref(db, `presence/${partnerName}`);

  set(myPresenceRef, { online: true, typing: false, lastSeen: serverTimestamp() });
  onDisconnect(myPresenceRef).set({ online: false, typing: false, lastSeen: serverTimestamp() });

  // Listen to Partner's Presence
  onValue(partnerPresenceRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      updateLastSeenUI(data.online, data.lastSeen, data.typing);
    } else {
      updateLastSeenUI(false, null, false);
    }
  });
}

function updateLastSeenUI(isOnline, lastSeen, isTyping) {
  if (isTyping) {
    statusText.innerText = "typing...";
    statusText.style.color = "#4caf50";
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
  } else {
    typingIndicator.classList.add('hidden');
    if (isOnline) {
      statusText.innerText = "Online";
      statusText.style.color = "#4caf50";
    } else {
      statusText.innerText = lastSeen ? `Last seen at ${formatTime(lastSeen)}` : "Offline";
      statusText.style.color = "#a8a8a8";
    }
  }
}

// 4. Sending Messages
window.sendMessage = () => {
  const text = messageInput.value.trim();
  if (!text) return;
  messageInput.value = '';
  set(ref(db, `presence/${currentUser}/typing`), false); // stop typing
  
  push(ref(db, 'messages'), {
    sender: currentUser,
    text: text,
    image: null,
    timestamp: Date.now()
  });
};

// Typing indicator logic
let typingTimeout;
messageInput.addEventListener('input', () => {
  set(ref(db, `presence/${currentUser}/typing`), true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    set(ref(db, `presence/${currentUser}/typing`), false);
  }, 2000);
});
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') window.sendMessage();
});

// 5. Sending & Compressing Images
window.sendPhoto = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => {
      // Compress image so database runs fast
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);

      push(ref(db, 'messages'), {
        sender: currentUser,
        text: "",
        image: compressedBase64,
        timestamp: Date.now()
      });
    };
  };
};

// 6. UI Rendering
function displayMessage(text, imageBase64, type, timestamp) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${type}`;

  let content = '';
  if (imageBase64) {
    content += `<img src="${imageBase64}" class="chat-image" onclick="window.open('${imageBase64}')">`;
  }
  if (text) {
    content += `<span style="margin-bottom: 2px;">${text}</span>`;
  }
  content += `<span class="msg-time">${formatTime(timestamp)}</span>`;

  msgDiv.innerHTML = content;
  chatBox.insertBefore(msgDiv, typingIndicator);
}

function scrollToBottom() { setTimeout(() => chatBox.scrollTop = chatBox.scrollHeight, 50); }

function switchScreen(hideElement, showElement) {
  hideElement.classList.remove('active');
  showElement.classList.add('active');
}

window.logout = () => {
  set(ref(db, `presence/${currentUser}/online`), false);
  window.location.reload(); // Hard reset to clear memory
};
