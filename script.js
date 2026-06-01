import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, push, onValue, set, serverTimestamp, onDisconnect, update, onChildAdded, onChildChanged, get, remove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ─── FIREBASE CONFIG ───────────────────────────────────────────
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
const db  = getDatabase(app);
const auth = getAuth(app);

// ─── GLOBAL STATE ──────────────────────────────────────────────
let currentUser        = "";
let partnerName        = "";
let currentScreenState = "home";
let userProfilePics    = { Aditya: 'aditya.jpg', Akanksha: 'akanksha.png' };
let lastRenderedDateStr = "";

let currentViewedPostId = null;
let replyingToAuthor    = null;

let isSoundOn     = true;
let isVibrationOn = true;

// Audio recorder
let mediaRecorder  = null;
let audioChunks    = [];
let isRecording    = false;
let audioBlobToSend = null;

// Confirm callback
let confirmCallback = null;

const msgSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2357/2357-84.wav");

// ─── DOM CACHE ─────────────────────────────────────────────────
const screenProfile    = document.getElementById('screen-profile');
const screenAuth       = document.getElementById('screen-auth');
const screenHome       = document.getElementById('screen-home');
const screenCreatePost = document.getElementById('screen-create-post');
const screenComments   = document.getElementById('screen-comments');
const screenChat       = document.getElementById('screen-chat');

const chatBox           = document.getElementById('chat-box');
const feedContainer     = document.getElementById('feed-container');
const commentsBox       = document.getElementById('comments-box');
const unreadBadge       = document.getElementById('unread-badge');
const actionSheetModal  = document.getElementById('action-sheet-modal');
const actionSheetContent = document.getElementById('action-sheet-content');

// ─── NOTIFICATION SUPPORT ──────────────────────────────────────
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission !== "denied" && Notification.permission !== "granted") {
    Notification.requestPermission();
  }
}

function sendSystemNotification(title, body) {
  if (Notification.permission === "granted" && document.hidden && isSoundOn) {
    const n = new Notification(title, {
      body,
      icon:  userProfilePics[partnerName],
      badge: userProfilePics[partnerName]
    });
    n.onclick = () => { window.focus(); n.close(); };
  }
}

// ─── LEGACY NAME MAP ───────────────────────────────────────────
function mapLegacyName(name) {
  return name === 'Shalu' ? 'Akanksha' : name;
}

// ─── SETTINGS ─────────────────────────────────────────────────
function loadSettings() {
  const savedMode = localStorage.getItem('lb_mode') || 'dark';
  isSoundOn     = localStorage.getItem('lb_sound')   !== 'false';
  isVibrationOn = localStorage.getItem('lb_vibrate') !== 'false';

  document.getElementById('setting-theme').checked     = savedMode === 'dark';
  document.getElementById('setting-sound').checked     = isSoundOn;
  document.getElementById('setting-vibration').checked = isVibrationOn;

  if (savedMode === 'dark') document.body.classList.add('dark-mode');
  else                      document.body.classList.remove('dark-mode');
}

window.saveSettings = () => {
  const isDark = document.getElementById('setting-theme').checked;
  isSoundOn     = document.getElementById('setting-sound').checked;
  isVibrationOn = document.getElementById('setting-vibration').checked;

  localStorage.setItem('lb_mode',    isDark ? 'dark' : 'light');
  localStorage.setItem('lb_sound',   isSoundOn);
  localStorage.setItem('lb_vibrate', isVibrationOn);

  if (isDark) document.body.classList.add('dark-mode');
  else        document.body.classList.remove('dark-mode');
};

loadSettings();

// ─── VIBRATION ────────────────────────────────────────────────
function triggerVibrate(duration = 50) {
  if (isVibrationOn && navigator.vibrate) navigator.vibrate(duration);
}

// ─── PRE-FETCH USER PROFILE PICS ──────────────────────────────
onValue(ref(db, 'users'), (snapshot) => {
  const data = snapshot.val();
  if (!data) return;

  if (data.Aditya?.profilePic) {
    userProfilePics.Aditya = data.Aditya.profilePic;
    document.getElementById('select-aditya-img').src = data.Aditya.profilePic;
  }
  if (data.Akanksha?.profilePic) {
    userProfilePics.Akanksha = data.Akanksha.profilePic;
    document.getElementById('select-akanksha-img').src = data.Akanksha.profilePic;
  }

  if (currentUser) {
    const src = userProfilePics[currentUser];
    document.getElementById('home-user-img').src       = src;
    document.getElementById('settings-profile-img').src = src;
    _el('create-post-avatar',    el => el.src = src);
    _el('comments-user-avatar',  el => el.src = src);
  }
  if (partnerName) {
    document.getElementById('header-partner-img').src = userProfilePics[partnerName];
  }
});

