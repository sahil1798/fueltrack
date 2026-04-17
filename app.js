// ============================================
// NUTRITION + WORKOUT TRACKER — Core App
// ============================================

// ── State ──
const APP = {
  currentPage: 'dashboard',
  currentDate: new Date(),
  profile: null,
  targets: null,
  meals: {},       // { "2026-04-16": { breakfast: [...], lunch: [...], ... } }
  workouts: {},    // { "2026-04-16": [ { exerciseId, sets: [{reps, weight}], muscle } ] }
  weightLog: [],   // [ { date, weight } ]
  waterLog: {},    // { "2026-04-16": glasses }
  isCloudLoaded: false, // Guard for cloud sync
};

// ── Date Helpers ──
function dateKey(d) {
  const dt = d || APP.currentDate;
  return dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');
}

function formatDateDisplay(d) {
  const today = new Date();
  const dt = d || APP.currentDate;
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  const str = dt.toLocaleDateString('en-IN', opts);
  if (dateKey(dt) === dateKey(today)) return str + ' <span class="today-badge">TODAY</span>';
  return str;
}

function prevDay() { APP.currentDate.setDate(APP.currentDate.getDate() - 1); renderCurrentPage(); }
function nextDay() { APP.currentDate.setDate(APP.currentDate.getDate() + 1); renderCurrentPage(); }
function goToday() { APP.currentDate = new Date(); renderCurrentPage(); }

function getWeekDates() {
  const d = new Date(APP.currentDate);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(mon);
    dt.setDate(mon.getDate() + i);
    dates.push(dt);
  }
  return dates;
}

// ── Storage ──
function saveState() {
  const data = {
    profile: APP.profile,
    meals: APP.meals,
    workouts: APP.workouts,
    weightLog: APP.weightLog,
    waterLog: APP.waterLog,
    daySplits: APP.daySplits || {},
  };
  localStorage.setItem('nutritionTracker', JSON.stringify(data));
  
  // Cloud Sync if authenticated AND cloud is loaded (prevent overwrite of cloud data by defaults)
  if (window.syncToCloud && APP.isCloudLoaded) {
    window.syncToCloud(data);
  }
}

// ── Bridge for Auth.js ──
window.applyCloudData = function(data) {
  if (!data) return;
  
  // Deep merge cloud data into local state
  Object.assign(APP, data);
  
  // Migration for new RPG and AI settings
  if (!APP.profile.rpg) APP.profile.rpg = { ...DEFAULT_PROFILE.rpg };
  if (!APP.profile.aiSettings) APP.profile.aiSettings = { ...DEFAULT_PROFILE.aiSettings };

  // Mark as loaded to enable cloud saving
  APP.isCloudLoaded = true;
  
  // Persistence
  localStorage.setItem('nutritionTracker', JSON.stringify(data));
  
  // Recalculate everything
  if (APP.profile) {
    APP.targets = calcTargets(APP.profile, getDailyActiveCals(dateKey()));
  }
  
  updateRPG();
  
  // Full UI Refresh
  if (window.renderCurrentPage) window.renderCurrentPage();
};

function loadState() {
  const raw = localStorage.getItem('nutritionTracker');
  if (raw) {
    try {
      const data = JSON.parse(raw);
      APP.profile = data.profile || { ...DEFAULT_PROFILE };
      APP.meals = data.meals || {};
      APP.workouts = data.workouts || {};
      APP.weightLog = data.weightLog || [];
      APP.waterLog = data.waterLog || {};
      APP.stepLog = data.stepLog || {};
      APP.customActivities = data.customActivities || [];
      APP.daySplits = data.daySplits || {};
    } catch {
      initDefaults();
    }
  } else {
    initDefaults();
  }
  
  // Recalculate targets based on profile
  if (APP.profile) {
    APP.targets = calcTargets(APP.profile);
  }
}

function initDefaults() {
  APP.profile = { ...DEFAULT_PROFILE };
  APP.meals = {};
  APP.workouts = {};
  APP.weightLog = [{ date: dateKey(), weight: 67 }];
  APP.waterLog = {};
  APP.stepLog = {};
  APP.customActivities = [];
  APP.daySplits = {};
}

// ── User Split Choices ──
const USER_SPLITS = [
  { id: 'chest', name: 'Chest', icon: '🏋️', muscles: ['chest'] },
  { id: 'back', name: 'Back', icon: '💪', muscles: ['back', 'traps'] },
  { id: 'legs', name: 'Legs', icon: '🦵', muscles: ['legs'] },
  { id: 'shoulders', name: 'Shoulders', icon: '⚡', muscles: ['shoulders'] },
  { id: 'arms', name: 'Arms', icon: '💪', muscles: ['biceps', 'triceps', 'forearms'] },
  { id: 'cardio_abs', name: 'Cardio / Abs', icon: '🎯', muscles: ['cardio', 'abs'] },
  { id: 'rest', name: 'Rest Day', icon: '😴', muscles: [] },
];

function getDaySplit(key) {
  const splitId = APP.daySplits?.[key];
  return USER_SPLITS.find(s => s.id === splitId) || null;
}

function setDaySplit(splitId) {
  const key = dateKey();
  if (!APP.daySplits) APP.daySplits = {};
  APP.daySplits[key] = splitId;
  saveState();
  renderCurrentPage();
}

// ── Meal Helpers ──
function getMeals(key) {
  return APP.meals[key] || { breakfast: [], lunch: [], evening: [], dinner: [], snacks: [] };
}

function addMealEntry(mealType, foodId, qty, customGrams) {
  const key = dateKey();
  if (!APP.meals[key]) APP.meals[key] = { breakfast: [], lunch: [], evening: [], dinner: [], snacks: [] };
  const food = FOOD_DATABASE.find(f => f.id === foodId);
  if (!food) return;
  let multiplier = qty;
  let servingLabel = qty > 1 ? `×${qty}` : '';
  // If custom grams provided, calculate proportional macros
  if (customGrams && food.servingGrams) {
    multiplier = customGrams / food.servingGrams;
    servingLabel = `${customGrams}g`;
  }
  APP.meals[key][mealType].push({
    id: Date.now() + Math.random(),
    foodId,
    qty: customGrams ? 1 : qty,
    customGrams: customGrams || null,
    name: food.name,
    servingLabel,
    calories: Math.round(food.calories * multiplier),
    protein: Math.round(food.protein * multiplier * 10) / 10,
    carbs: Math.round(food.carbs * multiplier * 10) / 10,
    fat: Math.round(food.fat * multiplier * 10) / 10,
    fiber: Math.round(food.fiber * multiplier * 10) / 10,
  });
  
  addXP(XP_MAP.MEAL_LOG);
  saveState();
  updateRPG();
  renderCurrentPage();
}

function removeMealEntry(mealType, entryId) {
  const key = dateKey();
  const m = APP.meals[key];
  if (!m || !m[mealType]) return;
  m[mealType] = m[mealType].filter(e => e.id !== entryId);
  saveState();
  renderCurrentPage();
}

function getDayTotals(key) {
  const m = APP.meals[key] || {};
  let cal = 0, pro = 0, carb = 0, fat = 0, fib = 0;
  Object.values(m).forEach(arr => {
    if (!Array.isArray(arr)) return;
    arr.forEach(e => {
      cal += e.calories || 0;
      pro += e.protein || 0;
      carb += e.carbs || 0;
      fat += e.fat || 0;
      fib += e.fiber || 0;
    });
  });
  return { calories: cal, protein: Math.round(pro * 10) / 10, carbs: Math.round(carb * 10) / 10, fat: Math.round(fat * 10) / 10, fiber: Math.round(fib * 10) / 10 };
}

function getMealCals(key, mealType) {
  const m = APP.meals[key];
  if (!m || !m[mealType]) return 0;
  return m[mealType].reduce((s, e) => s + (e.calories || 0), 0);
}

// ── Smart Fuel Coach ──
function getCoachAdvice() {
  const k = dateKey();
  const totals = getDayTotals(k);
  const targets = APP.targets;
  const remCals = targets.calories - totals.calories;
  const remPro = targets.protein - totals.protein;
  const hour = new Date().getHours();
  
  // Case 1: Over Cals
  if (remCals < -50) {
    return {
      title: "Coach's Warning ⚠️",
      text: `You've exceeded your calories by ${Math.abs(remCals)}. Keep your next meals light! Focus on volume and high-water foods (Cucumbers, Salads).`,
      type: 'warning'
    };
  }
  
  // Case 2: Protein Deficit
  if (remPro > 15) {
    const suggestions = FOOD_DATABASE.filter(f => {
      const pPer100 = f.protein;
      const cPer100 = f.calories;
      return (pPer100 > 15) && (cPer100 < remCals * 0.8 || remCals > 500); 
    }).sort((a,b) => b.protein - a.protein).slice(0, 2);
    
    if (suggestions.length > 0) {
      return {
        title: "Protein Mission 🥩",
        text: `You are ${Math.round(remPro)}g short on protein. I suggest adding ${suggestions[0].name} or ${suggestions[1]?.name || 'a Protein Shake'} to your next meal.`,
        item: suggestions[0],
        type: 'advice'
      };
    }
  }
  
  // Case 3: Evening Refuel (Special logic for late in day)
  if (hour >= 19 && remCals > 200) {
    return {
      title: "Nighttime Refuel 🌙",
      text: `You still have ${remCals} calories to hit your goal. A light high-protein snack like Greek Yogurt would be perfect now.`,
      type: 'refuel'
    };
  }

  // Case 4: Perfect Day
  if (Math.abs(remCals) < 100 && Math.abs(remPro) < 10) {
    return {
      title: "Perfect Adherence 💎",
      text: "You are absolutely crushing your macro targets today. Stay consistent and keep this momentum!",
      type: 'success'
    };
  }

  return {
    title: "Coach's Pulse 🧠",
    text: "You're on track. Keep logging your steps and meals to stay ahead of the game.",
    type: 'neutral'
  };
}

