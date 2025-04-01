declare module 'apcach' {
  export interface ApcachColor {
    alpha: number;
    chroma: number;
    colorSpace: string;
    contrastConfig: ContrastConfig;
    hue: number;
    lightness: number;
  }

  export interface ContrastConfig {
    bgColor: string | 'apcach';
    contrastModel: 'apca' | 'wcag';
    cr: number;
    fgColor: string | 'apcach';
    searchDirection: 'auto' | 'lighter' | 'darker';
  }

  export type ColorFormat = 'oklch' | 'hex' | 'p3' | 'rgb' | 'figma-p3';
  export type ColorSpace = 'p3' | 'srgb';
  export type ContrastModel = 'apca' | 'wcag';
  export type SearchDirection = 'auto' | 'lighter' | 'darker';

  // Main color creation function
  export function apcach(
    contrast: number | ContrastConfig,
    chroma: number | ((config: ContrastConfig, hue: number, alpha: number, colorSpace: string) => ApcachColor),
    hue: number,
    alpha?: number,
    colorSpace?: ColorSpace
  ): ApcachColor;

  // Color conversion
  export function apcachToCss(color: ApcachColor, format: ColorFormat): string;

  export function cssToApcach(
    color: string,
    antagonist: { bg?: string; fg?: string },
    colorSpace?: string,
    contrastModel?: 'apca' | 'wcag'
  ): ApcachColor;

  // Contrast configuration functions
  export function crTo(
    color: string,
    cr: number,
    contrastModel?: 'apca' | 'wcag',
    searchDirection?: 'auto' | 'lighter' | 'darker'
  ): ContrastConfig;

  export function crToBg(
    bgColor: string,
    cr: number,
    contrastModel?: 'apca' | 'wcag',
    searchDirection?: 'auto' | 'lighter' | 'darker'
  ): ContrastConfig;

  export function crToBgBlack(
    cr: number,
    contrastModel?: 'apca' | 'wcag',
    searchDirection?: 'auto' | 'lighter' | 'darker'
  ): ContrastConfig;

  export function crToBgWhite(
    cr: number,
    contrastModel?: 'apca' | 'wcag',
    searchDirection?: 'auto' | 'lighter' | 'darker'
  ): ContrastConfig;

  export function crToFg(
    fgColor: string,
    cr: number,
    contrastModel?: 'apca' | 'wcag',
    searchDirection?: 'auto' | 'lighter' | 'darker'
  ): ContrastConfig;

  export function crToFgBlack(
    cr: number,
    contrastModel?: 'apca' | 'wcag',
    searchDirection?: 'auto' | 'lighter' | 'darker'
  ): ContrastConfig;

  export function crToFgWhite(
    cr: number,
    contrastModel?: 'apca' | 'wcag',
    searchDirection?: 'auto' | 'lighter' | 'darker'
  ): ContrastConfig;

  // Color manipulation functions
  export function maxChroma(cap?: number): (config: ContrastConfig, hue: number, alpha: number, colorSpace: string) => ApcachColor;
  export function setChroma(
    color: ApcachColor,
    chroma: number | ((c: number) => number)
  ): ApcachColor;
  export function setContrast(color: ApcachColor, contrast: number | ((cr: number) => number)): ApcachColor;
  export function setHue(
    color: ApcachColor,
    hue: number | ((h: number) => number)
  ): ApcachColor;

  // Color space validation
  export function inColorSpace(color: string, colorSpace: 'p3' | 'srgb'): boolean;

  // Add calcContrast function
  export function calcContrast(
    color1: string,
    color2: string,
    contrastModel?: ContrastModel,
    colorSpace?: ColorSpace
  ): number;
} 