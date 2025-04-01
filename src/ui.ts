import type { 
  PluginMessage,
  ColorValues,
  ColorValuesMessage,
  InitialColorMessage,
  SelectionChangedMessage
} from './types/plugin-messages';
import { 
  apcach,
  inColorSpace,
  apcachToCss,
  crToBg,
  maxChroma,
  cssToApcach,
  type ApcachColor,
  type ContrastConfig,
  type ColorFormat,
  calcContrast
} from 'apcach';

// Add the Window interface declaration here
declare global {
  interface Window {
    updateColorPreview?: typeof updateColorPreview;
    lastTextPreviewColor?: string;
  }
}

import {
  converter,
  formatHex,
  formatRgb,
  differenceEuclidean,
  type ColorObject,
  // parse is not exported from culori, use formatHex instead
} from "culori";

/**
 * IMPORTANT: The Figma plugin code (code.ts) needs to be updated to handle these flags:
 * - disableLivePreview: true
 * - preventAutoSelection: true
 * - skipSelectionAfterCreation: true
 * - doNotChangeSelection: true
 * - returnToOriginalSelection: true
 * - oneTimePreviewOnly: true
 * 
 * The plugin should:
 * 1. Create the preview frames without selecting them
 * 2. Not enable live preview mode after creating the preview
 * 3. Return to the original selection after creating the preview
 * 4. Only track colors when explicitly requested by the user
 */

// Centralized default configuration
const DEFAULT_CONFIG = {
  // Color defaults
  contrast: 60,               // Default contrast
  chroma: 0.2,                // Default chroma
  hue: 145,                   // Default hue
  backgroundColor: '#1E1E1E', // Default background color
  
  // APCACH parameters
  previewHue: 145,
  maxChroma: 0.37,
  defaultOpacity: 1,
  
  // UI thresholds
  similarColorThreshold: 10, // Threshold for determining if colors are similar
  
  // APCA thresholds
  apcaThresholds: {
    bodyText: 75,      // Excellent contrast - body text
    largeText: 60,     // Good contrast - large text
    nonText: 45,       // Moderate contrast - large UI elements
    uiComponents: 30,  // Low contrast - minimum for UI components
    decorative: 15     // Minimal contrast - decorative elements only
  },
  
  // Background types
  backgroundTypes: {
    whiteLuminanceThreshold: 240, // Threshold for determining if a background is "white"
    blackLuminanceThreshold: 15   // Threshold for determining if a background is "black"
  },
  
  // Dynamic colors configuration
  dynamicColors: {
    textContrast: 90,        // Primary text contrast
    textSecondaryContrast: 75, // Secondary text contrast
    textTertiaryContrast: 60,  // Helper text contrast
    borderStrongContrast: 45,  // Interactive borders contrast
    borderSubtleContrast: 30,  // Default borders contrast
    hoverOverlayContrast: 15,  // Hover states contrast
    buttonChroma: 0.25        // Button background chroma
  }
};

// Add oklch converter with other converters at the top
const convertToOklch = converter("oklch");
const convertToP3 = converter("p3");
const convertToRgb = converter("rgb");
const convertToLab = converter("lab");

// Helper function for rounding numbers to a fixed precision
function roundToFixed(value: number, precision: number = 4): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

// Add color utilities at the top of the file
interface DynamicColors {
  textColor: string;      // Primary text - APCA 90
  textSecondary: string;  // Secondary text - APCA 75
  textTertiary: string;   // Helper text - APCA 60
  borderStrong: string;   // Interactive borders - APCA 45
  borderSubtle: string;   // Default borders - APCA 30
  hoverOverlay: string;   // Hover states - APCA 15
  background: string;     // Current background
  buttonBackground: string; // Button background color
}

// Add color relationship constants
const COLOR_RELATIONSHIPS = {
  TEXT: {
    PRIMARY: { contrast: 90, chroma: 0.015 },    // Critical text
    SECONDARY: { contrast: 75, chroma: 0.015 },  // Important text
    TERTIARY: { contrast: 60, chroma: 0.015 }    // Body text
  },
  BORDER: {
    STRONG: { contrast: 8, chroma: 0.01 },     // Interactive borders - reduced from 12
    SUBTLE: { contrast: 5, chroma: 0.01 }      // Default borders - reduced from 8
  },
  STATES: {
    HOVER: { contrast: 8, chroma: 0.015 },       // Hover state
    SUCCESS: { contrast: 45, chroma: 0.25 },     // Success state
    ERROR: { contrast: 45, chroma: 0.30 }        // Error state
  }
};

// Add helper to extract hue from preview color
function extractHueFromPreview(): number {
  const preview = document.getElementById('colorPreview');
  if (!preview) return 0;

  const color = preview.style.backgroundColor;
  
  // Convert color to OKLCH to get hue
  const oklch = convertToOklch(color);
  if (!oklch || typeof oklch.h === 'undefined') return 0;
  
  return oklch.h;
}

// Update generateDynamicColors to use proper APCACH functions
function generateDynamicColors(r: number, g: number, b: number, previewHue?: number): DynamicColors {
  // Create the background color in hex format
  const background = formatHex({ mode: 'rgb', r, g, b });
  
  // Determine if we should use the preview hue or a default
  const hue = previewHue !== undefined ? previewHue : DEFAULT_CONFIG.previewHue;
  
  // Create a contrast configuration generator function
  const createConfig = (contrast: number): ContrastConfig => {
    // Use crToBg to create a proper ContrastConfig
    return crToBg(background, contrast);
  };
  
  // Generate colors with different contrast levels using DEFAULT_CONFIG values
  const textConfig = createConfig(DEFAULT_CONFIG.dynamicColors.textContrast);
  const textSecondaryConfig = createConfig(DEFAULT_CONFIG.dynamicColors.textSecondaryContrast);
  const textTertiaryConfig = createConfig(DEFAULT_CONFIG.dynamicColors.textTertiaryContrast);
  const borderStrongConfig = createConfig(DEFAULT_CONFIG.dynamicColors.borderStrongContrast);
  const borderSubtleConfig = createConfig(DEFAULT_CONFIG.dynamicColors.borderSubtleContrast);
  const hoverOverlayConfig = createConfig(DEFAULT_CONFIG.dynamicColors.hoverOverlayContrast);
  
  // Create a button contrast configuration with higher chroma for better visibility
  const buttonConfig = createConfig(DEFAULT_CONFIG.dynamicColors.borderStrongContrast); // Use the same contrast as borderStrong
  
  // Function to generate a color with the given contrast and chroma
  const generateColor = (config: ContrastConfig, chroma: number): string => {
    // Generate the color using APCACH with proper parameters
    const color = apcach(config, chroma, hue);
    
    // Convert to CSS color
    return apcachToCss(color, 'hex');
  };
  
  // Generate colors with appropriate chroma values
  const textColor = generateColor(textConfig, 0.05);
  const textSecondary = generateColor(textSecondaryConfig, 0.05);
  const textTertiary = generateColor(textTertiaryConfig, 0.05);
  const borderStrong = generateColor(borderStrongConfig, 0.1);
  const borderSubtle = generateColor(borderSubtleConfig, 0.1);
  const hoverOverlay = generateColor(hoverOverlayConfig, 0.1);
  
  // Generate button color with higher chroma for better visibility
  const buttonBackground = generateColor(buttonConfig, DEFAULT_CONFIG.dynamicColors.buttonChroma);
  
  return {
    textColor,
    textSecondary,
    textTertiary,
    borderStrong,
    borderSubtle,
    hoverOverlay,
    background,
    buttonBackground
  };
}

// Add interface for preview context
interface PreviewContext {
  previewColor: string;
  previewHue: number;
  background: string;
}

// Add unified color update function
function updateColorValues(colors: DynamicColors, context: PreviewContext) {
  const root = document.documentElement;
  const colorValues = document.querySelector('.color-values');
  const apcaRow = document.querySelector('.color-value.apca-row');
  
  // Global colors with proper border handling - use consistent 26% opacity for borders
  root.style.setProperty('--text-color', colors.textColor);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--text-tertiary', colors.textTertiary);
  root.style.setProperty('--border-strong', `color-mix(in srgb, ${colors.borderStrong} 26%, transparent)`);
  root.style.setProperty('--border-subtle', `color-mix(in srgb, ${colors.borderSubtle} 10%, transparent)`);
  root.style.setProperty('--hover-overlay', colors.hoverOverlay);
  
  // Update color-values container
  if (colorValues instanceof HTMLElement) {
    colorValues.style.setProperty('--preview-color', context.previewColor);
    colorValues.style.setProperty('--value-text', colors.textColor);
    colorValues.style.setProperty('--value-secondary', colors.textSecondary);
    colorValues.style.setProperty('--value-tertiary', colors.textTertiary);
    colorValues.style.setProperty('--border-strong', `color-mix(in srgb, ${colors.borderStrong} 26%, transparent)`);
    colorValues.style.setProperty('--border-subtle', `color-mix(in srgb, ${colors.borderSubtle} 10%, transparent)`);
  }
  
  // Update APCA row with the same color variables
  if (apcaRow instanceof HTMLElement) {
    apcaRow.style.setProperty('--text-color', colors.textColor);
    apcaRow.style.setProperty('--text-secondary', colors.textSecondary);
    apcaRow.style.setProperty('--text-tertiary', colors.textTertiary);
    apcaRow.style.setProperty('--border-color', `color-mix(in srgb, ${colors.borderSubtle} 26%, transparent)`);
    apcaRow.style.setProperty('--border-subtle', `color-mix(in srgb, ${colors.borderSubtle} 10%, transparent)`);
    // Set the border-top directly using the variable
    apcaRow.style.borderTopColor = `var(--border-subtle)`;
  }
  
  // Update APCA description text color - set both variable and direct color
  const apcaDescription = document.getElementById('apcaDescription');
  if (apcaDescription instanceof HTMLElement) {
    apcaDescription.style.setProperty('--text-color', colors.textTertiary);
    // Set direct color property to ensure it's visible in all cases
    apcaDescription.style.color = "var(--figma-color-text-secondary, #666666)";
    // Force a repaint to ensure the color is updated
    apcaDescription.style.display = 'block';
  }
}

// Helper to apply dynamic colors to document
function applyDynamicColors(colors: DynamicColors) {
  const root = document.documentElement;
  
  // Set all dynamic text colors as CSS variables at the document level
  root.style.setProperty('--text-color', colors.textColor);
  root.style.setProperty('--text-color-secondary', colors.textSecondary);
  root.style.setProperty('--text-color-tertiary', colors.textTertiary);
  
  // Critically important: Set the --value-text variable at document root level
  // This is the primary source of truth for the text color in all controls
  root.style.setProperty('--value-text', colors.textColor);
  
  // Set border and overlay colors
  root.style.setProperty('--border-strong', `color-mix(in srgb, ${colors.borderStrong} 26%, transparent)`);
  root.style.setProperty('--border-subtle', `color-mix(in srgb, ${colors.borderSubtle} 10%, transparent)`);
  root.style.setProperty('--hover-overlay', colors.hoverOverlay);
  
  // Apply button background color
  const previewButton = document.getElementById('generatePreview');
  if (previewButton instanceof HTMLElement) {
    previewButton.style.backgroundColor = colors.buttonBackground;
    console.log('Updated button background color:', colors.buttonBackground);
  }

  // Log contrast values for verification in development mode
  if (process.env.NODE_ENV === 'development') {
    const contrastValues = {
      textColor: calculateAPCA(colors.textColor, colors.background),
      textSecondary: calculateAPCA(colors.textSecondary, colors.background),
      textTertiary: calculateAPCA(colors.textTertiary, colors.background),
      borderStrong: calculateAPCA(colors.borderStrong, colors.background),
      borderSubtle: calculateAPCA(colors.borderSubtle, colors.background),
      hoverOverlay: calculateAPCA(colors.hoverOverlay, colors.background),
      buttonBackground: calculateAPCA(colors.buttonBackground, colors.background)
    };
    console.log('Dynamic Color Contrast Values:', contrastValues);
  }
  
  console.log('✅ Applied dynamic colors to document root with --value-text:', colors.textColor);
}

// Helper to calculate APCA contrast for verification
function calculateAPCA(color: string, background: string): number {
  try {
    // Use the calcContrast function from apcach directly
    return calcContrast(color, background, 'apca', 'p3');
  } catch (error) {
    console.error('Error calculating APCA contrast:', error);
    
    // Fallback to using cssToApcach if direct calculation fails
    const colorObj = cssToApcach(color, { bg: background });
    return Math.abs(colorObj.contrastConfig.cr);
  }
}

// Update createContrastConfig to use crToBg consistently
function createContrastConfig(contrast: number): ContrastConfig {
  // Get the current background color
  const backgroundColor = currentBackground;
  
  // Always use crToBg for consistency
  console.log('Creating contrast config for background:', backgroundColor, 'with contrast:', contrast);
  return crToBg(backgroundColor, contrast);
}

function adjustChromaForGamut(initialChroma: number, contrast: number, hue: number): number {
  const contrastConfig = createContrastConfig(contrast);
  const maxChromaValue = maxChroma()(contrastConfig, hue, 100, 'p3');
  return Math.min(initialChroma, maxChromaValue.chroma);
}

function getMaxAllowedChroma(contrast: number, hue: number, backgroundColor: string = currentBackground): number {
  const contrastConfig = crToBg(backgroundColor, contrast);
  
  // Use maxChroma with cap to ensure we get real colors
  const maxChromaFn = maxChroma(0.37); // Cap at theoretical maximum
  const color = maxChromaFn(contrastConfig, hue, 100, 'p3');
  
  // Verify the color exists in at least one color space
  const p3Value = apcachToCss(color, 'p3');
  const srgbValue = apcachToCss(color, 'hex');
  
  if (!inColorSpace(p3Value, 'p3') && !inColorSpace(srgbValue, 'srgb')) {
    // If color doesn't exist in either space, try a lower chroma
    return findMaxValidChroma(contrastConfig, hue);
  }
  
  return Math.min(color.chroma, 0.37);
}