// ── RPG Character Engine ──
function addXP(amount) {
  if (!APP.profile.rpg) APP.profile.rpg = { level: 1, xp: 0, str: 0, agi: 0, vit: 0 };
  
  let r = APP.profile.rpg;
  r.xp += amount;
  
  // Level up logic (Level * 500 XP required)
  const xpNeeded = r.level * 500;
  if (r.xp >= xpNeeded) {
    r.xp -= xpNeeded;
    r.level++;
    saveState();
    showLevelUpModal(r.level);
  } else {
    saveState();
  }
}

function updateRPG() {
  if (!APP.profile.rpg) APP.profile.rpg = { level: 1, xp: 0, str: 0, agi: 0, vit: 0 };
  
  // Attributes calculation based on last 14 days
  let strength = 0, agility = 0, vitality = 0;
  const now = new Date();
  
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    
    // Strength: From resistance sets
    const dailyWorkouts = APP.workouts[key] || [];
    dailyWorkouts.forEach(w => {
      if (w.type === 'strength' && w.sets) {
        strength += w.sets.length;
      }
    });
    
    // Agility: From steps & cardio duration
    const steps = APP.stepLog[key] || 0;
    agility += Math.floor(steps / 2000);
    dailyWorkouts.forEach(w => {
      if (w.type === 'duration') agility += Math.floor(w.duration / 15);
    });
    
    // Vitality: From water & nutrition (Simplified for now)
    const water = APP.waterLog[key] || 0;
    if (water >= 8) vitality += 1;
    const totals = getDayTotals(key);
    if (totals.protein >= (APP.targets.protein * 0.8)) vitality += 1;
  }
  
  APP.profile.rpg.str = strength;
  APP.profile.rpg.agi = agility;
  APP.profile.rpg.vit = Math.floor(vitality / 2); // Normalize
}

function showLevelUpModal(level) {
  showToast(`🎊 LEVEL UP! You are now Level ${level}!`, 'success');
  // Add fancy cinematic effect here later if needed
}

// ── Step Tracking ──
function getSteps(key) { return APP.stepLog[key] || 0; }

function addSteps(count) {
  const k = dateKey();
  const wasUnderGoal = getSteps(k) < (APP.profile.stepGoal || 10000);
  
  APP.stepLog[k] = (APP.stepLog[k] || 0) + count;
  
  if (wasUnderGoal && APP.stepLog[k] >= (APP.profile.stepGoal || 10000)) {
    addXP(XP_MAP.STEP_GOAL_HIT);
  }
  
  saveState();
  APP.targets = calcTargets(APP.profile, getDailyActiveCals(k));
  updateRPG();
  renderCurrentPage();
}

function setSteps(count) {
  const k = dateKey();
  APP.stepLog[k] = count;
  saveState();
  APP.targets = calcTargets(APP.profile, getDailyActiveCals(k));
  renderCurrentPage();
}

// ── Performance Helpers ──
function getDailyActiveCals(key) {
  let activeTotal = 0;
  
  // 1. Calories from Steps (approx 0.04 kcal / step)
  const steps = APP.stepLog[key] || 0;
  activeTotal += steps * 0.04;
  
  // 2. Calories from Logged Activities
  const workouts = APP.workouts[key] || [];
  workouts.forEach(w => {
    if (w.caloriesBurned) activeTotal += w.caloriesBurned;
  });
  
  return Math.round(activeTotal);
}

// ── Workout Helpers ──
function getWorkouts(key) {
  return APP.workouts[key] || [];
}

function addWorkoutEntry(exerciseId, sets, duration = 0) {
  const key = dateKey();
  if (!APP.workouts[key]) APP.workouts[key] = [];
  
  // Search in both DB and Custom Activities
  let ex = EXERCISE_DATABASE.find(e => e.id === exerciseId);
  if (!ex) ex = APP.customActivities.find(e => e.id === exerciseId);
  if (!ex) return;
  
  let caloriesBurned = 0;
  if (ex.type === 'duration' && duration > 0) {
    // Formula: MET * 3.5 * weight_kg / 200 * duration_min
    const met = ex.met || 6.0;
    caloriesBurned = Math.round(met * 3.5 * (APP.profile.weight || 70) / 200 * duration);
  }

  APP.workouts[key].push({
    id: Date.now() + Math.random(),
    exerciseId,
    name: ex.name,
    muscle: ex.muscle,
    equipment: ex.equipment || (ex.type === 'duration' ? 'Activity' : 'None'),
    type: ex.type || 'strength',
    sets: ex.type === 'strength' ? sets : null,
    duration: ex.type === 'duration' ? duration : null,
    caloriesBurned
  });
  
  addXP(XP_MAP.WORKOUT_LOG);
  saveState();
  APP.targets = calcTargets(APP.profile, getDailyActiveCals(key));
  updateRPG();
  renderCurrentPage();
}

function addCustomActivity(name, intensity) {
  const metMap = { low: 3.0, moderate: 6.0, high: 9.0 };
  const newActivity = {
    id: 'custom_' + Date.now(),
    name,
    muscle: 'others',
    equipment: 'Custom',
    type: 'duration',
    met: metMap[intensity] || 6.0
  };
  APP.customActivities.push(newActivity);
  saveState();
  showToast(`${name} added to your library!`, 'success');
  return newActivity.id;
}

function removeWorkoutEntry(entryId) {
  const key = dateKey();
  APP.workouts[key] = (APP.workouts[key] || []).filter(e => e.id !== entryId);
  saveState();
  renderCurrentPage();
}

function getWeeklyMuscleFrequency() {
  const weekDates = getWeekDates();
  const freq = {};
  MUSCLE_GROUPS.forEach(m => freq[m.id] = 0);
  weekDates.forEach(d => {
    const k = dateKey(d);
    (APP.workouts[k] || []).forEach(w => {
      if (freq[w.muscle] !== undefined) freq[w.muscle]++;
    });
  });
  return freq;
}

function getAbTrainingDays(weeks = 4) {
  let count = 0;
  const now = new Date();
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const k = dateKey(d);
    const dayWorkouts = APP.workouts[k] || [];
    if (dayWorkouts.some(w => w.muscle === 'abs')) count++;
  }
  return count;
}

function getTotalVolume(key) {
  const w = APP.workouts[key] || [];
  let totalSets = 0, totalReps = 0;
  w.forEach(ex => ex.sets.forEach(s => { totalSets++; totalReps += (s.reps || 0); }));
  return { exercises: w.length, sets: totalSets, reps: totalReps };
}

// ── Water ──
function getWater(key) { return APP.waterLog[key] || 0; }
function addWater() { 
  const k = dateKey(); 
  APP.waterLog[k] = (APP.waterLog[k] || 0) + 1; 
  addXP(XP_MAP.WATER_GLASS);
  saveState(); 
  updateRPG();
  renderCurrentPage(); 
}

function removeWater() { 
  const k = dateKey(); 
  APP.waterLog[k] = Math.max(0, (APP.waterLog[k] || 0) - 1); 
  saveState(); 
  renderCurrentPage(); 
}

// ── Weight Log ──
function addWeightEntry(weight) {
  const key = dateKey();
  const existing = APP.weightLog.findIndex(e => e.date === key);
  if (existing >= 0) APP.weightLog[existing].weight = weight;
  else APP.weightLog.push({ date: key, weight });
  APP.weightLog.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  addXP(XP_MAP.WEIGHT_LOG);
  saveState();
  updateRPG();
  renderCurrentPage();
}

// ── Streak ──
function getStreak() {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dateKey(d);
    const totals = getDayTotals(k);
    if (totals.calories > 0) streak++;
    else break;
  }
  return streak;
}

// Aurora Onboarding Wizard Configuration
const WIZARD_TOTAL_STEPS = 6;
let currentWizStep = 1;

// ── Navigation ──
function navigateTo(page) {
  APP.currentPage = page;
  // Sync sidebar nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const active = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (active) active.classList.add('active');
  // Sync mobile bottom nav
  document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
  const mActive = document.querySelector(`.bottom-nav-item[data-page="${page}"]`);
  if (mActive) mActive.classList.add('active');
  // Update sidebar username
  const nameEl = document.getElementById('sidebarUserName');
  if (nameEl && APP.profile) nameEl.textContent = APP.profile.name;
  renderCurrentPage();
  // Close mobile sidebar
  document.querySelector('.sidebar')?.classList.remove('open');
  document.querySelector('.mobile-overlay')?.classList.remove('active');
  // Scroll to top
  window.scrollTo(0, 0);
}

function renderCurrentPage() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  switch (APP.currentPage) {
    case 'dashboard': renderDashboard(main); break;
    case 'meals': renderMealsPage(main); break;
    case 'workouts': renderWorkoutsPage(main); break;
    case 'progress': renderProgressPage(main); break;
    case 'profile': renderProfilePage(main); break;
    default: renderDashboard(main);
  }
}

