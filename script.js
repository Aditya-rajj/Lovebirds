import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, push, onValue, set, serverTimestamp, onDisconnect, update, onChildAdded, onChildChanged, get, remove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyARxN3khUsOgZhHtNL2oUzUsXlI-KJW6Sc",
  authDomain: "lovebirds-32905.firebaseapp.com",
  databaseURL: "https://lovebirds-32905-default-rtdb.firebaseio.com",
  projectId: "lovebirds-32905",
  storageBucket: "lovebirds-32905.firebasestorage.app",
  messagingSenderId: "143665598070",
  appId: "1:143665598070:web:8c059c146b7c8a602cd957"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app); 

// --- GLOBAL VARIABLES ---
let currentUser = "";
let partnerName = "";
let currentScreenState = "home"; 
let userProfilePics = { Aditya: 'aditya.jpg', Akanksha: 'akanksha.png' };
let lastRenderedDateStr = "";

const msgSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2357/2357-84.wav");

// --- AUDIO RECORDER VARS ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let audioBlobToSend = null;

// --- DOM ELEMENT CACHE ---
const screenProfile = document.getElementById('screen-profile');
const screenAuth = document.getElementById('screen-auth');
const screenHome = document.getElementById('screen-home');
const screenCreatePost = document.getElementById('screen-create-post');
const screenChat = document.getElementById('screen-chat');
const chatBox = document.getElementById('chat-box');
const feedContainer = document.getElementById('feed-container');
const unreadBadge = document.getElementById('unread-badge');

// --- BACKGROUND NOTIFICATION SUPPORT ---
function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.log("This browser does not support desktop notifications.");
  } else if (Notification.permission !== "denied" && Notification.permission !== "granted") {
    Notification.requestPermission();
  }
}

function sendSystemNotification(title, body) {
  if (Notification.permission === "granted" && document.hidden && isSoundOn) {
    const notification = new Notification(title, {
      body: body,
      icon: userProfilePics[partnerName], 
      badge: userProfilePics[partnerName]
    });
    notification.onclick = () => { window.focus(); notification.close(); };
  }
}

// --- BACKWARDS COMPATIBILITY FOR NAME CHANGE ---
// This ensures old posts/messages by 'Shalu' show up as 'Akanksha' and link to the right photo.
function mapLegacyName(name) {
  return name === 'Shalu' ? 'Akanksha' : name;
}

// --- SETTINGS & VIBRATION LOGIC ---
let isSoundOn = true;
let isVibrationOn = true;

function triggerVibrate(duration = 50) {
  if (isVibrationOn && navigator.vibrate) {
    navigator.vibrate(duration);
  }
}

function loadSettings() {
  const savedMode = localStorage.getItem('lb_mode') || 'dark';
  isSoundOn = localStorage.getItem('lb_sound') !== 'false';
  isVibrationOn = localStorage.getItem('lb_vibrate') !== 'false';

  document.getElementById('setting-theme').checked = savedMode === 'dark';
  document.getElementById('setting-sound').checked = isSoundOn;
  document.getElementById('setting-vibration').checked = isVibrationOn;

  if (savedMode === 'dark') document.body.classList.add('dark-mode');
  else document.body.classList.remove('dark-mode');
}

window.saveSettings = () => {
  const isDark = document.getElementById('setting-theme').checked;
  isSoundOn = document.getElementById('setting-sound').checked;
  isVibrationOn = document.getElementById('setting-vibration').checked;

  localStorage.setItem('lb_mode', isDark ? 'dark' : 'light');
  localStorage.setItem('lb_sound', isSoundOn);
  localStorage.setItem('lb_vibrate', isVibrationOn);

  if (isDark) document.body.classList.add('dark-mode');
  else document.body.classList.remove('dark-mode');
};

loadSettings();

