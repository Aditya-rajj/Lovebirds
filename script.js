import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, push, onValue, set, serverTimestamp, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// YOUR FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyARxN3khUsOgZhHtNL2oUzUsXlI-KJW6Sc",
  authDomain: "lovebirds-32905.firebaseapp.com",
  databaseURL: "https://lovebirds-32905-default-rtdb.firebaseio.com",
  projectId: "lovebirds-32905",
  storageBucket: "lovebirds-32905.firebasestorage.app",
  messagingSenderId: "143665598070",
  appId: "1:143665598070:web:8c059c146b7c8a602cd957",
  measurementId: "G-HLHV8NGXQB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app); 

let currentUser = "";
let partnerName = "";
let loadedMessages = new Set(); // Prevents duplicate rendering

// DOM Elements
const screenProfile = document.getElementById('screen-profile');
const screenAuth = document.getElementById('screen-auth');
const screenChat = document.getElementById('screen-chat');
const chatBox = document.getElementById('chat-box');
const otpInputs = document.querySelectorAll('.otp-input');
const statusText = document.getElementById('status-text');
const messageInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');
const modal = document.getElementById('image-modal');
const modalImg = document.getElementById('expanded-img');

// --- FORMAT TIMESTAMPS ---
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

// --- SESSION PERSISTENCE ---
// If the user refreshes the page, log them straight back into the chat!
onAuthStateChanged(auth, (user) => {
  if (user) {
    const savedUser = localStorage.getItem('lovebirds_user');
    if (savedUser) {
      currentUser = savedUser;
      partnerName = savedUser === 'Aditya' ? 'Shalu' : 'Aditya';
      document.getElementById('chat-partner-name').innerText = partnerName;
      switchScreen(screenProfile, screenChat);
      startChatEngine();
    }
  }
});

// --- SCREEN 1: PROFILE SELECTION ---
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

// --- SCREEN 2: OTP LOGIC ---
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

window.verifyCode = async () => {
  let enteredCode = Array.from(otpInputs).map(i => i.value).join('');
  const email = "chat@lovebirds.com"; 
  const password = enteredCode + "-love"; 
  
  try {
    await signInWithEmailAndPassword(auth, email, password);
    localStorage.setItem('lovebirds_user', currentUser); // Save session
    document.getElementById('chat-partner-name').innerText = partnerName;
    switchScreen(screenAuth, screenChat);
    startChatEngine();
  } catch (error) {
    const authCard = document.querySelector('.auth-card');
    authCard.style.animation = "none";
    authCard.offsetHeight; 
    authCard.style.animation = "shake 0.4s";
    otpInputs.forEach(i => i.value = '');
    otpInputs[0].focus();
  }
};

// --- SCREEN 3: CHAT ENGINE (DATABASE & PRESENCE) ---
function startChatEngine() {
  // Load Messages
  const messagesRef = ref(db, 'messages');
  onValue(messagesRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      Object.entries(data).forEach(([key, msg]) => {
        if (!loadedMessages.has(key)) {
          loadedMessages.add(key);
          const type = msg.sender === currentUser ? 'sent' : 'received';
          displayMessage(msg.text, msg.image, type, msg.timestamp);
        }
      });
    }
  });

  // Manage My Presence
  const myPresenceRef = ref(db, `presence/${currentUser}`);
  set(myPresenceRef, { online: true, typing: false, lastSeen: serverTimestamp() });
  onDisconnect(myPresenceRef).set({ online: false, typing: false, lastSeen: serverTimestamp() });

  // Listen to Partner's Presence
  const partnerPresenceRef = ref(db, `presence/${partnerName}`);
  onValue(partnerPresenceRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      updateLastSeenUI(data.online, data.lastSeen, data.typing);
    } else {
      updateLastSeenUI(false, null, false); // Fallback if partner hasn't logged in yet
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

// --- SENDING TEXT & TYPING INDICATORS ---
window.sendMessage = () => {
  const text = messageInput.value.trim();
  if (!text) return;
  
  messageInput.value = '';
  set(ref(db, `presence/${currentUser}/typing`), false); 
  
  push(ref(db, 'messages'), {
    sender: currentUser,
    text: text,
    image: null,
    timestamp: Date.now()
  });
};

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

// --- SENDING IMAGES (COMPRESSED TO AVOID LIMITS) ---
window.sendPhoto = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800; // Compresses size to keep database fast
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

// --- RENDERING MESSAGES (WHATSAPP FLEX-LAYOUT) ---
function displayMessage(text, imageBase64, type, timestamp) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${type}`;

  let content = '';
  
  // Render Image if it exists
  if (imageBase64) {
    content += `<img src="${imageBase64}" class="chat-image" onclick="window.openImage('${imageBase64}')">`;
  }
  
  // Render Text and Timestamp flexibly
  if (text) {
    content += `
      <div class="content-wrapper">
        <span>${text}</span>
        <span class="msg-time">${formatTime(timestamp)}</span>
      </div>
    `;
  } else {
    // If it's just an image, tuck the timestamp under it
    content += `<span class="msg-time">${formatTime(timestamp)}</span>`;
  }

  msgDiv.innerHTML = content;
  chatBox.insertBefore(msgDiv, typingIndicator);
  
  // Wait a fraction of a second for image to render before scrolling
  setTimeout(scrollToBottom, 100); 
}

function scrollToBottom() { 
  chatBox.scrollTop = chatBox.scrollHeight; 
}

function switchScreen(hideElement, showElement) {
  hideElement.classList.remove('active');
  showElement.classList.add('active');
}

// --- IMAGE MODAL VIEWER ---
window.openImage = (src) => {
  modal.style.display = "block";
  modalImg.src = src;
}
window.closeModal = () => {
  modal.style.display = "none";
}

// --- SECURE LOGOUT ---
window.logout = async () => {
  set(ref(db, `presence/${currentUser}/online`), false);
  localStorage.removeItem('lovebirds_user'); // Clear saved session
  
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign out error", error);
  }
  
  window.location.reload(); 
};
  