// Helper function to find maximum valid chroma through binary search
function findMaxValidChroma(contrastConfig: ContrastConfig, hue: number): number {
  let low = 0;
  let high = 0.37;
  const tolerance = 0.001;

  while (high - low > tolerance) {
    const mid = (low + high) / 2;
    const testColor = apcach(contrastConfig, mid, hue);
    const p3Value = apcachToCss(testColor, 'p3');
    const srgbValue = apcachToCss(testColor, 'hex');

    if (inColorSpace(p3Value, 'p3') || inColorSpace(srgbValue, 'srgb')) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low;
}

function updateChromaControls(maxChroma: number, currentValue?: number) {
  const chromaInput = document.getElementById('chromaInput') as HTMLInputElement;
  const chromaNumber = document.getElementById('chromaNumber') as HTMLInputElement;
  const maxChromaValue = document.getElementById('maxChromaValue');
  const maxChromaInfo = document.getElementById('maxChromaInfo');
  
  if (chromaInput && chromaNumber) {
    // Update max values with actual calculated max
    const safeMaxChroma = Math.min(maxChroma, 0.37);
    chromaInput.max = safeMaxChroma.toString();
    chromaNumber.max = safeMaxChroma.toString();
    
    // Update info text with actual max value and make it clickable
    if (maxChromaValue && maxChromaInfo) {
      const formattedMaxChroma = roundToFixed(safeMaxChroma, 4).toString();
      maxChromaValue.textContent = formattedMaxChroma;
      
      // Add click handler to max chroma info
      maxChromaInfo.style.cursor = 'pointer';
      maxChromaInfo.title = 'Click to set maximum chroma';
      maxChromaInfo.onclick = () => {
        chromaInput.value = formattedMaxChroma;
        chromaNumber.value = formattedMaxChroma;
        updateColorFromInputs();
      };
    }
    
    // Update current value if needed
    if (currentValue !== undefined) {
      // Ensure current value doesn't exceed new max
      const safeValue = Math.min(currentValue, safeMaxChroma);
      const formattedValue = roundToFixed(safeValue, 4).toString();
      chromaInput.value = formattedValue;
      chromaNumber.value = formattedValue;
      
      // Trigger color recalculation with new value
      recalculateColorWithBackground(currentBackground);
    }
  }
}

// Update the updateMaxChromaInfo function to properly send updates to Figma
function updateMaxChromaInfo(contrast: number, hue: number) {
  // Get max chroma for current background
  const maxChroma = getMaxAllowedChroma(contrast, hue);
  
  // Update all chroma controls
  updateChromaControls(maxChroma);
  
  // Set up click handler for max chroma
  const maxChromaInfo = document.getElementById('maxChromaInfo');
  if (maxChromaInfo) {
    maxChromaInfo.onclick = () => {
      console.log('🎯 Max Chroma clicked - setting to maximum value');
      const contrast = parseFloat((document.getElementById('contrastInput') as HTMLInputElement).value);
      const hue = parseFloat((document.getElementById('hueInput') as HTMLInputElement).value);
      
      // Get max chroma for current settings
      const maxChroma = getMaxAllowedChroma(contrast, hue);
      console.log(`🎯 Calculated max chroma: ${maxChroma} for contrast: ${contrast}, hue: ${hue}`);
      
      // Update controls with max value
      updateChromaControls(maxChroma, maxChroma);
      
      // Create the color with max chroma to get the actual APCA value
      const color = apcach(crToBg(currentBackground, contrast), maxChroma, hue);
      
      // Get the exact APCA value from the color object
      const actualApca = Math.abs(color.contrastConfig.cr);
      
      // Update APCA contrast display with the actual value
      const contrastNumber = document.getElementById('contrastNumber') as HTMLInputElement;
      if (contrastNumber) {
        contrastNumber.value = actualApca.toString();
      }
      
      // Also update the contrast input to match
      const contrastInput = document.getElementById('contrastInput') as HTMLInputElement;
      if (contrastInput) {
        contrastInput.value = actualApca.toString();
      }
      
      // Force color update with the actual APCA value
      recalculateColorWithBackground(currentBackground);
      
      // Set userChangedColor flag to indicate user-initiated change
      window.userChangedColor = true;
      
      // Get the updated color and send it to Figma for live update
      if (hasValidSelection && isLivePreviewEnabled) {
        console.log('🎯 Sending updated max chroma color to Figma');
        const hexColor = apcachToCss(color, 'hex').replace('#', '');
        sendColorToFigma(hexColor, true);
      } else {
        console.log('🎯 No selection active, not sending to Figma');
      }
    };
  }
  
  return maxChroma;
}

// Add function to get current background color from preview section
function getCurrentBackgroundColor(): string {
  // Always return the default background color from DEFAULT_CONFIG
  return DEFAULT_CONFIG.backgroundColor;
}

// Helper to parse P3 color string into components
function parseP3Color(p3String: string): { r: number, g: number, b: number } {
  const matches = p3String.match(/color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (matches) {
    return {
      r: parseFloat(matches[1]),
      g: parseFloat(matches[2]),
      b: parseFloat(matches[3])
    };
  }
  return { r: 0, g: 0, b: 0 }; // fallback to black
}

function updateUIColors(backgroundColor: string) {
  const previewSection = document.querySelector('.preview-section') as HTMLElement;
  const root = document.documentElement;
  
  // Calculate text color based on background
  const textColor = calculateTextColor(backgroundColor);
  
  // Set CSS variables for dynamic colors
  previewSection.style.setProperty('--text-color', textColor);
  
  // Calculate and set success/error colors based on background
  const contrastConfig = crToBg(backgroundColor, 70); // Increased contrast for status colors
  
  // Generate success color (green) with adaptive hue
  const successColor = apcach(contrastConfig, 0.25, getAdaptiveHue(backgroundColor, 120));
  root.style.setProperty('--success-color', apcachToCss(successColor, 'p3'));
  
  // Generate error color (red) with adaptive hue
  const errorColor = apcach(contrastConfig, 0.3, getAdaptiveHue(backgroundColor, 0));
  root.style.setProperty('--error-color', apcachToCss(errorColor, 'p3'));
  
  // Update background color
  previewSection.style.backgroundColor = backgroundColor;
}

function calculateTextColor(backgroundColor: string): string {
  // First convert background to OKLCH for analysis
  const bgColor = convertToOklch(backgroundColor);
  if (!bgColor || typeof bgColor.l === 'undefined') return '#8e8e8e';
  
  // Determine if background is light or dark
  const isLight = bgColor.l > 0.5;
  
  // Calculate contrast based on background lightness
  const targetContrast = isLight ? 75 : 90; // Higher contrast for dark backgrounds
  const contrastConfig = crToBg(backgroundColor, targetContrast);
  
  // Create neutral gray with proper contrast
  const textColor = apcach(contrastConfig, 0.02, bgColor.h || 0);
  
  return apcachToCss(textColor, 'p3');
}

function updateBackgroundColor(color: string) {
  try {
    // Validate the input - ensure it's a valid color
    if (!color || (typeof color !== 'string')) {
      console.error('Invalid color provided to updateBackgroundColor:', color);
      return;
    }
    
    console.log('Updating background color to:', color);
    
    // Format the color to ensure it has a # prefix
    const formattedColor = color.startsWith('#') ? color : '#' + color;
    
    // Store the new background color
    currentBackground = formattedColor;
    
    // Update UI colors based on the new background
    updateUIColors(formattedColor);
    
    // Parse the background color to RGB components
    const { r, g, b } = parseRgb(formattedColor) || { r: 30, g: 30, b: 30 };
    
    // Generate dynamic colors based on the new background
    const dynamicColors = generateDynamicColors(r / 255, g / 255, b / 255);
    applyDynamicColors(dynamicColors);
    
    // Force recalculation of color with the new background
    recalculateColorWithBackground(formattedColor);
    
    // Update the background color input if it exists
    const bgColorInput = document.getElementById('bgColorInput') as HTMLInputElement;
    if (bgColorInput) {
      bgColorInput.value = formattedColor;
    }
    
    // Update the background color value display if it exists
    const bgColorValue = document.getElementById('bgColorValue');
    if (bgColorValue) {
      bgColorValue.textContent = formattedColor.toUpperCase();
    }
    
    // Update the preview section background with hex format
    const previewSection = document.querySelector('.preview-section') as HTMLElement;
    if (previewSection) {
      previewSection.style.backgroundColor = formattedColor;
    }
    
    // Update button background color calculation if needed
    // Get current contrast and hue values from inputs
    const contrast = parseFloat((document.getElementById('contrastInput') as HTMLInputElement).value);
    const hue = parseFloat((document.getElementById('hueInput') as HTMLInputElement).value);
    updateMaxChromaInfo(contrast, hue);
    
    console.log('Background color updated successfully');
  } catch (error) {
    console.error('Error updating background color:', error);
  }
}

// Add helper to check if colors are visually similar
function areColorsSimilar(color1: string, color2: string, threshold = DEFAULT_CONFIG.similarColorThreshold): boolean {
  try {
    // Convert colors to Lab color space for perceptual comparison
    const lab1 = convertToLab(convertToRgb(color1));
    const lab2 = convertToLab(convertToRgb(color2));
    
    // Calculate color difference using deltaE
    const difference = differenceEuclidean(lab1, lab2);
    
    // Return true if the difference is below the threshold
    return difference < threshold;
  } catch (error) {
    console.error('Error comparing colors:', error);
    return false;
  }
}

/**
 * Parse an RGB color string into its component values
 * @param {string} color The color to parse (rgb, rgba, or hex format)
 * @returns {object} An object with r, g, b values (0-255) and a hex representation
 */
function parseRgb(color: string): { r: number, g: number, b: number, hex: string } | null {
  try {
    // Handle empty or invalid input
    if (!color) return null;
    
    // Handle P3 color format
    if (color.includes('display-p3')) {
      // Extract P3 values using parseP3Color from code.ts
      const p3Match = color.match(/color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
      if (p3Match) {
        // Convert P3 to sRGB approximately for compatibility (just as a fallback)
        // This is an approximation since we can't fully convert P3 to sRGB in the browser
        const r = Math.round(parseFloat(p3Match[1]) * 255);
        const g = Math.round(parseFloat(p3Match[2]) * 255);
        const b = Math.round(parseFloat(p3Match[3]) * 255);
        
        // Generate hex representation as a fallback
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
        
        console.log('📊 Parsed P3 color as approximate RGB:', { r, g, b, hex, originalP3: color });
        return { r, g, b, hex };
      }
    }
    
    // Match RGB or RGBA format
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/i);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1], 10);
      const g = parseInt(rgbMatch[2], 10);
      const b = parseInt(rgbMatch[3], 10);
      
      // Generate hex representation
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
      
      return { r, g, b, hex };
    }
    
    // Match hex format (with or without # prefix)
    let hexValue = color;
    if (color.startsWith('#')) {
      hexValue = color.substring(1);
    }
    
    // Handle shorthand hex format (#RGB)
    if (hexValue.length === 3) {
      hexValue = hexValue[0] + hexValue[0] + hexValue[1] + hexValue[1] + hexValue[2] + hexValue[2];
    }
    
    // Validate hex format and convert to RGB
    if (/^[0-9A-Fa-f]{6}$/.test(hexValue)) {
      const r = parseInt(hexValue.substring(0, 2), 16);
      const g = parseInt(hexValue.substring(2, 4), 16);
      const b = parseInt(hexValue.substring(4, 6), 16);
      
      const hex = `#${hexValue}`.toUpperCase();
      
      return { r, g, b, hex };
    }
    
    // Handle other formats or invalid input
    console.warn('Unsupported color format:', color);
    return null;
  } catch (error) {
    console.error('Error parsing RGB color:', color, error);
    return null;
  }
}

// Replace rgbToLab and deltaE functions with Culori implementations
function rgbToLab(rgb: { r: number, g: number, b: number }) {
  return convertToLab({
    mode: 'rgb',
    r: rgb.r / 255,
    g: rgb.g / 255,
    b: rgb.b / 255
  });
}

function deltaE(lab1: ColorObject, lab2: ColorObject): number {
  return differenceEuclidean(lab1, lab2);
}

// Update isColorSimilarToBackground function
function isColorSimilarToBackground(color: string, background: string): boolean {
  const colorRgb = parseRgb(color);
  const bgRgb = parseRgb(background);
  
  if (!colorRgb || !bgRgb) return false;
  
  // Convert to normalized RGB values (0-1)
  const normalizedColor = {
    mode: 'rgb',
    r: colorRgb.r / 255,
    g: colorRgb.g / 255,
    b: colorRgb.b / 255
  };
  
  const normalizedBg = {
    mode: 'rgb',
    r: bgRgb.r / 255,
    g: bgRgb.g / 255,
    b: bgRgb.b / 255
  };
  
  // Convert to Lab using Culori
  const colorLab = convertToLab(normalizedColor);
  const bgLab = convertToLab(normalizedBg);
  
  if (!colorLab || !bgLab) return false;
  
  // Calculate color difference using Euclidean distance
  const difference = differenceEuclidean(colorLab, bgLab);
  
  // Return true if colors are similar (difference < threshold)
  return difference < 5;
}

// Update updateColorPreview to handle borders properly and ensure they're always visible
function updateColorPreview(
  preview: HTMLElement, 
  color: string, 
  background: string, 
  allFills?: Array<{ color: string, opacity: number, blendMode?: string, cssBlendMode?: string, visible: boolean }>
) {
  try {
    console.log('🖼️ Updating color preview with:', { color, background, allFills });
    
    // Clear any existing content and styles
    preview.innerHTML = '';
    preview.style.cssText = '';
    
    // Set base styles for the preview
    preview.style.display = 'block';
    preview.style.width = '100%';
    preview.style.height = '120px';
    preview.style.borderRadius = '8px';
    preview.style.boxSizing = 'border-box';
    preview.style.position = 'relative';
    preview.style.overflow = 'hidden';
    
    // Check if this is a P3 color format
    const isP3Color = color.includes('display-p3');
    preview.setAttribute('data-is-p3', isP3Color.toString());
    
    // Ensure color has proper format for primary color tracking
    let primaryColor = isP3Color ? color : (color.startsWith('#') ? color : '#' + color);
    
    // Check if we have multiple fills
    if (allFills && allFills.length > 1) {
      console.log(`🖼️ Creating preview with ${allFills.length} fills`);
      
      // Get visible fills in Figma order (bottom to top)
      const visibleFills = [...allFills]
        .filter(fill => fill.visible)
        .reverse(); // Figma applies fills bottom-to-top
      
      if (visibleFills.length > 0) {
        // Track the primary (top) fill color
        primaryColor = visibleFills[visibleFills.length - 1].color;
        // Only add # if not P3 format and missing #
        if (!primaryColor.includes('display-p3') && !primaryColor.startsWith('#')) {
          primaryColor = '#' + primaryColor;
        }
        
        // We'll use absolutely positioned divs to represent each fill layer
        visibleFills.forEach((fill, index) => {
          // Check if this is a P3 color and format accordingly
          const isP3Fill = fill.color.includes('display-p3');
          // Ensure color has proper format
          const fillColor = isP3Fill ? fill.color : (fill.color.startsWith('#') ? fill.color : '#' + fill.color);
          const opacity = fill.opacity !== undefined ? fill.opacity : 1;
          const cssBlendMode = fill.cssBlendMode || 'normal';
          
          console.log(`🖼️ Creating fill layer ${index + 1}:`, {
            color: fillColor,
            isP3: isP3Fill,
            opacity: opacity,
            blendMode: cssBlendMode,
            zIndex: index + 1
          });
          
          // Create a div for this fill layer
          const fillLayer = document.createElement('div');
          fillLayer.className = 'fill-layer';
          fillLayer.style.position = 'absolute';
          fillLayer.style.top = '0';
          fillLayer.style.left = '0';
          fillLayer.style.width = '100%';
          fillLayer.style.height = '100%';
          // Use the correctly formatted color
          fillLayer.style.backgroundColor = fillColor;
          fillLayer.style.opacity = opacity.toString();
          fillLayer.style.mixBlendMode = cssBlendMode;
          
          // Add data attribute to track P3 status
          fillLayer.setAttribute('data-is-p3', isP3Fill.toString());
          
          // Add z-index to ensure proper stacking
          // Higher index values appear on top (later fills in Figma)
          fillLayer.style.zIndex = (index + 1).toString();
          
          // Add to preview
          preview.appendChild(fillLayer);
          
          console.log(`✅ Added fill layer ${index + 1}:`, {
            color: fillColor,
            isP3: isP3Fill,
            opacity: opacity,
            blendMode: cssBlendMode,
            zIndex: index + 1
          });
        });
        
        // Add a data attribute to indicate we're using multiple fills
        preview.setAttribute('data-multiple-fills', 'true');
        preview.setAttribute('data-fill-count', visibleFills.length.toString());
      } else {
        // No visible fills, use default color
        console.log('⚠️ No visible fills, using default color');
        // Use the appropriate color format
        preview.style.backgroundColor = primaryColor;
        preview.setAttribute('data-multiple-fills', 'false');
      }
    } else {
      // Single fill handling
      console.log('🖼️ Creating preview with single fill');
      
      // Set the background color of the preview using the correct format
      preview.style.backgroundColor = primaryColor;
      
      // Apply blend mode if specified in the first fill
      if (allFills && allFills.length === 1 && allFills[0].cssBlendMode) {
        preview.style.mixBlendMode = allFills[0].cssBlendMode;
        console.log(`🖼️ Applied blend mode: ${allFills[0].cssBlendMode}`);
        
        // Also set opacity if specified
        if (allFills[0].opacity !== undefined) {
          preview.style.opacity = allFills[0].opacity.toString();
          console.log(`🖼️ Applied opacity: ${allFills[0].opacity}`);
        }
      }
      
      preview.setAttribute('data-multiple-fills', 'false');
    }
    
    // Check if color is similar to background
    const isSimilar = isColorSimilarToBackground(primaryColor, background);
    preview.setAttribute('data-matches-bg', isSimilar.toString());
    console.log(`🖼️ Color similarity to background: ${isSimilar}`);
    
    // Update the foreground controls and dynamic variables with the ACTUAL color
    // This ensures consistent behavior with updateColorPreviewForText
    console.log('🎨 Calling updatePreviewInUI with color:', primaryColor);
    updatePreviewInUI(primaryColor, background);
    
    console.log('✅ Successfully updated color preview' + (isP3Color ? ' (using P3 format)' : ''));
  } catch (error) {
    console.error('❌ Error updating color preview:', error);
    // Fallback to basic preview
    preview.innerHTML = '';
    
    // Use appropriate format based on input
    if (color.includes('display-p3')) {
      preview.style.backgroundColor = color;
    } else {
      preview.style.backgroundColor = color.startsWith('#') ? color : '#' + color;
    }
  }
}