// --- PRE-FETCH USERS (For fast profile picture loading) ---
onValue(ref(db, 'users'), (snapshot) => {
  const data = snapshot.val();
  if (data) {
    if (data.Aditya?.profilePic) {
      userProfilePics.Aditya = data.Aditya.profilePic;
      document.getElementById('select-aditya-img').src = data.Aditya.profilePic;
    }
    if (data.Akanksha?.profilePic) {
      userProfilePics.Akanksha = data.Akanksha.profilePic;
      document.getElementById('select-akanksha-img').src = data.Akanksha.profilePic;
    }
    
    // Sync current elements if user is already logged in
    if(currentUser) {
      document.getElementById('home-user-img').src = userProfilePics[currentUser];
      document.getElementById('settings-profile-img').src = userProfilePics[currentUser];
    }
    if(partnerName) {
      document.getElementById('header-partner-img').src = userProfilePics[partnerName];
    }
  }
});

// --- UTILITY FUNCTIONS ---
function formatTime(ms) {
  if (!ms) return ''; 
  const date = new Date(ms);
  let h = date.getHours(); 
  let m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12; 
  m = m < 10 ? '0' + m : m;
  return `${h}:${m} ${ampm}`;
}

function getRelativeDay(ms) {
  if (!ms) return "Unknown Date";
  const d = new Date(ms); 
  const t = new Date(); 
  const y = new Date(); 
  y.setDate(t.getDate() - 1);
  
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// --- SCREEN TRANSITIONS ---
function switchScreen(hideEl, showEl, stateName) {
  triggerVibrate(30);
  if(hideEl) hideEl.classList.remove('active');
  
  if (stateName === 'chat' || stateName === 'create_post') {
    showEl.classList.add('active', 'slide-in-right');
    if(stateName === 'chat') markMessagesAsRead();
  } else {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'slide-in-right'));
    showEl.classList.add('active');
  }
  currentScreenState = stateName;
}

window.goToChat = () => switchScreen(screenHome, screenChat, 'chat');
window.goToHome = () => {
  if (currentScreenState === 'create_post') switchScreen(screenCreatePost, screenHome, 'home');
  else switchScreen(screenChat, screenHome, 'home');
};
window.goBackToProfile = () => switchScreen(screenAuth, screenProfile, 'profile');

// --- MODAL ANIMATIONS ---
function openModalAnimated(modalId) {
  triggerVibrate(30);
  const modal = document.getElementById(modalId);
  const card = modal.querySelector('.custom-modal-card');
  modal.classList.add('active');
  if(card) { card.classList.remove('bounce-out'); card.classList.add('bounce-in'); }
}

function closeModalAnimated(modalId) {
  triggerVibrate(30);
  const modal = document.getElementById(modalId);
  const card = modal.querySelector('.custom-modal-card');
  if(card) { card.classList.remove('bounce-in'); card.classList.add('bounce-out'); }
  setTimeout(() => { 
    modal.classList.remove('active'); 
    if(card) { card.classList.remove('bounce-out'); card.classList.add('bounce-in'); }
  }, 280);
}

window.openSettings = () => openModalAnimated('settings-modal');
window.closeSettings = () => closeModalAnimated('settings-modal');

// --- FULL PAGE CREATE POST ---
let tempPostImg = null;
let selectedMood = null;

window.openCreatePost = () => {
  switchScreen(screenHome, screenCreatePost, 'create_post');
};

window.closeCreatePost = () => {
  switchScreen(screenCreatePost, screenHome, 'home');
  setTimeout(() => {
    document.getElementById('post-preview-img').style.display = 'none';
    document.getElementById('post-preview-img').src = '';
    document.getElementById('post-preview-placeholder').style.display = 'block';
    document.getElementById('post-caption').value = '';
    
    // Reset Moods
    document.querySelectorAll('.mood-pill').forEach(btn => btn.classList.remove('active'));
    
    tempPostImg = null;
    selectedMood = null;
  }, 300);
};

window.selectMood = (mood, btnElement) => {
  triggerVibrate(30);
  document.querySelectorAll('.mood-pill').forEach(btn => btn.classList.remove('active'));
  btnElement.classList.add('active');
  selectedMood = btnElement.innerText; // Captures "😊 Happy", "❤️ Loved", etc.
};