// ─── UTILITY: safe element setter ─────────────────────────────
function _el(id, fn) {
  const el = document.getElementById(id);
  if (el) fn(el);
}

// ─── UTILITIES ────────────────────────────────────────────────
function formatTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  m = m < 10 ? '0' + m : m;
  return `${h}:${m} ${ampm}`;
}

function getRelativeDay(ms) {
  if (!ms) return "Unknown Date";
  const d = new Date(ms), t = new Date(), y = new Date();
  y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── SCREEN TRANSITIONS ───────────────────────────────────────
function switchScreen(hideEl, showEl, stateName) {
  triggerVibrate(30);
  if (hideEl) hideEl.classList.remove('active');

  if (stateName === 'chat' || stateName === 'create_post' || stateName === 'comments') {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'slide-in-right'));
    showEl.classList.add('active', 'slide-in-right');
    if (stateName === 'chat') markMessagesAsRead();
  } else {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'slide-in-right'));
    showEl.classList.add('active');
  }
  currentScreenState = stateName;
}

window.goToChat = () => switchScreen(screenHome, screenChat, 'chat');
window.goToHome = () => {
  if (currentScreenState === 'create_post')  switchScreen(screenCreatePost, screenHome, 'home');
  else if (currentScreenState === 'comments') switchScreen(screenComments,   screenHome, 'home');
  else                                        switchScreen(screenChat,        screenHome, 'home');
};
window.goBackToProfile = () => switchScreen(screenAuth, screenProfile, 'profile');

// ─── MODAL HELPERS ────────────────────────────────────────────
function openModalAnimated(modalId) {
  triggerVibrate(30);
  const modal = document.getElementById(modalId);
  const card  = modal.querySelector('.custom-modal-card');
  modal.classList.add('active');
  if (card) { card.classList.remove('bounce-out'); card.classList.add('bounce-in'); }
}

function closeModalAnimated(modalId) {
  triggerVibrate(30);
  const modal = document.getElementById(modalId);
  const card  = modal.querySelector('.custom-modal-card');
  if (card) { card.classList.remove('bounce-in'); card.classList.add('bounce-out'); }
  setTimeout(() => {
    modal.classList.remove('active');
    if (card) { card.classList.remove('bounce-out'); card.classList.add('bounce-in'); }
  }, 280);
}

window.openSettings  = () => {
  // Sync username label every time settings opens
  _el('settings-username-label', el => el.innerText = currentUser);
  openModalAnimated('settings-modal');
};
window.closeSettings = () => closeModalAnimated('settings-modal');

// ─── ACTION SHEET (3-DOT MENU) ────────────────────────────────
// Called from feed card template
window.openPostOptions = (postId, author) => {
  triggerVibrate(30);
  const safeAuthor = mapLegacyName(author);
  let html = '';

  if (safeAuthor === currentUser) {
    html += `
      <button class="action-item-btn" onclick="window.editPost('${postId}')">
        <i class="fa-solid fa-pen"></i> Edit Caption
      </button>
      <button class="action-item-btn danger" onclick="window.deletePost('${postId}')">
        <i class="fa-solid fa-trash"></i> Delete Post
      </button>`;
  } else {
    html += `
      <button class="action-item-btn" onclick="window.closeActionSheet()">
        <i class="fa-regular fa-star"></i> Save to Favorites
      </button>`;
  }

  actionSheetContent.innerHTML = html;
  actionSheetModal.classList.add('active');
  const card = actionSheetModal.querySelector('.action-sheet-card');
  card.classList.remove('slide-down');
  card.classList.add('slide-up');
};

// Legacy alias — keep in case any old references exist
window.openActionSheet = window.openPostOptions;

window.closeActionSheet = () => {
  triggerVibrate(30);
  const card = actionSheetModal.querySelector('.action-sheet-card');
  card.classList.remove('slide-up');
  card.classList.add('slide-down');
  setTimeout(() => {
    actionSheetModal.classList.remove('active');
    card.classList.remove('slide-down');
  }, 280);
};

window.deletePost = (postId) => {
  window.closeActionSheet();
  setTimeout(() => {
    window.customConfirm(
      "Delete Post?",
      "This moment and all its comments will be permanently removed.",
      () => remove(ref(db, `posts/${postId}`))
    );
  }, 350);
};

