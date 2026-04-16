// FuelTrack — Aurora 2.0 Identity Engine
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  updateDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import firebaseConfig from "./firebase-config.js";

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// State
let currentUser = null;

// ── Authentication Functions ──

window.loginWithGoogle = async function() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await checkUserRegistration(result.user);
  } catch (error) {
    console.error("Google login failed:", error);
    alert("Login failed: " + error.message);
  }
};

window.loginWithEmail = async function() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value.trim();
  
  if (!email || !pass) return alert("Please fill all fields");

  try {
    // Try sign in
    let result;
    try {
      result = await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        // Auto-signup if user doesn't exist (assuming invalid-cred means not yet registered for simplicity in demo)
        result = await createUserWithEmailAndPassword(auth, email, pass);
      } else {
        throw err;
      }
    }
    await checkUserRegistration(result.user);
  } catch (error) {
    console.error("Email login failed:", error);
    alert(error.message);
  }
};

async function checkUserRegistration(user) {
  const userDoc = await getDoc(doc(db, "users", user.uid));
  
  if (userDoc.exists()) {
    // User already registered — go to dashboard
    hideAuth();
    loadUserData(user.uid);
  } else {
    // New user — show profile setup stage
    switchStage('loginStage', 'profileStage');
    
    // Pre-fill display name if available from Google
    if (user.displayName) {
      document.getElementById('regDisplayName').value = user.displayName;
    }
  }
}

window.completeRegistration = async function() {
  const username = document.getElementById('regUsername').value.trim().toLowerCase();
  const displayName = document.getElementById('regDisplayName').value.trim();
  
  if (!username || !displayName) return alert("Please fill all fields");
  if (username.length < 3) return alert("Username too short");
  if (!/^[a-z0-9_]+$/.test(username)) return alert("Username can only contain a-z, 0-9, and underscores");

  try {
    // Check uniqueness
    const usernameDoc = await getDoc(doc(db, "usernames", username));
    if (usernameDoc.exists()) {
      return alert("This handle is already taken. Try another!");
    }

    const { uid, email, phoneNumber } = auth.currentUser;
    
    // 1. Create username mapping
    await setDoc(doc(db, "usernames", username), { uid });
    
    // 2. Create user profile
    const profile = {
      uid,
      email: email || null,
      phoneNumber: phoneNumber || null,
      username,
      displayName,
      createdAt: new Date().toISOString()
    };
    
    // 3. Migrate local data if exists
    const localData = JSON.parse(localStorage.getItem('nutritionTracker') || '{}');
    const cloudData = {
      profile: { ...profile, ...(localData.profile || {}) },
      meals: localData.meals || {},
      workouts: localData.workouts || {},
      weightLog: localData.weightLog || [],
      waterLog: localData.waterLog || {},
      daySplits: localData.daySplits || {}
    };

    await setDoc(doc(db, "users", uid), cloudData);
    
    alert("Welcome to the cloud, " + displayName + "!");
    hideAuth();
    loadUserData(uid);
  } catch (error) {
    console.error("Registration failed:", error);
    alert("Error completing registration: " + error.message);
  }
};

function switchStage(fromId, toId) {
  document.getElementById(fromId).classList.remove('active');
  document.getElementById(toId).classList.add('active');
}

function hideAuth() {
  const wrapper = document.getElementById('authOverlay');
  wrapper.classList.remove('active');
  setTimeout(() => wrapper.style.display = 'none', 800);
}

window.logout = async function() {
  if (confirm("Are you sure you want to logout?")) {
    await signOut(auth);
    location.reload();
  }
};

// ── Cloud Sync Logic ──

async function loadUserData(uid) {
  onSnapshot(doc(db, "users", uid), (doc) => {
    if (doc.exists()) {
      const cloudData = doc.data();
      Object.assign(window.APP, cloudData);
      localStorage.setItem('nutritionTracker', JSON.stringify(window.APP));
      if (window.renderCurrentPage) window.renderCurrentPage();
      updateProfileUI(cloudData.profile);
    }
  });
}

function updateProfileUI(profile) {
  const profileName = document.getElementById('profileName');
  if (profileName) profileName.textContent = profile.displayName || "User";
  
  const profileSub = document.querySelector('.profile-subtitle');
  if (profileSub) profileSub.textContent = "@" + profile.username;
}

window.syncToCloud = async function(data) {
  if (!auth.currentUser) return;
  try {
    await updateDoc(doc(db, "users", auth.currentUser.uid), data);
  } catch (e) {
    console.error("Cloud sync fail:", e);
  }
};

// ── Initial State Listen ──
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    checkUserRegistration(user);
    document.body.classList.add('is-authenticated');
  } else {
    currentUser = null;
    document.getElementById('authOverlay').classList.add('active');
    document.body.classList.remove('is-authenticated');
  }
});