// ── Dashboard ──
function renderDashboard(container) {
  const key = dateKey();
  const totals = getDayTotals(key);
  const t = APP.targets;
  const advice = getCoachAdvice();
  const dayWorkouts = getWorkouts(key);
  const volume = getTotalVolume(key);
  const water = getWater(key);
  const streak = getStreak();
  const todaySplit = getDaySplit(key);
  const weekFreq = getWeeklyMuscleFrequency();
  const abDays = getAbTrainingDays(4);

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div style="display:flex;align-items:center;gap:var(--space-md)">
          <h1>Dashboard</h1>
          <div class="header-level-badge">LVL ${APP.profile.rpg?.level || 1}</div>
        </div>
        <p class="page-subtitle">Your daily nutrition & training overview</p>
      </div>
      <div class="header-date-nav">
        <button class="date-nav-btn" onclick="prevDay()" id="btnPrevDay">◀</button>
        <div class="date-display" onclick="goToday()" id="dateDisplay">${formatDateDisplay()}</div>
        <button class="date-nav-btn" onclick="nextDay()" id="btnNextDay">▶</button>
      </div>
    </div>

    <!-- Macro Stats -->
    <div class="stats-grid">
      <div class="stat-card calories">
        <div class="stat-card-label">🔥 Calories</div>
        <div class="stat-card-value">${totals.calories.toLocaleString()}</div>
        <div class="stat-card-target">/ ${(t.calories).toLocaleString()} <span style="font-size:0.6rem;opacity:0.7">(Incl. Active)</span></div>
        <div class="stat-card-bar"><div class="stat-card-bar-fill" style="width: ${Math.min(100, (totals.calories / t.calories) * 100)}%"></div></div>
      </div>
      <div class="stat-card protein">
        <div class="stat-card-label">🥩 Protein</div>
        <div class="stat-card-value">${totals.protein}g</div>
        <div class="stat-card-target">/ ${t.protein}g target</div>
        <div class="stat-card-bar"><div class="stat-card-bar-fill" style="width: ${Math.min(100, (totals.protein / t.protein) * 100)}%"></div></div>
      </div>
      <div class="stat-card carbs">
        <div class="stat-card-label">🌾 Carbs</div>
        <div class="stat-card-value">${totals.carbs}g</div>
        <div class="stat-card-target">/ ${t.carbs}g target</div>
        <div class="stat-card-bar"><div class="stat-card-bar-fill" style="width: ${Math.min(100, (totals.carbs / t.carbs) * 100)}%"></div></div>
      </div>
      <div class="stat-card fat">
        <div class="stat-card-label">🥑 Fat</div>
        <div class="stat-card-value">${totals.fat}g</div>
        <div class="stat-card-target">/ ${t.fat}g target</div>
        <div class="stat-card-bar"><div class="stat-card-bar-fill" style="width: ${Math.min(100, (totals.fat / t.fat) * 100)}%"></div></div>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- Coach's Corner -->
      <div class="card coach-hub">
        <div class="card-shine"></div>
        <div class="card-header">
          <span class="card-title">Coach's Corner</span>
          <span class="card-icon">🧠</span>
        </div>
        <div class="coach-advice-box ${advice.type}">
          <div class="coach-advice-title">${advice.title}</div>
          <div class="coach-advice-text">${advice.text}</div>
          ${advice.item ? `
            <button class="btn btn-secondary btn-sm mt-md" style="width:100%" onclick="applyCoachSuggestion('${advice.item.name}')">Add Recommended Food</button>
          ` : ''}
        </div>
      </div>

      <!-- Calorie Ring + Today's Workout -->
      <div class="card">
        <div class="card-shine"></div>
        <div class="card-header">
          <span class="card-title">Calorie Budget</span>
          <span class="card-icon">🎯</span>
        </div>
        <div class="calorie-ring-container">
          <div class="calorie-ring">
            <svg viewBox="0 0 200 200">
              <defs>
                <linearGradient id="greenGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#00e896"/>
                  <stop offset="100%" stop-color="#00b87a"/>
                </linearGradient>
                <linearGradient id="redGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#ff4757"/>
                  <stop offset="100%" stop-color="#cc2233"/>
                </linearGradient>
              </defs>
              <circle class="calorie-ring-bg" cx="100" cy="100" r="85"/>
              <circle class="calorie-ring-fill" id="calorieRingFill" cx="100" cy="100" r="85"/>
            </svg>
            <div class="calorie-ring-center">
              <div class="calorie-ring-value" id="calorieRingValue">${totals.calories}</div>
              <div class="calorie-ring-label">of ${t.calories}</div>
            </div>
          </div>
          <div id="calorieRingRemaining" class="calorie-ring-remaining ${totals.calories <= t.calories ? 'positive' : 'negative'}">
            ${totals.calories <= t.calories ? (t.calories - totals.calories) + ' cal remaining' : Math.abs(t.calories - totals.calories) + ' cal over'}
          </div>
          <div class="active-burn-badge">
            <span class="active-burn-label">🏃 Active Burn Today</span>
            <span class="active-burn-value">+${t.activeCals} kcal</span>
          </div>
        </div>
      </div>

      <!-- Right Side: Workout + Water + Streak -->
      <div style="display:flex;flex-direction:column;gap:var(--space-md)">
        <div class="card stride-hub">
          <div class="card-header">
            <span class="card-title">Stride Hub</span>
            <span class="card-icon">👟</span>
          </div>
          <div class="stride-content">
            <div class="stride-stats">
              <div class="stride-value" id="dashStepCount">${getSteps(key).toLocaleString()}</div>
              <div class="stride-label">of ${APP.profile.stepGoal?.toLocaleString() || '10,000'} steps</div>
            </div>
            <div class="stride-ring-sm">
              <svg viewBox="0 0 40 40">
                <circle class="stride-ring-bg" cx="20" cy="20" r="18"/>
                <circle class="stride-ring-fill" cx="20" cy="20" r="18" style="stroke-dasharray: ${Math.min(113, (getSteps(key) / (APP.profile.stepGoal || 10000)) * 113)} 113"/>
              </svg>
            </div>
          </div>
          <div class="stride-input-group">
            <input type="number" id="stepInput" class="form-input" placeholder="Add steps...">
            <button class="btn btn-primary btn-sm" onclick="addSteps(parseInt(document.getElementById('stepInput').value)||0)">Add</button>
          </div>
        </div>

        <div class="card">
          <div class="card-shine"></div>
          <div class="card-header">
            <span class="card-title">Today's Split</span>
            <span class="card-icon">🏋️</span>
          </div>
          <div class="workout-today">
            <div class="workout-emoji">${todaySplit ? (todaySplit.id === 'rest' ? '😴' : '💪') : '❓'}</div>
            <div class="workout-info">
              <h3>${todaySplit ? todaySplit.name : 'Not Set'}</h3>
              <p>${todaySplit ? volume.exercises + ' exercises • ' + volume.sets + ' sets' : 'Go to Workouts to set today\'s split'}</p>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md)">
          <div class="card">
            <div class="card-shine"></div>
            <div class="card-header"><span class="card-title">Water</span><span class="card-icon">💧</span></div>
            <div style="display:flex;align-items:center;gap:var(--space-md);justify-content:center">
              <button class="qty-btn" onclick="removeWater()" id="btnRemoveWater">−</button>
              <span style="font-family:'JetBrains Mono';font-size:1.5rem;font-weight:700;color:var(--accent-cyan)">${water}</span>
              <button class="qty-btn" onclick="addWater()" id="btnAddWater">+</button>
            </div>
            <div style="text-align:center;font-size:0.7rem;color:var(--text-muted);margin-top:var(--space-xs)">${water * 250}ml / 3000ml</div>
          </div>

          <div class="card">
            <div class="card-shine"></div>
            <div class="card-header"><span class="card-title">Streak</span><span class="card-icon">🔥</span></div>
            <div class="streak-counter" style="border:none;background:transparent;justify-content:center;padding:0">
              <span class="streak-fire">🔥</span>
              <div>
                <div class="streak-value">${streak}</div>
                <div class="streak-label">days logged</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Macro Donut -->
      <div class="card">
        <div class="card-shine"></div>
        <div class="card-header">
          <span class="card-title">Macro Split</span>
          <span class="card-icon">📊</span>
        </div>
        <div class="chart-container" style="height:200px;display:flex;align-items:center;justify-content:center">
          <canvas id="macroDonutCanvas"></canvas>
        </div>
        <div style="display:flex;justify-content:center;gap:var(--space-lg);margin-top:var(--space-md)">
          <span style="display:flex;align-items:center;gap:6px;font-size:0.75rem"><span class="macro-dot protein"></span>Protein ${totals.protein}g</span>
          <span style="display:flex;align-items:center;gap:6px;font-size:0.75rem"><span class="macro-dot carbs"></span>Carbs ${totals.carbs}g</span>
          <span style="display:flex;align-items:center;gap:6px;font-size:0.75rem"><span class="macro-dot fat"></span>Fat ${totals.fat}g</span>
        </div>
      </div>

      <!-- Muscle Frequency Heatmap -->
      <div class="card">
        <div class="card-shine"></div>
        <div class="card-header">
          <span class="card-title">Weekly Muscle Hits</span>
          <span class="card-icon">🎯</span>
        </div>
        <div class="muscle-freq-grid">
          ${MUSCLE_GROUPS.map(mg => {
            const count = weekFreq[mg.id] || 0;
            const opacity = count === 0 ? 0.15 : Math.min(1, 0.3 + count * 0.2);
            return `<div class="muscle-freq-item" style="--mg-color: ${mg.color}">
              <div class="muscle-freq-icon" style="background: ${mg.color}; opacity: ${opacity}">${mg.icon}</div>
              <div class="muscle-freq-name">${mg.name}</div>
              <div class="muscle-freq-count" style="color: ${mg.color}">${count}×</div>
            </div>`;
          }).join('')}
        </div>
        <div style="margin-top:var(--space-md);padding:var(--space-sm) var(--space-md);border-radius:var(--radius-md);background:${abDays >= 8 ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)'};display:flex;align-items:center;gap:var(--space-sm)">
          <span>🎯</span>
          <span style="font-size:0.8rem;font-weight:600;color:${abDays >= 8 ? 'var(--accent-green)' : 'var(--accent-red)'}">
            Abs trained ${abDays} times in last 4 weeks ${abDays >= 8 ? '✅' : '— Need more!'}
          </span>
        </div>
      </div>

      <!-- Weekly Calorie Trend -->
      <div class="card full-width">
        <div class="card-shine"></div>
        <div class="card-header">
          <span class="card-title">7-Day Calorie Trend</span>
          <span class="card-icon">📈</span>
        </div>
        <div class="chart-container" style="height:220px">
          <canvas id="weeklyTrendCanvas"></canvas>
        </div>
      </div>
    </div>
  `;

  // Render charts
  setTimeout(() => {
    renderCalorieRing(totals.calories, t.calories);
    renderMacroDonut(totals.protein, totals.carbs, totals.fat);
    
    // Proactive Coach Notifications
    if (advice.type === 'refuel' || advice.type === 'warning') {
      showToast(`${advice.title}: ${advice.text}`, advice.type === 'warning' ? 'error' : 'info');
    }
    
    // Weekly trend
    const weekData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(APP.currentDate);
      d.setDate(d.getDate() - i);
      const k = dateKey(d);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      weekData.push({ label: dayNames[d.getDay()], value: getDayTotals(k).calories });
    }
    renderWeeklyTrend(weekData, t.calories);
  }, 50);
}

function applyCoachSuggestion(foodName) {
  activeMealContext = 'evening'; // Switch to evening context for refuels
  openAddFoodModal('evening'); 
  const input = document.getElementById('foodSearchInput');
  if (input) {
    input.value = foodName;
    renderFoodSearchResults(foodName);
  }
}

// ── Meals Page ──
function renderMealsPage(container) {
  const key = dateKey();
  const meals = getMeals(key);
  const totals = getDayTotals(key);

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Meal Log</h1>
        <p class="page-subtitle">Track everything you eat today</p>
      </div>
      <div class="header-date-nav">
        <button class="date-nav-btn" onclick="prevDay()" id="btnPrevDay2">◀</button>
        <div class="date-display" onclick="goToday()" id="dateDisplay2">${formatDateDisplay()}</div>
        <button class="date-nav-btn" onclick="nextDay()" id="btnNextDay2">▶</button>
      </div>
    </div>

    <!-- Quick Add -->
    <div class="card mb-lg">
      <div class="card-shine"></div>
      <div class="card-header">
        <span class="card-title">Quick Add</span>
        <span class="card-icon">⚡</span>
      </div>
      <div class="quick-add-grid">
        ${QUICK_ADD_PRESETS.map((p, i) => `
          <div class="quick-add-card" onclick="quickAdd(${i})" id="quickAdd${i}">
            <div class="emoji">${p.icon}</div>
            <div class="name">${p.name}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Meal Sections -->
    ${MEAL_CATEGORIES.map(mc => {
      const items = meals[mc.id] || [];
      const mealCals = getMealCals(key, mc.id);
      return `
      <div class="card mb-md meal-section">
        <div class="card-shine"></div>
        <div class="meal-section-header">
          <div class="meal-section-title">
            <span class="meal-emoji">${mc.icon}</span>
            ${mc.name}
            <span style="font-size:0.7rem;color:var(--text-muted);font-weight:400">${mc.timeRange}</span>
          </div>
          <div class="meal-section-cals">${mealCals} cal</div>
        </div>
        ${items.length === 0 ? '<div class="meal-empty">No items logged yet</div>' :
          items.map(item => `
            <div class="meal-item">
              <div class="meal-item-info">
                <div class="meal-item-name">${item.name} ${item.servingLabel || (item.qty > 1 ? '×' + item.qty : '')}</div>
                <div class="meal-item-serving">${item.customGrams ? item.customGrams + 'g' : (FOOD_DATABASE.find(f => f.id === item.foodId)?.serving || '')}</div>
              </div>
              <div class="meal-item-macros">
                <span><span class="macro-dot protein"></span>${item.protein}g</span>
                <span><span class="macro-dot carbs"></span>${item.carbs}g</span>
                <span><span class="macro-dot fat"></span>${item.fat}g</span>
              </div>
              <div class="meal-item-calories">${item.calories}</div>
              <button class="meal-item-delete" onclick="removeMealEntry('${mc.id}', ${item.id})" title="Remove">✕</button>
            </div>
          `).join('')
        }
        <button class="add-meal-btn mt-sm" onclick="openAddFoodModal('${mc.id}')" id="addBtn_${mc.id}">
          + Add ${mc.name}
        </button>
      </div>
      `;
    }).join('')}

    <!-- Day Summary -->
    <div class="card">
      <div class="card-shine"></div>
      <div class="card-header">
        <span class="card-title">Day Summary</span>
        <span class="card-icon">📋</span>
      </div>
      <div class="stats-grid" style="margin-bottom:0">
        <div class="stat-card calories" style="padding:var(--space-md)">
          <div class="stat-card-label" style="font-size:0.65rem">🔥 Calories</div>
          <div class="stat-card-value" style="font-size:1.4rem">${totals.calories}</div>
          <div class="stat-card-target">/ ${APP.targets.calories}</div>
        </div>
        <div class="stat-card protein" style="padding:var(--space-md)">
          <div class="stat-card-label" style="font-size:0.65rem">🥩 Protein</div>
          <div class="stat-card-value" style="font-size:1.4rem">${totals.protein}g</div>
          <div class="stat-card-target">/ ${APP.targets.protein}g</div>
        </div>
        <div class="stat-card carbs" style="padding:var(--space-md)">
          <div class="stat-card-label" style="font-size:0.65rem">🌾 Carbs</div>
          <div class="stat-card-value" style="font-size:1.4rem">${totals.carbs}g</div>
          <div class="stat-card-target">/ ${APP.targets.carbs}g</div>
        </div>
        <div class="stat-card fat" style="padding:var(--space-md)">
          <div class="stat-card-label" style="font-size:0.65rem">🥑 Fat</div>
          <div class="stat-card-value" style="font-size:1.4rem">${totals.fat}g</div>
          <div class="stat-card-target">/ ${APP.targets.fat}g</div>
        </div>
      </div>
    </div>
  `;
}

// ── Workouts Page ──
function renderWorkoutsPage(container) {
  const key = dateKey();
  const workouts = getWorkouts(key);
  const volume = getTotalVolume(key);
  const todaySplit = getDaySplit(key);
  const weekFreq = getWeeklyMuscleFrequency();

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Workout Log</h1>
        <p class="page-subtitle">${todaySplit ? todaySplit.name + ' Day' : 'Select your workout below'}</p>
      </div>
      <div class="header-date-nav">
        <button class="date-nav-btn" onclick="prevDay()" id="btnPrevDayW">◀</button>
        <div class="date-display" onclick="goToday()" id="dateDisplayW">${formatDateDisplay()}</div>
        <button class="date-nav-btn" onclick="nextDay()" id="btnNextDayW">▶</button>
      </div>
    </div>

    <!-- Split Selector -->
    <div class="card mb-lg">
      <div class="card-shine"></div>
      <div class="card-header">
        <span class="card-title">Today's Workout</span>
        <span class="card-icon">🏋️</span>
      </div>
      <div class="split-selector">
        ${USER_SPLITS.map(s => {
          const isActive = todaySplit && todaySplit.id === s.id;
          return `<button class="split-btn ${isActive ? 'active' : ''}" onclick="setDaySplit('${s.id}')" id="split_${s.id}"
            style="${isActive ? 'background:var(--accent-green-dim);border-color:var(--accent-green);color:var(--accent-green)' : ''}">
            <span class="split-btn-icon">${s.icon}</span>
            <span class="split-btn-name">${s.name}</span>
          </button>`;
        }).join('')}
      </div>
    </div>

    <!-- Workout Stats -->
    <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr)">
      <div class="stat-card" style="--accent: var(--accent-green)">
        <div class="stat-card-label">🏋️ Exercises</div>
        <div class="stat-card-value" style="color:var(--accent-green)">${volume.exercises}</div>
      </div>
      <div class="stat-card" style="--accent: var(--accent-blue)">
        <div class="stat-card-label">📊 Total Sets</div>
        <div class="stat-card-value" style="color:var(--accent-blue)">${volume.sets}</div>
      </div>
      <div class="stat-card" style="--accent: var(--accent-orange)">
        <div class="stat-card-label">🔄 Total Reps</div>
        <div class="stat-card-value" style="color:var(--accent-orange)">${volume.reps}</div>
      </div>
    </div>

    <!-- Target Muscles -->
    ${todaySplit && todaySplit.muscles.length > 0 ? `
    <div class="card mb-lg">
      <div class="card-shine"></div>
      <div class="card-header">
        <span class="card-title">Target Muscles</span>
        <span class="card-icon">🎯</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-sm)">
        ${todaySplit.muscles.map(m => {
          const mg = MUSCLE_GROUPS.find(g => g.id === m);
          return mg ? `<span style="background:${mg.color}22;color:${mg.color};padding:6px 14px;border-radius:var(--radius-full);font-size:0.8rem;font-weight:600;border:1px solid ${mg.color}44">${mg.icon} ${mg.name}</span>` : '';
        }).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Logged Exercises -->
    <div class="card mb-lg">
      <div class="card-shine"></div>
      <div class="card-header">
        <span class="card-title">Exercises Logged</span>
        <span class="card-icon">📋</span>
      </div>
      ${workouts.length === 0 ? '<div class="meal-empty">No exercises logged yet. Hit that + button! 💪</div>' :
        workouts.map(w => {
          const mg = MUSCLE_GROUPS.find(g => g.id === w.muscle);
          return `
          <div class="workout-entry">
            <div class="workout-entry-header">
              <div style="display:flex;align-items:center;gap:var(--space-sm)">
                <span class="workout-muscle-badge" style="background:${mg?.color || '#888'}22;color:${mg?.color || '#888'};border:1px solid ${mg?.color || '#888'}44">${mg?.icon || ''} ${mg?.name || w.muscle}</span>
                <span style="font-weight:600;font-size:0.9rem">${w.name}</span>
                <span style="font-size:0.7rem;color:var(--text-muted)">${w.equipment}</span>
              </div>
              <button class="meal-item-delete" style="opacity:1" onclick="removeWorkoutEntry(${w.id})" title="Remove">✕</button>
            </div>
            <div class="workout-sets">
              ${w.sets.map((s, si) => `
                <div class="workout-set-row">
                  <span class="set-number">Set ${si + 1}</span>
                  <span class="set-detail">${s.weight > 0 ? s.weight + ' kg' : 'BW'} × ${s.reps} reps</span>
                </div>
              `).join('')}
            </div>
          </div>
        `}).join('')
      }
      <button class="add-meal-btn mt-md" onclick="openAddExerciseModal()" id="addExerciseBtn">
        + Add Exercise
      </button>
    </div>

    <!-- Muscle Frequency -->
    <div class="card">
      <div class="card-shine"></div>
      <div class="card-header">
        <span class="card-title">This Week's Muscle Frequency</span>
        <span class="card-icon">📊</span>
      </div>
      <div class="muscle-freq-grid">
        ${MUSCLE_GROUPS.map(mg => {
          const count = weekFreq[mg.id] || 0;
          return `<div class="muscle-freq-item" style="--mg-color: ${mg.color}">
            <div class="muscle-freq-icon" style="background: ${mg.color}; opacity: ${count === 0 ? 0.15 : Math.min(1, 0.3 + count * 0.15)}">${mg.icon}</div>
            <div class="muscle-freq-name">${mg.name}</div>
            <div class="muscle-freq-count" style="color: ${mg.color}">${count}×</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

// ── Progress Page ──
function renderProgressPage(container) {
  const weightEntries = [...APP.weightLog].sort((a, b) => new Date(b.date) - new Date(a.date));
  const latestWeight = weightEntries.length > 0 ? weightEntries[0].weight : APP.profile.weight;
  const startWeight = weightEntries.length > 0 ? weightEntries[weightEntries.length - 1].weight : APP.profile.weight;
  const change = Math.round((latestWeight - startWeight) * 10) / 10;
  const abDays = getAbTrainingDays(4);

  // Weekly averages
  const weekDates = getWeekDates();
  let weekCals = 0, weekDaysLogged = 0;
  weekDates.forEach(d => {
    const k = dateKey(d);
    const t = getDayTotals(k);
    if (t.calories > 0) { weekCals += t.calories; weekDaysLogged++; }
  });
  const avgCals = weekDaysLogged > 0 ? Math.round(weekCals / weekDaysLogged) : 0;

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Progress</h1>
        <p class="page-subtitle">Track your transformation journey</p>
      </div>
    </div>

    <!-- Key Metrics -->
    <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr)">
      <div class="stat-card calories">
        <div class="stat-card-label">⚖️ Current</div>
        <div class="stat-card-value">${latestWeight}</div>
        <div class="stat-card-target">kg</div>
      </div>
      <div class="stat-card protein">
        <div class="stat-card-label">📉 Change</div>
        <div class="stat-card-value" style="color:${change <= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${change > 0 ? '+' : ''}${change}</div>
        <div class="stat-card-target">kg total</div>
      </div>
      <div class="stat-card carbs">
        <div class="stat-card-label">📊 Avg Cal/Day</div>
        <div class="stat-card-value">${avgCals}</div>
        <div class="stat-card-target">this week</div>
      </div>
      <div class="stat-card fat">
        <div class="stat-card-label">🎯 Ab Sessions</div>
        <div class="stat-card-value">${abDays}</div>
        <div class="stat-card-target">last 4 weeks</div>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- Weight Log -->
      <div class="card">
        <div class="card-shine"></div>
        <div class="card-header">
          <span class="card-title">Log Weight</span>
          <span class="card-icon">⚖️</span>
        </div>
        <div class="weight-log-form">
          <input type="number" class="form-input" id="weightInput" placeholder="e.g. 66.5" step="0.1" min="30" max="200">
          <button class="btn btn-primary" onclick="logWeight()" id="btnLogWeight">Log</button>
        </div>
        <div class="weight-entries">
          ${weightEntries.slice(0, 10).map((e, i) => {
            const prev = weightEntries[i + 1];
            const diff = prev ? Math.round((e.weight - prev.weight) * 10) / 10 : 0;
            return `<div class="weight-entry">
              <span class="weight-entry-date">${new Date(e.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
              <span class="weight-entry-value">${e.weight} kg</span>
              <span class="weight-entry-change ${diff < 0 ? 'down' : diff > 0 ? 'up' : 'same'}">${diff > 0 ? '+' : ''}${diff} kg</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Weight Trend Chart -->
      <div class="card">
        <div class="card-shine"></div>
        <div class="card-header">
          <span class="card-title">Weight Trend</span>
          <span class="card-icon">📈</span>
        </div>
        <div class="chart-container" style="height:250px">
          <canvas id="weightTrendCanvas"></canvas>
        </div>
      </div>

      <!-- Ab Training Tracker -->
      <div class="card full-width">
        <div class="card-shine"></div>
        <div class="card-header">
          <span class="card-title">Ab Training Accountability</span>
          <span class="card-icon">🎯</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-lg);align-items:center">
          <div>
            <div style="font-size:3rem;font-weight:900;font-family:'JetBrains Mono';color:${abDays >= 8 ? 'var(--accent-green)' : 'var(--accent-red)'}">${abDays}/12</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:var(--space-xs)">Ab sessions in last 4 weeks</div>
            <div style="margin-top:var(--space-md)">
              <div class="stat-card-bar" style="height:8px"><div class="stat-card-bar-fill" style="width:${Math.min(100, (abDays / 12) * 100)}%;background:${abDays >= 8 ? 'var(--gradient-green)' : 'var(--gradient-red)'};height:100%;border-radius:4px"></div></div>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:var(--space-sm)">Target: 3× per week = 12 sessions / 4 weeks</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1rem;font-weight:600;margin-bottom:var(--space-sm);color:${abDays >= 8 ? 'var(--accent-green)' : 'var(--accent-orange)'}">
              ${abDays >= 12 ? '🏆 Perfect! Keep it up!' : abDays >= 8 ? '💪 Good progress!' : abDays >= 4 ? '⚠️ Need more ab work!' : '🚨 Train abs more often!'}
            </div>
            <div style="font-size:0.8rem;color:var(--text-secondary)">
              ${abDays < 8 ? 'Add ab exercises to at least 3 workouts per week. You want abs? Train them!' : 'You\'re consistent. Abs will show as body fat drops.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    renderWeightTrend(APP.weightLog);
  }, 50);
}

// ── Profile Page ──
function renderProfilePage(container) {
  const p = APP.profile;
  const t = APP.targets;
  const r = p.rpg || { level: 1, xp: 0, str: 0, agi: 0, vit: 0 };
  const xpNeeded = r.level * 500;
  const xpPercent = Math.min(100, (r.xp / xpNeeded) * 100);

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Profile</h1>
        <p class="page-subtitle">Character Sheet & Performance Settings</p>
      </div>
    </div>

    <!-- RPG Avatar Banner -->
    <div class="card avatar-banner mb-lg">
      <div class="avatar-content">
        <div class="avatar-main">
          <div class="avatar-circle">
            <span class="avatar-level-label">LVL</span>
            <span class="avatar-level-val">${r.level}</span>
          </div>
          <div class="avatar-details">
            <h2 class="avatar-name">${p.name || 'FuelTrack Athlete'}</h2>
            <div class="xp-container">
              <div class="xp-text">XP: ${r.xp} / ${xpNeeded}</div>
              <div class="xp-bar"><div class="xp-fill" style="width: ${xpPercent}%"></div></div>
            </div>
          </div>
        </div>
        <div class="avatar-stats">
          <div class="stat-pill str"><span class="stat-icon">⚔️</span> STR <strong>${r.str}</strong></div>
          <div class="stat-pill agi"><span class="stat-icon">⚡</span> AGI <strong>${r.agi}</strong></div>
          <div class="stat-pill vit"><span class="stat-icon">❤️</span> VIT <strong>${r.vit}</strong></div>
        </div>
      </div>
    </div>

    <div class="profile-layout-grid">
      <div class="card">
        <div class="card-shine"></div>
        <div class="card-header">
          <span class="card-title">Base Identity</span>
          <span class="card-icon">👤</span>
        </div>
        <div class="form-group">
          <label class="form-label">Display Name</label>
          <input class="form-input" id="profName" value="${p.name || ''}">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md)">
          <div class="form-group">
            <label class="form-label">Age</label>
            <input class="form-input" type="number" id="profAge" value="${p.age}">
          </div>
          <div class="form-group">
            <label class="form-label">Gender</label>
            <select class="form-select" id="profGender">
              <option value="male" ${p.gender === 'male' ? 'selected' : ''}>Male</option>
              <option value="female" ${p.gender === 'female' ? 'selected' : ''}>Female</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Height (cm)</label>
            <input class="form-input" type="number" id="profHeight" value="${p.height}">
          </div>
          <div class="form-group">
            <label class="form-label">Weight (kg)</label>
            <input class="form-input" type="number" step="0.1" id="profWeight" value="${p.weight}">
          </div>
          <div class="form-group">
            <label class="form-label">Activity Level</label>
            <select class="form-select" id="profActivity">
              <option value="1.2" ${p.activityLevel === 1.2 ? 'selected' : ''}>Sedentary</option>
              <option value="1.375" ${p.activityLevel === 1.375 ? 'selected' : ''}>Lightly Active</option>
              <option value="1.55" ${p.activityLevel === 1.55 ? 'selected' : ''}>Moderately Active</option>
              <option value="1.725" ${p.activityLevel === 1.725 ? 'selected' : ''}>Very Active</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Step Goal</label>
            <input class="form-input" type="number" id="profStepGoal" value="${p.stepGoal || 10000}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Primary Goal</label>
          <select class="form-select" id="profGoal">
            <option value="cut" ${p.goal === 'cut' ? 'selected' : ''}>🔥 Cut (Lose Fat)</option>
            <option value="maintain" ${p.goal === 'maintain' ? 'selected' : ''}>⚖️ Maintain</option>
            <option value="bulk" ${p.goal === 'bulk' ? 'selected' : ''}>💪 Bulk (Gain Muscle)</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="saveProfile()" style="width:100%;margin-top:var(--space-sm)">Save Persona</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--space-md)">
        <div class="card">
          <div class="card-shine"></div>
          <div class="card-header"><span class="card-title">Intelligence Hub</span><span class="card-icon">🧠</span></div>
          <div class="form-group">
            <label class="form-label">Gemini API Key</label>
            <input class="form-input font-mono" style="font-size:0.75rem" type="password" id="profGeminiKey" 
                   value="${p.aiSettings?.geminiKey || ''}" placeholder="Paste Gemini API Key...">
          </div>
          <button class="btn btn-secondary btn-sm" onclick="saveAISettings()">Save AI Settings</button>
        </div>

        <div class="card">
          <div class="card-shine"></div>
          <div class="card-header"><span class="card-title">Targets</span><span class="card-icon">🎯</span></div>
          <div class="profile-grid">
            <div class="profile-stat">
              <div class="profile-stat-value">${t.bmr}</div>
              <div class="profile-stat-label">BMR</div>
            </div>
            <div class="profile-stat">
              <div class="profile-stat-value" style="color:var(--accent-green)">${t.calories}</div>
              <div class="profile-stat-label">Target Cal</div>
            </div>
            <div class="profile-stat">
              <div class="profile-stat-value" style="color:var(--accent-blue)">${t.protein}g</div>
              <div class="profile-stat-label">Protein</div>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="card-shine"></div>
          <div class="card-header"><span class="card-title">Data Control</span><span class="card-icon">💾</span></div>
          <div style="display:flex;flex-direction:column;gap:var(--space-sm)">
            <button class="btn btn-secondary btn-sm" onclick="exportData()">📦 Export JSON</button>
            <button class="btn btn-danger btn-sm" onclick="clearAllData()">🗑️ Reset Project</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function saveAISettings() {
  const key = document.getElementById('profGeminiKey').value.trim();
  if (!APP.profile.aiSettings) APP.profile.aiSettings = {};
  APP.profile.aiSettings.geminiKey = key;
  saveState();
  showToast('Intelligence settings updated!', 'success');
}
  `;
}

// ── Profile Actions ──
function saveProfile() {
  APP.profile.name = document.getElementById('profName').value || 'User';
  APP.profile.age = parseInt(document.getElementById('profAge').value) || 21;
  APP.profile.gender = document.getElementById('profGender').value;
  APP.profile.height = parseInt(document.getElementById('profHeight').value) || 167;
  APP.profile.weight = parseFloat(document.getElementById('profWeight').value) || 67;
  APP.profile.activityLevel = parseFloat(document.getElementById('profActivity').value) || 1.65;
  APP.profile.goal = document.getElementById('profGoal').value;
  APP.profile.stepGoal = parseInt(document.getElementById('profStepGoal').value) || 10000;
  
  APP.targets = calcTargets(APP.profile, getDailyActiveCals(dateKey()));
  saveState();
  updateRPG();
  renderCurrentPage();
  showToast('Persona saved & updated!', 'success');
}

function logWeight() {
  const input = document.getElementById('weightInput');
  const val = parseFloat(input.value);
  if (!val || val < 30 || val > 200) { showToast('Enter a valid weight', 'error'); return; }
  addWeightEntry(val);
  showToast(`Logged ${val} kg`, 'success');
}

function exportData() {
  const data = localStorage.getItem('nutritionTracker');
  if (!data) { showToast('No data to export', 'error'); return; }
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nutrition-tracker-${dateKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported!', 'success');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      localStorage.setItem('nutritionTracker', JSON.stringify(data));
      loadState();
      renderCurrentPage();
      showToast('Data imported successfully!', 'success');
    } catch {
      showToast('Invalid file format', 'error');
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm('⚠️ Delete ALL data? This cannot be undone!')) return;
  localStorage.removeItem('nutritionTracker');
  initDefaults();
  APP.targets = calcTargets(APP.profile);
  saveState();
  renderCurrentPage();
  showToast('All data cleared', 'success');
}

// ── Quick Add ──
function quickAdd(presetIndex) {
  const preset = QUICK_ADD_PRESETS[presetIndex];
  if (!preset) return;
  // Determine meal type from preset name
  let mealType = 'snacks';
  const lower = preset.name.toLowerCase();
  if (lower.includes('breakfast')) mealType = 'breakfast';
  else if (lower.includes('lunch')) mealType = 'lunch';
  else if (lower.includes('dinner') || lower.includes('rice')) mealType = 'dinner';
  else if (lower.includes('pre-gym') || lower.includes('shake') || lower.includes('evening')) mealType = 'evening';

  preset.items.forEach(item => addMealEntry(mealType, item.foodId, item.qty));
  showToast(`Added "${preset.name}" to ${mealType}`, 'success');
}

// ── Add Food Modal ──
let currentMealType = 'breakfast';

function openAddFoodModal(mealType) {
  currentMealType = mealType;
  const overlay = document.getElementById('addFoodModal');
  overlay.classList.add('active');
  document.getElementById('foodSearchInput').value = '';
  document.getElementById('foodSearchInput').focus();
  renderFoodSearchResults('');
}

function closeAddFoodModal() {
  document.getElementById('addFoodModal').classList.remove('active');
}

function renderFoodSearchResults(query) {
  const resultsEl = document.getElementById('foodSearchResults');
  let filtered = FOOD_DATABASE;
  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = FOOD_DATABASE.filter(f =>
      f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
    );
  }
  // Also filter by category chip if active
  const activeChip = document.querySelector('.category-chip.active');
  if (activeChip && activeChip.dataset.category !== 'All') {
    filtered = filtered.filter(f => f.category === activeChip.dataset.category);
  }

  resultsEl.innerHTML = filtered.slice(0, 30).map(f => `
    <div class="food-result-item" onclick="selectFood(${f.id})" id="food_${f.id}">
      <div class="food-result-info">
        <div class="food-result-name">${f.name}</div>
        <div class="food-result-serving">${f.serving} · P:${f.protein}g C:${f.carbs}g F:${f.fat}g</div>
      </div>
      <div class="food-result-cal">${f.calories}</div>
    </div>
  `).join('') || '<div class="meal-empty">No foods found</div>';
}

function filterByCategory(category, el) {
  document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderFoodSearchResults(document.getElementById('foodSearchInput')?.value || '');
}

function selectFood(foodId) {
  const food = FOOD_DATABASE.find(f => f.id === foodId);
  if (!food) return;
  // Close food search modal
  closeAddFoodModal();
  // Open portion customizer
  APP._portionFood = food;
  APP._portionQty = 1;
  APP._portionGrams = food.servingGrams || 100;
  APP._portionMode = 'qty'; // 'qty' or 'grams'
  openPortionCustomizer();
}

function openPortionCustomizer() {
  const overlay = document.getElementById('portionModal');
  overlay.classList.add('active');
  renderPortionCustomizer();
}

function closePortionCustomizer() {
  document.getElementById('portionModal').classList.remove('active');
}

function renderPortionCustomizer() {
  const food = APP._portionFood;
  if (!food) return;
  const body = document.getElementById('portionBody');
  const isGrams = APP._portionMode === 'grams';
  let multiplier = isGrams ? (APP._portionGrams / food.servingGrams) : APP._portionQty;
  const cal = Math.round(food.calories * multiplier);
  const pro = Math.round(food.protein * multiplier * 10) / 10;
  const carb = Math.round(food.carbs * multiplier * 10) / 10;
  const fat = Math.round(food.fat * multiplier * 10) / 10;

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:var(--space-lg)">
      <div style="font-size:1.1rem;font-weight:700">${food.name}</div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">Per serving: ${food.serving} (${food.servingGrams}g) · ${food.calories} cal</div>
    </div>

    <!-- Mode Toggle -->
    <div style="display:flex;border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border-subtle);margin-bottom:var(--space-lg)">
      <button class="portion-mode-btn ${!isGrams ? 'active' : ''}" onclick="setPortionMode('qty')" id="btnModeQty" style="flex:1;padding:var(--space-sm);background:${!isGrams ? 'var(--accent-green-dim)' : 'transparent'};border:none;color:${!isGrams ? 'var(--accent-green)' : 'var(--text-secondary)'};font-weight:600;font-size:0.8rem;cursor:pointer;font-family:'Inter',sans-serif">× Servings</button>
      <button class="portion-mode-btn ${isGrams ? 'active' : ''}" onclick="setPortionMode('grams')" id="btnModeGrams" style="flex:1;padding:var(--space-sm);background:${isGrams ? 'var(--accent-green-dim)' : 'transparent'};border:none;color:${isGrams ? 'var(--accent-green)' : 'var(--text-secondary)'};font-weight:600;font-size:0.8rem;cursor:pointer;font-family:'Inter',sans-serif">⚖️ Custom Weight</button>
    </div>

    ${!isGrams ? `
    <!-- Quantity Selector -->
    <div style="display:flex;align-items:center;justify-content:center;gap:var(--space-lg);margin-bottom:var(--space-lg)">
      <button class="qty-btn" onclick="adjustPortionQty(-0.5)" id="btnQtyDown" style="width:44px;height:44px;font-size:1.2rem">−</button>
      <div style="text-align:center">
        <div style="font-size:2.5rem;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--accent-green)">${APP._portionQty}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">${food.serving}</div>
      </div>
      <button class="qty-btn" onclick="adjustPortionQty(0.5)" id="btnQtyUp" style="width:44px;height:44px;font-size:1.2rem">+</button>
    </div>
    <div style="display:flex;gap:var(--space-xs);justify-content:center;margin-bottom:var(--space-lg);flex-wrap:wrap">
      ${[0.5, 1, 1.5, 2, 3, 4, 5].map(v => `<button class="qty-preset ${APP._portionQty === v ? 'active' : ''}" onclick="setPortionQty(${v})" style="padding:6px 14px;border-radius:var(--radius-full);border:1px solid ${APP._portionQty === v ? 'var(--accent-green)' : 'var(--border-subtle)'};background:${APP._portionQty === v ? 'var(--accent-green-dim)' : 'transparent'};color:${APP._portionQty === v ? 'var(--accent-green)' : 'var(--text-secondary)'};font-size:0.8rem;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif">${v}×</button>`).join('')}
    </div>
    ` : `
    <!-- Gram Input -->
    <div style="text-align:center;margin-bottom:var(--space-lg)">
      <div style="display:flex;align-items:center;justify-content:center;gap:var(--space-md)">
        <button class="qty-btn" onclick="adjustPortionGrams(-10)" id="btnGramsDown" style="width:44px;height:44px;font-size:1.2rem">−</button>
        <div style="position:relative">
          <input type="number" class="form-input" id="gramsInput" value="${APP._portionGrams}" min="1" max="2000" step="5"
            oninput="updatePortionGrams(this.value)"
            style="width:120px;text-align:center;font-size:1.5rem;font-weight:700;font-family:'JetBrains Mono',monospace;padding:var(--space-sm)">
          <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px">grams</div>
        </div>
        <button class="qty-btn" onclick="adjustPortionGrams(10)" id="btnGramsUp" style="width:44px;height:44px;font-size:1.2rem">+</button>
      </div>
      <div style="display:flex;gap:var(--space-xs);justify-content:center;margin-top:var(--space-md);flex-wrap:wrap">
        ${[50, 100, 150, 200, 250, 300, 500].map(v => `<button onclick="setPortionGrams(${v})" style="padding:6px 12px;border-radius:var(--radius-full);border:1px solid ${APP._portionGrams === v ? 'var(--accent-green)' : 'var(--border-subtle)'};background:${APP._portionGrams === v ? 'var(--accent-green-dim)' : 'transparent'};color:${APP._portionGrams === v ? 'var(--accent-green)' : 'var(--text-secondary)'};font-size:0.75rem;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif">${v}g</button>`).join('')}
      </div>
    </div>
    `}

    <!-- Live Macro Preview -->
    <div style="background:var(--bg-glass);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-md)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-sm)">
        <span style="font-size:0.7rem;font-weight:600;text-transform:uppercase;color:var(--text-secondary)">Nutrition</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;font-weight:800;color:var(--accent-green)">${cal} cal</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-sm);text-align:center">
        <div style="padding:var(--space-xs);border-radius:var(--radius-sm);background:rgba(77,141,255,0.08)">
          <div style="font-size:0.65rem;color:var(--text-muted)">Protein</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:0.9rem;font-weight:700;color:var(--accent-blue)">${pro}g</div>
        </div>
        <div style="padding:var(--space-xs);border-radius:var(--radius-sm);background:rgba(255,140,66,0.08)">
          <div style="font-size:0.65rem;color:var(--text-muted)">Carbs</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:0.9rem;font-weight:700;color:var(--accent-orange)">${carb}g</div>
        </div>
        <div style="padding:var(--space-xs);border-radius:var(--radius-sm);background:rgba(168,85,247,0.08)">
          <div style="font-size:0.65rem;color:var(--text-muted)">Fat</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:0.9rem;font-weight:700;color:var(--accent-purple)">${fat}g</div>
        </div>
      </div>
    </div>
  `;
}

function setPortionMode(mode) {
  APP._portionMode = mode;
  renderPortionCustomizer();
}

function adjustPortionQty(delta) {
  APP._portionQty = Math.max(0.5, Math.round((APP._portionQty + delta) * 10) / 10);
  renderPortionCustomizer();
}

function setPortionQty(val) {
  APP._portionQty = val;
  renderPortionCustomizer();
}

function adjustPortionGrams(delta) {
  APP._portionGrams = Math.max(5, APP._portionGrams + delta);
  renderPortionCustomizer();
}

function updatePortionGrams(val) {
  APP._portionGrams = Math.max(1, parseInt(val) || 1);
  // Don't re-render the whole thing (it would lose focus), just update the preview
  const food = APP._portionFood;
  if (!food) return;
  const multiplier = APP._portionGrams / food.servingGrams;
  const cal = Math.round(food.calories * multiplier);
  const pro = Math.round(food.protein * multiplier * 10) / 10;
  const carb = Math.round(food.carbs * multiplier * 10) / 10;
  const fat = Math.round(food.fat * multiplier * 10) / 10;
  // Quick-update the preview numbers if the elements exist
  // (handled by next full render on button click)
}

function setPortionGrams(val) {
  APP._portionGrams = val;
  renderPortionCustomizer();
}

function confirmPortion() {
  const food = APP._portionFood;
  if (!food) return;
  if (APP._portionMode === 'grams') {
    addMealEntry(currentMealType, food.id, 1, APP._portionGrams);
    showToast(`Added ${APP._portionGrams}g ${food.name}`, 'success');
  } else {
    addMealEntry(currentMealType, food.id, APP._portionQty);
    showToast(`Added ${APP._portionQty}× ${food.name}`, 'success');
  }
  closePortionCustomizer();
}

// ── Add Exercise Modal ──
let exerciseSearchFilter = '';

function openAddExerciseModal() {
  const overlay = document.getElementById('addExerciseModal');
  overlay.classList.add('active');
  document.getElementById('exerciseSearchInput').value = '';
  document.getElementById('exerciseSearchInput').focus();
  exerciseSearchFilter = '';
  renderExerciseSearchResults('');
}

function closeAddExerciseModal() {
  document.getElementById('addExerciseModal').classList.remove('active');
}

function renderExerciseSearchResults(query) {
  const resultsEl = document.getElementById('exerciseSearchResults');
  let filtered = [...EXERCISE_DATABASE, ...APP.customActivities];
  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = filtered.filter(e =>
      e.name.toLowerCase().includes(q) || (e.muscle && e.muscle.toLowerCase().includes(q)) || (e.equipment && e.equipment.toLowerCase().includes(q))
    );
  }
  if (exerciseSearchFilter) {
    filtered = filtered.filter(e => e.muscle === exerciseSearchFilter);
  }

  let html = filtered.map(ex => {
    const mg = MUSCLE_GROUPS.find(g => g.id === ex.muscle);
    return `
    <div class="food-result-item" onclick="openSetLogger('${ex.id}')" id="ex_${ex.id}">
      <div style="display:flex;align-items:center;gap:var(--space-sm)">
        <span class="workout-muscle-badge" style="background:${mg?.color || '#888'}22;color:${mg?.color || '#888'};border:1px solid ${mg?.color || '#888'}44;font-size:0.6rem;padding:3px 8px;border-radius:var(--radius-full)">${mg?.name || ex.muscle}</span>
      </div>
      <div class="food-result-info" style="flex:1">
        <div class="food-result-name">${ex.name} ${ex.id.toString().startsWith('custom') ? '<span style="font-size:0.6rem;opacity:0.5;margin-left:5px">CUSTOM</span>' : ''}</div>
        <div class="food-result-serving">${ex.equipment || 'Activity'} • ${ex.type === 'duration' ? 'Duration' : 'Sets'}</div>
      </div>
    </div>`;
  }).join('');

  if (!query.trim() && !exerciseSearchFilter) {
    html = `
      <div class="custom-activity-prompt" onclick="openCustomActivityModal()">
        <div class="custom-activity-icon">✨</div>
        <div class="custom-activity-text">
          <strong>Can't find your sport?</strong>
          <span>Add a custom activity like "Pickleball" or "Yoga"</span>
        </div>
      </div>
    ` + html;
  }

  resultsEl.innerHTML = html || '<div class="meal-empty">No exercises found</div>';
}