// Update the recalculateColorWithBackground function
function recalculateColorWithBackground(backgroundColor: string, sendToFigma: boolean = false) {
  try {
    // Get current input values
    const contrast = parseFloat((document.getElementById('contrastInput') as HTMLInputElement).value);
    const hue = parseFloat((document.getElementById('hueInput') as HTMLInputElement).value);
    const chroma = parseFloat((document.getElementById('chromaInput') as HTMLInputElement).value);
    
    // Determine background type for logging
    const bgType = determineBackgroundType(backgroundColor);
    console.log('Background type:', bgType, 'Background color:', backgroundColor);
    console.log('Input values - Contrast:', contrast, 'Hue:', hue, 'Chroma:', chroma);
    
    let color: ApcachColor;
    
    // Handle zero contrast case specially
    if (contrast === 0) {
      // For zero contrast, create a color that matches the background
      // Use minimal contrast (0.1) instead of exactly 0
      color = apcach(crToBg(backgroundColor, 0.1), chroma, hue);
      console.log('Creating zero contrast color with minimal contrast (0.1)');
    } else {
      // Normal contrast handling - always use crToBg for consistency
      // This handles all background types (white, black, custom) in the same way
      color = apcach(crToBg(backgroundColor, contrast), chroma, hue);
      console.log('Creating color with crToBg, contrast:', contrast);
    }
    
    // Get color values in different formats - use direct apcachToCss calls without intermediate conversions
    const values = {
      oklch: apcachToCss(color, 'oklch'),
      hex: apcachToCss(color, 'hex'),
      p3: apcachToCss(color, 'p3'),
      figmaP3: apcachToCss(color, 'figma-p3')
    };

    console.log('Generated color values:', values);

    // Get the exact APCA value from the color object
    const apcaValue = Math.abs(color.contrastConfig.cr);
    console.log('APCA value from color object:', apcaValue);
    
    // Update the contrast input if the calculated APCA value is different from the input value
    // This ensures the UI always shows the actual APCA value
    if (Math.abs(apcaValue - contrast) > 0.1) { // Only update if difference is significant
      console.log('Updating contrast input with actual APCA value:', apcaValue);
      const contrastInput = document.getElementById('contrastInput') as HTMLInputElement;
      if (contrastInput) {
        contrastInput.value = apcaValue.toString();
      }
      const contrastNumber = document.getElementById('contrastNumber') as HTMLInputElement;
      if (contrastNumber) {
        contrastNumber.value = apcaValue.toString();
      }
    }
    
    // Verify contrast calculation using calcContrast
    try {
      const directContrast = calcContrast(values.p3, backgroundColor, 'apca', 'p3');
      console.log('Direct contrast calculation:', directContrast, 'Absolute value:', Math.abs(directContrast));
    } catch (error) {
      console.error('Error calculating direct contrast:', error);
    }

    // Validate color and create complete values object
    const validatedValues = validateColor(color, values);
    
    // Format APCACH value consistently using crToBg for all backgrounds
    validatedValues.apcach = `apcach(crToBg("${backgroundColor}", ${apcaValue}), ${chroma.toFixed(2)}, ${Math.round(hue)})`;
    console.log('Formatted APCACH value:', validatedValues.apcach);

    // Update UI with validated values
    updateUI(validatedValues);

    // Update color preview with explicit border refresh
    const colorPreview = document.getElementById('colorPreview') as HTMLDivElement;
    if (colorPreview && validatedValues.gamut.p3) {
      updateColorPreview(colorPreview, validatedValues.figmaP3, backgroundColor);
    }
    
    // If user has changed the color and we have a valid selection, send update to Figma
    if ((window.userChangedColor || sendToFigma) && hasValidSelection && isLivePreviewEnabled) {
      console.log('Sending updated color to Figma:', validatedValues.figmaP3);
      sendColorToFigma(validatedValues.figmaP3.replace('#', ''), true);
      
      // Update current preview color to avoid duplicate updates
      currentPreviewColor = validatedValues.figmaP3;
    }
    
    // Ensure APCA value is properly formatted in the UI
    ensureFormattedApcaValueInUI();
    
    // Return the generated color
    return color;
  } catch (error) {
    console.error('Error recalculating color:', error);
    showStatusMessage(`Error calculating color: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return null;
  }
}

// New helper function to adjust chroma to match contrast exactly
function adjustChromaForContrast(
  initialChroma: number, 
  targetContrast: number, 
  hue: number, 
  backgroundColor: string
): number {
  const contrastConfig = crToBg(backgroundColor, targetContrast);
  let low = 0;
  let high = initialChroma;
  const tolerance = 0.1;

  while (high - low > 0.001) {
    const mid = (low + high) / 2;
    const testColor = apcach(contrastConfig, mid, hue);
    const actualContrast = Math.abs(testColor.contrastConfig.cr);

    if (Math.abs(actualContrast - Math.abs(targetContrast)) < tolerance) {
      return mid;
    } else if (actualContrast < Math.abs(targetContrast)) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return low;
}

// Update the global variable declarations with proper typing
let isTextPreviewMode = false;
let currentTextNodePreviewColor = '';
let currentTextNodeFills: Array<{ color: string; opacity: number; cssBlendMode?: string; visible: boolean }> | undefined = undefined;

// Fix the updateColorFromInputs function to use the same updatePreviewInUI approach consistently
function updateColorFromInputs(previousContrast?: number) {
  // Get current values
  const contrast = parseFloat((document.getElementById('contrastInput') as HTMLInputElement).value);
  const hue = parseFloat((document.getElementById('hueInput') as HTMLInputElement).value);
  const chroma = parseFloat((document.getElementById('chromaInput') as HTMLInputElement).value);

  // Calculate max chroma for current contrast and hue
  const maxChroma = getMaxAllowedChroma(contrast, hue);
  
  // Ensure chroma doesn't exceed max allowed
  const adjustedChroma = Math.min(chroma, maxChroma);
  
  // Update chroma controls with new max value
  updateChromaControls(maxChroma, adjustedChroma);

  // Create the color to get the actual APCA value
  const color = apcach(crToBg(currentBackground, contrast), adjustedChroma, hue);
  
  // Get the exact APCA value from the color object
  const actualApca = Math.abs(color.contrastConfig.cr);
  
  // Update APCA contrast display if significantly different
  if (Math.abs(actualApca - contrast) > 0.1) {
    console.log('Updating contrast input with actual APCA value:', actualApca);
    const contrastInput = document.getElementById('contrastInput') as HTMLInputElement;
    if (contrastInput) {
      contrastInput.value = actualApca.toString();
    }
    const contrastNumber = document.getElementById('contrastNumber') as HTMLInputElement;
    if (contrastNumber) {
      contrastNumber.value = actualApca.toString();
    }
  }

  // Update dynamic colors with the new hue
  const { r, g, b } = parseRgb(currentBackground) || { r: 255, g: 255, b: 255 };
  const dynamicColors = generateDynamicColors(r, g, b, hue);
  applyDynamicColors(dynamicColors);

  // Use current background for calculations
  recalculateColorWithBackground(currentBackground);
  
  // Ensure APCA value is properly formatted in the UI
  ensureFormattedApcaValueInUI();
  
  // If we're in text preview mode, update the text preview instead of regular preview
  if (isTextPreviewMode) {
    console.log('🔤 Updating text preview with new color values');
    // Convert the color to CSS format
    const cssColor = apcachToCss(color, 'hex');
    // Ensure color has proper format for text preview
    const formattedColor = cssColor.startsWith('#') ? cssColor : `#${cssColor}`;
    
    console.log('Generated color for text preview:', formattedColor);
    
    // Store the formatted color for consistent reference
    window.lastTextPreviewColor = formattedColor;
    
    // SIMPLIFIED: Use the updatePreviewInUI function to update all foreground controls
    updatePreviewInUI(formattedColor, currentBackground);
    
    // Get the preview element
    const colorPreview = document.getElementById('colorPreview') as HTMLDivElement;
    if (colorPreview) {
      // Update the text preview with the new color
      updateColorPreviewForText(
        colorPreview, 
        formattedColor.startsWith('#') ? formattedColor.substring(1) : formattedColor,
        currentBackground,
        currentTextNodeFills
      );
      
      // Send the updated color to Figma as a text color update
      sendColorToFigma(formattedColor, true);
    }
  }
}

// Fix the updateUI function to properly cast the colorPreview element
function updateUI(values: ValidatedValues) {
  const elements = {
    apca: document.getElementById('apcaValue')
  };

  const preview = document.querySelector('.preview-section');
  const colorValues = document.querySelector('.color-values');
  const apcaRow = document.querySelector('.apca-row');
  const apcaDescription = document.getElementById('apcaDescription');
  
  // Check if we have valid values
  const hasValues = Object.values(values).some(value => value !== undefined && value !== '');
  
  if (hasValues) {
    preview?.classList.remove('empty');
  } else {
    preview?.classList.add('empty');
  }

  // Update foreground color controls with the figmaP3 value or lastTextPreviewColor if in text preview mode
  if (values.figmaP3 || (isTextPreviewMode && window.lastTextPreviewColor)) {
    // Format the color for display - use lastTextPreviewColor if in text mode (priority)
    const displayColor = isTextPreviewMode && window.lastTextPreviewColor 
      ? window.lastTextPreviewColor 
      : (values.figmaP3?.startsWith('#') ? values.figmaP3 : `#${values.figmaP3}`);
    
    // Update the color input element
    const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
    if (fgColorInput) {
      fgColorInput.value = displayColor;
    }
    
    // Update the color value display
    const fgColorValue = document.getElementById('fgColorValue');
    if (fgColorValue) {
      fgColorValue.textContent = displayColor.toUpperCase();
    }
    
    console.log('Updated foreground control with color:', displayColor, 
      isTextPreviewMode ? '(from text preview)' : '(from values)');
  }

  // Update APCA row styles
  if (apcaRow instanceof HTMLElement) {
    // Ensure APCA row uses the same CSS variables
    apcaRow.style.setProperty('--border-color', 'var(--border-subtle)');
    apcaRow.style.setProperty('--text-color', 'var(--text-color)');
    apcaRow.style.setProperty('--text-secondary', 'var(--text-secondary)');
    apcaRow.style.setProperty('--text-tertiary', 'var(--text-tertiary)');
    // Ensure border-top uses the variable
    apcaRow.style.borderTopColor = 'var(--border-subtle)';
    // Force a repaint to ensure the border is visible
    apcaRow.style.display = 'block';
  }

  // Update APCA description styles - ensure direct color application
  if (apcaDescription instanceof HTMLElement) {
    // Get the current text tertiary color from root variables
    const textTertiaryColor = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim();
    
    // Apply both variable and direct color
    apcaDescription.style.setProperty('--text-color', 'var(--text-tertiary)');
    apcaDescription.style.color = "var(--figma-color-text-secondary, #666666)";
  }

  // Always recalculate APCA value for the preview section
  if (values.figmaP3 && values.p3) {
    // Calculate APCA value directly using the current color and background
    const directApca = calculateAPCA(values.p3, currentBackground);
    
    // Store the raw value for calculations
    values.apca = directApca.toString();
    
    // Format the APCA value for display
    values.apcaFormatted = Math.round(Math.abs(directApca)).toString();
    
    console.log('Recalculated APCA value for preview:', directApca, 'Raw:', values.apca, 'Formatted:', values.apcaFormatted);
  }

  // Update APCA element
  const apcaElement = elements.apca;
  if (apcaElement) {
    // Use the formatted APCA value for display
    const apcaValue = values.apcaFormatted || Math.round(parseFloat(values.apca as string)).toString();
    
    // Update the HTML element
    apcaElement.textContent = apcaValue;
    console.log('Displaying APCA value in UI:', apcaValue, 'Element ID:', apcaElement.id);
    
    // Update description with proper styling
    if (apcaDescription) {
      // Use the raw APCA value for description to ensure accuracy
      const rawApcaValue = parseFloat(values.apca as string);
      apcaDescription.textContent = getAPCADescription(rawApcaValue);
      
      // Get the current text tertiary color from root variables
      const textTertiaryColor = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim();
      
      // Apply both variable and direct color
      apcaDescription.style.setProperty('--text-color', 'var(--text-tertiary)');
      apcaDescription.style.color = "var(--figma-color-text-secondary, #666666)";
    }
  }

  // Update color preview with current background
  const colorPreview = document.getElementById('colorPreview') as HTMLDivElement;
  if (colorPreview && (values.figmaP3 || (isTextPreviewMode && window.lastTextPreviewColor))) {
    // If we're in text preview mode, update the text preview instead
    if (isTextPreviewMode) {
      console.log('🔤 Maintaining text preview mode in updateUI');
      
      // Get the color to use - either from lastTextPreviewColor or values.figmaP3
      const colorToUse = window.lastTextPreviewColor
        ? (window.lastTextPreviewColor.startsWith('#') 
            ? window.lastTextPreviewColor.substring(1) 
            : window.lastTextPreviewColor)
        : (values.figmaP3?.startsWith('#') 
            ? values.figmaP3.substring(1) 
            : values.figmaP3 || '');
      
      console.log('Using color for text preview in updateUI:', colorToUse);
      
      // Make sure we're updating the foreground control with this color too
      const formattedColor = colorToUse.startsWith('#') ? colorToUse : `#${colorToUse}`;
      updatePreviewInUI(formattedColor, currentBackground);
      
      updateColorPreviewForText(
        colorPreview, 
        colorToUse,
        currentBackground,
        currentTextNodeFills
      );
    } else {
      updateColorPreview(colorPreview, values.figmaP3 || '', currentBackground);
    }
  }
}

// Update ValidatedValues interface to include srgbFallback
interface ValidatedValues extends ColorValues {
  apcaPolarity: 'positive' | 'negative';
  srgbFallback?: string;  // Add this property
  apcaFormatted?: string; // Formatted APCA value for display
  gamut: {
    p3: boolean;
    srgb: boolean;
  };
}

// Update validateColor function to include srgbFallback calculation
function validateColor(color: ApcachColor, values: Partial<ColorValues>): ValidatedValues {
  // Check if color is in P3 and sRGB gamuts
  const p3Value = apcachToCss(color, 'p3');
  const srgbValue = apcachToCss(color, 'hex');
  
  const inP3 = inColorSpace(p3Value, 'p3');
  const inSrgb = inColorSpace(srgbValue, 'srgb');

  // Calculate sRGB fallback if needed
  let srgbFallback: string | undefined;
  if (!inSrgb) {
    // Create a new color with reduced chroma until it fits sRGB
    let testChroma = color.chroma;
    while (testChroma > 0) {
      testChroma -= 0.01;
      const testColor = apcach(color.contrastConfig, testChroma, color.hue);
      const testHex = apcachToCss(testColor, 'hex');
      if (inColorSpace(testHex, 'srgb')) {
        srgbFallback = testHex;
        break;
      }
    }
  }

  // Determine APCA polarity based on contrast config
  // For black backgrounds, contrast should be negative
  const isBlackBackground = 
    color.contrastConfig.bgColor === 'rgb(0, 0, 0)' || 
    color.contrastConfig.bgColor === '#000000' ||
    color.contrastConfig.bgColor === 'oklch(0 0 0)';
  
  // For black backgrounds, ensure polarity is negative
  const apcaPolarity = isBlackBackground ? 'negative' : 
                      (color.contrastConfig.cr >= 0 ? 'positive' : 'negative');
  
  // Get the exact APCA value from the color object
  const apcaValue = Math.abs(color.contrastConfig.cr);
  
  // Store the raw APCA value with minimal rounding for calculations
  const rawApca = apcaValue.toString();
  
  // Format the APCA value for display with rounding to nearest whole number
  const formattedApca = Math.round(apcaValue).toString();

  return {
    ...values,
    apcach: `apcach(${roundToFixed(Math.abs(color.contrastConfig.cr))}, ${color.chroma.toFixed(4)}, ${roundToFixed(color.hue)})`,
    oklch: values.oklch || '',
    hex: values.hex || '',
    p3: values.p3 || '',
    figmaP3: values.figmaP3 || '',
    apca: rawApca, // Store raw value for calculations
    apcaFormatted: formattedApca, // Store formatted value for display
    apcaDescription: getAPCADescription(apcaValue),
    textColor: values.textColor || '',
    apcaPolarity,
    srgbFallback,
    gamut: {
      p3: inP3,
      srgb: inSrgb
    }
  };
}

// Helper function to determine background type
function determineBackgroundType(bg: string): 'white' | 'black' | 'custom' {
  // Special case for pure black
  if (bg === '#000000' || bg === 'rgb(0, 0, 0)' || bg === '#000') {
    return 'black';
  }
  
  // Parse the background color to RGB
  const rgb = parseRgb(bg);
  
  if (!rgb) {
    console.warn('Could not parse background color:', bg);
    return 'white'; // Default to white if parsing fails
  }
  
  // Calculate luminance (0-255 range)
  const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  console.log('Background luminance:', luminance);
  
  // Check if it's white (or very close to white) using threshold from DEFAULT_CONFIG
  if (luminance >= DEFAULT_CONFIG.backgroundTypes.whiteLuminanceThreshold) {
    return 'white';
  }
  
  // Check if it's black (or very close to black) using threshold from DEFAULT_CONFIG
  if (luminance <= DEFAULT_CONFIG.backgroundTypes.blackLuminanceThreshold) {
    return 'black';
  }
  
  // Otherwise it's a custom color
  return 'custom';
}

// Update formatApcachValue to use consistent format with crToBg
function formatApcachValue(color: ApcachColor, bgType: 'white' | 'black' | 'custom'): string {
  try {
    const cr = Math.abs(color.contrastConfig.cr);
    const chroma = roundToFixed(color.chroma);
    const hue = roundToFixed(color.hue);
    
    console.log('Formatting APCACH value for background type:', bgType);
    console.log('Contrast:', color.contrastConfig.cr, 'Absolute contrast:', cr);
    console.log('Chroma:', chroma, 'Hue:', hue);
    
    // Get the current background color
    const bgColor = currentBackground || '#ffffff'; // Default to white if not found
    
    // Always use crToBg format for consistency
    return `apcach(crToBg("${bgColor}", ${cr}), ${chroma.toFixed(2)}, ${Math.round(hue)})`;
  } catch (error) {
    console.error('Error formatting APCACH value:', error);
    // Return a safe default format
    return `apcach(${Math.abs(color.contrastConfig.cr)}, ${color.chroma.toFixed(2)}, ${Math.round(color.hue)})`;
  }
}

function validateChromaInput(value: number): number {
  const contrast = parseFloat((document.getElementById('contrastInput') as HTMLInputElement).value);
  const hue = parseFloat((document.getElementById('hueInput') as HTMLInputElement).value);
  
  // Get max chroma for current state
  const maxChroma = getMaxAllowedChroma(contrast, hue);
  
  // Clamp value between 0 and max
  return Math.min(Math.max(0, value), maxChroma);
}

// Helper function to convert floating point to hex with proper padding
function floatingPointToHex(float: number): string {
  return Math.round(255 * float)
    .toString(16)
    .padStart(2, "0");
}

// Add this helper for percentage rounding
function roundPercentage(value: number, precision: number = 4): string {
  return (value * 100).toFixed(precision) + '%';
}

// Helper function to determine APCA contrast status
function getAPCAStatus(apcaValue: number): string {
  const absValue = Math.abs(apcaValue);
  
  if (absValue >= DEFAULT_CONFIG.apcaThresholds.bodyText) {
    return 'Body Text';
  }
  if (absValue >= DEFAULT_CONFIG.apcaThresholds.largeText) {
    return 'Large Text';
  }
  if (absValue >= DEFAULT_CONFIG.apcaThresholds.nonText) {
    return 'Non-Text';
  }
  if (absValue >= DEFAULT_CONFIG.apcaThresholds.uiComponents) {
    return 'UI Components';
  }
  if (absValue >= DEFAULT_CONFIG.apcaThresholds.decorative) {
    return 'Decorative';
  }
  return 'Insufficient';
}

// Helper function for APCA descriptions based on documentation
function getAPCADescription(apcaValue: number): string {
  const absValue = Math.abs(apcaValue);
  
  if (absValue >= DEFAULT_CONFIG.apcaThresholds.bodyText) {
    return 'Excellent Contrast (75+) - Suitable for body text';
  }
  if (absValue >= DEFAULT_CONFIG.apcaThresholds.largeText) {
    return 'Good Contrast (60-74) - Suitable for large text and headlines';
  }
  if (absValue >= DEFAULT_CONFIG.apcaThresholds.nonText) {
    return 'Moderate Contrast (45-59) - Suitable for large UI elements';
  }
  if (absValue >= DEFAULT_CONFIG.apcaThresholds.uiComponents) {
    return 'Low Contrast (30-44) - Minimum for UI components';
  }
  if (absValue >= DEFAULT_CONFIG.apcaThresholds.decorative) {
    return 'Minimal Contrast (15-29) - Decorative elements only';
  }
  return 'Insufficient Contrast (1-15) - Not suitable for any use';
}

// Initial state variables
let currentBackground = DEFAULT_CONFIG.backgroundColor; // Default background from config
let currentPreviewColor = '';
let currentPreviewHue = DEFAULT_CONFIG.previewHue; // Default hue from config
let hasValidSelection = false;
let selectedNodeId = ''; // ID of the currently selected node
let isLivePreviewEnabled = false; // Whether live preview is enabled
let currentAPCAValue = 0; // Current APCA contrast value
let currentBackgroundInfo: any = null; // Current background information

// Add a flag to track initialization state
let isInitializing = false;

// Initialize plugin with proper APCA contrast-based colors
function initializePluginColors() {
  try {
    isInitializing = true;
    console.log('Initializing plugin colors');
    
    // Set default color
    const DEFAULT_COLOR = generateDefaultColor();
    
    const root = document.documentElement;
    const initialBackground = currentBackground;
    const { r, g, b } = parseRgb(initialBackground) || { r: 255, g: 255, b: 255 };
    
    // Generate initial dynamic colors using APCA relationships
    const initialColors = generateDynamicColors(r, g, b, DEFAULT_CONFIG.previewHue);
    
    // Apply the calculated dynamic colors
    applyDynamicColors(initialColors);
    
    // Update UI state
    updateUIState(hasValidSelection);
    
    // Set the current preview hue to the default
    currentPreviewHue = DEFAULT_CONFIG.previewHue;
    
    console.log('Initialized plugin colors with hue:', currentPreviewHue);
    
    // Reset initializing flag
    setTimeout(() => {
      isInitializing = false;
    }, 500);
  } catch (error) {
    console.error('Error initializing plugin colors:', error);
    isInitializing = false;
  }
}

// Add this function to initialize the background color
function initializeBackgroundColor() {
  console.log('Initializing background color...');
  
  // Try to get background info from localStorage
  try {
    const storedBackgroundInfo = localStorage.getItem('backgroundInfo');
    if (storedBackgroundInfo) {
      const backgroundInfo = JSON.parse(storedBackgroundInfo);
      console.log('Found stored background info:', backgroundInfo);
      
      if (backgroundInfo.color) {
        // Update the current background variable
        currentBackground = backgroundInfo.color;
        console.log('Set current background to stored value:', currentBackground);
        
        // Update the background color input if it exists
        const bgColorInput = document.getElementById('bgColorInput') as HTMLInputElement;
        if (bgColorInput) {
          bgColorInput.value = backgroundInfo.color;
          console.log('Set background color input to stored value:', backgroundInfo.color);
        }
        
        // Update the background color value display if it exists
        const bgColorValue = document.getElementById('bgColorValue');
        if (bgColorValue) {
          bgColorValue.textContent = backgroundInfo.color.toUpperCase();
          console.log('Set background color value display to stored value:', backgroundInfo.color.toUpperCase());
        }
        
        // Update the preview section background
        const previewSection = document.querySelector('.preview-section') as HTMLElement;
        if (previewSection) {
          previewSection.style.backgroundColor = backgroundInfo.color;
          console.log('Set preview section background to stored value:', backgroundInfo.color);
        }
        
        // Update the root CSS variable
        document.documentElement.style.setProperty('--background-color', backgroundInfo.color);
        console.log('Set root CSS variable --background-color to stored value:', backgroundInfo.color);
        
        return;
      }
    }
  } catch (error) {
    console.error('Error reading background info from localStorage:', error);
  }
  
  // If we get here, either there was no stored background info or there was an error
  // Set default background color (white)
  currentBackground = '#FFFFFF';
  console.log('Set current background to default (white)');
  
  // Update the background color input if it exists
  const bgColorInput = document.getElementById('bgColorInput') as HTMLInputElement;
  if (bgColorInput) {
    bgColorInput.value = currentBackground;
    console.log('Set background color input to default (white)');
  }
  
  // Update the background color value display if it exists
  const bgColorValue = document.getElementById('bgColorValue');
  if (bgColorValue) {
    bgColorValue.textContent = currentBackground.toUpperCase();
    console.log('Set background color value display to default (white)');
  }
  
  // Update the preview section background
  const previewSection = document.querySelector('.preview-section') as HTMLElement;
  if (previewSection) {
    previewSection.style.backgroundColor = currentBackground;
    console.log('Set preview section background to default (white)');
  }
  
  // Update the root CSS variable
  document.documentElement.style.setProperty('--background-color', currentBackground);
  console.log('Set root CSS variable --background-color to default (white)');
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM content loaded, initializing plugin...');
  
  // Initialize the background color first
  initializeBackgroundColor();
  
  // Initialize plugin colors
  initializePluginColors();
  
  // Set up the APCACH value observer
  try {
    setupAPCACHValueObserver();
    // Set flag to prevent duplicate initialization
    window.apcachObserverInitialized = true;
  } catch (error) {
    console.error('Error setting up APCACH observer:', error);
  }
  
  // Log the current background for debugging
  console.log('Current background after initialization:', currentBackground);
  console.log('Background type:', determineBackgroundType(currentBackground));
  
  // Ensure the background color input is set to the current background
  const bgColorInput = document.getElementById('bgColorInput') as HTMLInputElement;
  if (bgColorInput) {
    bgColorInput.value = convertColorToHex(currentBackground);
    console.log('Set background color input to:', bgColorInput.value);
  }
  
  // Ensure the background color value display is set to the current background
  const bgColorValue = document.getElementById('bgColorValue');
  if (bgColorValue) {
    bgColorValue.textContent = currentBackground.toUpperCase();
    console.log('Set background color value display to:', bgColorValue.textContent);
  }
  
  // Ensure the preview section background is set to the current background
  const previewSection = document.querySelector('.preview-section') as HTMLElement;
  if (previewSection) {
    previewSection.style.backgroundColor = currentBackground;
    console.log('Set preview section background to:', currentBackground);
  }
  
  // Add event listeners for UI controls
  setupEventListeners();
});

