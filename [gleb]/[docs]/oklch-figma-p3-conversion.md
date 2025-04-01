# OKLCH to Figma P3 Conversion and Hue-Based Color Adjustment

This document explains the logic behind converting OKLCH colors to Figma P3 format and how hue changes affect chroma values in the color picker application.

## Table of Contents

1. [OKLCH to Figma P3 Conversion](#oklch-to-figma-p3-conversion)
2. [Hue Step Configuration](#hue-step-configuration)
3. [Hue-Based Chroma Adjustment](#hue-based-chroma-adjustment)
4. [Slider Styling and Thumb Placement](#slider-styling-and-thumb-placement)
5. [Implementation for Figma Plugins](#implementation-for-figma-plugins)

## OKLCH to Figma P3 Conversion

The application converts OKLCH colors to Figma P3 using a multi-step process that leverages the Culori library.

### Key Functions and Flow

1. **Color Object Creation**: First, an OKLCH color object is created using the `build` function:

```typescript
// Create an OKLCH color object
export function build(l: number, c: number, h: number, alpha = 1): AnyLch {
  return { alpha, c, h, l, mode: COLOR_FN }
}

// Where COLOR_FN is either "oklch" or "lch" depending on the configuration
```

2. **Conversion to P3**: The OKLCH color is converted to P3 using the `p3` function from Culori:

```typescript
// From formats.ts - Convert color to P3 and serialize as hex
'figmaP3': 'Figma P3 ' + serializeHex8(p3(color)),
```

3. **Forced P3 Conversion**: When a user inputs a RGB color and the output format is set to Figma P3, the application forces the conversion using the `forceP3` function:

```typescript
// Force conversion to P3 color space
export function forceP3(color: Color): P3 {
  return { ...rgb(color), mode: 'p3' }
}

// Used in setCurrent function
if (outputFormat.get() === 'figmaP3' && isRgbInput) {
  parsed = forceP3(parsed)
}
```

### Complete Conversion Pipeline

The complete process for converting from OKLCH to Figma P3 format is:

1. Start with OKLCH values (lightness, chroma, hue)
2. Create an OKLCH color object using `build()`
3. Convert to P3 color space using Culori's `p3()` function
4. Serialize to hex format with `serializeHex8()`
5. Prefix with "Figma P3" for clarity

```typescript
// The complete conversion pipeline
function oklchToFigmaP3(l: number, c: number, h: number, alpha = 1): string {
  // Create OKLCH color object
  const oklchColor = { alpha, c, h, l, mode: "oklch" };
  
  // Convert to P3 and serialize
  return 'Figma P3 ' + serializeHex8(p3(oklchColor));
}
```

## Hue Step Configuration

The application configures hue steps in a way that allows for smooth transitions while maintaining accurate color representation.

### Hue Constants

```typescript
// For OKLCH mode
let config = {
  // Other constants...
  H_MAX: 360,   // Maximum hue value (degrees)
  H_STEP: 1,    // Hue slider step
  // Other constants...
}
```

### Hue Slider Initialization

The hue slider is initialized with specific parameters that define its range and step size:

```typescript
// From card/mixin.pug - Initialize hue slider
+range('h', H_MAX, H_STEP, 286)  // Default hue: 286°

// From range/mixin.pug - Range component definition
mixin range(type, max, step, defaultValue)
  .range(class=`is-${type}`)
    if type !== 'a'
      canvas.range_space
    input.range_input(
      type="range"
      min="0"
      max=max
      step=step / 100   // Convert step to appropriate scale
      aria-hidden="true"
      value=defaultValue
      tabindex="-1"
      list=`range_${type}_values`
    )
    datalist(id=`range_${type}_values`)
```

## Hue-Based Chroma Adjustment

One of the most important aspects of the application is how it adjusts the available chroma range based on the current hue value. This is crucial because different hues have different maximum chroma values within the sRGB and P3 color spaces.

### Chroma Slider Update Logic

When the hue changes, the application redraws the chroma slider to show the available chroma range for that particular hue:

```typescript
// From range/index.ts
onPaint({
  // When lightness or hue changes, update the chroma slider
  lh(value) {
    let color = valueToColor(value)
    let l = color.l
    let h = color.h ?? 0
    let [width, height] = initCanvasSize(canvasC)
    let factor = (showRec2020.get() ? C_MAX_REC2020 : C_MAX) / width
    setList(
      listC,
      paint(canvasC, 'c', width, height, parseFloat(inputC.step), x => {
        // Build colors with varying chroma while keeping the same lightness and hue
        return build(l, x * factor, h)
      })
    )
  }
})
```

### Color Space Detection

As the chroma increases for a given hue, the color may eventually exceed the sRGB gamut and enter the P3-only range. The application detects this using the `getSpace` function:

```typescript
export function getSpace(color: Color): Space {
  let proxyColor = getProxyColor(color)
  if (inRGB(proxyColor)) {
    return Space.sRGB
  } else if (inP3(proxyColor)) {
    return Space.P3
  } else if (inRec2020(proxyColor)) {
    return Space.Rec2020
  } else {
    return Space.Out
  }
}
```

### Visualization of Gamut Boundaries

The `paint` function visualizes these gamut boundaries on the chroma slider:

```typescript
function paint(canvas, type, width, height, sliderStep, getColor) {
  // ...
  let prevSpace = getSpace(getColor(0))
  for (let x = 0; x <= width; x++) {
    let color = getColor(x)
    let space = getSpace(color)
    
    // Handle different color spaces
    if (space !== Space.Out) {
      // Render color
      // ...
      
      // Draw boundaries between color spaces
      if (prevSpace !== space) {
        // Add a stop at color space transitions
        // ...
        
        // Draw boundary lines
        if (space === Space.P3 && prevSpace !== Space.Rec2020) {
          // Draw P3 boundary
        } else if (space === Space.sRGB && prevSpace === Space.P3) {
          // Draw sRGB boundary
        }
        // ...
      }
    } else {
      // Handle out-of-gamut colors
      // ...
    }
    prevSpace = space
  }
  // ...
}
```

## Slider Styling and Thumb Placement

The application uses specialized styling and positioning logic for the slider thumbs to provide an intuitive and visually appealing interface.

### Slider Thumb Styling

The slider thumbs have a distinctive diamond-shaped appearance with a background that shows the current color:

```css
@define-mixin range-thumb {
  box-sizing: border-box;
  width: 27px;
  height: 27px;
  appearance: none;
  cursor: grab;
  background:
    linear-gradient(var(--range-color), var(--range-color)),
    repeating-conic-gradient(
      from 45deg,
      var(--chess) 0% 25%,
      var(--surface-1) 0% 50%
    )
    50% / 5.5px 5.5px;
  border: 4px solid oklch(1 0 0);
  border-radius: 1px;
  border-radius: 0;
  box-shadow:
    0 1px 6px 0 oklch(0.2 0.03 310 / 12%),
    0 0 1px 0.5px oklch(0.2 0.03 310 / 12%);
  transform: rotate(45deg) translate(14px, 14px);
}

/* Apply the mixin to both WebKit and Mozilla sliders */
.range_input::-webkit-slider-thumb {
  @mixin range-thumb;
}

.range_input::-moz-range-thumb {
  @mixin range-thumb;
}
```

The `--range-color` CSS variable is updated dynamically to reflect the current color:

```typescript
function setRangeColor(): void {
  let { fallback, real, space } = visible.get()
  let isVisible = false
  if (space === 'srgb') {
    isVisible = true
  } else if (space === 'p3' && showP3.get()) {
    isVisible = true
  } else if (space === 'rec2020' && showRec2020.get()) {
    isVisible = true
  }
  document.body.style.setProperty('--range-color', real || fallback)
  // ...
}
```

### Step Calculation and Datalist Generation

The application dynamically generates tick marks (steps) on the sliders to indicate color space boundaries, making it easier for users to see where colors transition between different gamuts:

```typescript
function setList(list: HTMLDataListElement, values: number[]): void {
  list.replaceChildren(
    ...values.map(value => {
      let option = document.createElement('option')
      option.value = String(value)
        .replace(/(0{5,}\d|9{5,}\d)/, '')  // Clean up trailing zeros
        .replace(/\.$/, '')                 // Remove trailing decimal points
      return option
    })
  )
}
```

These tick marks are calculated during the slider painting process. The `addStop` function is called whenever a transition between color spaces is detected:

```typescript
function addStop(x: number, round: (num: number) => number): void {
  let origin = getColor(x)
  let value = origin[type] ?? 0
  if (type === 'l') value = (100 / L_MAX) * value
  stops.push(round(value / sliderStep) * sliderStep)
}

// Later in the code:
if (prevSpace !== space) {
  // Add a stop at transition from out-of-gamut to in-gamut or at color space boundaries
  if (
    prevSpace === Space.Out ||
    (prevSpace === Space.Rec2020 && space === Space.P3) ||
    (prevSpace === Space.P3 && space === Space.sRGB)
  ) {
    addStop(x, Math.ceil)  // Round up for entering a color space
  } else {
    addStop(x - 1, Math.floor)  // Round down for exiting a color space
  }
  // ...
}
```

### Hue Thumb Placement

For the hue slider specifically, the thumb position is calculated to accurately reflect the hue value in the 0-360° range:

1. **Initialization**: The slider is initialized with the default value (286° by default):

```typescript
// Initialize with default hue of 286°
+range('h', H_MAX, H_STEP, 286)
```

2. **Range Input Updates**: When the user moves the slider, the current hue value is updated:

```typescript
range.addEventListener('input', () => {
  current.setKey(type, parseFloat(range.value))
})
```

3. **Bidirectional Updates**: When the current color changes programmatically, the slider position is updated to match:

```typescript
onCurrentChange({
  h(value) {
    inputH.value = String(value)
  },
  // Other handlers...
})
```

4. **Slider Redrawing**: The hue slider is redrawn when lightness or chroma changes to show how different hues would appear with the current lightness and chroma values:

```typescript
lc(value) {
  let { c, l } = valueToColor(value)
  let [width, height] = initCanvasSize(canvasH)
  let factor = H_MAX / width
  setList(
    listH,
    paint(canvasH, 'h', width, height, parseFloat(inputH.step), x => {
      return build(l, c, x * factor)
    })
  )
}
```

This approach ensures that the hue slider's appearance and thumb position always accurately reflect the current hue value and show what colors are possible at that hue.

## Implementation for Figma Plugins

To implement this logic in a Figma plugin, you can follow these steps:

### 1. OKLCH to Figma P3 Conversion

```typescript
import { oklch, p3 } from 'culori';

function oklchToFigmaP3(l: number, c: number, h: number, alpha = 1): string {
  // Create OKLCH color object
  const oklchColor = { 
    mode: "oklch", 
    l: l / 100, // Normalize lightness to 0-1 range
    c, 
    h, 
    alpha 
  };
  
  // Convert to P3
  const p3Color = p3(oklchColor);
  
  // Convert to hex format suitable for Figma
  const r = Math.round(p3Color.r * 255);
  const g = Math.round(p3Color.g * 255);
  const b = Math.round(p3Color.b * 255);
  
  // Format as hex
  const hexValue = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  
  return `#${hexValue}`;
}
```

### 2. Determining Maximum Chroma for a Given Hue

```typescript
import { oklch, rgb, p3 } from 'culori';

// Binary search to find max chroma for a given hue and lightness
function findMaxChroma(l: number, h: number, colorSpace: 'srgb' | 'p3'): number {
  let min = 0;
  let max = colorSpace === 'srgb' ? 0.37 : 0.47; // Different max for different spaces
  let epsilon = 0.001; // Precision
  
  while (max - min > epsilon) {
    const mid = (min + max) / 2;
    const color = oklch({ l: l / 100, c: mid, h });
    
    // Check if color is in the target gamut
    const inGamut = colorSpace === 'srgb' 
      ? isInSRGBGamut(color)
      : isInP3Gamut(color);
    
    if (inGamut) {
      min = mid;
    } else {
      max = mid;
    }
  }
  
  return min;
}

// Helper functions to check if a color is in gamut
function isInSRGBGamut(color: any): boolean {
  const rgbColor = rgb(color);
  const tolerance = 0.0001;
  
  return (
    rgbColor.r >= -tolerance && rgbColor.r <= 1 + tolerance &&
    rgbColor.g >= -tolerance && rgbColor.g <= 1 + tolerance &&
    rgbColor.b >= -tolerance && rgbColor.b <= 1 + tolerance
  );
}

function isInP3Gamut(color: any): boolean {
  const p3Color = p3(color);
  const tolerance = 0.0001;
  
  return (
    p3Color.r >= -tolerance && p3Color.r <= 1 + tolerance &&
    p3Color.g >= -tolerance && p3Color.g <= 1 + tolerance &&
    p3Color.b >= -tolerance && p3Color.b <= 1 + tolerance
  );
}
```

### 3. Updating Chroma Based on Hue Changes

```typescript
// Example of how to adjust chroma when hue changes
function updateChromaForHue(l: number, currentC: number, h: number): number {
  // Find the maximum chroma for this hue and lightness
  const maxChroma = findMaxChroma(l, h, 'p3');
  
  // Ensure current chroma doesn't exceed the maximum
  return Math.min(currentC, maxChroma);
}

// Example usage in a Figma plugin
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'hue-changed') {
    const { l, c, h } = msg;
    
    // Adjust chroma based on new hue
    const adjustedC = updateChromaForHue(l, c, h);
    
    // Generate the P3 color
    const p3Color = oklchToFigmaP3(l, adjustedC, h);
    
    // Apply to Figma
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      for (const node of selection) {
        if ('fills' in node) {
          const fills = JSON.parse(JSON.stringify(node.fills));
          fills[0].color = hexToRgb(p3Color);
          node.fills = fills;
        }
      }
    }
  }
};

// Helper to convert hex to RGB
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}
```

### 4. Creating Styled Sliders with Proper Thumb Placement

```typescript
// HTML for styled sliders
function createSliders() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="slider-container">
      <div class="slider hue-slider">
        <div class="slider-gradient"></div>
        <input type="range" min="0" max="360" step="1" value="0" class="slider-input hue-input">
        <div class="slider-ticks"></div>
      </div>
      <div class="slider chroma-slider">
        <div class="slider-gradient"></div>
        <input type="range" min="0" max="0.37" step="0.01" value="0.1" class="slider-input chroma-input">
        <div class="slider-ticks"></div>
      </div>
      <!-- Other sliders... -->
    </div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .slider {
      position: relative;
      height: 40px;
      border-radius: 4px;
      margin-bottom: 16px;
    }
    
    .slider-gradient {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 4px;
      pointer-events: none;
    }
    
    .hue-slider .slider-gradient {
      background: linear-gradient(to right,
        hsl(0, 100%, 50%),
        hsl(60, 100%, 50%),
        hsl(120, 100%, 50%),
        hsl(180, 100%, 50%),
        hsl(240, 100%, 50%),
        hsl(300, 100%, 50%),
        hsl(360, 100%, 50%)
      );
    }
    
    .slider-input {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      appearance: none;
      background: transparent;
      outline: none;
    }
    
    .slider-input::-webkit-slider-thumb {
      appearance: none;
      width: 20px;
      height: 20px;
      background: currentColor;
      border: 3px solid white;
      border-radius: 0;
      transform: rotate(45deg);
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
    
    .slider-ticks {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
    }
    
    .tick {
      position: absolute;
      top: 0;
      width: 1px;
      height: 8px;
      background: rgba(255,255,255,0.5);
    }
  `;
  
  document.head.appendChild(style);
  return container;
}

// JavaScript for handling slider updates and thumb color
function initializeSliders() {
  const hueInput = document.querySelector('.hue-input');
  const chromaInput = document.querySelector('.chroma-input');
  const hueSlider = document.querySelector('.hue-slider');
  
  // Initial color calculation
  let l = 65; // Default lightness
  let c = 0.1; // Default chroma
  let h = 0;   // Default hue
  
  // Update slider thumbs to reflect current color
  function updateSliderThumbs() {
    // Create an OKLCH color
    const color = oklch({
      mode: 'oklch',
      l: l/100,
      c,
      h
    });
    
    // Convert to RGB for display
    const rgbColor = rgb(color);
    const rgbString = `rgb(${Math.round(rgbColor.r*255)}, ${Math.round(rgbColor.g*255)}, ${Math.round(rgbColor.b*255)})`;
    
    // Set thumb colors
    hueInput.style.color = rgbString;
    chromaInput.style.color = rgbString;
  }
  
  // Update chromaInput max value based on current hue
  function updateChromaRange() {
    const maxChroma = findMaxChroma(l, h, 'p3');
    chromaInput.max = maxChroma.toString();
    
    // If current chroma exceeds max, adjust it
    if (c > maxChroma) {
      c = maxChroma;
      chromaInput.value = c.toString();
    }
    
    // Generate chroma slider gradient
    updateChromaGradient();
  }
  
  // Generate gradient for chroma slider based on current hue and lightness
  function updateChromaGradient() {
    const chromaGradient = document.querySelector('.chroma-slider .slider-gradient');
    const steps = 20;
    let gradient = 'linear-gradient(to right,';
    
    for (let i = 0; i <= steps; i++) {
      const stepC = (i / steps) * parseFloat(chromaInput.max);
      const color = oklch({
        mode: 'oklch',
        l: l/100,
        c: stepC,
        h
      });
      const rgbColor = rgb(color);
      const rgbString = `rgb(${Math.round(rgbColor.r*255)}, ${Math.round(rgbColor.g*255)}, ${Math.round(rgbColor.b*255)})`;
      
      gradient += `${rgbString} ${(i/steps)*100}%${i < steps ? ',' : ''}`;
    }
    
    gradient += ')';
    chromaGradient.style.background = gradient;
  }
  
  // Add gamut boundary ticks to hue slider
  function addHueTicks() {
    const ticksContainer = hueSlider.querySelector('.slider-ticks');
    ticksContainer.innerHTML = '';
    
    // Find points where colors exit sRGB gamut at current lightness and chroma
    for (let h = 0; h <= 360; h += 5) {
      const color = oklch({
        mode: 'oklch',
        l: l/100,
        c,
        h
      });
      
      const nextColor = oklch({
        mode: 'oklch',
        l: l/100,
        c,
        h: h + 5
      });
      
      // Check if this is a boundary between gamuts
      const inGamut = isInSRGBGamut(color);
      const nextInGamut = isInSRGBGamut(nextColor);
      
      if (inGamut !== nextInGamut) {
        const tick = document.createElement('div');
        tick.className = 'tick';
        tick.style.left = `${(h / 360) * 100}%`;
        ticksContainer.appendChild(tick);
      }
    }
  }
  
  // Initialize event listeners
  hueInput.addEventListener('input', () => {
    h = parseInt(hueInput.value);
    updateChromaRange();
    updateSliderThumbs();
    addHueTicks();
    
    // Notify Figma plugin of changes
    parent.postMessage({ 
      pluginMessage: { 
        type: 'color-change',
        l, 
        c, 
        h
      } 
    }, '*');
  });
  
  chromaInput.addEventListener('input', () => {
    c = parseFloat(chromaInput.value);
    updateSliderThumbs();
    addHueTicks();
    
    // Notify Figma plugin of changes
    parent.postMessage({ 
      pluginMessage: { 
        type: 'color-change',
        l, 
        c, 
        h
      } 
    }, '*');
  });
  
  // Initial setup
  updateChromaRange();
  updateSliderThumbs();
  addHueTicks();
}
```

By implementing these components in your Figma plugin, you'll have sliders that accurately represent the color space boundaries and properly adjust the chroma range based on the selected hue, just like in the original application. 