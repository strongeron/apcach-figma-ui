I've analyzed the code and understand how we can implement a switcher between APCA and WCAG contrast models. The current code already has support for both contrast models in the underlying `apcach` library, but the UI is currently designed only for APCA.

## Current Implementation Analysis

1. The `apcach` function already supports both APCA and WCAG contrast models:
   - It accepts a `contrastConfig` parameter that can specify the contrast model
   - The `crToBg` and other helper functions have a `contrastModel` parameter defaulting to "apca"
   - The `calcContrast` function handles both models

2. Key differences between APCA and WCAG:
   - APCA uses a range of 0-108 (current slider range is 8-108)
   - WCAG uses ratios from 1:1 to 21:1 (typically displayed as 1.0 to 21.0)
   - They use different calculation methods (`calcApcaP3` vs `calcWcag`)

3. Current UI elements related to contrast:
   - APCA slider with ID `contrastInput` (range 8-108)
   - APCA number input with ID `contrastNumber`
   - APCA label with SVG icon

## Implementation Plan

### 1. Add Contrast Model Switcher UI

```html
<div class="contrast-model-switch">
  <label>
    <input type="radio" name="contrastModel" value="apca" checked>
    APCA
  </label>
  <label>
    <input type="radio" name="contrastModel" value="wcag">
    WCAG 2.1
  </label>
</div>
```

Place this above or near the APCA slider control.

### 2. Add WCAG Slider and Input (initially hidden)

```html
<div class="control" id="wcagControl" style="display: none;">
  <label>
    <span class="icon-wcag">
      <svg width="16" height="16" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Similar SVG path as APCA but with a different icon -->
      </svg>
    </span>
    WCAG:
  </label>
  <div class="slider-container">
    <input type="range" 
           id="wcagInput" 
           min="1" 
           max="21" 
           value="4.5" 
           step="0.1">
  </div>
  <input type="number" 
         id="wcagNumber" 
         value="4.5"
         min="1"
         max="21"
         step="0.1">
</div>
```

### 3. Update JavaScript to Track Current Contrast Model

```javascript
// Add to the default values
const defaults = {
  // ... existing defaults ...
  contrastModel: 'apca', // Default contrast model
  wcagContrast: 4.5,     // Default WCAG contrast value
};

// Add current contrast model state
let currentContrastModel = 'apca';
```

### 4. Add Event Handlers for Contrast Model Switching

```javascript
// Event listener for contrast model radio buttons
document.querySelectorAll('input[name="contrastModel"]').forEach(radio => {
  radio.addEventListener('change', function() {
    switchContrastModel(this.value);
  });
});

// Function to switch between contrast models
function switchContrastModel(model) {
  currentContrastModel = model;
  
  // Show/hide appropriate controls
  const apcaControl = document.querySelector('.control:has(#contrastInput)');
  const wcagControl = document.getElementById('wcagControl');
  
  if (model === 'apca') {
    apcaControl.style.display = 'grid';
    wcagControl.style.display = 'none';
  } else {
    apcaControl.style.display = 'none';
    wcagControl.style.display = 'grid';
  }
  
  // Update the color based on the new contrast model
  recalculateColorWithCurrentModel();
}

// Function to recalculate color with current contrast model
function recalculateColorWithCurrentModel() {
  const contrastValue = currentContrastModel === 'apca' 
    ? parseFloat(document.getElementById('contrastInput').value)
    : parseFloat(document.getElementById('wcagInput').value);
  
  const hue = parseFloat(document.getElementById('hueInput').value);
  const chroma = parseFloat(document.getElementById('chromaInput').value);
  const bgColor = document.getElementById('bgColorInput').value;
  
  // Recalculate color with current contrast model
  let contrastConfig;
  if (currentContrastModel === 'apca') {
    contrastConfig = crToBg(bgColor, contrastValue, 'apca');
  } else {
    contrastConfig = crToBg(bgColor, contrastValue, 'wcag');
  }
  
  // Use existing recalculateColorWithBackground logic but with the updated contrast config
  // This will need modifications to accept the contrast model
  
  // Update UI with the new color values
  updateHuePreview(hue);
  
  // Update max chroma for the current contrast model and value
  updateMaxChroma();
}

// Update the existing updateMaxChroma function to check current contrast model
function updateMaxChroma() {
  // Existing max chroma calculation but adapted for both models
  // This function will need to calculate max chroma based on the active contrast model
}
```

### 5. Modify Existing Functions to Support Both Models

1. Update the `updateChromaGradient` function to use the current contrast model
2. Modify `updateAPCAThumbColor` to be more generic (perhaps rename to `updateContrastThumbColor`)
3. Update any APCA-specific calculations to check the current model

### 6. Add WCAG-Specific Contrast Recommendations

```javascript
// Function to get WCAG contrast recommendations
function getWcagRecommendations(contrast) {
  const recommendations = [];
  
  if (contrast >= 3) {
    recommendations.push('AA Large Text');
  }
  
  if (contrast >= 4.5) {
    recommendations.push('AA Normal Text');
    recommendations.push('AAA Large Text');
  }
  
  if (contrast >= 7) {
    recommendations.push('AAA Normal Text');
  }
  
  return recommendations.join(', ');
}

// Update the existing APCA description update function to check model
function updateContrastDescription() {
  const descriptionElement = document.getElementById('apcaDescription');
  
  if (currentContrastModel === 'apca') {
    // Existing APCA description logic
  } else {
    // WCAG description logic
    const wcagValue = parseFloat(document.getElementById('wcagInput').value);
    const recommendations = getWcagRecommendations(wcagValue);
    descriptionElement.textContent = recommendations || 'Below minimum contrast';
  }
}
```

### 7. Update Event Listeners for New Inputs

```javascript
// Add listeners for WCAG inputs
wcagInput.addEventListener('input', function() {
  wcagNumber.value = this.value;
  recalculateColorWithCurrentModel();
  updateContrastDescription();
});

wcagNumber.addEventListener('input', function() {
  wcagInput.value = this.value;
  recalculateColorWithCurrentModel();
  updateContrastDescription();
});
```

## Implementation Strategy

1. **Phase 1: Add UI Elements**
   - Add the contrast model switcher
   - Add WCAG slider and number input (hidden initially)
   - Style them to match existing UI

2. **Phase 2: Basic Switching Logic**
   - Implement switching between APCA and WCAG controls
   - Ensure proper show/hide behavior

3. **Phase 3: Integration with Calculation Logic**
   - Modify existing functions to check the current contrast model
   - Implement WCAG contrast description logic
   - Update the color calculation to use the appropriate contrast model

4. **Phase 4: Testing and Refinement**
   - Test with various colors and contrast values
   - Ensure smooth transitions between models
   - Verify max chroma calculations work correctly for both models

This approach maintains the current functionality while safely adding the new feature, leveraging the existing code structure and the built-in support for WCAG in the `apcach` library.