window.editPost = async (postId) => {
  window.closeActionSheet();
  await new Promise(r => setTimeout(r, 350));
  const snap = await get(ref(db, `posts/${postId}`));
  if (!snap.exists()) return;
  const post = snap.val();
  const newCaption = prompt("Edit your caption:", post.caption || '');
  if (newCaption !== null) {
    update(ref(db, `posts/${postId}`), { caption: newCaption.trim() });
  }
};

// ─── CREATE POST ──────────────────────────────────────────────
let tempPostImg  = null;
let selectedMood = null;

window.openCreatePost = () => {
  // Sync avatar in create post screen
  _el('create-post-avatar',   el => el.src = userProfilePics[currentUser] || '');
  _el('create-post-username', el => el.innerText = currentUser);
  switchScreen(screenHome, screenCreatePost, 'create_post');
};

window.closeCreatePost = () => {
  switchScreen(screenCreatePost, screenHome, 'home');
  setTimeout(() => {
    const img = document.getElementById('post-preview-img');
    const placeholder = document.getElementById('post-preview-placeholder');
    const overlay = document.getElementById('post-change-photo-overlay');
    if (img)         { img.style.display = 'none'; img.src = ''; }
    if (placeholder) placeholder.style.display = 'flex';
    if (overlay)     overlay.style.display = 'none';
    document.getElementById('post-caption').value = '';
    document.getElementById('post-caption').style.height = 'auto';
    document.querySelectorAll('.mood-pill').forEach(btn => btn.classList.remove('active'));
    tempPostImg  = null;
    selectedMood = null;
  }, 320);
};

window.selectMood = (mood, btnEl) => {
  triggerVibrate(30);
  document.querySelectorAll('.mood-pill').forEach(btn => btn.classList.remove('active'));
  btnEl.classList.add('active');
  selectedMood = btnEl.innerText;
};

window.previewPostImage = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => compressImage(ev.target.result, 800, (b64) => {
    tempPostImg = b64;
    const img = document.getElementById('post-preview-img');
    const placeholder = document.getElementById('post-preview-placeholder');
    const overlay = document.getElementById('post-change-photo-overlay');
    img.src = b64;
    img.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    if (overlay)     overlay.style.display = 'flex';
  });
  reader.readAsDataURL(file);
  e.target.value = '';
};

window.submitPost = () => {
  triggerVibrate(50);
  const caption = document.getElementById('post-caption').value.trim();
  if (!tempPostImg && !caption) return;
  push(ref(db, 'posts'), {
    author:    currentUser,
    image:     tempPostImg,
    caption:   caption,
    mood:      selectedMood,
    timestamp: Date.now()
  });
  window.closeCreatePost();
};

// ─── AUTHENTICATION ───────────────────────────────────────────
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

  document.getElementById('home-user-name').innerText       = currentUser;
  document.getElementById('chat-partner-name').innerText    = partnerName;
  document.getElementById('home-user-img').src              = userProfilePics[currentUser];
  document.getElementById('settings-profile-img').src       = userProfilePics[currentUser];
  document.getElementById('header-partner-img').src         = userProfilePics[partnerName];
  _el('create-post-avatar',    el => el.src       = userProfilePics[currentUser] || '');
  _el('create-post-username',  el => el.innerText = currentUser);
  _el('settings-username-label', el => el.innerText = currentUser);
  _el('comments-user-avatar',  el => el.src       = userProfilePics[currentUser] || '');
}

window.selectProfile = (name) => {
  triggerVibrate(30);
  setupUserSession(name);
  document.getElementById('verify-name').innerText      = name;
  document.getElementById('verify-profile-img').src     = userProfilePics[name];
  document.querySelectorAll('.otp-input').forEach(i => i.value = '');
  switchScreen(screenProfile, screenAuth, 'auth');
};

// OTP input auto-advance
document.querySelectorAll('.otp-input').forEach((input, index, inputs) => {
  input.addEventListener('input', () => {
    if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
    if (index === inputs.length - 1 && input.value !== '') window.verifyCode();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value && index > 0) inputs[index - 1].focus();
  });
});

window.verifyCode = async () => {
  triggerVibrate(50);
  const code = Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');
  try {
    await signInWithEmailAndPassword(auth, "chat@lovebirds.com", code + "-love");
    localStorage.setItem('lovebirds_user', currentUser);
    switchScreen(null, screenHome, 'home');
    startEngine();
  } catch (e) {
    triggerVibrate([50, 50, 50]);
    const authCard = document.querySelector('.auth-card');
    authCard.style.transition = 'transform 0.1s';
    authCard.style.transform  = 'translate(10px, 0)';
    setTimeout(() => authCard.style.transform = 'translate(-10px, 0)', 100);
    setTimeout(() => authCard.style.transform = 'translate(0, 0)',     200);
    document.querySelectorAll('.otp-input').forEach(i => i.value = '');
    document.querySelectorAll('.otp-input')[0].focus();
  }
};

