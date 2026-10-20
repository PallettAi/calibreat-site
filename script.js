/**
 * calibrEAT - script.js
 *
 * Adds interactivity to the iPhone demo website:
 * - Scroll-triggered animations: as user scrolls, each feature section triggers
 *   its corresponding animation inside the iPhone mockup
 * - Simple looped demo: cycles through features automatically if user does not scroll
 *
 * Uses requestAnimationFrame for performance and CSS class toggling for animations.
 */

(function () {
  "use strict";

  // Configuration
  const CONFIG = {
    // Time in ms of no scroll before starting auto-demo
    autoDemoDelay: 3000,
    // Time in ms each feature shows during auto-demo
    featureDisplayTime: 4000,
    // CSS classes for phone screen states
    screenStates: [
      "screen-burn",      // True Burn Learning
      "screen-diary",     // Food diary
      "screen-barcode",   // Barcode scanner
      "screen-label",     // Label & recipe import
      "screen-weight",    // Weight & goals
      "screen-water",     // Water tracker
      "screen-workout",   // Workout logging
      "screen-fasting",   // Fasting timer
      "screen-macros",    // Macros & nutrients
      "screen-export",    // Export your data
      "screen-privacy",   // Private by design
      "screen-streaks"    // Streaks & reminders
    ]
  };

  // State
  let state = {
    lastScrollTime: Date.now(),
    isAutoDemoActive: false,
    autoDemoTimeout: null,
    autoDemoInterval: null,
    currentFeatureIndex: 0,
    ticking: false
  };

  // Cache DOM elements
  const elements = {
    phoneScreen: document.querySelector('.phone-screen'),
    features: document.querySelectorAll('.feature'),
    hero: document.querySelector('.hero')
  };

  // Initialize
  function init() {
    if (!elements.phoneScreen || !elements.features.length) {
      console.warn('Required elements not found for script.js');
      return;
    }

    // Set initial state
    resetPhoneScreen();

    // Setup event listeners
    setupScrollListener();
    setupVisibilityChangeListener();

    // Start auto-demo after delay
    startAutoDemoTimer();
  }

  // Reset phone screen to default state
  function resetPhoneScreen() {
    elements.phoneScreen.className = 'phone-screen';
    // Add any default content or animation reset here
  }

  // Setup scroll event listener with throttling
  function setupScrollListener() {
    let ticking = false;

    window.addEventListener('scroll', function() {
      updateLastScrollTime();

      if (!ticking) {
        window.requestAnimationFrame(function() {
          checkFeatureVisibility();
          ticking = false;
        });
        ticking = true;
      }
    });

    // Also check on load/resize
    window.addEventListener('load', checkFeatureVisibility);
    window.addEventListener('resize', checkFeatureVisibility);
  }

  // Update last scroll time and handle auto-demo
  function updateLastScrollTime() {
    state.lastScrollTime = Date.now();

    // If auto-demo is active, pause it on user scroll
    if (state.isAutoDemoActive) {
      pauseAutoDemo();
    }

    // Restart auto-demo timer
    startAutoDemoTimer();
  }

  // Start the timer that will activate auto-demo after delay
  function startAutoDemoTimer() {
    clearTimeout(state.autoDemoTimeout);
    state.autoDemoTimeout = setTimeout(() => {
      if (!state.isAutoDemoActive) {
        startAutoDemo();
      }
    }, CONFIG.autoDemoDelay);
  }

  // Start automatic cycling through features
  function startAutoDemo() {
    state.isAutoDemoActive = true;
    state.currentFeatureIndex = 0;

    // Show first feature immediately
    showFeatureInPhone(state.currentFeatureIndex);

    // Set interval to cycle through features
    state.autoDemoInterval = setInterval(() => {
      state.currentFeatureIndex = (state.currentFeatureIndex + 1) % CONFIG.screenStates.length;
      showFeatureInPhone(state.currentFeatureIndex);
    }, CONFIG.featureDisplayTime);
  }

  // Pause automatic cycling
  function pauseAutoDemo() {
    state.isAutoDemoActive = false;
    clearTimeout(state.autoDemoInterval);
    state.autoDemoInterval = null;
  }

  // Stop auto-demo and reset
  function stopAutoDemo() {
    pauseAutoDemo();
    resetPhoneScreen();
  }

  // Check which feature sections are currently visible
  function checkFeatureVisibility() {
    const viewportHeight = window.innerHeight;
    const viewportTop = window.pageYOffset;
    const viewportBottom = viewportTop + viewportHeight;

    let visibleFeatureIndex = -1;

    elements.features.forEach((feature, index) => {
      const rect = feature.getBoundingClientRect();
      const featureTop = viewportTop + rect.top;
      const featureBottom = featureTop + rect.height;

      // Consider feature visible if at least 50% is in viewport
      const visibleAmount = Math.min(
        viewportBottom,
        featureBottom
      ) - Math.max(
        viewportTop,
        featureTop
      );

      const isVisible = (visibleAmount / rect.height) >= 0.5;

      if (isVisible && visibleFeatureIndex === -1) {
        visibleFeatureIndex = index;
      }
    });

    // If we found a visible feature and auto-demo is not active, show it
    if (visibleFeatureIndex !== -1 && !state.isAutoDemoActive) {
      showFeatureInPhone(visibleFeatureIndex);
    }
    // If no features are visible (e.g., user scrolled past all features),
    // we could reset or show a default state
    else if (visibleFeatureIndex === -1 && !state.isAutoDemoActive) {
      // Optionally reset to hero state or keep last state
    }
  }

  // Show specific feature state in phone mockup
  function showFeatureInPhone(featureIndex) {
    // Reset phone screen
    elements.phoneScreen.className = 'phone-screen';

    // Add specific class for this feature
    if (CONFIG.screenStates[featureIndex]) {
      elements.phoneScreen.classList.add(CONFIG.screenStates[featureIndex]);
    }

    // Add any feature-specific content or trigger animations here
    // For now, we're just using CSS classes to trigger animations

    // Update current index for auto-demo tracking
    state.currentFeatureIndex = featureIndex;
  }

  // Handle page visibility change (when tab is hidden/showing)
  function setupVisibilityChangeListener() {
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        // Page is hidden, pause auto-demo to save resources
        if (state.isAutoDemoActive) {
          pauseAutoDemo();
        }
      } else {
        // Page is visible again, restart timer
        startAutoDemoTimer();
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging if needed
  window.calibrEATDemo = {
    reset: resetPhoneScreen,
    showFeature: showFeatureInPhone,
    startAutoDemo: startAutoDemo,
    stopAutoDemo: stopAutoDemo,
    getState: () => ({...state})
  };

})();