function filterExerciseByMuscle(muscleId, el) {
  document.querySelectorAll('#exerciseMuscleChips .category-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  exerciseSearchFilter = muscleId === 'All' ? '' : muscleId;
  renderExerciseSearchResults(document.getElementById('exerciseSearchInput')?.value || '');
}

// ── Set Logger Modal ──
let pendingExercise = null;
let pendingSets = [{ reps: 10, weight: 0 }];

function openSetLogger(exerciseId) {
  closeAddExerciseModal();
  pendingExercise = EXERCISE_DATABASE.find(e => e.id == exerciseId) || APP.customActivities.find(a => a.id == exerciseId);
  if (!pendingExercise) return;
  
  if (pendingExercise.type === 'duration') {
    pendingSets = []; 
  } else {
    pendingSets = [{ reps: 10, weight: 0 }];
  }
  
  renderSetLogger();
  document.getElementById('setLoggerModal').classList.add('active');
}

function closeSetLogger() {
  document.getElementById('setLoggerModal').classList.remove('active');
}

function renderSetLogger() {
  const modal = document.getElementById('setLoggerBody');
  const mg = MUSCLE_GROUPS.find(g => g.id === pendingExercise?.muscle);
  
  if (pendingExercise.type === 'duration') {
    modal.innerHTML = `
      <div style="text-align:center;margin-bottom:var(--space-lg)">
        <div style="font-size:3rem;margin-bottom:var(--space-sm)">${mg?.icon || '🏃'}</div>
        <h3 style="margin:0">${pendingExercise.name}</h3>
        <p style="color:var(--text-secondary);font-size:0.85rem">Log your activity duration</p>
      </div>
      <div class="form-group">
        <label class="form-label">Duration (Minutes)</label>
        <div style="display:flex;align-items:center;gap:var(--space-md)">
          <input type="number" class="form-input" id="actDuration" value="30" style="font-size:1.5rem;text-align:center;height:60px">
          <span style="font-weight:700;color:var(--text-muted)">MIN</span>
        </div>
      </div>
      <div style="margin-top:var(--space-lg);padding:var(--space-md);background:var(--bg-glass);border-radius:var(--radius-md);font-size:0.8rem;color:var(--text-secondary)">
        ℹ️ Active calories will be calculated based on your weight and activity intensity.
      </div>
    `;
    // Hide add set button if it exists
    const addBtn = document.getElementById('btnAddSet');
    if (addBtn) addBtn.style.display = 'none';
  } else {
    modal.innerHTML = `
      <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-lg)">
        <span class="workout-muscle-badge" style="background:${mg?.color || '#888'}22;color:${mg?.color || '#888'};border:1px solid ${mg?.color || '#888'}44;padding:4px 12px;border-radius:var(--radius-full);font-size:0.75rem">${mg?.icon} ${mg?.name}</span>
        <span style="font-weight:700;font-size:1.1rem">${pendingExercise?.name}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-sm)">
        ${pendingSets.map((s, i) => `
          <div style="display:flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm);background:var(--bg-glass);border-radius:var(--radius-md)">
            <span style="font-size:0.75rem;color:var(--text-muted);width:45px">Set ${i + 1}</span>
            <input type="number" class="form-input" style="width:80px;padding:6px 8px;text-align:center" placeholder="kg" value="${s.weight || ''}" onchange="pendingSets[${i}].weight=parseFloat(this.value)||0" id="setWeight${i}">
            <span style="font-size:0.75rem;color:var(--text-muted)">kg</span>
            <span style="font-size:0.75rem;color:var(--text-muted)">×</span>
            <input type="number" class="form-input" style="width:70px;padding:6px 8px;text-align:center" placeholder="reps" value="${s.reps || ''}" onchange="pendingSets[${i}].reps=parseInt(this.value)||0" id="setReps${i}">
            <span style="font-size:0.75rem;color:var(--text-muted)">reps</span>
            ${pendingSets.length > 1 ? `<button class="meal-item-delete" style="opacity:1" onclick="removeSet(${i})">✕</button>` : ''}
          </div>
        `).join('')}
      </div>
      <button class="btn btn-secondary btn-sm mt-md" onclick="addSet()" id="btnAddSet" style="width:100%">+ Add Set</button>
    `;
  }
}

function addSet() {
  const last = pendingSets[pendingSets.length - 1];
  pendingSets.push({ reps: last.reps, weight: last.weight });
  renderSetLogger();
}

function removeSet(i) {
  pendingSets.splice(i, 1);
  renderSetLogger();
}

function confirmExercise() {
  if (!pendingExercise) return;
  
  if (pendingExercise.type === 'duration') {
    const duration = parseInt(document.getElementById('actDuration').value) || 0;
    addWorkoutEntry(pendingExercise.id, null, duration);
  } else {
    // Read latest values from inputs
    pendingSets.forEach((s, i) => {
      const wEl = document.getElementById(`setWeight${i}`);
      const rEl = document.getElementById(`setReps${i}`);
      if (wEl) s.weight = parseFloat(wEl.value) || 0;
      if (rEl) s.reps = parseInt(rEl.value) || 0;
    });
    addWorkoutEntry(pendingExercise.id, [...pendingSets]);
  }
  
  closeSetLogger();
  showToast(`${pendingExercise.name} logged!`, 'success');
}

// ── Toast ──
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'} ${message}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ── Mobile Sidebar ──
function toggleMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.mobile-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}