window.previewPostImage = (e) => {
  const file = e.target.files[0];
  if(!file) return; 
  const reader = new FileReader();
  reader.onload = (ev) => compressImage(ev.target.result, 800, (b64) => {
    tempPostImg = b64;
    document.getElementById('post-preview-img').src = b64;
    document.getElementById('post-preview-img').style.display = 'block';
    document.getElementById('post-preview-placeholder').style.display = 'none';
  });
  reader.readAsDataURL(file);
  e.target.value = ''; // FIXED BUG: Clears the input so the same image can be re-selected if needed.
};

window.submitPost = () => {
  triggerVibrate(50);
  const caption = document.getElementById('post-caption').value.trim();
  if(!tempPostImg && !caption) return;
  
  push(ref(db, 'posts'), { 
    author: currentUser, 
    image: tempPostImg, 
    caption: caption,
    mood: selectedMood,
    timestamp: Date.now() 
  });
  window.closeCreatePost();
};


// --- AUTHENTICATION ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    const savedUser = localStorage.getItem('lovebirds_user');
    if (savedUser) {
      setupUserSession(savedUser);
      switchScreen(null, screenHome, 'home');
      startEngine();
    }
  }
});

function setupUserSession(name) {
  currentUser = name; 
  partnerName = name === 'Aditya' ? 'Akanksha' : 'Aditya';
  
  document.getElementById('home-user-name').innerText = currentUser;
  document.getElementById('chat-partner-name').innerText = partnerName;
  document.getElementById('home-user-img').src = userProfilePics[currentUser];
  document.getElementById('settings-profile-img').src = userProfilePics[currentUser];
  document.getElementById('header-partner-img').src = userProfilePics[partnerName];
}

window.selectProfile = (name) => {
  triggerVibrate(30);
  setupUserSession(name);
  document.getElementById('verify-name').innerText = name;
  document.getElementById('verify-profile-img').src = userProfilePics[name];
  document.querySelectorAll('.otp-input').forEach(i => i.value = '');
  switchScreen(screenProfile, screenAuth, 'auth');
};

document.querySelectorAll('.otp-input').forEach((input, index, inputs) => {
  input.addEventListener('input', () => {
    if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
    if (index === inputs.length - 1 && input.value !== '') window.verifyCode();
  });
});

window.verifyCode = async () => {
  triggerVibrate(50);
  let code = Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');
  
  try {
    await signInWithEmailAndPassword(auth, "chat@lovebirds.com", code + "-love");
    localStorage.setItem('lovebirds_user', currentUser);
    switchScreen(null, screenHome, 'home');
    startEngine();
  } catch (e) {
    triggerVibrate([50, 50, 50]); 
    const authCard = document.querySelector('.auth-card');
    authCard.style.transform = "translate(10px, 10px)"; 
    setTimeout(() => authCard.style.transform = "translate(-10px, -10px)", 100); 
    setTimeout(() => authCard.style.transform = "translate(0, 0)", 200);
    document.querySelectorAll('.otp-input').forEach(i => i.value = '');
  }
};

// --- CORE ENGINE (Triggers on Login) ---
function startEngine() {
  requestNotificationPermission(); // Ask for system notifications
  loadFeed(); 
  loadChat(); 
  listenForUnread();
  
  const myPresenceRef = ref(db, `presence/${currentUser}`);
  set(myPresenceRef, { online: true, typing: false, lastSeen: serverTimestamp() });
  onDisconnect(myPresenceRef).set({ online: false, lastSeen: serverTimestamp() });

  onValue(ref(db, `presence/${partnerName}`), (snapshot) => {
    const data = snapshot.val();
    if (data) {
      updatePartnerStatusUI(data.online, data.lastSeen, data.typing);
    }
  });
}