// Add helper function to get adaptive hue based on background
  function getAdaptiveHue(backgroundColor: string, baseHue: number): number {
  const bgColor = convertToOklch(backgroundColor);
  if (!bgColor || typeof bgColor.h === 'undefined') return baseHue;
  
  // Adjust hue based on background hue to maintain contrast
  const bgHue = bgColor.h;
  const hueDiff = Math.abs(bgHue - baseHue);
  
  // If background hue is too close to target hue, shift it
  if (hueDiff < 30) {
    return (baseHue + 180) % 360; // Shift to opposite hue
  }
  
  return baseHue;
}

// Helper function to convert any color format to hex
function convertColorToHex(color: string, removeHash: boolean = false): string {
  if (!color) return removeHash ? 'FFFFFF' : '#FFFFFF';
  
  // If it's already a hex color, just return it
  if (color.startsWith('#')) {
    return removeHash ? color.substring(1) : color;
  }
  
  // Handle rgb/rgba format
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    
    const hex = '#' + 
      r.toString(16).padStart(2, '0') + 
      g.toString(16).padStart(2, '0') + 
      b.toString(16).padStart(2, '0');
    
    return removeHash ? hex.substring(1) : hex;
  }
  
  // Handle P3 format
  const p3Match = color.match(/color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\)/);
  if (p3Match) {
    // For P3 colors, we'll convert to RGB approximation for hex
    const r = Math.round(parseFloat(p3Match[1]) * 255);
    const g = Math.round(parseFloat(p3Match[2]) * 255);
    const b = Math.round(parseFloat(p3Match[3]) * 255);
    
    const hex = '#' + 
      r.toString(16).padStart(2, '0') + 
      g.toString(16).padStart(2, '0') + 
      b.toString(16).padStart(2, '0');
    
    return removeHash ? hex.substring(1) : hex;
  }
  
  // If we can't parse it, use a default color
  console.warn('Could not parse color:', color);
  return removeHash ? 'FFFFFF' : '#FFFFFF';
}

// Define default initial color values
const DEFAULT_COLOR = generateDefaultColor();
const DEFAULT_CONTRAST = DEFAULT_CONFIG.contrast;
const DEFAULT_CHROMA = DEFAULT_CONFIG.chroma;
const DEFAULT_HUE = DEFAULT_CONFIG.hue;

// Update function to update UI state based on selection
function updateUIState(hasValidSelection: boolean) {
  console.log('Updating UI state, hasValidSelection:', hasValidSelection);
  
  const root = document.documentElement;
  const previewSection = document.querySelector('.preview-section');
  
  if (hasValidSelection) {
    root.classList.remove('no-selection');
    previewSection?.classList.remove('empty');
    
    // Enable the preview button
    const previewButton = document.getElementById('generatePreview') as HTMLButtonElement;
    if (previewButton) {
      previewButton.disabled = false;
      previewButton.title = 'Generate a preview of this color in Figma (Cmd/Ctrl+Enter)';
    }
    
    // Update status to indicate live preview is active
    const statusElement = document.getElementById('livePreviewStatus');
    if (statusElement) {
      statusElement.textContent = isLivePreviewEnabled ? 'Live Preview Active' : 'Preview Ready';
      statusElement.classList.toggle('active', isLivePreviewEnabled);
    }
    
    console.log('UI updated for valid selection, live preview:', isLivePreviewEnabled);
  } else {
    root.classList.add('no-selection');
    previewSection?.classList.add('empty');
    
    // Keep the preview button enabled but with different message
    const previewButton = document.getElementById('generatePreview') as HTMLButtonElement;
    if (previewButton) {
      previewButton.disabled = false;
      previewButton.title = 'Generate a preview with the current color settings';
    }
    
    // Update status to indicate live preview is inactive
    const statusElement = document.getElementById('livePreviewStatus');
    if (statusElement) {
      statusElement.textContent = 'No Selection';
      statusElement.classList.remove('active');
    }
    
    // Reset to default initial color state when no selection
    // Only show message if not initializing
    if (!hasValidSelection) {
      resetToDefaultColorState(!isInitializing);
    }
    
    console.log('UI updated for no selection');
  }
}

// Function to reset to default initial color state
function resetToDefaultColorState(showMessage: boolean = true) {
  try {
    console.log('Resetting to default color state');
    
    // Reset the user changed color flag
    window.userChangedColor = false;
    
    // Disable live preview mode
    isLivePreviewEnabled = false;
    hasValidSelection = false;
    selectedNodeId = '';
    
    // Use fixed default background color from DEFAULT_CONFIG
    const defaultBackground = DEFAULT_CONFIG.backgroundColor;
    currentBackground = defaultBackground; // Update the global currentBackground variable
    
    // Generate default color using APCACH parameters
    const initialColor = generateDefaultColor();
    console.log('Generated default color:', initialColor);
    
    // Update the background color in the UI
    updateBackgroundColor(defaultBackground);
    
    // Create default APCACH color with fixed background
    const defaultApcachColor = cssToApcach(initialColor, { bg: defaultBackground });
    
    // Update UI controls silently
    updateControlsFromColorSilently(defaultApcachColor);
    
    // Generate default color values
    const defaultValues = {
      apcach: `apcach(${DEFAULT_CONFIG.contrast}, ${DEFAULT_CONFIG.chroma}, ${DEFAULT_CONFIG.hue})`,
      oklch: apcachToCss(defaultApcachColor, 'oklch'),
      hex: apcachToCss(defaultApcachColor, 'hex'),
      p3: apcachToCss(defaultApcachColor, 'p3'),
      figmaP3: initialColor
    };
    
    // Calculate APCA value for the default color
    const apcaValue = Math.abs(defaultApcachColor.contrastConfig.cr);
    
    // Create validated values object for updateUI
    const validatedValues: ValidatedValues = {
      ...defaultValues,
      apca: apcaValue.toString(),
      apcaFormatted: Math.round(apcaValue).toString(),
      apcaPolarity: apcaValue >= 0 ? 'positive' : 'negative',
      textColor: calculateTextColor(defaultBackground),
      apcaDescription: getAPCADescription(apcaValue),
      gamut: {
        p3: true,
        srgb: true
      }
    };
    
    // Update UI with validated values
    updateUI(validatedValues);
    
    // Reset sliders to default values
    updateSlidersWithValues(
      DEFAULT_CONFIG.contrast,
      DEFAULT_CONFIG.chroma,
      DEFAULT_CONFIG.hue
    );
    
    // Update color preview
    const colorPreview = document.getElementById('colorPreview');
    if (colorPreview) {
      // Update the preview with the initial color and background
      updateColorPreview(colorPreview, initialColor, defaultBackground);
      console.log('Updated color preview with initial color:', initialColor);
    }
    
    // Update the preview hue
    currentPreviewHue = DEFAULT_CONFIG.previewHue;
    
    // Update dynamic colors based on the default background
    const { r, g, b } = parseRgb(defaultBackground) || { r: 255, g: 255, b: 255 };
    const dynamicColors = generateDynamicColors(r, g, b, currentPreviewHue);
    applyDynamicColors(dynamicColors);
    
    // Update current preview color to avoid duplicate updates
    currentPreviewColor = initialColor;
    
    // Ensure APCA value is properly formatted in the UI
    ensureFormattedApcaValueInUI();
    
    console.log('Reset to default color state complete');
    
    // Only show the message if showMessage is true and we're not initializing
    if (showMessage && !isInitializing) {
      showStatusMessage('Reset to default color state', 'info');
    }
  } catch (error) {
    console.error('Error resetting to default color state:', error);
  }
}

