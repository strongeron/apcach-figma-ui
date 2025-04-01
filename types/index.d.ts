/**
 * Creates an apcach color object with specified contrast, chroma and hue
 * @param {number|ContrastConfig} contrast - Desired contrast ratio (0-108) or contrast configuration
 * @param {number|Function} chroma - Chroma value (0-0.37) or chroma calculation function
 * @param {number} hue - Hue value (0-360)
 * @param {number} [alpha=100] - Alpha value (0-100)
 * @param {'p3'|'srgb'} [colorSpace='p3'] - Color space to use
 * @returns {ApcachColor} The generated apcach color object
 */
export function apcach(contrast: number | ContrastConfig, chroma: number | Function, hue: number, alpha?: number | undefined, colorSpace?: "p3" | "srgb" | undefined): ApcachColor;
/**
 * Converts an apcach color to CSS color string
 * @param {ApcachColor} color - The apcach color to convert
 * @param {'oklch'|'rgb'|'hex'|'p3'|'figma-p3'} format - Output format
 * @returns {string} CSS color string in requested format
 */
export function apcachToCss(color: ApcachColor, format: 'oklch' | 'rgb' | 'hex' | 'p3' | 'figma-p3'): string;
export function calcContrast(fgColor: any, bgColor: any, contrastModel?: string, colorSpace?: string): number;
export function crTo(bgColor: any, cr: any, contrastModel?: string, searchDirection?: string): {
    bgColor: any;
    contrastModel: string;
    cr: any;
    fgColor: string;
    searchDirection: string;
};
export function crToBg(bgColor: any, cr: any, contrastModel?: string, searchDirection?: string): {
    bgColor: any;
    contrastModel: string;
    cr: any;
    fgColor: string;
    searchDirection: string;
};
export function crToBgBlack(cr: any, contrastModel?: string, searchDirection?: string): {
    bgColor: any;
    contrastModel: string;
    cr: any;
    fgColor: string;
    searchDirection: string;
};
export function crToBgWhite(cr: any, contrastModel?: string, searchDirection?: string): {
    bgColor: any;
    contrastModel: string;
    cr: any;
    fgColor: string;
    searchDirection: string;
};
export function crToFg(fgColor: any, cr: any, contrastModel?: string, searchDirection?: string): {
    bgColor: string;
    contrastModel: string;
    cr: any;
    fgColor: any;
    searchDirection: string;
};
export function crToFgBlack(cr: any, contrastModel?: string, searchDirection?: string): {
    bgColor: string;
    contrastModel: string;
    cr: any;
    fgColor: any;
    searchDirection: string;
};
export function crToFgWhite(cr: any, contrastModel?: string, searchDirection?: string): {
    bgColor: string;
    contrastModel: string;
    cr: any;
    fgColor: any;
    searchDirection: string;
};
export function cssToApcach(color: any, antagonist: any, colorSpace?: string, contrastModel?: string): ApcachColor;
export function inColorSpace(color: any, colorSpace?: string): any;
export function maxChroma(chromaCap?: number): (contrastConfig: any, hue: any, alpha: any, colorSpace: any) => any;
export function setChroma(colorInApcach: any, c: any): ApcachColor;
export function setContrast(colorInApcach: any, cr: any): ApcachColor;
export function setHue(colorInApcach: any, h: any): ApcachColor;