function listenForUnread() {
  onValue(ref(db, 'messages'), (snapshot) => {
    let unreadCount = 0;
    snapshot.forEach(child => {
      const msg = child.val();
      const senderName = mapLegacyName(msg.sender);
      if (senderName === partnerName && msg.status !== 'read') {
        unreadCount++;
      }
    });
    
    if (unreadCount > 0) {
      unreadBadge.innerText = unreadCount > 99 ? '99+' : unreadCount;
      unreadBadge.classList.remove('hidden');
    } else {
      unreadBadge.classList.add('hidden');
    }
  });
}

// --- FEED SYSTEM ---
function loadFeed() {
  onValue(ref(db, 'posts'), (snapshot) => {
    feedContainer.innerHTML = ''; 
    const data = snapshot.val();
    
    if (data) {
      const posts = Object.entries(data).reverse();
      posts.forEach(([id, post]) => {
        // Handle backwards compatibility for Shalu -> Akanksha
        const authorName = mapLegacyName(post.author);
        const dp = userProfilePics[authorName] || `https://api.dicebear.com/7.x/initials/svg?seed=${authorName}`;
        
        let moodHtml = post.mood ? `<span class="post-mood-badge">is feeling ${post.mood}</span>` : '';

        feedContainer.innerHTML += `
          <div class="feed-card neo-box fade-in">
            <div class="feed-header">
              <img src="${dp}">
              <div class="feed-header-info">
                <h4>${authorName} ${moodHtml}</h4>
                <span>${getRelativeDay(post.timestamp)} at ${formatTime(post.timestamp)}</span>
              </div>
            </div>
            ${post.image ? `<img src="${post.image}" class="feed-img neo-border" onclick="window.openImage('${post.image}')">` : ''}
            <div class="feed-actions">
              <i class="fa-solid fa-heart ${post.likes && post.likes[currentUser] ? 'liked' : ''}" onclick="window.likePost('${id}')"></i>
            </div>
            <p class="feed-caption"><b>${authorName}</b> ${post.caption}</p>
          </div>
        `;
      });
    } else { 
      feedContainer.innerHTML = `<p style="text-align:center; color:var(--text-sub); margin-top:20px; font-weight:700;">No moments shared yet.</p>`; 
    }
  });
}

window.likePost = async (postId) => {
  triggerVibrate(30);
  const likeRef = ref(db, `posts/${postId}/likes/${currentUser}`);
  const snap = await get(likeRef);
  
  if (snap.exists()) { 
    update(ref(db, `posts/${postId}/likes`), { [currentUser]: null }); 
  } else { 
    update(ref(db, `posts/${postId}/likes`), { [currentUser]: true }); 
  }
};

window.uploadProfilePic = (event) => {
  const file = event.target.files[0]; 
  if (!file) return; 
  const reader = new FileReader();
  reader.onload = (e) => compressImage(e.target.result, 400, (b64) => { 
    update(ref(db, `users/${currentUser}`), { profilePic: b64 }); 
  });
  reader.readAsDataURL(file);
  event.target.value = ''; // FIXED BUG: Resets input allowing identical image selection later.
};


// --- VOICE RECORDING LOGIC ---
window.toggleRecording = async () => {
  triggerVibrate(30);
  const recordBtn = document.getElementById('record-btn');
  const msgInput = document.getElementById('message-input');

  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        audioBlobToSend = new Blob(audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlobToSend);
        
        // Setup the Preview UI
        document.getElementById('audio-preview-player').src = audioUrl;
        document.getElementById('audio-preview-container').style.display = 'flex';
        
        // Hide standard inputs
        document.getElementById('message-input').style.display = 'none';
        document.getElementById('attach-btn').style.display = 'none';
        document.getElementById('record-btn').style.display = 'none';
        document.getElementById('text-send-btn').style.display = 'none';
        
        stream.getTracks().forEach(track => track.stop()); 
      };
      
      mediaRecorder.start();
      isRecording = true;
      recordBtn.classList.add('recording-active');
      recordBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
      msgInput.placeholder = "Recording...";
      msgInput.disabled = true;

    } catch (e) {
      alert("Microphone access is required to send voice notes.");
    }
  } else {
    // STOP RECORDING (Triggers onstop above)
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.classList.remove('recording-active');
    recordBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    msgInput.placeholder = "Type a message...";
    msgInput.disabled = false;
  }
};