// ─── CORE ENGINE ──────────────────────────────────────────────
function startEngine() {
  requestNotificationPermission();
  loadFeed();
  loadChat();
  listenForUnread();

  const myPresRef = ref(db, `presence/${currentUser}`);
  set(myPresRef, { online: true, typing: false, lastSeen: serverTimestamp() });
  onDisconnect(myPresRef).set({ online: false, lastSeen: serverTimestamp() });

  // Typing detection
  const msgInput = document.getElementById('message-input');
  let typingTimer;
  msgInput.addEventListener('input', () => {
    update(ref(db, `presence/${currentUser}`), { typing: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      update(ref(db, `presence/${currentUser}`), { typing: false });
    }, 1500);
  });

  onValue(ref(db, `presence/${partnerName}`), (snap) => {
    const data = snap.val();
    if (data) updatePartnerStatusUI(data.online, data.lastSeen, data.typing);
  });
}

function updatePartnerStatusUI(isOnline, lastSeen, isTyping) {
  const textEl = document.getElementById('status-text');
  const dotEl  = document.getElementById('status-dot');
  const homeEl = document.getElementById('home-status-text');

  let statusStr = "";
  if (isTyping) {
    statusStr = "typing...";
    if (dotEl) dotEl.className = "status-dot online";
  } else if (isOnline) {
    statusStr = "Online";
    if (dotEl) dotEl.className = "status-dot online";
  } else {
    statusStr = lastSeen ? `Last seen ${formatTime(lastSeen)}` : "Offline";
    if (dotEl) dotEl.className = "status-dot offline";
  }

  if (textEl) textEl.innerText = statusStr;
  if (homeEl) homeEl.innerText = `${partnerName}: ${statusStr}`;
}

function listenForUnread() {
  onValue(ref(db, 'messages'), (snap) => {
    let count = 0;
    snap.forEach(child => {
      const msg = child.val();
      const sender = mapLegacyName(msg.sender);
      if (sender === partnerName && msg.status !== 'read') count++;
    });
    if (count > 0) {
      unreadBadge.innerText = count > 99 ? '99+' : count;
      unreadBadge.classList.remove('hidden');
    } else {
      unreadBadge.classList.add('hidden');
    }
  });
}

