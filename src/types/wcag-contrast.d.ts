declare module 'wcag-contrast' {
  interface RGBColor {
    r: number;
    g: number;
    b: number;
  }

  export function rgb(color1: RGBColor | string, color2: RGBColor | string): number;
} 