window.cancelAudio = () => {
  triggerVibrate(30);
  audioBlobToSend = null;
  document.getElementById('audio-preview-player').src = "";
  document.getElementById('audio-preview-container').style.display = 'none';
  
  // Restore Input Bar
  document.getElementById('message-input').style.display = 'block';
  document.getElementById('attach-btn').style.display = 'block';
  document.getElementById('record-btn').style.display = 'block';
  document.getElementById('text-send-btn').style.display = 'block';
};

window.sendAudio = () => {
  if (!audioBlobToSend) return;
  triggerVibrate(50);
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64Audio = e.target.result;
    
    push(ref(db, 'messages'), {
      sender: currentUser,
      text: "",
      image: null,
      audio: base64Audio,
      timestamp: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // Auto-Delete in exactly 24 Hours
      isDeleted: false,
      status: 'sent'
    });
    
    window.cancelAudio(); // Reset UI
  };
  reader.readAsDataURL(audioBlobToSend);
};

// --- CHAT SYSTEM ---
function renderDateHeader(timestamp) {
  const div = document.createElement('div');
  div.className = 'date-header fade-in';
  div.innerText = getRelativeDay(timestamp);
  
  const typingInd = document.getElementById('typing-indicator');
  if (typingInd) { chatBox.insertBefore(div, typingInd); } 
  else { chatBox.appendChild(div); }
}

function loadChat() {
  const typingInd = document.getElementById('typing-indicator');
  document.querySelectorAll('.message, .date-header').forEach(el => el.remove());
  
  if (typingInd && !chatBox.contains(typingInd)) { 
    chatBox.appendChild(typingInd); 
  }
  
  lastRenderedDateStr = "";

  onChildAdded(ref(db, 'messages'), (snapshot) => {
    const msg = snapshot.val(); 
    const key = snapshot.key;
    
    if (!msg || typeof msg !== 'object') return;
    
    // Auto-Delete expired Voice Notes
    if (msg.audio && msg.expiresAt) {
      const timeLeft = msg.expiresAt - Date.now();
      if (timeLeft <= 0) {
        if (msg.sender === currentUser) remove(ref(db, `messages/${key}`));
        return; 
      } else {
        setTimeout(() => {
          const el = document.getElementById(`msg-${key}`);
          if (el) el.remove();
          if (msg.sender === currentUser) remove(ref(db, `messages/${key}`));
        }, timeLeft);
      }
    }

    const senderName = mapLegacyName(msg.sender);
    const type = senderName === currentUser ? 'sent' : 'received';
    msg.status = msg.status || 'read'; 

    const msgDateStr = new Date(msg.timestamp || Date.now()).toDateString();
    if (msgDateStr !== lastRenderedDateStr) {
      renderDateHeader(msg.timestamp || Date.now());
      lastRenderedDateStr = msgDateStr;
    }

    if (type === 'received' && msg.status !== 'read') {
      if (currentScreenState === 'chat') { 
        update(ref(db, `messages/${key}`), { status: 'read' }); 
      } else { 
        update(ref(db, `messages/${key}`), { status: 'delivered' }); 
      }
      
      if (isSoundOn && Date.now() - (msg.timestamp || Date.now()) < 5000) { 
        msgSound.play().catch(()=>{}); 
        
        // --- NATIVE BACKGROUND NOTIFICATIONS ---
        let notifText = msg.text ? msg.text : (msg.audio ? "🎤 Sent a voice note" : "📷 Sent a photo");
        sendSystemNotification(`New message from ${partnerName}`, notifText);
      }
    }
    
    renderMsg(key, msg, type);
  });

  onChildChanged(ref(db, 'messages'), (snapshot) => {
    const el = document.getElementById(`msg-${snapshot.key}`); 
    const msg = snapshot.val();
    if (!msg) return; 
    
    msg.status = msg.status || 'read'; 
    if (el) {
      el.innerHTML = buildMsgHTML(snapshot.key, msg);
    }
  });
}