// ── PWA Install ──
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('installBtn');
  if (installBtn) installBtn.style.display = 'flex';
});

function installPWA() {
  if (!deferredPrompt) {
    showToast('Open in browser to install', 'info');
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((res) => {
    if (res.outcome === 'accepted') showToast('App installed!', 'success');
    deferredPrompt = null;
  });
}

// ── Custom Activity UI ──
function openCustomActivityModal() {
  document.getElementById('customActivityModal').classList.add('active');
  document.getElementById('custActName').value = '';
}

function closeCustomActivityModal() {
  document.getElementById('customActivityModal').classList.remove('active');
}

function selectCustIntensity(val, el) {
  document.querySelectorAll('#custIntensityGrid .option-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('custActIntensity').value = val;
}

function submitCustomActivity() {
  const name = document.getElementById('custActName').value.trim();
  const intensity = document.getElementById('custActIntensity').value;
  if (!name) return showToast('Please enter a name', 'error');
  
  const id = addCustomActivity(name, intensity);
  closeCustomActivityModal();
  openSetLogger(id); // Immediately open logger for the new activity
}

// ── AI Vision Scanner (Snap & Log) ──
let visionStream = null;

async function openVisionScanner() {
  closeAddFoodModal();
  document.getElementById('visionModal').classList.add('active');
  document.getElementById('cameraView').style.display = 'block';
  document.getElementById('visionProcessing').style.display = 'none';
  document.getElementById('visionReview').style.display = 'none';

  try {
    visionStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' } 
    });
    const video = document.getElementById('visionVideo');
    video.srcObject = visionStream;
    video.play();
  } catch (err) {
    showToast('Camera access denied or unavailable', 'error');
    closeVisionScanner();
  }
}