// ─── FEED SYSTEM ──────────────────────────────────────────────
function loadFeed() {
  onValue(ref(db, 'posts'), (snap) => {
    feedContainer.innerHTML = '';
    const data = snap.val();

    if (!data) {
      feedContainer.innerHTML = `
        <div style="text-align:center; color:var(--text-sub); margin-top:30px; font-weight:700; font-size:14px;">
          <div style="font-size:36px; margin-bottom:10px;">📸</div>
          No moments shared yet.<br>
          <span style="font-size:12px; font-weight:600;">Be the first to post something!</span>
        </div>`;
      return;
    }

    const posts = Object.entries(data).reverse();
    posts.forEach(([id, post], i) => {
      const authorName = mapLegacyName(post.author);
      const dp = userProfilePics[authorName] || `https://api.dicebear.com/7.x/initials/svg?seed=${authorName}`;
      const moodHtml = post.mood
        ? `<span class="post-mood-badge">is feeling ${post.mood}</span>` : '';
      const likeCount    = post.likes   ? Object.values(post.likes).filter(Boolean).length : 0;
      const commentCount = post.comments ? Object.keys(post.comments).length : 0;
      const isLiked      = post.likes && post.likes[currentUser];

      const card = document.createElement('div');
      card.className = 'feed-card neo-box';
      card.style.animationDelay = `${i * 0.06}s`;
      card.innerHTML = `
        <!-- Post Header -->
        <div class="feed-header">
          <div class="feed-header-left">
            <img src="${dp}" alt="${authorName}" onerror="this.src='https://api.dicebear.com/7.x/initials/svg?seed=${authorName}'">
            <div class="feed-header-info">
              <h4>${authorName} ${moodHtml}</h4>
              <span>${getRelativeDay(post.timestamp)} · ${formatTime(post.timestamp)}</span>
            </div>
          </div>
          <button class="post-options-btn" onclick="window.openPostOptions('${id}', '${escapeHtml(authorName)}')">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>

        <!-- Post Image -->
        ${post.image ? `<img src="${post.image}" class="feed-img" onclick="window.openImage('${post.image}')" alt="Post photo">` : ''}

        <!-- Actions Bar -->
        <div class="feed-actions-bar">
          <button class="feed-action-btn" onclick="window.likePost('${id}')">
            <i class="fa-solid fa-heart heart-icon ${isLiked ? 'liked' : ''}" id="heart-${id}"></i>
            <span class="feed-action-count" id="likes-${id}">${likeCount > 0 ? likeCount : ''}</span>
          </button>
          <button class="feed-action-btn" onclick="window.openComments('${id}')">
            <i class="fa-regular fa-comment comment-icon"></i>
            <span class="feed-action-count">${commentCount > 0 ? commentCount : ''}</span>
          </button>
        </div>

        <!-- Caption -->
        ${post.caption ? `<p class="feed-caption"><b>${authorName}</b> ${escapeHtml(post.caption)}</p>` : ''}
      `;
      feedContainer.appendChild(card);
    });
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
    // Animate heart
    const heartEl = document.getElementById(`heart-${postId}`);
    if (heartEl) { heartEl.classList.remove('liked'); void heartEl.offsetWidth; heartEl.classList.add('liked'); }
  }
};

// ─── COMMENTS ENGINE (Facebook-Style) ─────────────────────────
window.openComments = async (postId) => {
  currentViewedPostId = postId;
  switchScreen(screenHome, screenComments, 'comments');

  // Sync avatar in comment input bar
  _el('comments-user-avatar', el => el.src = userProfilePics[currentUser] || '');

  // Load mini post preview
  try {
    const snap = await get(ref(db, `posts/${postId}`));
    const previewEl = document.getElementById('comment-post-preview');
    if (snap.exists() && previewEl) {
      const post = snap.val();
      const authorName = mapLegacyName(post.author);
      const dp = userProfilePics[authorName] || `https://api.dicebear.com/7.x/initials/svg?seed=${authorName}`;
      previewEl.style.display = 'flex';
      previewEl.innerHTML = `
        ${post.image
          ? `<img src="${post.image}" class="cpr-thumb" onclick="window.openImage('${post.image}')" alt="Post">`
          : `<div style="width:54px;height:54px;border-radius:10px;background:var(--card-bg);border:var(--border-thick);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;">📝</div>`
        }
        <div class="cpr-info">
          <div class="cpr-author">${authorName}</div>
          <div class="cpr-caption">${escapeHtml(post.caption) || '<span style="opacity:0.5;font-style:italic;">No caption</span>'}</div>
        </div>
      `;
    }
  } catch(e) {
    console.log('Preview load error:', e);
  }

  loadComments(postId);
};

window.closeComments = () => {
  currentViewedPostId = null;
  window.cancelReply();
  const previewEl = document.getElementById('comment-post-preview');
  if (previewEl) previewEl.style.display = 'none';
  _el('comments-count-sub', el => el.innerText = '0 comments');
  switchScreen(screenComments, screenHome, 'home');
};

// Active comment listener unsubscribe
let commentsUnsubscribe = null;

function loadComments(postId) {
  // Unsubscribe previous listener
  if (commentsUnsubscribe) { commentsUnsubscribe(); commentsUnsubscribe = null; }

  commentsUnsubscribe = onValue(ref(db, `posts/${postId}/comments`), (snap) => {
    if (currentViewedPostId !== postId) return;
    commentsBox.innerHTML = '';
    const data = snap.val();

    // Update count label
    const count = data ? Object.keys(data).length : 0;
    _el('comments-count-sub', el => el.innerText = `${count} comment${count !== 1 ? 's' : ''}`);

    if (!data) {
      commentsBox.innerHTML = `
        <div style="text-align:center;margin-top:40px;color:var(--text-sub);">
          <div style="font-size:40px;margin-bottom:10px;">💬</div>
          <p style="font-weight:700;font-size:14px;">No comments yet</p>
          <p style="font-size:12px;font-weight:600;margin-top:4px;">Be the first to say something!</p>
        </div>`;
      return;
    }

    Object.entries(data).forEach(([cId, comment]) => {
      const authorName = mapLegacyName(comment.author);
      const dp = userProfilePics[authorName] || `https://api.dicebear.com/7.x/initials/svg?seed=${authorName}`;
      const isMyComment = authorName === currentUser;

      const replyTag = comment.replyTo
        ? `<div class="comment-reply-tag"><i class="fa-solid fa-reply" style="font-size:9px;"></i> @${escapeHtml(comment.replyTo)}</div>` : '';

      const deleteBtn = isMyComment
        ? `<button class="comment-action-btn danger" onclick="window.deleteComment('${postId}','${cId}')">
             <i class="fa-solid fa-trash"></i> Delete
           </button>` : '';

      const likeIcon  = comment.reaction
        ? `<i class="fa-solid fa-heart"></i> Liked`
        : `<i class="fa-regular fa-heart"></i> Like`;
      const likeClass = comment.reaction ? 'liked' : '';

      const reactionBadge = comment.reaction
        ? `<div class="comment-reaction-badge">${comment.reaction}</div>` : '';

      const item = document.createElement('div');
      item.className = 'comment-item';
      item.id = `comment-${cId}`;
      item.innerHTML = `
        <img src="${dp}" class="comment-avatar" alt="${authorName}"
             onerror="this.src='https://api.dicebear.com/7.x/initials/svg?seed=${authorName}'">
        <div class="comment-body">
          <div class="comment-bubble">
            ${reactionBadge}
            <div class="comment-author">
              ${escapeHtml(authorName)}
              <span class="comment-time">${formatTime(comment.timestamp)}</span>
            </div>
            ${replyTag}
            <div class="comment-text">${escapeHtml(comment.text)}</div>
          </div>
          <div class="comment-actions-row">
            <button class="comment-action-btn" onclick="window.replyToComment('${escapeHtml(authorName)}')">
              <i class="fa-solid fa-reply"></i> Reply
            </button>
            <button class="comment-action-btn ${likeClass}"
                    onclick="window.reactToComment('${postId}','${cId}','❤️')">
              ${likeIcon}
            </button>
            ${deleteBtn}
          </div>
        </div>
      `;
      commentsBox.appendChild(item);
    });

    commentsBox.scrollTop = commentsBox.scrollHeight;
  });
}

window.sendComment = () => {
  const input = document.getElementById('comment-input');
  const text  = input.value.trim();
  if (!text || !currentViewedPostId) return;
  triggerVibrate(30);

  push(ref(db, `posts/${currentViewedPostId}/comments`), {
    author:    currentUser,
    text:      text,
    replyTo:   replyingToAuthor,
    timestamp: Date.now(),
    reaction:  null
  });

  input.value = '';
  window.cancelReply();
};

// Send comment on Enter
document.getElementById('comment-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendComment(); }
});

