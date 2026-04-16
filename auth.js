// FuelTrack — Authentication & Cloud Sync Engine
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import firebaseConfig from "./firebase-config.js";

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State
let confirmationResult = null;
let currentUser = null;
let iti = null;

// ── Auth UI Elements ──
// These will be added to index.html
const authOverlay = () => document.getElementById('authOverlay');

// ── Authentication Functions ──

async function initRecaptcha() {
  if (window.recaptchaVerifier) return;
  window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    'size': 'invisible',
    'callback': (response) => {
      // reCAPTCHA solved, allow signInWithPhoneNumber.
    }
  });
}

window.sendOTP = async function() {
  if (!iti) return;
  const phoneNumber = iti.getNumber();
  if (!iti.isValidNumber()) return alert("Please enter a valid phone number");

  try {
    await initRecaptcha();
    const appVerifier = window.recaptchaVerifier;
    confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
    
    switchStage('phoneStage', 'otpStage');
    alert("OTP sent to " + phoneNumber);
  } catch (error) {
    console.error("OTP send failed:", error);
    alert("Fail to send OTP: " + error.message);
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.render().then(widgetId => {
        grecaptcha.reset(widgetId);
      });
    }
  }
};

window.verifyOTP = async function() {
  const otpInput = document.getElementById('loginOTP');
  const code = otpInput.value.trim();
  if (!code) return alert("Please enter the OTP");

  try {
    const result = await confirmationResult.confirm(code);
    const user = result.user;
    // Check if user exists in Firestore
    await checkUserRegistration(user);
  } catch (error) {
    console.error("OTP verification failed:", error);
    alert("Invalid OTP, try again.");
  }
};

async function checkUserRegistration(user) {
  const userDoc = await getDoc(doc(db, "users", user.uid));
  
  if (userDoc.exists()) {
    // User already registered
    hideAuth();
    loadUserData(user.uid);
  } else {
    // New user — show profile setup
    switchStage('otpStage', 'profileStage');
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
      return alert("This username is already taken. Try another!");
    }

    const { uid, phoneNumber } = auth.currentUser;
    
    // 1. Create username mapping
    await setDoc(doc(db, "usernames", username), { uid });
    
    // 2. Create user profile
    const profile = {
      uid,
      phoneNumber,
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
    
    alert("Registration complete! Welcome " + displayName);
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
  document.getElementById('authOverlay').classList.remove('active');
}

window.logout = async function() {
  if (confirm("Are you sure you want to logout?")) {
    await signOut(auth);
    location.reload(); // Refresh to clean state
  }
};

// ── Cloud Sync Logic ──

async function loadUserData(uid) {
  // Listen for real-time changes
  onSnapshot(doc(db, "users", uid), (doc) => {
    if (doc.exists()) {
      const cloudData = doc.data();
      // Update local APP state
      Object.assign(window.APP, cloudData);
      
      // Save a local backup
      localStorage.setItem('nutritionTracker', JSON.stringify(window.APP));
      
      // Update UI
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

// Global expose for saveState update in app.js
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
    // Remove local-only limitation
    document.body.classList.add('is-authenticated');
  } else {
    currentUser = null;
    document.getElementById('authOverlay').classList.add('active');
    document.body.classList.remove('is-authenticated');
  }
});

// ── Initialize International Phone Input ──
document.addEventListener('DOMContentLoaded', () => {
  const input = document.querySelector("#loginPhone");
  if (input) {
    iti = window.intlTelInput(input, {
      utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/18.3.3/js/utils.js",
      separateDialCode: true,
      preferredCountries: ["in", "us", "gb"]
    });
  }
});
