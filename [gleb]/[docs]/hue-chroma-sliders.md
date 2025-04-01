# Hue and Chroma Sliders: Logic and Implementation

This document outlines the core logic behind the hue and chroma sliders in the OKLCH/LCH color picker, including how colors adjust based on different hue values, step calculations, and visualization techniques.

## Table of Contents

1. [Color Space Constants](#color-space-constants)
2. [Slider Initialization and Structure](#slider-initialization-and-structure)
3. [Slider Painting Logic](#slider-painting-logic)
4. [Hue-based Color Adjustment](#hue-based-color-adjustment)
5. [Slider Steps and Color Boundaries](#slider-steps-and-color-boundaries)
6. [Color Space Detection](#color-space-detection)
7. [Implementation Details](#implementation-details)

## Color Space Constants

The application defines different constants for LCH and OKLCH color spaces, which are used to set the slider ranges:

```javascript
// For OKLCH mode
let config = {
  ALPHA_MAX: 100,
  ALPHA_STEP: 1,

  C_MAX: 0.37,         // Maximum chroma for sRGB
  C_MAX_REC2020: 0.47, // Maximum chroma for Rec2020
  C_RANDOM: 0.1,       // Default chroma for random colors
  C_STEP: 0.01,        // Chroma slider step

  H_MAX: 360,          // Maximum hue value (degrees)
  H_STEP: 1,           // Hue slider step

  L_MAX: 1,            // Maximum lightness (1.0 for OKLCH)
  L_STEP: 1            // Lightness slider step
}

// For LCH mode (used if process.env.LCH is true)
if (process.env.LCH) {
  config = {
    ...config,
    C_MAX: 145,        // Maximum chroma for sRGB in LCH mode
    C_MAX_REC2020: 195,// Maximum chroma for Rec2020 in LCH mode
    C_RANDOM: 39,      // Default chroma for random colors in LCH mode
    C_STEP: 1,         // Chroma slider step in LCH mode
    COLOR_FN: '"lch"', // Color function name
    L_MAX: 100         // Maximum lightness (100 for LCH)
  }
}
```

## Slider Initialization and Structure

The sliders are initialized with specific ranges and steps based on the color space:

```javascript
// HTML structure (Pug template)
mixin range(type, max, step, defaultValue)
  .range(class=`is-${type}`)
    if type !== 'a'
      canvas.range_space
    input.range_input(
      type="range"
      min="0"
      max=max
      step=step / 100
      aria-hidden="true"
      value=defaultValue
      tabindex="-1"
      list=`range_${type}_values`
    )
    datalist(id=`range_${type}_values`)

// Initial values
+range('l', 100, L_STEP, 70)         // Lightness slider
+range('c', C_MAX, C_STEP, 39)       // Chroma slider (default: 39 for LCH, 0.1 for OKLCH)
+range('h', H_MAX, H_STEP, 286)      // Hue slider (default: 286°)
+range('a', ALPHA_MAX, ALPHA_STEP, 100) // Alpha slider (default: 100%)
```

## Slider Painting Logic

The sliders are painted using a specialized function that visualizes color changes across the range, showing gamut boundaries:

```javascript
function paint(
  canvas: HTMLCanvasElement,
  type: 'c' | 'h' | 'l',
  width: number,
  height: number,
  sliderStep: number,
  getColor: (x: number) => AnyLch
): number[] {
  let ctx = getCleanCtx(canvas)
  let halfHeight = Math.floor(height / 2)
  let [borderP3, borderRec2020] = getBorders()
  let getSpace = generateGetSpace(showP3.get(), showRec2020.get())

  let stops: number[] = []
  function addStop(x: number, round: (num: number) => number): void {
    let origin = getColor(x)
    let value = origin[type] ?? 0
    if (type === 'l') value = (100 / L_MAX) * value
    stops.push(round(value / sliderStep) * sliderStep)
  }

  // Paint each pixel of the slider
  let prevSpace = getSpace(getColor(0))
  for (let x = 0; x <= width; x++) {
    let color = getColor(x)
    let space = getSpace(color)
    
    // Handle different color spaces (sRGB, P3, Rec2020)
    if (space !== Space.Out) {
      ctx.fillStyle = canvasFormat(color)
      if (space === Space.sRGB) {
        ctx.fillRect(x, 0, 1, height)
      } else {
        // Show original color in top half, fallback in bottom half
        ctx.fillRect(x, 0, 1, halfHeight)
        let fallback = toRgb(color)
        ctx.fillStyle = fastFormat(fallback)
        ctx.fillRect(x, halfHeight, 1, halfHeight + 1)
      }
      
      // Draw boundaries between color spaces
      if (prevSpace !== space) {
        // Add a stop at color space transitions
        if (
          prevSpace === Space.Out ||
          (prevSpace === Space.Rec2020 && space === Space.P3) ||
          (prevSpace === Space.P3 && space === Space.sRGB)
        ) {
          addStop(x, Math.ceil)
        } else {
          addStop(x - 1, Math.floor)
        }
        
        // Draw boundary lines
        if (space === Space.P3 && prevSpace !== Space.Rec2020) {
          ctx.fillStyle = borderP3
          ctx.fillRect(x, 0, 1, height)
        } else if (space === Space.sRGB && prevSpace === Space.P3) {
          ctx.fillStyle = borderP3
          ctx.fillRect(x - 1, 0, 1, height)
        } else if (space === Space.Rec2020) {
          ctx.fillStyle = borderRec2020
          ctx.fillRect(x, 0, 1, height)
        } else if (prevSpace === Space.Rec2020) {
          ctx.fillStyle = borderRec2020
          ctx.fillRect(x - 1, 0, 1, height)
        }
      }
    } else {
      // Handle out-of-gamut colors
      if (prevSpace !== Space.Out) {
        addStop(x - 1, Math.floor)
      }
      if (type === 'c') {
        return stops
      }
    }
    prevSpace = space
  }
  return stops
}
```

## Hue-based Color Adjustment

The application adjusts colors based on hue by redrawing the lightness and chroma sliders whenever the hue changes. This shows how the available color range changes with different hue values:

```javascript
onPaint({
  // When chroma or hue changes, update the lightness slider
  ch(value) {
    let color = valueToColor(value)
    let c = color.c
    let h = color.h ?? 0
    let [width, height] = initCanvasSize(canvasL)
    let factor = L_MAX / width
    setList(
      listL,
      paint(canvasL, 'l', width, height, parseFloat(inputL.step), x => {
        // Build colors with varying lightness while keeping the same hue and chroma
        return build(x * factor, c, h)
      })
    )
  },
  
  // When lightness or chroma changes, update the hue slider
  lc(value) {
    let { c, l } = valueToColor(value)
    let [width, height] = initCanvasSize(canvasH)
    let factor = H_MAX / width
    setList(
      listH,
      paint(canvasH, 'h', width, height, parseFloat(inputH.step), x => {
        // Build colors with varying hue while keeping the same lightness and chroma
        return build(l, c, x * factor)
      })
    )
  },
  
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

This is particularly important as the available chroma range varies significantly with different hue values. For example, yellows and greens can typically support higher chroma values within the sRGB gamut compared to blues and purples.

## Slider Steps and Color Boundaries

The application automatically calculates slider tick marks (steps) based on color space boundaries:

```javascript
function setList(list: HTMLDataListElement, values: number[]): void {
  list.innerHTML = values
    .map(
      value =>
        `<option value="${value}" label="${
          value === Math.floor(value) ? value : ''
        }"></option>`
    )
    .join('')
}
```

The `paint` function returns an array of values where color space transitions occur (e.g., from sRGB to P3, or from P3 to out-of-gamut). These values are used to create tick marks on the sliders, helping users visualize where color space boundaries lie.

## Color Space Detection

The application determines which color space a color belongs to using these functions:

```javascript
// Check if a color is within the sRGB gamut
export function inRGB(color: Color): boolean {
  let check = rgb(color)
  return (
    check.r >= -COLOR_SPACE_GAP &&
    check.r <= 1 + COLOR_SPACE_GAP &&
    check.g >= -COLOR_SPACE_GAP &&
    check.g <= 1 + COLOR_SPACE_GAP &&
    check.b >= -COLOR_SPACE_GAP &&
    check.b <= 1 + COLOR_SPACE_GAP
  )
}

// Check if a color is within the P3 gamut
export const inP3 = inGamut('p3')

// Check if a color is within the Rec2020 gamut
export const inRec2020 = inGamut('rec2020')

// Determine the color space
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

## Implementation Details

### Building Colors

The application uses a `build` function to create colors with specific lightness, chroma, and hue values:

```javascript
export function build(l: number, c: number, h: number, alpha = 1): AnyLch {
  return { alpha, c, h, l, mode: COLOR_FN }
}
```

Where `COLOR_FN` is either "oklch" or "lch" depending on the configuration.

### Color Conversion

Colors are converted between different spaces using functions from the Culori library:

```javascript
// Convert to RGB (potentially with gamut mapping)
export let toRgb = toGamut('rgb', COLOR_FN)

// Format RGB color as CSS
export function formatRgb(color: Rgb): string {
  let r = Math.round(25500 * color.r) / 100
  let g = Math.round(25500 * color.g) / 100
  let b = Math.round(25500 * color.b) / 100
  if (typeof color.alpha !== 'undefined' && color.alpha < 1) {
    return `rgba(${r}, ${g}, ${b}, ${color.alpha})`
  } else {
    return `rgb(${r}, ${g}, ${b})`
  }
}

// Format LCH/OKLCH color as CSS
export function formatLch(color: AnyLch): string {
  let { alpha, c, h, l } = color
  let postfix = ''
  if (typeof alpha !== 'undefined' && alpha < 1) {
    postfix = ` / ${toPercent(alpha)}`
  }
  return `${COLOR_FN}(${toPercent(l / L_MAX)} ${c} ${h}${postfix})`
}
```

### Visualization of 2D Color Charts

The application also renders 2D color charts to show the relationship between different color components:

```javascript
// paintCH: Visualizes chroma and hue with fixed lightness
export function paintCH(
  width: number,
  height: number,
  from: number,
  to: number,
  l: number,
  showP3: boolean,
  showRec2020: boolean,
  borderP3: Rgb,
  borderRec2020: Rgb
): ImageData {
  let hFactor = H_MAX / width
  let cFactor = (showRec2020 ? C_MAX_REC2020 : C_MAX) / height

  return paint(
    height,
    from,
    to,
    false,
    6,
    showP3,
    showRec2020,
    borderP3,
    borderRec2020,
    (x, y) => build(l, y * cFactor, x * hFactor)
  )
}

// paintCL: Visualizes chroma and lightness with fixed hue
export function paintCL(
  width: number,
  height: number,
  from: number,
  to: number,
  h: number,
  showP3: boolean,
  showRec2020: boolean,
  borderP3: Rgb,
  borderRec2020: Rgb
): ImageData {
  let lFactor = L_MAX / width
  let cFactor = (showRec2020 ? C_MAX_REC2020 : C_MAX) / height

  return paint(
    height,
    from,
    to,
    false,
    6,
    showP3,
    showRec2020,
    borderP3,
    borderRec2020,
    (x, y) => build(x * lFactor, y * cFactor, h)
  )
}

// paintLH: Visualizes lightness and hue with fixed chroma
export function paintLH(
  width: number,
  height: number,
  from: number,
  to: number,
  c: number,
  showP3: boolean,
  showRec2020: boolean,
  borderP3: Rgb,
  borderRec2020: Rgb
): ImageData {
  let hFactor = H_MAX / width
  let lFactor = L_MAX / height

  return paint(
    height,
    from,
    to,
    true,
    2,
    showP3,
    showRec2020,
    borderP3,
    borderRec2020,
    (x, y) => build(y * lFactor, c, x * hFactor)
  )
}
```

These functions demonstrate how changing one component (like hue) affects the available range of other components (like chroma) for a given color space. 