window.replyToComment = (authorName) => {
  triggerVibrate(30);
  replyingToAuthor = authorName;
  const banner = document.getElementById('reply-indicator');
  const label  = document.getElementById('reply-label');
  if (banner) banner.classList.remove('hidden');
  if (label)  label.innerText = `Replying to @${authorName}`;
  document.getElementById('comment-input').focus();
};

window.cancelReply = () => {
  replyingToAuthor = null;
  const banner = document.getElementById('reply-indicator');
  if (banner) banner.classList.add('hidden');
};

window.reactToComment = async (postId, commentId, emoji) => {
  triggerVibrate(30);
  const cRef = ref(db, `posts/${postId}/comments/${commentId}/reaction`);
  const snap = await get(cRef);
  // Toggle: if same emoji exists, remove it
  if (snap.exists() && snap.val() === emoji) {
    update(ref(db, `posts/${postId}/comments/${commentId}`), { reaction: null });
  } else {
    update(ref(db, `posts/${postId}/comments/${commentId}`), { reaction: emoji });
  }
};

window.deleteComment = (postId, commentId) => {
  triggerVibrate(30);
  window.customConfirm(
    "Delete Comment?",
    "Are you sure you want to remove this comment?",
    () => remove(ref(db, `posts/${postId}/comments/${commentId}`))
  );
};

// ─── PROFILE PIC UPLOAD ───────────────────────────────────────
window.uploadProfilePic = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => compressImage(e.target.result, 400, (b64) => {
    update(ref(db, `users/${currentUser}`), { profilePic: b64 });
  });
  reader.readAsDataURL(file);
  event.target.value = '';
};

// ─── CONFIRM MODAL ────────────────────────────────────────────
window.customConfirm = (title, message, callback) => {
  document.getElementById('confirm-title').innerText   = title;
  document.getElementById('confirm-message').innerText = message;
  openModalAnimated('confirm-modal');
  confirmCallback = callback;
};
window.closeConfirm = () => closeModalAnimated('confirm-modal');
document.getElementById('confirm-action-btn').onclick = () => {
  triggerVibrate(50);
  if (confirmCallback) confirmCallback();
  window.closeConfirm();
};

// ─── LOGOUT ───────────────────────────────────────────────────
window.showLogoutWarning = () => {
  window.customConfirm(
    "Logging Out?",
    "Are you sure? Your space will be waiting for you. 💕",
    async () => {
      set(ref(db, `presence/${currentUser}/online`), false);
      localStorage.removeItem('lovebirds_user');
      await signOut(auth);
      window.location.reload();
    }
  );
};

