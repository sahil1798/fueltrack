// ============================================
// NUTRITION TRACKER — Chart Utilities
// Chart.js setup and rendering
// ============================================

let macroDonutChart = null;
let weeklyTrendChart = null;
let weightTrendChart = null;

// ── Initialize SVG Gradients ── //
function initSVGGradients() {
  // The SVG defs are added in the HTML
}

// ── Render Calorie Ring ── //
function renderCalorieRing(consumed, target) {
  const ring = document.getElementById('calorieRingFill');
  const valueEl = document.getElementById('calorieRingValue');
  const remainingEl = document.getElementById('calorieRingRemaining');
  if (!ring || !valueEl) return;

  const radius = 85;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min(consumed / target, 1.5);
  const offset = circumference - (percentage * circumference);

  ring.style.strokeDasharray = circumference;
  ring.style.strokeDashoffset = circumference;

  // Animate
  requestAnimationFrame(() => {
    setTimeout(() => {
      ring.style.strokeDashoffset = offset;
    }, 100);
  });

  valueEl.textContent = consumed.toLocaleString();
  
  if (consumed > target) {
    valueEl.classList.add('over');
    ring.classList.add('over');
  } else {
    valueEl.classList.remove('over');
    ring.classList.remove('over');
  }

  if (remainingEl) {
    const remaining = target - consumed;
    if (remaining >= 0) {
      remainingEl.textContent = `${remaining} cal remaining`;
      remainingEl.className = 'calorie-ring-remaining positive';
    } else {
      remainingEl.textContent = `${Math.abs(remaining)} cal over`;
      remainingEl.className = 'calorie-ring-remaining negative';
    }
  }
}

// ── Render Macro Donut Chart ── //
function renderMacroDonut(protein, carbs, fat) {
  const ctx = document.getElementById('macroDonutCanvas');
  if (!ctx) return;

  if (macroDonutChart) {
    macroDonutChart.destroy();
  }

  const total = protein + carbs + fat;
  if (total === 0) {
    // Show empty state
    macroDonutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['No data'],
        datasets: [{
          data: [1],
          backgroundColor: ['rgba(255,255,255,0.05)'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    return;
  }

  macroDonutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Protein', 'Carbs', 'Fat'],
      datasets: [{
        data: [protein * 4, carbs * 4, fat * 9], // Convert to calories
        backgroundColor: [
          'rgba(77, 141, 255, 0.9)',
          'rgba(255, 140, 66, 0.9)',
          'rgba(168, 85, 247, 0.9)',
        ],
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(18, 18, 26, 0.95)',
          titleColor: '#f0f0f5',
          bodyColor: '#8888a0',
          borderColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: 'Inter', size: 13, weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          callbacks: {
            label: function (context) {
              const totalCal = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = Math.round((context.raw / totalCal) * 100);
              return ` ${context.label}: ${context.raw} cal (${pct}%)`;
            },
          },
        },
      },
      animation: {
        animateRotate: true,
        duration: 800,
        easing: 'easeOutQuart',
      },
    },
  });
}

// ── Render Weekly Calorie Trend ── //
function renderWeeklyTrend(data, target) {
  const ctx = document.getElementById('weeklyTrendCanvas');
  if (!ctx) return;

  if (weeklyTrendChart) {
    weeklyTrendChart.destroy();
  }

  const labels = data.map(d => d.label);
  const values = data.map(d => d.value);

  weeklyTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Calories',
          data: values,
          borderColor: 'rgba(0, 232, 150, 0.9)',
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return 'transparent';
            const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(0, 232, 150, 0.2)');
            gradient.addColorStop(1, 'rgba(0, 232, 150, 0)');
            return gradient;
          },
          fill: true,
          borderWidth: 2.5,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: 'rgba(0, 232, 150, 1)',
          pointBorderColor: '#0a0a0f',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
        },
        {
          label: 'Target',
          data: Array(labels.length).fill(target),
          borderColor: 'rgba(255, 71, 87, 0.4)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: 'rgba(136, 136, 160, 0.7)',
            font: { family: 'Inter', size: 11 },
          },
          border: { display: false },
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.03)',
            drawBorder: false,
          },
          ticks: {
            color: 'rgba(136, 136, 160, 0.7)',
            font: { family: 'JetBrains Mono', size: 11 },
          },
          border: { display: false },
          min: 0,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(18, 18, 26, 0.95)',
          titleColor: '#f0f0f5',
          bodyColor: '#8888a0',
          borderColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: 'Inter', size: 13, weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
        },
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart',
      },
    },
  });
}

// ── Render Weight Trend Chart ── //
function renderWeightTrend(entries) {
  const ctx = document.getElementById('weightTrendCanvas');
  if (!ctx) return;

  if (weightTrendChart) {
    weightTrendChart.destroy();
  }

  if (!entries || entries.length === 0) {
    return;
  }

  const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  const labels = sorted.map(e => {
    const d = new Date(e.date);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });
  const values = sorted.map(e => e.weight);

  weightTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Weight (kg)',
        data: values,
        borderColor: 'rgba(168, 85, 247, 0.9)',
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(168, 85, 247, 0.15)');
          gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
          return gradient;
        },
        fill: true,
        borderWidth: 2.5,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: 'rgba(168, 85, 247, 1)',
        pointBorderColor: '#0a0a0f',
        pointBorderWidth: 2,
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: 'rgba(136, 136, 160, 0.7)',
            font: { family: 'Inter', size: 11 },
          },
          border: { display: false },
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.03)',
          },
          ticks: {
            color: 'rgba(136, 136, 160, 0.7)',
            font: { family: 'JetBrains Mono', size: 11 },
          },
          border: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(18, 18, 26, 0.95)',
          titleColor: '#f0f0f5',
          bodyColor: '#8888a0',
          borderColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: (ctx) => ` ${ctx.raw} kg`,
          },
        },
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart',
      },
    },
  });
}