function markMessagesAsRead() {
  get(ref(db, 'messages')).then((snap) => {
    if(snap.exists()) {
      const updates = {}; 
      let needsUpdate = false;
      
      snap.forEach(child => {
        const msg = child.val();
        const senderName = mapLegacyName(msg.sender);
        
        if(senderName !== currentUser && (msg.status === 'sent' || msg.status === 'delivered')) {
          updates[`${child.key}/status`] = 'read'; 
          needsUpdate = true;
        }
      });
      
      if(needsUpdate) update(ref(db, 'messages'), updates);
    }
  });
}

function buildMsgHTML(id, msg) {
  if (msg.isDeleted) {
    return `<div style="font-style:italic; opacity:0.6; font-size: 13px;"><i class="fa-solid fa-ban"></i> Message deleted</div>`;
  }
  
  let ticks = '';
  const senderName = mapLegacyName(msg.sender);
  
  if (senderName === currentUser) {
    if (msg.status === 'read') {
      ticks = `<span class="read-receipt status-read"><i class="fa-solid fa-check-double"></i></span>`;
    } else if (msg.status === 'delivered') {
      ticks = `<span class="read-receipt"><i class="fa-solid fa-check-double"></i></span>`;
    } else {
      ticks = `<span class="read-receipt"><i class="fa-solid fa-check"></i></span>`;
    }
  }
  
  let html = `
    <div class="message-actions-menu">
      <button class="react-btn" onclick="window.reactToMessage('${id}', '❤️')">❤️</button>
      <button class="react-btn" onclick="window.reactToMessage('${id}', '😂')">😂</button>
      <button class="react-btn" onclick="window.reactToMessage('${id}', '🥺')">🥺</button>
      <button class="del-msg-btn" onclick="window.customConfirm('Delete message?', 'This will remove it for both of you.', () => window.deleteMessage('${id}'))"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;
  
  if (msg.image) {
    html += `<img src="${msg.image}" style="width:100%; border-radius:10px; border: 2px solid var(--text-main); margin-bottom:8px; cursor:pointer;" onclick="window.openImage('${msg.image}')">`;
  }
  
  if (msg.audio) {
    html += `
      <div class="audio-msg-bubble">
        <i class="fa-solid fa-microphone-lines"></i>
        <audio controls src="${msg.audio}"></audio>
      </div>
    `;
  }
  
  if (msg.text) {
    html += `<span>${msg.text}</span>`;
  }
  
  const safeTime = msg.timestamp ? formatTime(msg.timestamp) : '';
  html += `<div class="msg-time-wrapper"><span class="msg-time">${safeTime}</span> ${ticks}</div>`;
  
  if (msg.reaction) {
    html += `<div class="message-reaction-badge bounce-in">${msg.reaction}</div>`;
  }
  
  return html;
}

function renderMsg(id, msg, type) {
  const div = document.createElement('div'); 
  div.id = `msg-${id}`; 
  div.className = `message ${type}`; 
  div.innerHTML = buildMsgHTML(id, msg);
  
  const typingInd = document.getElementById('typing-indicator');
  if (typingInd) {
    chatBox.insertBefore(div, typingInd); 
  } else {
    chatBox.appendChild(div);
  }
  chatBox.scrollTop = chatBox.scrollHeight;
}

window.sendMessage = () => {
  const text = document.getElementById('message-input').value.trim(); 
  if (!text) return;
  
  triggerVibrate(30);
  document.getElementById('message-input').value = '';
  
  push(ref(db, 'messages'), { 
    sender: currentUser, 
    text: text, 
    image: null, 
    audio: null,
    timestamp: Date.now(), 
    isDeleted: false, 
    status: 'sent' 
  });
};

window.sendPhoto = (e) => {
  const file = e.target.files[0]; 
  if(!file) return; 
  const reader = new FileReader();
  reader.onload = (ev) => compressImage(ev.target.result, 800, (b64) => {
    push(ref(db, 'messages'), { 
      sender: currentUser, 
      text: "", 
      image: b64, 
      audio: null,
      timestamp: Date.now(), 
      isDeleted: false, 
      status: 'sent' 
    });
  }); 
  reader.readAsDataURL(file);
  e.target.value = ''; // FIXED BUG: Resets file input.
}

window.reactToMessage = (msgId, emoji) => { 
  triggerVibrate(30); 
  update(ref(db, `messages/${msgId}`), { reaction: emoji }); 
};

// --- CHAT HISTORY DELETION ---
window.clearEntireChatHistory = () => {
  window.customConfirm(
    "Wipe Chat History?", 
    "Are you sure? This will delete ALL messages.", 
    () => {
      const messagesRef = ref(db, 'messages');
      remove(messagesRef).then(() => {
        document.querySelectorAll('.message, .date-header').forEach(el => el.remove());
      });
    }
  );
};

// --- ROBUST IMAGE COMPRESSION & MODALS ---
function compressImage(src, maxWidth, callback) {
  const img = new Image(); 
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas'); 
      let w = img.width, h = img.height;
      if (w > maxWidth) { 
        h = Math.round((h * maxWidth) / w); 
        w = maxWidth; 
      }
      canvas.width = w; 
      canvas.height = h; 
      canvas.getContext('2d').drawImage(img, 0, 0, w, h); 
      callback(canvas.toDataURL('image/jpeg', 0.6));
    } catch(err) {
      // Fallback if canvas crashes on older devices
      callback(src);
    }
  };
  img.src = src;
}

let confirmCallback = null;

window.customConfirm = (title, message, callback) => {
  document.getElementById('confirm-title').innerText = title;
  document.getElementById('confirm-message').innerText = message;
  openModalAnimated('confirm-modal'); 
  confirmCallback = callback;
};

window.closeConfirm = () => closeModalAnimated('confirm-modal');

document.getElementById('confirm-action-btn').onclick = () => { 
  triggerVibrate(50); 
  if(confirmCallback) confirmCallback(); 
  window.closeConfirm(); 
};

window.deleteMessage = (id) => {
  update(ref(db, `messages/${id}`), { isDeleted: true, text: "", image: null, audio: null, reaction: null });
};

window.showLogoutWarning = () => {
  window.customConfirm(
    "Logging Out?", 
    "Are you sure? Your space will be waiting for you.", 
    async () => {
      set(ref(db, `presence/${currentUser}/online`), false); 
      localStorage.removeItem('lovebirds_user');
      await signOut(auth); 
      window.location.reload();
    }
  );
};

function updatePartnerStatusUI(isOnline, lastSeen, isTyping) {
  const text = document.getElementById('status-text'); 
  const dot = document.getElementById('status-dot');
  const homeStatus = document.getElementById('home-status-text');

  let statusString = "";
  if (isTyping) { 
    statusString = "typing..."; 
    dot.className = "status-dot online"; 
  } else if (isOnline) { 
    statusString = "Online"; 
    dot.className = "status-dot online"; 
  } else { 
    statusString = lastSeen ? `Last seen ${formatTime(lastSeen)}` : "Offline"; 
    dot.className = "status-dot offline"; 
  }

  text.innerText = statusString;
  if (homeStatus) {
    homeStatus.innerText = `${partnerName}: ${statusString}`;
  }
}

window.openImage = (src) => { 
  triggerVibrate(30);
  const modal = document.getElementById('image-modal');
  const img = document.getElementById('expanded-img');
  
  img.src = src; 
  modal.style.display = "flex"; 
  img.classList.remove('bounce-out');
  img.classList.add('bounce-in');
};

window.closeImageModal = () => { 
  triggerVibrate(30);
  const modal = document.getElementById('image-modal');
  const img = document.getElementById('expanded-img');
  
  img.classList.remove('bounce-in');
  img.classList.add('bounce-out');
  
  setTimeout(() => {
    modal.style.display = "none";
    img.src = ''; 
    img.classList.remove('bounce-out');
    img.classList.add('bounce-in');
  }, 280);
};