function generateFigmaPreview() {
  try {
    console.log('Generating Figma preview');
    
    // Get the current color values from the preview
    const previewElement = document.getElementById('colorPreview');
    if (!previewElement) {
      showStatusMessage('Error: Preview element not found', 'error');
      return;
    }
    
    // Get the current color from the preview
    const currentColor = previewElement.style.backgroundColor;
    if (!currentColor) {
      showStatusMessage('Error: No color in preview', 'error');
      return;
    }
    
    // Get the CURRENT background color - this is critical
    // First try to get it from the preview section, then fall back to currentBackground variable
    const previewSection = document.querySelector('.preview-section') as HTMLElement;
    let backgroundColor = '';
    
    if (previewSection) {
      backgroundColor = getComputedStyle(previewSection).backgroundColor;
      console.log('Got background from preview section:', backgroundColor);
    }
    
    // If we couldn't get the background from the preview section, use the current background
    if (!backgroundColor || backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent') {
      backgroundColor = currentBackground;
      console.log('Using currentBackground variable:', backgroundColor);
    }
    
    // As a final fallback, use getCurrentBackgroundColor
    if (!backgroundColor) {
      backgroundColor = getCurrentBackgroundColor();
      console.log('Using getCurrentBackgroundColor:', backgroundColor);
    }
    
    console.log('Final background color for preview:', backgroundColor);
    
    // Parse background color to RGB components - this is the most accurate representation
    const bgRgb = parseRgb(backgroundColor);
    
    // If we have valid RGB components, use them to generate a consistent hex color
    let backgroundHex = '';
    if (bgRgb) {
      // Generate hex from RGB for consistency
      backgroundHex = '#' + 
        bgRgb.r.toString(16).padStart(2, '0') + 
        bgRgb.g.toString(16).padStart(2, '0') + 
        bgRgb.b.toString(16).padStart(2, '0');
      console.log('Generated consistent background hex from RGB:', backgroundHex);
    } else {
      // Fallback to convertColorToHex if parseRgb fails
      backgroundHex = convertColorToHex(backgroundColor);
      console.log('Using convertColorToHex fallback for background:', backgroundHex);
    }
    
    // Get background type for additional context
    const bgType = determineBackgroundType(backgroundColor);
    console.log('Background type:', bgType);
    console.log('Background RGB:', bgRgb);
    console.log('Background Hex:', backgroundHex);
    
    // Get the figma P3 value from the UI - try multiple selectors
    let figmaP3Value = document.getElementById('figmaP3Value')?.textContent || '';
    
    // If we have a figma P3 value, validate it's in the P3 gamut
    if (figmaP3Value) {
      // Clean the value to ensure proper format
      figmaP3Value = figmaP3Value.replace(/^#+/, '');
      
      // Ensure it doesn't have a # prefix for internal processing
      if (figmaP3Value.startsWith('#')) {
        figmaP3Value = figmaP3Value.substring(1);
      }
      
      // Convert to OKLCH for consistent APCA calculation - with error handling
      const figmaP3Color = `#${figmaP3Value}`;
      
      // Safely convert to APCACH with error handling
      let apcachColor: ApcachColor;
      try {
        apcachColor = cssToApcach(figmaP3Color, { bg: backgroundColor });
      } catch (error) {
        console.error('Error converting to APCACH:', error);
        // Create a fallback APCACH color
        apcachColor = {
          alpha: 1,
          chroma: DEFAULT_CONFIG.chroma,
          hue: DEFAULT_CONFIG.hue,
          lightness: 0.5,
          colorSpace: 'p3',
          contrastConfig: createContrastConfig(DEFAULT_CONFIG.contrast)
        };
      }
      
      // Safely convert to OKLCH with error handling
      let oklchColor: string;
      try {
        oklchColor = apcachToCss(apcachColor, 'oklch');
      } catch (error) {
        console.error('Error converting to OKLCH:', error);
        // Create a fallback OKLCH string
        oklchColor = `oklch(50% ${DEFAULT_CONFIG.chroma} ${DEFAULT_CONFIG.hue})`;
      }
      
      // Calculate APCA from APCACH values with error handling
      let apcaValue: number;
      try {
        apcaValue = Math.abs(apcachColor.contrastConfig.cr);
      } catch (error) {
        console.error('Error getting APCA value:', error);
        apcaValue = DEFAULT_CONFIG.contrast;
      }
      
      console.log('Preview color APCA value calculated from OKLCH:', apcaValue);
      
      // Check if we're already in live preview mode
      const isInLivePreviewMode = isLivePreviewEnabled && hasValidSelection;
      
      // Check if the color is in the P3 gamut with error handling
      let inP3Gamut = true;
      let inSrgbGamut = true;
      try {
        inP3Gamut = inColorSpace(`#${figmaP3Value}`, 'p3');
        inSrgbGamut = inColorSpace(`#${figmaP3Value}`, 'srgb');
      } catch (error) {
        console.error('Error checking color gamut:', error);
        // Default to true to avoid unnecessary adjustments
      }
      
      // Create a values object with all color formats and gamut information
      const values: ColorValues = {
        apcach: document.getElementById('apcachValue')?.textContent || '',
        oklch: document.getElementById('oklchValue')?.textContent || oklchColor,
        hex: document.getElementById('hexValue')?.textContent || figmaP3Color,
        p3: document.getElementById('p3Value')?.textContent || `color(display-p3 0.5 0.5 0.5)`,
        figmaP3: `#${figmaP3Value}`,
        apca: apcaValue.toString(),
        apcaDescription: getAPCADescription(apcaValue),
        textColor: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#000000',
        textSecondary: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#333333',
        textTertiary: getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim() || '#666666',
        gamut: {
          p3: inP3Gamut,
          srgb: inSrgbGamut
        }
      };
      
      if (!inP3Gamut) {
        console.warn('Color is outside P3 gamut, adjusting...');
        
        // Get the current APCACH values
        const contrastInput = document.getElementById('contrastInput') as HTMLInputElement;
        const chromaInput = document.getElementById('chromaInput') as HTMLInputElement;
        const hueInput = document.getElementById('hueInput') as HTMLInputElement;
        
        if (contrastInput && chromaInput && hueInput) {
          const contrast = parseFloat(contrastInput.value) || DEFAULT_CONFIG.contrast;
          const chroma = parseFloat(chromaInput.value) || DEFAULT_CONFIG.chroma;
          const hue = parseFloat(hueInput.value) || DEFAULT_CONFIG.hue;
          
          // Create a contrast config
          const config = createContrastConfig(contrast);
          
          // Find maximum valid chroma for this contrast and hue with error handling
          let maxValidChroma: number;
          try {
            maxValidChroma = findMaxValidChroma(config, hue);
          } catch (error) {
            console.error('Error finding max valid chroma:', error);
            maxValidChroma = Math.min(chroma, 0.2); // Conservative fallback
          }
          
          console.log(`Adjusting chroma from ${chroma} to ${maxValidChroma}`);
          
          // Generate a new color with the adjusted chroma with error handling
          let adjustedColor: ApcachColor;
          let adjustedP3Value: string;
          try {
            adjustedColor = apcach(config, maxValidChroma, hue);
            adjustedP3Value = apcachToCss(adjustedColor, 'figma-p3');
          } catch (error) {
            console.error('Error generating adjusted color:', error);
            // Create fallback values
            adjustedColor = {
              alpha: 1,
              chroma: maxValidChroma,
              hue: hue,
              lightness: 0.5,
              colorSpace: 'p3',
              contrastConfig: config
            };
            adjustedP3Value = figmaP3Color; // Use original as fallback
          }
          
          // Calculate APCA from the adjusted color with error handling
          let adjustedApcaValue: number;
          try {
            adjustedApcaValue = Math.abs(adjustedColor.contrastConfig.cr);
          } catch (error) {
            console.error('Error calculating adjusted APCA value:', error);
            adjustedApcaValue = contrast; // Use input contrast as fallback
          }
          
          console.log('Adjusted color APCA value:', adjustedApcaValue);
          
          // Update the values object with adjusted values
          values.figmaP3 = adjustedP3Value;
          values.apca = adjustedApcaValue.toString();
          values.apcaDescription = getAPCADescription(adjustedApcaValue);
          values.gamut = {
            p3: true, // Adjusted color should be in P3 gamut
            srgb: inColorSpace(adjustedP3Value, 'srgb')
          };
          
          // Show a warning message
          showStatusMessage('Color adjusted to fit P3 gamut', 'warning');
          
          // Send the adjusted color to Figma with the calculated APCA value and background info
          sendPreviewToFigma(adjustedP3Value, adjustedApcaValue, values);
        } else {
          // If we can't adjust the color, convert current color to hex
          const hexColor = convertColorToHex(currentColor);
          
          // Calculate APCA from the hex color with error handling
          let hexApcaValue: number;
          try {
            const hexApcachColor = cssToApcach(hexColor, { bg: backgroundColor });
            hexApcaValue = Math.abs(hexApcachColor.contrastConfig.cr);
          } catch (error) {
            console.error('Error calculating hex APCA value:', error);
            hexApcaValue = DEFAULT_CONFIG.contrast; // Use default as fallback
          }
          
          // Update the values object
          values.figmaP3 = hexColor;
          values.apca = hexApcaValue.toString();
          values.apcaDescription = getAPCADescription(hexApcaValue);
          
          sendPreviewToFigma(hexColor, hexApcaValue, values);
        }
      } else {
        // Send the figma P3 value directly with the calculated APCA value
        sendPreviewToFigma(`#${figmaP3Value}`, apcaValue, values);
      }
      
      // Update the button text based on the current state
      const previewButton = document.getElementById('generatePreview');
      if (previewButton) {
        if (isInLivePreviewMode) {
          // If we're already in live preview mode, this is just generating a new preview
          // without changing the live preview state
          previewButton.textContent = 'Preview Generated';
          setTimeout(() => {
            if (previewButton) {
              previewButton.textContent = 'Generate Preview';
            }
          }, 2000);
          
          showStatusMessage('Preview generated. Live preview mode remains active.', 'info');
        } else {
          // If we're not in live preview mode, this is a one-time preview
          previewButton.textContent = 'Preview Generated';
          setTimeout(() => {
            if (previewButton) {
              previewButton.textContent = 'Generate Preview';
            }
          }, 2000);
          
          showStatusMessage('Preview generated. No auto-selection or tracking.', 'info');
        }
      }
    } else {
      // If we don't have a figma P3 value, convert current color to hex
      const hexColor = convertColorToHex(currentColor);
      
      // Calculate APCA from the hex color with error handling
      let hexApcaValue: number;
      try {
        const hexApcachColor = cssToApcach(hexColor, { bg: backgroundColor });
        hexApcaValue = Math.abs(hexApcachColor.contrastConfig.cr);
      } catch (error) {
        console.error('Error calculating hex APCA value:', error);
        hexApcaValue = DEFAULT_CONFIG.contrast; // Use default as fallback
      }
      
      // Create a values object with all color formats
      const values: ColorValues = {
        apcach: document.getElementById('apcachValue')?.textContent || '',
        oklch: document.getElementById('oklchValue')?.textContent || `oklch(50% 0.2 145)`,
        hex: document.getElementById('hexValue')?.textContent || hexColor,
        p3: document.getElementById('p3Value')?.textContent || `color(display-p3 0.5 0.5 0.5)`,
        figmaP3: hexColor,
        apca: hexApcaValue.toString(),
        apcaDescription: getAPCADescription(hexApcaValue),
        textColor: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#000000',
        textSecondary: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#333333',
        textTertiary: getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim() || '#666666',
        gamut: {
          p3: true, // Assume it's in P3 gamut
          srgb: true // Assume it's in sRGB gamut
        }
      };
      
      // Send the hex color to Figma with the calculated APCA value
      sendPreviewToFigma(hexColor, hexApcaValue, values);
      
      // Update the button text
      const previewButton = document.getElementById('generatePreview');
      if (previewButton) {
        previewButton.textContent = 'Preview Generated';
        setTimeout(() => {
          if (previewButton) {
            previewButton.textContent = 'Generate Preview';
          }
        }, 2000);
      }
      
      showStatusMessage('Preview generated with current color.', 'info');
    }
  } catch (error) {
    console.error('Error generating Figma preview:', error);
    showStatusMessage(`Error generating Figma preview: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

/**
 * Shows a status message to the user
 * @param message The message to show
 * @param type The type of message (info, error, warning)
 */
function showStatusMessage(message: string, type: 'info' | 'error' | 'warning' = 'info') {
  const statusElement = document.getElementById('statusMessage');
  if (!statusElement) {
    // Create status element if it doesn't exist
    const newStatusElement = document.createElement('div');
    newStatusElement.id = 'statusMessage';
    newStatusElement.style.position = 'fixed';
    newStatusElement.style.bottom = '16px';
    newStatusElement.style.left = '50%';
    newStatusElement.style.transform = 'translateX(-50%)';
    newStatusElement.style.padding = '8px 16px';
    newStatusElement.style.borderRadius = '4px';
    newStatusElement.style.fontSize = '14px';
    newStatusElement.style.fontWeight = 'bold';
    newStatusElement.style.zIndex = '1000';
    newStatusElement.style.transition = 'opacity 0.3s ease';
    document.body.appendChild(newStatusElement);
    
    // Use the newly created element
    showStatusMessage(message, type);
    return;
  }
  
  // Set styles based on message type
  switch (type) {
    case 'error':
      statusElement.style.backgroundColor = 'rgba(220, 38, 38, 0.9)';
      statusElement.style.color = 'white';
      break;
    case 'warning':
      statusElement.style.backgroundColor = 'rgba(245, 158, 11, 0.9)';
      statusElement.style.color = 'white';
      break;
    case 'info':
    default:
      statusElement.style.backgroundColor = 'rgba(59, 130, 246, 0.9)';
      statusElement.style.color = 'white';
      break;
  }
  
  // Set message and show
  statusElement.textContent = message;
  statusElement.style.opacity = '1';
  statusElement.style.display = 'block';
  
  // Hide after 3 seconds
  setTimeout(() => {
    if (statusElement) {
      statusElement.style.opacity = '0';
      setTimeout(() => {
        if (statusElement) {
          statusElement.style.display = 'none';
        }
      }, 300);
    }
  }, 3000);
}

// ... rest of the existing code ... 

// Helper function to calculate luminance (0-255 range)
function calculateLuminance(color: string): number {
  const rgb = parseRgb(color);
  if (!rgb) return 255; // Default to white if parsing fails
  
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

// Function to parse APCACH value
function parseAPCACHValue(apcachStr: string): { functionName: string; targetColor?: string; contrast: number; hue: number; chroma: number } | null {
  if (!apcachStr) {
    console.error('Empty APCACH string provided');
    return null;
  }

  try {
    console.log('Parsing APCACH value:', apcachStr);
    
    // Simple format: apcach(22.46, 0.2393, 262.93)
    const simpleContrastRegex = /apcach\((\d+\.?\d*),\s*(\d+\.?\d*),\s*(\d+\.?\d*)\)/;
    const simpleMatch = apcachStr.match(simpleContrastRegex);
    
    if (simpleMatch) {
      const result = {
        functionName: 'contrast',
        targetColor: '', // Add empty targetColor for consistency
        contrast: parseFloat(simpleMatch[1]),
        chroma: parseFloat(simpleMatch[2]),
        hue: parseFloat(simpleMatch[3])
      };
      console.log('Matched simple contrast format:', result);
      return result;
    }
    
    // Complex format: apcach(crToBg("#1e1e1e", 22.46), 0.24, 263)
    const crToBgRegex = /apcach\(crToBg\("([^"]+)",\s*(\d+\.?\d*)\),\s*(\d+\.?\d*),\s*(\d+\.?\d*)\)/;
    const crToBgMatch = apcachStr.match(crToBgRegex);
    
    if (crToBgMatch) {
      const result = {
        functionName: 'crToBg',
        targetColor: crToBgMatch[1],
        contrast: parseFloat(crToBgMatch[2]),
        chroma: parseFloat(crToBgMatch[3]),
        hue: parseFloat(crToBgMatch[4])
      };
      console.log('Matched generic crToBg format:', result);
      return result;
    }
    
    console.log('Failed to parse APCACH value:', apcachStr);
    return null;
  } catch (error) {
    console.error('Error parsing APCACH value:', error);
    return null;
  }
}

// Function to update sliders from APCACH value
function updateSlidersFromAPCACH(apcachValue: string): void {
  if (!apcachValue) {
    console.error('Empty APCACH value provided to updateSlidersFromAPCACH');
    return;
  }

  console.log('Updating sliders from APCACH value:', apcachValue);
  
  // Try to parse the APCACH value
  const parsedValue = parseAPCACHValue(apcachValue);
  
  if (parsedValue) {
    // If parsing succeeds, use the parsed values
    console.log('Updating sliders with parsed values:', {
      contrast: parsedValue.contrast,
      chroma: parsedValue.chroma,
      hue: parsedValue.hue
    });
    
    // Update sliders without triggering additional updates
    updateSlidersWithValues(parsedValue.contrast, parsedValue.chroma, parsedValue.hue);
    
    // Only recalculate color if needed - this was causing the loop
    // We'll let the slider update handle this instead of calling it directly
  } else {
    // If parsing fails, extract values directly from the original simple format
    const simpleMatch = apcachValue.match(/apcach\((\d+\.?\d*),\s*(\d+\.?\d*),\s*(\d+\.?\d*)\)/);
    if (simpleMatch) {
      const contrast = parseFloat(simpleMatch[1]);
      const chroma = parseFloat(simpleMatch[2]);
      const hue = parseFloat(simpleMatch[3]);
      console.log('Using simple format fallback values:', { contrast, chroma, hue });
      updateSlidersWithValues(contrast, chroma, hue);
      // Don't call updateColorFromInputs() here - let the slider update handle it
    } else {
      console.log('Could not extract values from APCACH string, no changes made to sliders');
    }
  }
}

// Update the updateSlidersWithValues function to update dynamic colors
function updateSlidersWithValues(contrast: number, chroma: number, hue: number): void {
  try {
    // Update contrast slider
    const contrastSlider = document.getElementById('contrastSlider') as HTMLInputElement;
    const contrastInput = document.getElementById('contrastInput') as HTMLInputElement;
    const contrastValue = document.getElementById('contrastSliderValue');
    
    if (contrastSlider && contrastInput && contrastValue) {
      contrastSlider.value = contrast.toString();
      contrastInput.value = contrast.toString();
      contrastValue.textContent = contrast.toString();
      console.log('Updated contrast slider to:', contrast);
    }
    
    // Update chroma slider
    const chromaSlider = document.getElementById('chromaSlider') as HTMLInputElement;
    const chromaInput = document.getElementById('chromaInput') as HTMLInputElement;
    const chromaValue = document.getElementById('chromaSliderValue');
    
    if (chromaSlider && chromaInput && chromaValue) {
      chromaSlider.value = chroma.toString();
      chromaInput.value = chroma.toString();
      chromaValue.textContent = chroma.toFixed(4);
      console.log('Updated chroma slider to:', chroma);
    }
    
    // Update hue slider
    const hueSlider = document.getElementById('hueSlider') as HTMLInputElement;
    const hueInput = document.getElementById('hueInput') as HTMLInputElement;
    const hueValue = document.getElementById('hueSliderValue');
    
    if (hueSlider && hueInput && hueValue) {
      hueSlider.value = hue.toString();
      hueInput.value = hue.toString();
      hueValue.textContent = Math.round(hue).toString();
      console.log('Updated hue slider to:', hue);
    }
    
    // Update dynamic colors with the new hue
    const { r, g, b } = parseRgb(currentBackground) || { r: 255, g: 255, b: 255 };
    const dynamicColors = generateDynamicColors(r, g, b, hue);
    applyDynamicColors(dynamicColors);
    
    // Store the current hue for future reference
    currentPreviewHue = hue;
  } catch (error) {
    console.error('Error updating sliders with values:', error);
  }
}

// Function to ensure APCACH value is in the correct format
function ensureCorrectAPCACHFormat(apcachValue: string): string {
  if (!apcachValue) return apcachValue;
  
  console.log('Ensuring correct APCACH format for:', apcachValue);
  
  try {
    // Check if we're already processing this value to prevent loops
    if (window.isProcessingAPCACH) {
      console.log('Already processing APCACH value, skipping format check');
      return apcachValue;
    }
    
    // Parse the APCACH value
    const parsedValue = parseAPCACHValue(apcachValue);
    
    if (!parsedValue) {
      console.log('Could not parse APCACH value for formatting:', apcachValue);
      return apcachValue; // Return original value if parsing fails
    }
    
    // If it's already in the complex format, just return it
    if (parsedValue.functionName === 'crToBg') {
      return apcachValue;
    }
    
    // Only convert simple format to complex format if needed
    if (parsedValue.functionName === 'contrast') {
      const backgroundColor = getCurrentBackgroundColor();
      const formattedValue = `apcach(crToBg("${backgroundColor}", ${parsedValue.contrast.toFixed(2)}), ${parsedValue.chroma.toFixed(4)}, ${Math.round(parsedValue.hue)})`;
      console.log('Formatted simple APCACH to complex format:', formattedValue);
      return formattedValue;
    }
    
    return apcachValue;
  } catch (error) {
    console.error('Error formatting APCACH value:', error);
    return apcachValue; // Return original value on error
  }
}

// Add a MutationObserver to watch for changes to the APCACH value in the UI
function setupAPCACHValueObserver() {
  const apcachValueElement = document.getElementById('apcachValue');
  if (!apcachValueElement) return;
  
  // Add a flag to the window object to track processing state
  window.isProcessingAPCACH = false;
  
  const observer = new MutationObserver(function(mutations) {
    try {
      // If we're already processing, don't trigger another update
      if (window.isProcessingAPCACH) {
        console.log('Skipping APCACH observer update - already processing');
        return;
      }
      
      mutations.forEach(function(mutation) {
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          const newValue = apcachValueElement.textContent;
          if (!newValue) return;
          
          console.log('APCACH value changed to:', newValue);
          
          // Set processing flag to prevent loops
          window.isProcessingAPCACH = true;
          
          try {
            // Check if the value needs to be formatted
            const formattedValue = ensureCorrectAPCACHFormat(newValue);
            
            // If the formatted value is different from the current value, update it
            if (formattedValue !== newValue) {
              console.log('Detected APCACH value that needs formatting, fixing:', newValue);
              console.log('Formatted value:', formattedValue);
              
              // Use setTimeout to avoid infinite loop with the observer
              setTimeout(() => {
                if (apcachValueElement.textContent !== formattedValue) {
                  apcachValueElement.textContent = formattedValue;
                }
                // Reset processing flag after update
                window.isProcessingAPCACH = false;
              }, 0);
            } else {
              // Update the sliders based on the APCACH value
              try {
                if (typeof updateSlidersFromAPCACH === 'function') {
                  updateSlidersFromAPCACH(formattedValue);
                } else {
                  console.error('updateSlidersFromAPCACH function is not defined');
                }
              } catch (sliderError) {
                console.error('Error updating sliders from APCACH:', sliderError);
              }
              
              // Reset processing flag
              window.isProcessingAPCACH = false;
            }
          } catch (error) {
            // Reset processing flag on error
            window.isProcessingAPCACH = false;
            console.error('Error processing APCACH value:', error);
          }
        }
      });
    } catch (error) {
      // Reset processing flag on error
      window.isProcessingAPCACH = false;
      console.error('Error in APCACH observer:', error);
    }
  });
  
  observer.observe(apcachValueElement, { 
    characterData: true, 
    childList: true,
    subtree: true 
  });
}

// Update function to update controls without triggering recalculation
function updateControlsFromColorSilently(color: ApcachColor) {
  console.log('Updating controls silently with color:', color);
  
  // This is a programmatic update, not a user change
  window.userChangedColor = false;
  
  // Get all input elements
  const contrastInput = document.getElementById('contrastInput') as HTMLInputElement;
  const hueInput = document.getElementById('hueInput') as HTMLInputElement;
  const chromaInput = document.getElementById('chromaInput') as HTMLInputElement;
  const contrastNumber = document.getElementById('contrastNumber') as HTMLInputElement;
  const hueNumber = document.getElementById('hueNumber') as HTMLInputElement;
  const chromaNumber = document.getElementById('chromaNumber') as HTMLInputElement;
  
  if (!contrastInput || !hueInput || !chromaInput) {
    console.error('Could not find all required input elements');
    return;
  }
  
  // Store original event listeners
  const contrastInputListener = contrastInput.oninput;
  const hueInputListener = hueInput.oninput;
  const chromaInputListener = chromaInput.oninput;
  
  // Temporarily remove event listeners
  contrastInput.oninput = null;
  hueInput.oninput = null;
  chromaInput.oninput = null;
  
  try {
    // Extract values from color
    const contrast = Math.abs(color.contrastConfig.cr);
    const hue = color.hue;
    const chroma = color.chroma;
    
    console.log('Extracted values from color:', { contrast, hue, chroma });
    
    // Update slider inputs
    contrastInput.value = contrast.toString();
    hueInput.value = hue.toString();
    chromaInput.value = chroma.toString();
    
    // Update number inputs if they exist
    if (contrastNumber) contrastNumber.value = contrast.toString();
    if (hueNumber) hueNumber.value = hue.toString();
    if (chromaNumber) chromaNumber.value = chroma.toString();
    
    console.log('Updated all input values silently');
    
    // Update max chroma info
    updateMaxChromaInfo(contrast, hue);
    console.log('Updated max chroma info');
  } finally {
    // Restore event listeners
    contrastInput.oninput = contrastInputListener;
    hueInput.oninput = hueInputListener;
    chromaInput.oninput = chromaInputListener;
    
    console.log('Restored event listeners');
  }
}

// Listen for messages from the plugin
window.onmessage = async (event: MessageEvent) => {
  console.log('🔔🔔🔔 MESSAGE RECEIVED FROM FIGMA 🔔🔔🔔', new Date().toISOString());
  
  // Ensure event.data.pluginMessage exists
  if (!event.data.pluginMessage) {
    console.warn('⚠️ Received message with no pluginMessage:', event.data);
    return;
  }
  
  const message = event.data.pluginMessage;
  console.log('🔔 RECEIVED MESSAGE FROM PLUGIN:', message);

  if (message.type === 'init-background') {
    // Extract the background color from the Figma message
    const { r, g, b } = message.color;
    
    // Convert RGB values to hex format with proper padding for single digits
    const rHex = Math.round(r).toString(16).padStart(2, '0');
    const gHex = Math.round(g).toString(16).padStart(2, '0');
    const bHex = Math.round(b).toString(16).padStart(2, '0');
    const extractedBgColor = `#${rHex}${gHex}${bHex}`.toUpperCase();
    
    console.log('🎨 Received background color from Figma:', extractedBgColor, 'Original RGB:', { r, g, b });
    
    // Update the background with the extracted color from Figma
    updateBackgroundColor(extractedBgColor);
    
    // Generate and apply new dynamic colors based on the extracted background
    const dynamicColors = generateDynamicColors(Math.round(r), Math.round(g), Math.round(b));
    applyDynamicColors(dynamicColors);
    
    console.log('✅ Initialized with background color from Figma:', extractedBgColor);
  } else if (message.type === 'initial-state') {
    console.log('📋 Received initial state:', message);
    hasValidSelection = message.hasSelection && message.hasValidFill;
    updateUIState(hasValidSelection);
    
    // If no selection, reset to default color state
    // Only show message if not initializing
    if (!hasValidSelection) {
      resetToDefaultColorState(!isInitializing);
    }
  } else if (message.type === 'initial-color') {
    console.log('');
    console.log('*********************************************************');
    console.log('******* INITIAL COLOR MESSAGE HANDLER TRIGGERED *********');
    console.log('*********************************************************');
    console.log('');
    
    try {
      console.log('🎨 RECEIVED INITIAL COLOR FROM FIGMA:', message);
      console.log('🎨 RAW MESSAGE OBJECT:', JSON.stringify(message));
      
      // Simple check for text node
      console.log('🔎 TEXT NODE TYPE VALUE IS:', message.nodeType);
      console.log('🔎 TYPE OF NODE TYPE IS:', typeof message.nodeType);
      
      // Detailed check for TEXT
      if (typeof message.nodeType === 'string') {
        console.log('🔍 TEXT NODE COMPARISONS:');
        console.log('✓ Direct comparison (message.nodeType === \'TEXT\'):', message.nodeType === 'TEXT');
        console.log('✓ Lowercase comparison (message.nodeType.toLowerCase() === \'text\'):', message.nodeType.toLowerCase() === 'text');
        console.log('✓ Uppercase comparison (message.nodeType.toUpperCase() === \'TEXT\'):', message.nodeType.toUpperCase() === 'TEXT');
        
        // Check for extra whitespace or special characters
        console.log('✓ Trimmed value:', `'${message.nodeType.trim()}'`);
        
        // Get character codes in a TypeScript-safe way
        const charCodes: number[] = [];
        for (let i = 0; i < message.nodeType.length; i++) {
          charCodes.push(message.nodeType.charCodeAt(i));
        }
        console.log('✓ Character codes:', charCodes);
      }
      
      // Determine if this is a text node - use consistent check
      const isTextNode = typeof message.nodeType === 'string' && message.nodeType.toUpperCase() === 'TEXT';
      console.log('Is text node?', isTextNode, 'Node type:', message.nodeType);
      
      // Set the text preview mode flag based on node type
      isTextPreviewMode = isTextNode;
      
      // Format the color correctly
      const formattedColor = message.color;
      
      // Check if the message has a valid color
      if (!formattedColor) {
        console.error('⚠️ Received initial-color message with no color value');
      }
      
      console.log('📊 Formatted color:', formattedColor);
      
      // Reset the userChangedColor flag - this is a color from Figma, not a user change
      window.userChangedColor = false;
      
      // Set selection state
      hasValidSelection = true;
      selectedNodeId = message.nodeId || '';
      
      // Enable live preview mode
      isLivePreviewEnabled = true;
      
      try {
        // Ensure the color has a # prefix if it's a hex color
        const formattedColor = message.color && message.color.startsWith ? 
          (message.color.startsWith('#') ? message.color : '#' + message.color) : null;
          
        if (!formattedColor) {
          console.error('❌ Could not format color:', message.color);
          showStatusMessage('Invalid color format received from Figma', 'error');
          return;
        }

        console.log('📊 Formatted color:', formattedColor);
        
        // Check if we have a detected background color from Figma
        if (message.detectedBackground) {
          console.log('🎨 Using detected background color:', message.detectedBackground);
          // Update the background color in the UI
          updateBackgroundColor(message.detectedBackground);
          // Show notification to user
          // showStatusMessage('Background color detected and applied', 'info');
        }
        
        // Convert to APCACH format with the current background
        console.log('📊 Current background before conversion:', currentBackground);
        const apcachColor = cssToApcach(formattedColor, { bg: currentBackground });
        console.log('📊 Converted to APCACH:', apcachColor);
        
        // Update UI controls without triggering recalculation
        updateControlsFromColorSilently(apcachColor);
        
        // Use the exact Figma color values
        const values = {
          oklch: apcachToCss(apcachColor, 'oklch'),
          hex: apcachToCss(apcachColor, 'hex'),
          p3: apcachToCss(apcachColor, 'p3'),
          figmaP3: formattedColor // Use the exact Figma color
        };
        console.log('📊 Generated color values:', values);
        
        // Validate and update UI
        const validatedValues = validateColor(apcachColor, values);
        updateUI(validatedValues);
        
        // Check if we have multiple fills and update the preview
        const preview = document.getElementById('colorPreview') as HTMLDivElement;
        if (preview) {
          console.log('🖼️ Found preview element, updating with color data');
          
          // If we have a text node, update text node preview
          if (isTextNode) {
            console.log('🚨 RENDERING TEXT NODE PREVIEW 🚨');
            showStatusMessage('Text node selected - showing text preview', 'info');
            
            try {
              // Store current text node color and fills for later use
              currentTextNodePreviewColor = message.color;
              if (message.allFills) {
                currentTextNodeFills = message.allFills;
              }
              
              // Set this flag before calling updateColorPreviewForText
              isTextPreviewMode = true;
              
              // Store the formatted color for consistent reference
              window.lastTextPreviewColor = formattedColor;
              
              // First, directly update the foreground controls to ensure they show the correct value
              // This is critical as sometimes the DOM updates in updateColorPreviewForText aren't applied immediately
              const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
              const fgColorValue = document.getElementById('fgColorValue');
              
              if (fgColorInput) {
                fgColorInput.value = formattedColor;
                console.log('✅ Directly updated fgColorInput with initial text color:', formattedColor);
              }
              
              if (fgColorValue) {
                fgColorValue.textContent = formattedColor.toUpperCase();
                fgColorValue.setAttribute('data-original-value', formattedColor.toUpperCase());
                console.log('✅ Directly updated fgColorValue with initial text color:', formattedColor.toUpperCase());
              }
              
              // Then create the actual text preview
              updateColorPreviewForText(
                preview, 
                formattedColor, 
                currentBackground, 
                message.allFills
              );
              
              // Double-check that the foreground controls have the correct values
              setTimeout(() => {
                if (fgColorValue && fgColorValue.textContent !== formattedColor.toUpperCase()) {
                  console.log('⚠️ Foreground value not updated correctly, forcing update');
                  fgColorValue.textContent = formattedColor.toUpperCase();
                  
                  // Force a DOM refresh
                  fgColorValue.style.display = 'inline-block';
                }
                
                if (fgColorInput && fgColorInput.value !== formattedColor) {
                  console.log('⚠️ Foreground input not updated correctly, forcing update');
                  fgColorInput.value = formattedColor;
                }
              }, 0);
              
              console.log('✅ Text preview rendered successfully');
              showStatusMessage('Text preview rendered', 'info');
            } catch (error) {
              console.error('❌ Text preview error:', error);
              showStatusMessage('Error in text preview - falling back to standard', 'warning');
              
              // Fallback to standard preview and reset text preview mode
              isTextPreviewMode = false;
              currentTextNodePreviewColor = '';
              currentTextNodeFills = undefined;
              
              updateColorPreview(preview, formattedColor, currentBackground, message.allFills);
            }
          } else if (message.allFills && message.allFills.length > 0) {
            // Reset text preview mode for non-text selections
            isTextPreviewMode = false;
            currentTextNodePreviewColor = '';
            currentTextNodeFills = undefined;
            
            console.log('📊 Using multiple fills for preview:', message.allFills);
            
            // Update preview with all fills
            updateColorPreview(preview, formattedColor, currentBackground, message.allFills);
            
            // Show notification about multiple fills
            if (message.allFills.length > 1) {
              showStatusMessage(`Displaying ${message.allFills.length} fill layers from selection`, 'info');
            }
          } else {
            // Reset text preview mode for non-text selections
            isTextPreviewMode = false;
            currentTextNodePreviewColor = '';
            currentTextNodeFills = undefined;
            
            // Just use the single color for preview
            console.log('📊 Using single color for preview:', formattedColor);
            updateColorPreview(preview, formattedColor, currentBackground);
          }
          console.log('✅ Updated color preview');
        } else {
          console.error('❌ Could not find colorPreview element in the DOM');
        }
        
        // Store the current preview color
        currentPreviewColor = formattedColor;
        
        // Update UI state to reflect valid selection
        updateUIState(true);
        console.log('✅ Updated UI state for valid selection');
      } catch (error) {
        console.error('❌ Error processing initial color from Figma:', error);
        showStatusMessage('Error processing color from Figma', 'error');
      }
    } catch (error) {
      console.error('Error processing initial-color message:', error);
      showStatusMessage('Error processing initial-color message', 'error');
    }
  } else if (message.type === 'selection-changed') {
    console.log('📋 Received selection changed:', message);
    
    // Reset the userChangedColor flag - selection change comes from Figma, not a user change
    window.userChangedColor = false;
    
    // Update selection state
    hasValidSelection = message.hasSelection && message.hasValidFill;
    selectedNodeId = message.nodeId || '';
    
    // Store the node type
    const nodeTypeStr = String(message.nodeType || '').trim();
    
    // Check if this is a text node
    const isTextNode = nodeTypeStr.toUpperCase() === 'TEXT';
    
    // Set the text preview mode flag based on node type
    isTextPreviewMode = isTextNode;
    if (!isTextNode) {
      // Reset text preview variables if not a text node
      currentTextNodePreviewColor = '';
      currentTextNodeFills = undefined;
    }
    
    // DEBUG: Log the node type from selection-changed event with detailed info
    console.log('🔍 DEBUG SELECTION NODE TYPE:', {
      rawValue: message.nodeType,
      nodeTypeStr: nodeTypeStr,
      isTextNode: isTextNode,
      typeOf: typeof message.nodeType,
      stringified: JSON.stringify(message.nodeType),
      length: nodeTypeStr.length,
      charCodes: Array.from(nodeTypeStr).map(c => c.charCodeAt(0))
    });
    
    // Update live preview state
    isLivePreviewEnabled = hasValidSelection;
    
    // Check if we have a detected background color from Figma
    if (message.detectedBackground) {
      console.log('🎨 Using detected background color from selection change:', message.detectedBackground);
      // Update the background color in the UI
      updateBackgroundColor(message.detectedBackground);
      // Show notification to user
      // showStatusMessage('Background color updated from selection', 'info');
    }
    
    // Update UI state
    updateUIState(hasValidSelection);
    
    // If the selection has a valid fill, request the color from Figma
    if (hasValidSelection && message.hasValidFill) {
      console.log('📋 Selection has valid fill, requesting color from Figma');
      // Show notification to user that we're fetching the color
      showStatusMessage('Fetching color from selection...', 'info');
      
      // Add information about the node type
      if (isTextNode) {
        showStatusMessage('Text node selected', 'info');
      }
      
      // Request the selected color from Figma
      parent.postMessage({
        pluginMessage: {
          type: 'get-selected-color'
        }
      }, '*');
    } else if (!hasValidSelection) {
      // If no selection, reset to default color state
      resetToDefaultColorState(!isInitializing);
    }
  } else if (message.type === 'convert-to-apcach') {
    try {
      // Log the conversion request
      console.log('Received convert-to-apcach request:', message);
      
      // Convert the color to APCACH format
      const inputColor = message.color;
      const backgroundColor = message.background;
      
      // Use the existing APCAch library for conversion
      // This is a simplified implementation - in a real implementation we'd use the full conversion
      // and return the result to the plugin
      
      const result = {
        type: 'apcach-conversion-result',
        originalColor: inputColor,
        backgroundColor: backgroundColor,
        // Send a success message for now - in the real implementation we'd send actual conversion data
        success: true
      };
      
      // Send the result back to the plugin (for logging purposes)
      parent.postMessage({ pluginMessage: result }, '*');
    } catch (error: any) {
      console.error('Error converting color to APCACH:', error);
      // Send error back to plugin
      parent.postMessage({ 
        pluginMessage: { 
          type: 'apcach-conversion-error',
          error: error.message || 'Unknown error' 
        } 
      }, '*');
    }
  }

  // Handle parameter-based actions notification
  if (message.type === 'parameter-action-started') {
    const notificationElement = document.getElementById('parameter-action-notification');
    if (notificationElement) {
      const messageElement = notificationElement.querySelector('.notification-message');
      if (messageElement && message.message) {
        messageElement.textContent = message.message;
      }
      notificationElement.style.display = 'block';
    }
  }
  
  if (message.type === 'parameter-action-completed') {
    const notificationElement = document.getElementById('parameter-action-notification');
    if (notificationElement) {
      notificationElement.style.display = 'none';
    }
  }

  // Handle color conversion request from maximize chroma feature
  if (message.type === 'convert-to-apcach') {
    try {
      // Show notification that we're processing
      const notificationElement = document.getElementById('parameter-action-notification');
      if (notificationElement) {
        const messageElement = notificationElement.querySelector('.notification-message');
        if (messageElement) {
          messageElement.textContent = 'Processing color conversions...';
        }
        notificationElement.style.display = 'block';
      }
      
      // Log the conversion request
      console.log('Received convert-to-apcach request:', message);
      
      // Convert the color to APCACH format
      const inputColor = message.color;
      const backgroundColor = message.background;
      
      // Use the existing APCAch library for conversion
      // This is a simplified implementation - in a real implementation we'd use the full conversion
      // and return the result to the plugin
      
      const result = {
        type: 'apcach-conversion-result',
        originalColor: inputColor,
        backgroundColor: backgroundColor,
        // Send a success message for now - in the real implementation we'd send actual conversion data
        success: true
      };
      
      // Hide notification when done
      if (notificationElement) {
        notificationElement.style.display = 'none';
      }
      
      // Send the result back to the plugin (for logging purposes)
      parent.postMessage({ pluginMessage: result }, '*');
    } catch (error: any) {
      console.error('Error converting color to APCACH:', error);
      // Send error back to plugin
      parent.postMessage({ 
        pluginMessage: { 
          type: 'apcach-conversion-error',
          error: error.message || 'Unknown error' 
        } 
      }, '*');
    }
  }
};

// Function to send color to Figma
function sendColorToFigma(color: string = '', isLiveUpdate: boolean = false): void {
  // If no specific color is provided, get it from the foreground input
  if (!color) {
    const fgColorInput = document.getElementById('fgColorInput');
    if (fgColorInput instanceof HTMLInputElement) {
      color = fgColorInput.value;
    }
  }
  
  // Ensure the color has a proper # prefix for sending to Figma
  const formattedColor = color.startsWith('#') ? color : '#' + color;
  
  try {
    if (!formattedColor) {
      console.error('❌ No color to send to Figma');
      return;
    }
    
    console.log('🎨 Sending color to Figma:', formattedColor, 'Live update:', isLiveUpdate);
    
    // If not a live update, indicate that the user has changed the color
    if (!isLiveUpdate) {
      window.userChangedColor = true;
    }
    
    // Extract the APCA value from the UI
    const apcaElement = document.getElementById('apcaValue');
    const apcaValue = apcaElement ? apcaElement.textContent : '';
    
    console.log('🎨 Extracted APCA value from UI:', apcaValue);
    
    // Determine the color description (material name or custom)
    const colorName = 'Custom color';
    
    // Get background color info for complete message
    const backgroundInfo = {
      color: currentBackground,
      type: determineBackgroundType(currentBackground)
    };
    
    // Send message to Figma
    const messageType = isTextPreviewMode ? 'apply-text-color' : 'apply-color';
    
    console.log(`🎨 Sending ${messageType} message to Figma`);
    
    parent.postMessage({
      pluginMessage: {
        type: messageType,
        color: formattedColor.startsWith('#') ? formattedColor.substring(1) : formattedColor,
        apca: apcaValue,
        name: colorName,
        background: backgroundInfo,
        targetNodeId: selectedNodeId,
        // If it's a text node, we need some additional parameters
        isTextNode: isTextPreviewMode,
        // Include any current text fills if we have them
        textFills: isTextPreviewMode ? currentTextNodeFills : undefined
      }
    }, '*');
    
    if (isLiveUpdate) {
      console.log('🚀 Live update sent to Figma');
    } else {
      // Show message only for user-initiated updates to avoid spam
      showStatusMessage('Color applied to selection', 'info');
      console.log('🚀 User-initiated color update sent to Figma');
    }
  } catch (error) {
    console.error('❌ Error sending color to Figma:', error);
    showStatusMessage(`Error applying color: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// Add the parseBackgroundColor function
function parseBackgroundColor(color: string | null): string | null {
  if (!color) return null;
  
  try {
    // Handle rgb/rgba format
    if (color.startsWith('rgb')) {
      const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10);
        const g = parseInt(rgbMatch[2], 10);
        const b = parseInt(rgbMatch[3], 10);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }
    
    // Handle hex format
    if (color.startsWith('#')) {
      return ensureHexPrefix(color);
    }
    
    return color;
  } catch (error) {
    console.error('Error parsing background color:', error);
    return null;
  }
}

// ... existing code ... 

// Add the ensureHexPrefix function
function ensureHexPrefix(color: string): string {
  if (!color) return '#000000';
  return color.startsWith('#') ? color : `#${color}`;
}

// Function to set up all event listeners
function setupEventListeners() {
  // Initialize the userChangedColor flag to false when plugin loads
  window.userChangedColor = false;
  
  // Set up slider event listeners
  const contrastInput = document.getElementById('contrastInput') as HTMLInputElement;
  const contrastNumber = document.getElementById('contrastNumber') as HTMLInputElement;
  const chromaInput = document.getElementById('chromaInput') as HTMLInputElement;
  const chromaNumber = document.getElementById('chromaNumber') as HTMLInputElement;
  const hueInput = document.getElementById('hueInput') as HTMLInputElement;
  const hueNumber = document.getElementById('hueNumber') as HTMLInputElement;
  const bgColorInput = document.getElementById('bgColorInput') as HTMLInputElement;
  
  // Store original event handlers
  const originalContrastHandler = contrastInput?.oninput;
  const originalContrastNumberHandler = contrastNumber?.oninput;
  const originalChromaHandler = chromaInput?.oninput;
  const originalChromaNumberHandler = chromaNumber?.oninput;
  const originalHueHandler = hueInput?.oninput;
  const originalHueNumberHandler = hueNumber?.oninput;
  
  // APCA Contrast slider
  contrastInput?.addEventListener('input', () => {
    // Set userChangedColor to true when user interacts with controls
    window.userChangedColor = true;
    
    if (contrastNumber) {
      contrastNumber.value = contrastInput.value;
    }
    
    // Call original handler if needed
    if (originalContrastHandler) {
      originalContrastHandler.call(contrastInput, new Event('input'));
    }
    
    // Update with the new values
    updateColorFromInputs();
    
    // Send live updates to Figma if in text preview mode
    if (isTextPreviewMode && isLivePreviewEnabled) {
      console.log('🔄 Sending live text color update to Figma from contrast slider');
      const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
      if (fgColorInput) {
        sendColorToFigma(fgColorInput.value, true);
      }
    }
  });
  
  contrastNumber?.addEventListener('input', () => {
    // Set userChangedColor to true when user interacts with controls
    window.userChangedColor = true;
    
    if (contrastInput) {
      contrastInput.value = contrastNumber.value;
    }
    
    // Call original handler if needed
    if (originalContrastNumberHandler) {
      originalContrastNumberHandler.call(contrastNumber, new Event('input'));
    }
    
    // Update with the new values
    updateColorFromInputs();
    
    // Send live updates to Figma if in text preview mode
    if (isTextPreviewMode && isLivePreviewEnabled) {
      console.log('🔄 Sending live text color update to Figma from contrast number input');
      const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
      if (fgColorInput) {
        sendColorToFigma(fgColorInput.value, true);
      }
    }
  });
  
  // Chroma slider
  chromaInput?.addEventListener('input', () => {
    // Set userChangedColor to true when user interacts with controls
    window.userChangedColor = true;
    
    if (chromaNumber) {
      const validatedValue = validateChromaInput(parseFloat(chromaInput.value));
      chromaInput.value = validatedValue.toString();
      chromaNumber.value = validatedValue.toString();
    }
    
    // Call original handler if needed
    if (originalChromaHandler) {
      originalChromaHandler.call(chromaInput, new Event('input'));
    }
    
    // Update with the new values
    updateColorFromInputs();
    
    // Send live updates to Figma if in text preview mode
    if (isTextPreviewMode && isLivePreviewEnabled) {
      console.log('🔄 Sending live text color update to Figma from chroma slider');
      const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
      if (fgColorInput) {
        sendColorToFigma(fgColorInput.value, true);
      }
    }
  });
  
  chromaNumber?.addEventListener('input', () => {
    // Set userChangedColor to true when user interacts with controls
    window.userChangedColor = true;
    
    if (chromaInput) {
      const validatedValue = validateChromaInput(parseFloat(chromaNumber.value));
      chromaNumber.value = validatedValue.toString();
      chromaInput.value = validatedValue.toString();
    }
    
    // Call original handler if needed
    if (originalChromaNumberHandler) {
      originalChromaNumberHandler.call(chromaNumber, new Event('input'));
    }
    
    // Update with the new values
    updateColorFromInputs();
    
    // Send live updates to Figma if in text preview mode
    if (isTextPreviewMode && isLivePreviewEnabled) {
      console.log('🔄 Sending live text color update to Figma from chroma number input');
      const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
      if (fgColorInput) {
        sendColorToFigma(fgColorInput.value, true);
      }
    }
  });
  
  // Hue slider
  hueInput?.addEventListener('input', () => {
    // Set userChangedColor to true when user interacts with controls
    window.userChangedColor = true;
    
    if (hueNumber) {
      hueNumber.value = hueInput.value;
    }
    
    // Call original handler if needed
    if (originalHueHandler) {
      originalHueHandler.call(hueInput, new Event('input'));
    }
    
    // Update with the new values
    updateColorFromInputs();
    
    // Send live updates to Figma if in text preview mode
    if (isTextPreviewMode && isLivePreviewEnabled) {
      console.log('🔄 Sending live text color update to Figma from hue slider');
      const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
      if (fgColorInput) {
        sendColorToFigma(fgColorInput.value, true);
      }
    }
  });
  
  hueNumber?.addEventListener('input', () => {
    // Set userChangedColor to true when user interacts with controls
    window.userChangedColor = true;
    
    if (hueInput) {
      hueInput.value = hueNumber.value;
    }
    
    // Call original handler if needed
    if (originalHueNumberHandler) {
      originalHueNumberHandler.call(hueNumber, new Event('input'));
    }
    
    // Update with the new values
    updateColorFromInputs();
    
    // Send live updates to Figma if in text preview mode
    if (isTextPreviewMode && isLivePreviewEnabled) {
      console.log('🔄 Sending live text color update to Figma from hue number input');
      const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
      if (fgColorInput) {
        sendColorToFigma(fgColorInput.value, true);
      }
    }
  });
  
  // Background color input
  bgColorInput?.addEventListener('input', () => {
    // Set userChangedColor to true when user interacts with controls
    window.userChangedColor = true;
    updateBackgroundColor(bgColorInput.value);
  });

  // Set up the preview button
  const previewButton = document.getElementById('generatePreview');
  if (previewButton) {
    previewButton.addEventListener('click', () => {
      generateFigmaPreview();
    });
    
    // Enable the button regardless of selection state
    if (previewButton instanceof HTMLButtonElement) {
      previewButton.disabled = false;
      previewButton.title = 'Generate a preview with the current color settings';
    }
  }
  
  // Add keyboard shortcut for generating preview (Cmd/Ctrl+Enter)
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      generateFigmaPreview();
    }
  });
  
  console.log('Set up all event listeners');
    
  // Handle focus events for contrast, chroma, and hue inputs
  contrastNumber?.addEventListener('focus', () => {
    // When focusing on a slider control, ensure hue display is up to date
    const hueInput = document.getElementById('hueInput') as HTMLInputElement;
    if (hueInput) {
      // Dispatch a custom event to update the hue display
      const event = new CustomEvent('update-hue-display', { 
        detail: { hueValue: hueInput.value } 
      });
      document.dispatchEvent(event);
    }
  });
  
  chromaNumber?.addEventListener('focus', () => {
    // When focusing on a slider control, ensure hue display is up to date
    const hueInput = document.getElementById('hueInput') as HTMLInputElement;
    if (hueInput) {
      // Dispatch a custom event to update the hue display
      const event = new CustomEvent('update-hue-display', { 
        detail: { hueValue: hueInput.value } 
      });
      document.dispatchEvent(event);
    }
  });
  
  hueNumber?.addEventListener('focus', () => {
    // When focusing on the hue control, ensure hue display is up to date
    // Dispatch a custom event to update the hue display
    const event = new CustomEvent('update-hue-display', { 
      detail: { hueValue: hueNumber.value } 
    });
    document.dispatchEvent(event);
  });
}

/**
 * Updates the UI elements based on a preview color
 * @param color The color to show (with # prefix)
 * @param backgroundColor The background color
 */
function updatePreviewInUI(color: string, backgroundColor: string) {
  try {
    // Log with source identification for easier debugging
    const caller = new Error().stack?.split('\n')[2]?.trim() || 'unknown';
    console.log(`🔍 updatePreviewInUI called from: ${caller}`);
    
    // Check if this is a P3 color format
    const isP3Color = color.includes('display-p3');
    
    // Format color appropriately based on type
    let formattedColor: string;
    if (isP3Color) {
      // Preserve P3 format
      formattedColor = color;
      console.log('🎨 Preserving P3 color format:', color);
    } else {
      // Format as hex
      formattedColor = color.startsWith('#') ? color : `#${color}`;
      formattedColor = formattedColor.toUpperCase();
    }
    
    console.log('🎨 updatePreviewInUI - Using color:', formattedColor, 'and background:', backgroundColor);
    
    // Check if we're in text preview mode - this has priority for color display
    const textModeActive = isTextPreviewMode;
    const priorityColor = textModeActive && window.lastTextPreviewColor 
      ? window.lastTextPreviewColor 
      : formattedColor;
    
    if (textModeActive) {
      console.log(`📌 TEXT PREVIEW MODE ACTIVE - Using priority color: ${priorityColor}`);
    }
    
    // Extract RGB values for dynamic color generation
    const rgb = parseRgb(backgroundColor);
    if (!rgb) {
      console.error('❌ Failed to parse background color for dynamic colors:', backgroundColor);
      return;
    }
    
    // Use the parsed hex value if available, otherwise normalize the background color
    const formattedBackground = rgb.hex || (backgroundColor.startsWith('#') ? backgroundColor : `#${backgroundColor}`);
    
    // Extract hue from the appropriate color (text color in text preview mode or normal color)
    let previewHue: number;
    try {
      const oklchColor = cssToApcach(priorityColor, { bg: formattedBackground });
      previewHue = oklchColor.hue;
      console.log('📊 Using extracted hue from preview color:', previewHue);
    } catch (error) {
      console.warn('⚠️ Error extracting hue, using default:', error);
      previewHue = DEFAULT_CONFIG.previewHue;
    }
    
    // Generate dynamic colors for UI based on the appropriate hue
    const dynamicColors = generateDynamicColors(
      rgb.r / 255, 
      rgb.g / 255, 
      rgb.b / 255, 
      previewHue
    );
    
    // Create preview context with the appropriate color
    const previewContext: PreviewContext = {
      previewColor: priorityColor,
      previewHue: previewHue,
      background: backgroundColor
    };
    
    // SINGLE SOURCE OF TRUTH: Update CSS variables at document level first
    document.documentElement.style.setProperty('--fg-color', formattedColor);
    document.documentElement.style.setProperty('--text-color-fg', formattedColor);
    document.documentElement.style.setProperty('--is-p3-color', isP3Color ? 'true' : 'false');
    
    // Apply primary dynamic colors to the document root for consistent inheritance
    applyDynamicColors(dynamicColors);
    
    // Update CSS values at document level for global access
    updateColorValues(dynamicColors, previewContext);
    
    // Update the color input element (color picker) with the ACTUAL color if not in P3 format
    const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
    if (fgColorInput && !isP3Color) {
      // Only update if different from current value
      if (fgColorInput.value !== formattedColor) {
        console.log(`✅ Updating fgColorInput from ${fgColorInput.value} to ${formattedColor}`);
        fgColorInput.value = formattedColor;
        
        // Force a repaint of the input element to ensure the color swatch updates
        fgColorInput.style.display = 'none';
        void fgColorInput.offsetHeight; // Force reflow
        fgColorInput.style.display = '';
        
        // Dispatch events for better browser compatibility
        try {
          fgColorInput.dispatchEvent(new Event('change', { bubbles: true }));
          fgColorInput.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (error) {
          console.error('❌ Error dispatching events:', error);
        }
      }
    } else if (!fgColorInput) {
      console.error('❌ fgColorInput element not found');
    } else if (isP3Color) {
      console.log('ℹ️ Not updating color input for P3 color:', formattedColor);
    }
    
    // Update the color value display with the appropriate color text
    const fgColorValue = document.getElementById('fgColorValue');
    if (fgColorValue) {
      // Store the original color value for reference
      fgColorValue.setAttribute('data-original-value', priorityColor);
      fgColorValue.setAttribute('data-is-p3', isP3Color.toString());
      
      // Update the text content properly - clear and set with text node for better browser support
      while (fgColorValue.firstChild) {
        fgColorValue.removeChild(fgColorValue.firstChild);
      }
      fgColorValue.appendChild(document.createTextNode(priorityColor));
      
      console.log('✅ Updated fgColorValue text content to:', priorityColor);
    } else {
      console.error('❌ fgColorValue element not found');
    }
    
    console.log('✅ Preview UI updated successfully' + (isP3Color ? ' (using P3 format)' : ''));
  } catch (error) {
    console.error('❌ Error updating UI with preview color:', error);
  }
}

/**
 * Updates the color preview specifically for text nodes, showing a text sample
 * @param previewElement The preview element to update
 * @param color The color to show
 * @param backgroundColor The background color
 * @param fills Optional multiple fills data
 */
function updateColorPreviewForText(
  previewElement: HTMLDivElement,
  color: string,
  backgroundColor: string,
  fills?: Array<{ color: string; opacity: number; cssBlendMode?: string; visible: boolean }>
) {
  console.log('⚡⚡⚡ TEXT PREVIEW FUNCTION CALLED ⚡⚡⚡');
  const caller = new Error().stack?.split('\n')[2]?.trim() || 'unknown';
  console.log(`🔍 updateColorPreviewForText called from: ${caller}`);
  
  console.log('📊 TEXT PREVIEW PARAMETERS:', { 
    color, 
    backgroundColor, 
    fillsCount: fills?.length || 0
  });
  
  try {
    // Set the global flag to indicate we're in text preview mode
    isTextPreviewMode = true;
    currentTextNodePreviewColor = color;
    currentTextNodeFills = fills;
    
    if (!previewElement) {
      console.error('❌ TEXT PREVIEW ERROR: Preview element not found');
      return false;
    }
    
    // Clear the preview element
    previewElement.innerHTML = '';
    
    // Set basic styles
    previewElement.style.display = 'flex';
    previewElement.style.flexDirection = 'column';
    previewElement.style.alignItems = 'center';
    previewElement.style.justifyContent = 'center';
    previewElement.style.gap = '8px';
    previewElement.style.padding = '16px 8px'; // Adjust padding for better fit
    
    // Make sure background color is properly formatted for hex
    const bgColor = backgroundColor.startsWith('#') ? backgroundColor : '#' + backgroundColor;
    previewElement.style.backgroundColor = bgColor;
    
    previewElement.style.borderRadius = '4px';
    
    // Add a data attribute to identify this as a text preview
    previewElement.setAttribute('data-text-preview', 'true');
    
    // Check if this is a P3 color format
    const isP3Color = color.includes('display-p3');
    previewElement.setAttribute('data-is-p3', isP3Color.toString());
    
    // Format color appropriately based on type
    let formattedColor: string;
    if (isP3Color) {
      // Preserve P3 format
      formattedColor = color;
      console.log('🎨 Preserving P3 color format for text:', color);
    } else {
      // Format as hex
      formattedColor = color.startsWith('#') ? color : `#${color}`;
    }
    
    // Store the formatted color for consistent reference
    window.lastTextPreviewColor = formattedColor;
    console.log('📌 Set lastTextPreviewColor to:', formattedColor);
    
    // Extract hue from the text color for dynamic variables
    let textHue = DEFAULT_CONFIG.previewHue; // Default fallback
    
    try {
      // Extract hue from the text color
      const oklchColor = cssToApcach(formattedColor, { bg: backgroundColor });
      textHue = oklchColor.hue;
      console.log('📊 Extracted hue from text color:', textHue);
      
      // Update current preview hue for global access
      currentPreviewHue = textHue;
      
      // Generate dynamic colors based on the text color's hue and background
      const { r, g, b } = parseRgb(backgroundColor) || { r: 255, g: 255, b: 255 };
      const dynamicColors = generateDynamicColors(r / 255, g / 255, b / 255, textHue);
      
      // SINGLE SOURCE OF TRUTH: Apply dynamic colors at document level
      applyDynamicColors(dynamicColors);
      
      // Create preview context with the text color
      const previewContext: PreviewContext = {
        previewColor: formattedColor,
        previewHue: textHue,
        background: backgroundColor
      };
      
      // Update all CSS variables with the text color values
      updateColorValues(dynamicColors, previewContext);
    } catch (hueError) {
      console.error('❌ Error extracting hue from text color:', hueError);
    }
    
    // Text Sample Container - to center the Aa text
    const textContainer = document.createElement('div');
    textContainer.style.display = 'flex';
    textContainer.style.flexDirection = 'column';
    textContainer.style.alignItems = 'center';
    textContainer.style.justifyContent = 'center';
    textContainer.style.width = '100%';
    textContainer.style.height = '80%';
    
    // Create main text sample with larger size
    const textSample = document.createElement('div');
    textSample.textContent = 'Aa';
    textSample.style.color = formattedColor;
    textSample.style.fontSize = '64px'; // Increased from 48px
    textSample.style.fontWeight = 'bold';
    textSample.style.lineHeight = '1';
    textSample.style.marginBottom = '8px';
    textContainer.appendChild(textSample);
    
    // Create paragraph sample
    const textParagraph = document.createElement('div');
    textParagraph.textContent = 'The quick brown fox';
    textParagraph.style.color = formattedColor;
    textParagraph.style.fontSize = '14px';
    textParagraph.style.textAlign = 'center';
    textParagraph.style.lineHeight = '1.4';
    textParagraph.style.maxWidth = '100%';
    textContainer.appendChild(textParagraph);
    
    // Add the text container to the preview
    previewElement.appendChild(textContainer);
    
    // Ensure the foreground color input element color swatch is updated
    const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
    if (fgColorInput) {
      const oldValue = fgColorInput.value;
      
      // Update the input value
      fgColorInput.value = formattedColor;
      
      // If the value changed, force a visual update of the color swatch
      if (oldValue !== formattedColor) {
        console.log(`✅ Text preview updated fgColorInput from ${oldValue} to ${formattedColor}`);
        
        // Force a repaint of the color swatch
        fgColorInput.style.display = 'none';
        void fgColorInput.offsetHeight; // Force a reflow
        fgColorInput.style.display = '';
        
        // Dispatch change event to ensure browsers update the swatch visually
        try {
          const event = new Event('change', { bubbles: true });
          fgColorInput.dispatchEvent(event);
          
          // For Safari and some other browsers, we may need to dispatch input event too
          const inputEvent = new Event('input', { bubbles: true });
          fgColorInput.dispatchEvent(inputEvent);
        } catch (error) {
          console.error('❌ Error dispatching input events:', error);
        }
      }
    }
    
    // Set CSS custom properties at document level (primary source of truth)
    document.documentElement.style.setProperty('--fg-color', formattedColor);
    document.documentElement.style.setProperty('--text-color-fg', formattedColor);
    
    // Now use updatePreviewInUI to handle the rest of the updates consistently
    // This will use the prioritized color since we already set lastTextPreviewColor
    updatePreviewInUI(formattedColor, backgroundColor);
    
    console.log('✅ TEXT PREVIEW CREATED SUCCESSFULLY');
    return true;
  } catch (error) {
    console.error('❌ TEXT PREVIEW ERROR:', error);
    
    // Emergency fallback - use updatePreviewInUI even in error case
    try {
      const fallbackColor = color.startsWith('#') ? color : `#${color}`;
      updatePreviewInUI(fallbackColor, backgroundColor);
    } catch (fallbackError) {
      console.error('❌ Even fallback update failed:', fallbackError);
    }
    
    return false;
  }
}

/**
 * Generates a default color based on the current background and default APCACH parameters
 * @returns A color string in Figma-compatible format
 */
function generateDefaultColor(): string {
  try {
    // Use the current background or default background
    const backgroundColor = currentBackground || DEFAULT_CONFIG.backgroundColor;
    
    // Create contrast config based on background
    const contrastConfig = crToBg(
      backgroundColor, 
      DEFAULT_CONFIG.contrast, 
      'apca', 
      'auto'
    );
    
    // Generate color using APCACH
    const defaultColor = apcach(
      contrastConfig,
      DEFAULT_CONFIG.chroma,
      DEFAULT_CONFIG.hue,
      DEFAULT_CONFIG.defaultOpacity,
      'p3'
    );
    
    // Convert to Figma-compatible format
    return apcachToCss(defaultColor, 'figma-p3');
  } catch (error) {
    console.error('Error generating default color:', error);
    // Fallback to a safe color if generation fails
    return '#4F46E5';
  }
}

/**
 * Ensures the APCA value displayed in the UI is properly formatted as a whole number
 * This function directly updates the UI element
 */
function ensureFormattedApcaValueInUI() {
  const apcaElement = document.getElementById('apcaValue');
  if (!apcaElement) return;
  
  const currentValue = apcaElement.textContent;
  if (!currentValue) return;
  
  try {
    const numericValue = parseFloat(currentValue);
    if (!isNaN(numericValue)) {
      const formattedValue = Math.round(Math.abs(numericValue)).toString();
      
      // Only update if different
      if (formattedValue !== currentValue) {
        console.log('Updating APCA value in UI:', currentValue, '→', formattedValue);
        apcaElement.textContent = formattedValue;
      }
    }
  } catch (error) {
    console.error('Error formatting APCA value in UI:', error);
  }
}

/**
 * Sends a preview to Figma with all necessary details
 */
function sendPreviewToFigma(colorValue: string, apcaValue?: number, values?: ColorValues) {
  // Ensure APCA value is properly formatted in the UI first
  ensureFormattedApcaValueInUI();
  
  try {
    console.log('Preparing to send preview to Figma with color:', colorValue);
    
    // Ensure color value is properly formatted for Figma (no # prefix)
    const formattedColor = colorValue.startsWith('#') ? colorValue.substring(1) : colorValue;
    
    // Get the background color - try multiple sources for reliability
    const bgColorInput = document.getElementById('bgColorInput') as HTMLInputElement;
    let backgroundColor = '';
    
    if (bgColorInput && bgColorInput.value) {
      backgroundColor = bgColorInput.value;
      console.log('Got background directly from bgColorInput:', backgroundColor);
    } else {
      // Fallback to current background variable
      backgroundColor = currentBackground;
      console.log('Using currentBackground variable as fallback:', backgroundColor);
    }
    
    // Ensure the background color is properly formatted (has # prefix for parsing)
    if (!backgroundColor.startsWith('#') && backgroundColor.match(/^[0-9a-fA-F]{6}$/)) {
      backgroundColor = '#' + backgroundColor;
    }
    
    // Parse the RGB values from the background color
    const backgroundRgb = parseRgb(backgroundColor);
    if (!backgroundRgb) {
      console.warn('Could not parse background color RGB values:', backgroundColor);
    }
    
    // Create background info object for Figma
    const bgType = determineBackgroundType(backgroundColor);
    const backgroundInfo = {
      color: backgroundRgb?.hex || backgroundColor, // Use hex value if available
      type: bgType,
      rgb: backgroundRgb ? {
        r: backgroundRgb.r,
        g: backgroundRgb.g,
        b: backgroundRgb.b
      } : { r: 255, g: 255, b: 255 } // Fallback to white if parsing fails
    };
    
    // For preview color, ensure we have the full hex value with # prefix
    const previewColor = colorValue.startsWith('#') ? colorValue : `#${colorValue}`;
    
    // Check for multiple fills in the color preview
    const colorPreview = document.getElementById('colorPreview');
    let multipleFills = undefined;
    
    if (colorPreview && colorPreview.children.length > 0) {
      // If the preview has child elements, it's using multiple fills
      const fills: Array<{color: string; opacity: number; cssBlendMode?: string; visible: boolean}> = [];
      
      // Collect information about each fill from the preview divs
      Array.from(colorPreview.children).forEach(child => {
        const div = child as HTMLElement;
        const color = div.style.backgroundColor;
        const opacity = parseFloat(div.style.opacity || '1');
        const blendMode = div.style.mixBlendMode || undefined;
        
        // Convert backgroundColor to hex
        let hexColor = '';
        if (color) {
          const rgb = parseRgb(color);
          if (rgb) {
            // Use the parsed hex representation directly
            hexColor = rgb.hex;
          }
        }
        
        if (hexColor) {
          fills.push({
            color: hexColor,
            opacity,
            cssBlendMode: blendMode,
            visible: true
          });
        }
      });
      
      if (fills.length > 0) {
        multipleFills = fills;
        console.log('Detected multiple fills in preview:', multipleFills);
      }
    }
    
    // IMPORTANT: Get the APCA value directly from the UI element WITHOUT any processing
    const apcaElement = document.getElementById('apcaValue');
    const apcaDescriptionElement = document.getElementById('apcaDescription');
    
    // Get the exact text content from the UI elements
    const uiApcaValue = apcaElement?.textContent || '';
    const uiApcaDescription = apcaDescriptionElement?.textContent || '';
    
    console.log('Using exact APCA value from UI element:', uiApcaValue, 'Element ID: apcaValue');
    
    // Get CSS variables from the document
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#000000';
    const textSecondary = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#333333';
    const textTertiary = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim() || '#666666';
    
    // Convert CSS variables to P3 format for Figma
    const textColorP3 = convertToP3Format(textColor);
    const textSecondaryP3 = convertToP3Format(textSecondary);
    const textTertiaryP3 = convertToP3Format(textTertiary);
    
    console.log('Text tertiary color converted to P3:', textTertiaryP3);
    
    // Get all color values from the UI if not provided
    const colorValues = values || {
      figmaP3: previewColor,
      // Use the exact APCA value from the UI element without any processing
      apca: uiApcaValue,
      apcaDescription: uiApcaDescription,
      // Use both original and P3 versions of the colors
      textColor: textColor,
      textColorP3: textColorP3,
      textSecondary: textSecondary,
      textSecondaryP3: textSecondaryP3,
      textTertiary: textTertiary,
      textTertiaryP3: textTertiaryP3
    };
    
    // Add the multiple fills to the message if available
    if (multipleFills) {
      (colorValues as any).allFills = multipleFills;
    }
    
    // Log the APCA value being sent to Figma
    console.log('APCA value being sent to Figma:', colorValues.apca, 'Source: UI Element');
    
    // Create styling object with all necessary colors and properties
    const styling = {
      textColor: colorValues.textColor || '#000000',
      textColorP3: colorValues.textColorP3 || textColorP3,
      textSecondary: colorValues.textSecondary || '#333333',
      textSecondaryP3: colorValues.textSecondaryP3 || textSecondaryP3,
      textTertiary: colorValues.textTertiary || '#666666',
      textTertiaryP3: colorValues.textTertiaryP3 || textTertiaryP3,
      borderColor: '#E0E0E0',
      backgroundColor: backgroundColor,
      previewBackground: previewColor
    };
    
    // Send message to Figma to generate preview
    parent.postMessage({ 
      pluginMessage: { 
        type: 'generate-preview',
        color: formattedColor,
        background: backgroundColor.startsWith('#') ? backgroundColor.substring(1) : backgroundColor,
        previewColor: previewColor,
        values: colorValues,
        styling: styling,
        backgroundInfo: backgroundInfo,
        // Include the cssBlendMode if available
        cssBlendMode: colorPreview?.style.mixBlendMode || undefined,
        // Include the flag for multiple fills
        hasMultipleFills: !!multipleFills && multipleFills.length > 1,
        useRgbBackground: true
      }
    }, '*');
    
    console.log('Sent preview request to Figma with color:', formattedColor, 'and background:', backgroundColor);
  } catch (error) {
    console.error('Error sending preview to Figma:', error);
    showStatusMessage(`Error sending preview to Figma: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// Add the missing convertToP3Format function
/**
 * Converts a CSS color value to P3 format for Figma
 * @param color The color in any CSS format
 * @returns The color in P3 format
 */
function convertToP3Format(color: string): string {
  try {
    // Parse the color to get RGB values
    const rgbColor = parseRgb(color);
    if (!rgbColor) return color;
    
    // Format the color as P3
    return `color(display-p3 ${rgbColor.r} ${rgbColor.g} ${rgbColor.b})`;
  } catch (error) {
    console.error('Error converting to P3 format:', error);
    return color;
  }
}

// Initialize the global variable
window.lastTextPreviewColor = '';

function ensureColorValueDisplay() {
  try {
    // This function will be called in various places to ensure the color value display is updated
    console.log('🔍 Ensuring color value display is correct');
    
    const fgColorValue = document.getElementById('fgColorValue');
    const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
    
    if (!fgColorValue || !fgColorInput) {
      console.error('❌ Could not find foreground control elements');
      return;
    }
    
    // Get the color from the input (most reliable source)
    const colorFromInput = fgColorInput.value;
    
    // If in text preview mode, prioritize lastTextPreviewColor
    const colorToUse = isTextPreviewMode && window.lastTextPreviewColor 
      ? window.lastTextPreviewColor 
      : colorFromInput;
    
    // Format the color properly
    const formattedColor = colorToUse.startsWith('#') ? colorToUse : `#${colorToUse}`;
    const upperCaseColor = formattedColor.toUpperCase();
    
    // Current color in the display
    const currentDisplayColor = fgColorValue.textContent;
    
    // Only update if needed
    if (currentDisplayColor !== upperCaseColor) {
      console.log(`🔄 Updating color value display: ${currentDisplayColor || 'empty'} → ${upperCaseColor}`);
      
      // Try multiple approaches to update
      try {
        fgColorValue.textContent = upperCaseColor;
      } catch (e) {
        console.warn('⚠️ Standard update failed, trying innerHTML:', e);
        fgColorValue.innerHTML = upperCaseColor;
      }
    } else {
      console.log('✅ Color value display already correct:', upperCaseColor);
    }
  } catch (error) {
    console.error('❌ Error in ensureColorValueDisplay:', error);
  }
}

// Add this to existing event listeners in setupEventListeners
function enhanceSetupEventListeners() {
  // Add this function call inside setupEventListeners after the existing event listeners
  document.addEventListener('DOMContentLoaded', () => {
    // Ensure the color value display is periodically checked and updated if needed
    setInterval(ensureColorValueDisplay, 1000);
    console.log('🔄 Set up periodic color value display checks');
  });
  
  // Add extra handlers for direct manipulation of the foreground color value
  const fgColorValue = document.getElementById('fgColorValue');
  const fgColorInput = document.getElementById('fgColorInput') as HTMLInputElement;
  
  if (fgColorValue && fgColorInput) {
    // Ensure values stay in sync
    fgColorInput.addEventListener('input', () => {
      try {
        const colorValue = fgColorInput.value.toUpperCase();
        fgColorValue.textContent = colorValue;
        console.log('🔄 Synced fgColorValue from input:', colorValue);
      } catch (e) {
        console.error('❌ Error syncing fgColorValue from input:', e);
      }
    });
    
    // Also sync on focus events
    fgColorInput.addEventListener('focus', () => {
      setTimeout(ensureColorValueDisplay, 50);
    });
    
    fgColorInput.addEventListener('blur', () => {
      setTimeout(ensureColorValueDisplay, 50);
    });
    
    console.log('✅ Added extra foreground color value sync handlers');
  }
}

// Initialization code that runs when the script loads
// Window onload or similar section at the end of the file

// Fire custom event to signal DOM is ready to process
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content loaded, initializing plugin...');
  
  // Set up all event listeners
  setupEventListeners();
  
  // Set up enhanced event listeners for foreground control
  enhanceSetupEventListeners();
  
  // Get the root element for styling
  const root = document.documentElement;
  
  // Apply the default background variable
  root.style.setProperty('--background-color', DEFAULT_CONFIG.backgroundColor);
  
  // Initialize the background color
  initializeBackgroundColor();
  
  // Initialize plugin colors based on the current theme
  initializePluginColors();
  
  // Set up APCACH Value Observer for input field
  setupAPCACHValueObserver();
  
  // Fire a custom event when initialization is complete
  const initEvent = new CustomEvent('apcach-ui-initialized');
  document.dispatchEvent(initEvent);
  
  console.log('Plugin initialization complete ✅');
});

/**
 * Updates the APCA description in the UI with the correct text and styling
 * @param apcaValue The numeric APCA value
 */
function updateAPCADescription(apcaValue: number) {
  const apcaDescription = document.getElementById('apcaDescription');
  if (!apcaDescription) return;
  
  // Get the description text based on the APCA value
  const description = getAPCADescription(apcaValue);
  
  // Set the description text
  apcaDescription.textContent = description;
  
  // Set the color based on Figma color variables rather than dynamic variables
  // This ensures consistent styling regardless of the current color preview
  apcaDescription.style.color = "var(--figma-color-text-secondary, #666666)";
  
  // Force a repaint to ensure the color is updated
  apcaDescription.style.display = 'block';
}

// Replace the current enforceHexColors and addHexBackgroundRule functions with this cleaner approach

/**
 * Ensures that color previews display hex colors directly instead of RGB values
 * This is a cleaner approach that modifies the core update function
 */
function ensureHexColorsInPreview() {
  // Find the original updateColorPreview function in the prototype
  const originalUpdateColorPreview = window.updateColorPreview || updateColorPreview;
  
  // Replace it with our enhanced version that ensures hex colors
  window.updateColorPreview = function(
    preview: HTMLElement, 
    color: string, 
    background: string, 
    allFills?: Array<{ color: string, opacity: number, blendMode?: string, cssBlendMode?: string, visible: boolean }>
  ) {
    try {
      console.log('🔄 Enhanced updateColorPreview with:', { color, background });
      
      // Check if color is already in display-p3 format
      const isP3Format = color.includes('display-p3');
      
      // Only convert to hex if not already in P3 format
      const formattedColor = isP3Format ? color : ensureHexFormat(color);
      const formattedBackground = ensureHexFormat(background);
      
      // Format all fills to use hex or preserve P3
      let formattedFills = allFills;
      if (allFills && allFills.length > 0) {
        formattedFills = allFills.map(fill => ({
          ...fill,
          color: fill.color.includes('display-p3') ? fill.color : ensureHexFormat(fill.color)
        }));
      }
      
      // Clear any existing !important styles and CSS variables that might interfere
      if (preview) {
        // Reset any style properties that might be set by previous approaches
        preview.style.removeProperty('--preview-hex-color');
        
        // Store the fact we're using the enhanced version
        preview.setAttribute('data-using-enhanced-preview', 'true');
        
        // Add attribute to indicate if using P3 color format
        preview.setAttribute('data-using-p3', isP3Format.toString());
      }
      
      // Call the original function with the formatted values
      return originalUpdateColorPreview(preview, formattedColor, formattedBackground, formattedFills);
    } catch (error) {
      console.error('Error in enhanced updateColorPreview:', error);
      // Fall back to original function if there's an error
      return originalUpdateColorPreview(preview, color, background, allFills);
    }
  };
  
  // Also enhance the fill layer creation by directly attaching a hex color converter
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName: string) {
    const element = originalCreateElement.call(document, tagName);
    
    // Only intercept div elements that might be used for fills
    if (tagName.toLowerCase() === 'div') {
      // Store the original setProperty method
      const originalSetProperty = element.style.setProperty;
      
      // Replace with our enhanced version
      element.style.setProperty = function(property: string, value: string, priority?: string) {
        // Preserve P3 colors - don't convert them to hex
        if (property === 'background-color' && value) {
          if (value.includes('display-p3')) {
            // Keep P3 format intact
            return originalSetProperty.call(this, property, value, priority);
          } else if (value.startsWith('rgb')) {
            // Convert RGB to hex
            const hexColor = rgbToHexString(value);
            if (hexColor) {
              return originalSetProperty.call(this, property, hexColor, priority);
            }
          }
        }
        
        // For any other property or format, pass through
        return originalSetProperty.call(this, property, value, priority);
      };
    }
    
    return element;
  };
  
  console.log('✅ Enhanced color preview functions installed with P3 support');
}