function closeVisionScanner() {
  if (visionStream) {
    visionStream.getTracks().forEach(t => t.stop());
    visionStream = null;
  }
  document.getElementById('visionModal').classList.remove('active');
}

async function captureAndScan() {
  const video = document.getElementById('visionVideo');
  const canvas = document.getElementById('visionCanvas');
  const context = canvas.getContext('2d');
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  
  document.getElementById('cameraView').style.display = 'none';
  document.getElementById('visionProcessing').style.display = 'flex';
  
  await processImageWithAI(base64Image);
}

async function processImageWithAI(base64Data) {
  const apiKey = APP.profile.aiSettings?.geminiKey;
  if (!apiKey) {
    showToast('Please add your Gemini API Key in Profile Settings', 'error');
    resetScanner();
    return;
  }

  const prompt = `Analyze this food image. Provide a precise nutrition estimate in JSON format. 
  Include: foodName, calories, protein, carbs, fat, fiber. 
  Return ONLY the JSON object. Example: {"foodName": "Avocado Toast", "calories": 350, "protein": 12, "carbs": 40, "fat": 15, "fiber": 8}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64Data } }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // Clean JSON from potential markdown markers
    const jsonStr = text.replace(/```json|```/g, "").trim();
    const result = JSON.parse(jsonStr);
    
    showVisionReview(result);
  } catch (err) {
    console.error("AI Error:", err);
    showToast('AI analysis failed. Check your API key or connection.', 'error');
    resetScanner();
  }
}

function showVisionReview(res) {
  document.getElementById('visionProcessing').style.display = 'none';
  document.getElementById('visionReview').style.display = 'block';
  
  document.getElementById('aiFoodName').textContent = res.foodName || 'Detected Food';
  document.getElementById('aiCal').value = res.calories || 0;
  document.getElementById('aiPro').value = res.protein || 0;
  document.getElementById('aiCar').value = res.carbs || 0;
  document.getElementById('aiFat').value = res.fat || 0;
}

function logAIResult() {
  const name = document.getElementById('aiFoodName').textContent;
  const cal = parseInt(document.getElementById('aiCal').value);
  const pro = parseFloat(document.getElementById('aiPro').value);
  const car = parseFloat(document.getElementById('aiCar').value);
  const fat = parseFloat(document.getElementById('aiFat').value);
  
  const key = dateKey();
  if (!APP.meals[key]) APP.meals[key] = { breakfast: [], lunch: [], evening: [], dinner: [], snacks: [] };
  
  APP.meals[key][activeMealContext].push({
    id: Date.now() + Math.random(),
    name: `🤖 ${name}`,
    servingLabel: "AI Scan",
    calories: cal,
    protein: pro,
    carbs: car,
    fat: fat,
    fiber: 0
  });
  
  addXP(XP_MAP.MEAL_LOG * 2); // Bonus XP for using AI!
  saveState();
  updateRPG();
  closeVisionScanner();
  renderCurrentPage();
  showToast('AI Meal logged! +100 XP', 'success');
}

function resetScanner() {
  document.getElementById('cameraView').style.display = 'block';
  document.getElementById('visionProcessing').style.display = 'none';
  document.getElementById('visionReview').style.display = 'none';
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  // navigateTo('dashboard'); <-- Removed to prevent auto-loading before Auth

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