// ─── CLEAR CHAT ───────────────────────────────────────────────
window.clearEntireChatHistory = () => {
  window.customConfirm(
    "Wipe Chat History?",
    "This will permanently delete ALL messages for both of you.",
    () => {
      remove(ref(db, 'messages')).then(() => {
        document.querySelectorAll('.message, .date-header').forEach(el => el.remove());
      });
    }
  );
};

// ─── IMAGE MODAL ──────────────────────────────────────────────
window.openImage = (src) => {
  triggerVibrate(30);
  const modal = document.getElementById('image-modal');
  const img   = document.getElementById('expanded-img');
  img.src = src;
  modal.style.display = 'flex';
  img.classList.remove('bounce-out');
  img.classList.add('bounce-in');
};

window.closeImageModal = () => {
  triggerVibrate(30);
  const modal = document.getElementById('image-modal');
  const img   = document.getElementById('expanded-img');
  img.classList.remove('bounce-in');
  img.classList.add('bounce-out');
  setTimeout(() => {
    modal.style.display = 'none';
    img.src = '';
    img.classList.remove('bounce-out');
    img.classList.add('bounce-in');
  }, 280);
};

// ─── IMAGE COMPRESSION ────────────────────────────────────────
function compressImage(src, maxWidth, callback) {
  const img = new Image();
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.65));
    } catch(err) { callback(src); }
  };
  img.src = src;
}

// ─── VOICE RECORDING ──────────────────────────────────────────
window.toggleRecording = async () => {
  triggerVibrate(30);
  const recordBtn = document.getElementById('record-btn');
  const msgInput  = document.getElementById('message-input');

  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks   = [];

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        audioBlobToSend = new Blob(audioChunks, { type: 'audio/webm' });
        document.getElementById('audio-preview-player').src = URL.createObjectURL(audioBlobToSend);
        document.getElementById('audio-preview-container').style.display = 'flex';
        document.getElementById('message-input').style.display  = 'none';
        document.getElementById('attach-btn').style.display     = 'none';
        document.getElementById('record-btn').style.display     = 'none';
        document.getElementById('text-send-btn').style.display  = 'none';
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      recordBtn.classList.add('recording-active');
      recordBtn.innerHTML    = '<i class="fa-solid fa-stop"></i>';
      msgInput.placeholder   = 'Recording...';
      msgInput.disabled      = true;
    } catch(e) {
      alert("Microphone access is required to send voice notes.");
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.classList.remove('recording-active');
    recordBtn.innerHTML  = '<i class="fa-solid fa-microphone"></i>';
    msgInput.placeholder = 'Type a message...';
    msgInput.disabled    = false;
  }
};

window.cancelAudio = () => {
  triggerVibrate(30);
  audioBlobToSend = null;
  document.getElementById('audio-preview-player').src          = '';
  document.getElementById('audio-preview-container').style.display = 'none';
  document.getElementById('message-input').style.display  = 'block';
  document.getElementById('attach-btn').style.display     = 'block';
  document.getElementById('record-btn').style.display     = 'block';
  document.getElementById('text-send-btn').style.display  = 'block';
};

window.sendAudio = () => {
  if (!audioBlobToSend) return;
  triggerVibrate(50);
  const reader = new FileReader();
  reader.onload = (e) => {
    push(ref(db, 'messages'), {
      sender:    currentUser,
      text:      "",
      image:     null,
      audio:     e.target.result,
      timestamp: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000),
      isDeleted: false,
      status:    'sent'
    });
    window.cancelAudio();
  };
  reader.readAsDataURL(audioBlobToSend);
};

// ─── CHAT SYSTEM ──────────────────────────────────────────────
function renderDateHeader(timestamp) {
  const div = document.createElement('div');
  div.className = 'date-header fade-in';
  div.innerText = getRelativeDay(timestamp);
  const typingInd = document.getElementById('typing-indicator');
  if (typingInd) chatBox.insertBefore(div, typingInd);
  else chatBox.appendChild(div);
}

