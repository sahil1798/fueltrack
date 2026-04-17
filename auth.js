// FuelTrack — Aurora 3.0 Cinematic Identity Engine
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

// ── Wizard State ──
const WIZARD_TOTAL_STEPS = 6;
let currentWizStep = 1;

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
    let result;
    try {
      result = await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
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
    hideAuth();
    loadUserData(user.uid);
    safeNavigate('dashboard');
  } else {
    // Start Cinematic Onboarding
    switchStage('loginStage', 'profileStage');
    if (user.displayName) document.getElementById('regDisplayName').value = user.displayName;
  }
}

// ── Onboarding Wizard Logic ──

window.setGender = function(val) {
  document.getElementById('regGender').value = val;
  document.querySelectorAll('.gender-card').forEach(c => {
    c.classList.toggle('active', c.dataset.val === val);
  });
};

window.setWizOption = function(group, val, el) {
  const hiddenId = group === 'activity' ? 'regActivity' : 'regGoal';
  document.getElementById(hiddenId).value = val;
  document.querySelectorAll(`.option-card[data-group="${group}"]`).forEach(c => {
    c.classList.remove('active');
  });
  el.classList.add('active');
};

window.wizStep = function(delta) {
  const nextStep = currentWizStep + delta;
  
  // Validation
  if (delta > 0 && !validateStep(currentWizStep)) return;
  
  if (nextStep > 5) {
    completeRegistration();
    return;
  }
  
  if (nextStep < 1) return;

  // Change UI
  document.querySelector(`.wiz-step[data-step="${currentWizStep}"]`).classList.remove('active');
  document.querySelector(`.wiz-step[data-step="${nextStep}"]`).classList.add('active');
  
  currentWizStep = nextStep;
  updateWizProgress();
};

function validateStep(step) {
  if (step === 1) {
    const u = document.getElementById('regUsername').value.trim();
    const n = document.getElementById('regDisplayName').value.trim();
    if (u.length < 3 || !n) {
      alert("Please enter a valid handle and name");
      return false;
    }
    if (!/^[a-z0-9_]+$/.test(u.toLowerCase())) {
        alert("Handle can only contain a-z, 0-9, and underscores");
        return false;
    }
  }
  if (step === 2) {
    const age = document.getElementById('regAge').value;
    if (!age || age < 10) {
      alert("Please enter a valid age");
      return false;
    }
  }
  if (step === 3) {
    const h = document.getElementById('regHeight').value;
    const w = document.getElementById('regWeight').value;
    if (!h || !w) {
      alert("Please enter both height and weight");
      return false;
    }
  }
  return true;
}

function updateWizProgress() {
  const pct = (currentWizStep / 5) * 100;
  document.getElementById('wizProgress').style.width = pct + '%';
  document.getElementById('currStep').textContent = currentWizStep;
  document.getElementById('wizPrev').style.visibility = currentWizStep === 1 ? 'hidden' : 'visible';
  document.getElementById('wizNext').textContent = currentWizStep === 5 ? 'Finalize 🔥' : 'Next Step';
}

window.completeRegistration = async function() {
  const username = document.getElementById('regUsername').value.trim().toLowerCase();
  
  try {
    // Check username uniqueness
    const usernameDoc = await getDoc(doc(db, "usernames", username));
    if (usernameDoc.exists()) {
      currentWizStep = 1; // Back to start
      wizStep(0); 
      return alert("Handle taken! Back to step 1 to choose another.");
    }

    const { uid, email } = auth.currentUser;
    
    // Gather all wizard data
    const profile = {
      uid,
      username,
      name: document.getElementById('regDisplayName').value.trim(),
      age: parseInt(document.getElementById('regAge').value),
      gender: document.getElementById('regGender').value,
      height: parseFloat(document.getElementById('regHeight').value),
      weight: parseFloat(document.getElementById('regWeight').value),
      activityLevel: parseFloat(document.getElementById('regActivity').value),
      goal: document.getElementById('regGoal').value,
      stepGoal: parseInt(document.getElementById('regStepGoal').value) || 10000,
      email: email || null,
      createdAt: new Date().toISOString()
    };
    
    await setDoc(doc(db, "usernames", username), { uid });
    
    // Initial State Structure
    const cloudData = {
      profile,
      meals: {},
      workouts: {},
      weightLog: [{ date: new Date().toISOString().split('T')[0], weight: profile.weight }],
      waterLog: {},
      daySplits: {}
    };

    await setDoc(doc(db, "users", uid), cloudData);
    
    alert("Onboarding complete! Welcome, " + profile.name);
    hideAuth();
    loadUserData(uid);
    safeNavigate('dashboard');
  } catch (error) {
    console.error("Registration failed:", error);
    alert(error.message);
  }
};

// ── Core Utils ──

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
  if (confirm("Logout from FuelTrack?")) {
    await signOut(auth);
    location.reload();
  }
};

async function loadUserData(uid) {
  onSnapshot(doc(db, "users", uid), (doc) => {
    if (doc.exists()) {
      const cloudData = doc.data();
      
      // Handover to main app logic
      if (window.applyCloudData) {
        window.applyCloudData(cloudData);
      }
      
      updateProfileUI(cloudData.profile);
    }
  });
}

function updateProfileUI(profile) {
  const profileName = document.getElementById('profileName');
  if (profileName) profileName.textContent = profile.name || "User";
  const profileSub = document.querySelector('.profile-subtitle');
  if (profileSub) profileSub.textContent = "@" + profile.username;
  
  // Also update sidebar footer
  const sbName = document.getElementById('sidebarUserName');
  if (sbName) sbName.textContent = profile.name;
  const sbGoal = document.querySelector('.sidebar-user-goal');
  if (sbGoal) sbGoal.textContent = `${profile.goal.toUpperCase()} · ${profile.gender === 'male' ? 'KINGS' : 'QUEENS'} MODE`;
}

window.syncToCloud = async function(data) {
  if (!auth.currentUser) return;
  try {
    await updateDoc(doc(db, "users", auth.currentUser.uid), data);
  } catch (e) { console.error("Cloud sync fail:", e); }
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    checkUserRegistration(user);
    document.body.classList.add('is-authenticated');
  } else {
    document.getElementById('authOverlay').classList.add('active');
    document.body.classList.remove('is-authenticated');
  }
});

function safeNavigate(page) {
  if (window.navigateTo) {
    window.navigateTo(page);
  } else {
    console.log("App engine not ready, retrying navigation in 100ms...");
    setTimeout(() => safeNavigate(page), 100);
  }
}