/**
 * Converts any color format to hex
 * @param color The color in any format (rgb, hex, etc.)
 * @returns The color in hex format (#RRGGBB)
 */
function ensureHexFormat(color: string): string {
  // If already hex format, return as is
  if (color.startsWith('#')) {
    return color;
  }
  
  // If no color or empty string, return black
  if (!color) {
    return '#000000';
  }
  
  // Check if it's RGB format
  if (color.startsWith('rgb')) {
    const hexColor = rgbToHexString(color);
    if (hexColor) {
      return hexColor;
    }
  }
  
  // Check if it's a hex value without the # prefix
  if (/^[0-9A-Fa-f]{6}$/.test(color)) {
    return '#' + color;
  }
  
  // If no other format works, parse using DOM tricks
  try {
    const tempDiv = document.createElement('div');
    tempDiv.style.color = color;
    document.body.appendChild(tempDiv);
    const computedColor = getComputedStyle(tempDiv).color;
    document.body.removeChild(tempDiv);
    return rgbToHexString(computedColor) || color;
  } catch (e) {
    console.warn('Failed to parse color:', color);
    return color;
  }
}

/**
 * Converts an RGB color string to hex format
 * @param rgbColor The RGB color string (e.g., "rgb(255, 0, 0)")
 * @returns The color in hex format (#RRGGBB)
 */
function rgbToHexString(rgbColor: string): string | null {
  const rgbMatch = rgbColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
  }
  return null;
}

// Call this function when the document is ready instead of the previous approach
document.addEventListener('DOMContentLoaded', function() {
  console.log('🔍 Setting up clean hex color enforcement');
  ensureHexColorsInPreview();
});

// Remove these duplicate declarations
// ... existing code ...