function loadChat() {
  document.querySelectorAll('.message, .date-header').forEach(el => el.remove());
  const typingInd = document.getElementById('typing-indicator');
  if (typingInd && !chatBox.contains(typingInd)) chatBox.appendChild(typingInd);
  lastRenderedDateStr = '';

  onChildAdded(ref(db, 'messages'), (snapshot) => {
    const msg = snapshot.val(), key = snapshot.key;
    if (!msg || typeof msg !== 'object') return;

    // Auto-expire voice notes
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
        msgSound.play().catch(() => {});
        const notifText = msg.text ? msg.text : (msg.audio ? "🎤 Voice note" : "📷 Photo");
        sendSystemNotification(`New message from ${partnerName}`, notifText);
      }
    }

    renderMsg(key, msg, type);
  });

  onChildChanged(ref(db, 'messages'), (snapshot) => {
    const el  = document.getElementById(`msg-${snapshot.key}`);
    const msg = snapshot.val();
    if (!msg) return;
    msg.status = msg.status || 'read';
    if (el) el.innerHTML = buildMsgHTML(snapshot.key, msg);
  });
}

function markMessagesAsRead() {
  get(ref(db, 'messages')).then((snap) => {
    if (!snap.exists()) return;
    const updates = {};
    let needsUpdate = false;
    snap.forEach(child => {
      const msg = child.val();
      const sender = mapLegacyName(msg.sender);
      if (sender !== currentUser && (msg.status === 'sent' || msg.status === 'delivered')) {
        updates[`${child.key}/status`] = 'read';
        needsUpdate = true;
      }
    });
    if (needsUpdate) update(ref(db, 'messages'), updates);
  });
}

function buildMsgHTML(id, msg) {
  if (msg.isDeleted) return `
    <span style="font-style:italic; opacity:0.55; font-size:12.5px; display:flex; align-items:center; gap:5px;">
      <i class="fa-solid fa-ban"></i> Message deleted
    </span>`;

  let ticks = '';
  const senderName = mapLegacyName(msg.sender);
  if (senderName === currentUser) {
    if (msg.status === 'read')
      ticks = `<span class="read-receipt status-read"><i class="fa-solid fa-check-double"></i></span>`;
    else if (msg.status === 'delivered')
      ticks = `<span class="read-receipt"><i class="fa-solid fa-check-double"></i></span>`;
    else
      ticks = `<span class="read-receipt"><i class="fa-solid fa-check"></i></span>`;
  }

  let html = `
    <div class="message-actions-menu">
      <button class="react-btn" onclick="window.reactToMessage('${id}','❤️')">❤️</button>
      <button class="react-btn" onclick="window.reactToMessage('${id}','😂')">😂</button>
      <button class="react-btn" onclick="window.reactToMessage('${id}','🥺')">🥺</button>
      <button class="del-msg-btn" onclick="window.customConfirm('Delete message?','This removes it for both of you.',()=>window.deleteMessage('${id}'))">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>`;

  if (msg.image) html += `<img src="${msg.image}" style="width:100%;border-radius:10px;border:2px solid var(--text-main);margin-bottom:8px;cursor:pointer;" onclick="window.openImage('${msg.image}')">`;
  if (msg.audio) html += `<div class="audio-msg-bubble"><i class="fa-solid fa-microphone-lines"></i><audio controls src="${msg.audio}"></audio></div>`;
  if (msg.text)  html += `<span>${escapeHtml(msg.text)}</span>`;

  html += `<div class="msg-time-wrapper"><span class="msg-time">${formatTime(msg.timestamp)}</span>${ticks}</div>`;
  if (msg.reaction) html += `<div class="message-reaction-badge bounce-in">${msg.reaction}</div>`;
  return html;
}

function renderMsg(id, msg, type) {
  const div = document.createElement('div');
  div.id = `msg-${id}`;
  div.className = `message ${type}`;
  div.innerHTML = buildMsgHTML(id, msg);
  const typingInd = document.getElementById('typing-indicator');
  if (typingInd) chatBox.insertBefore(div, typingInd);
  else chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

window.sendMessage = () => {
  const text = document.getElementById('message-input').value.trim();
  if (!text) return;
  triggerVibrate(30);
  document.getElementById('message-input').value = '';
  push(ref(db, 'messages'), {
    sender: currentUser, text, image: null, audio: null,
    timestamp: Date.now(), isDeleted: false, status: 'sent'
  });
};

// Send on Enter
document.getElementById('message-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMessage(); }
});

window.sendPhoto = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => compressImage(ev.target.result, 800, (b64) => {
    push(ref(db, 'messages'), {
      sender: currentUser, text: "", image: b64, audio: null,
      timestamp: Date.now(), isDeleted: false, status: 'sent'
    });
  });
  reader.readAsDataURL(file);
  e.target.value = '';
};

window.reactToMessage = (msgId, emoji) => {
  triggerVibrate(30);
  update(ref(db, `messages/${msgId}`), { reaction: emoji });
};

window.deleteMessage = (id) => {
  update(ref(db, `messages/${id}`), { isDeleted: true, text: "", image: null, audio: null, reaction: null });
};
