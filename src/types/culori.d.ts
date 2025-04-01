declare module 'culori' {
  export interface ColorObject {
    mode: string;
    r?: number;
    g?: number;
    b?: number;
    l?: number;
    a?: number;
    b?: number;
    h?: number;
    c?: number;
    [key: string]: any;
  }

  export type Converter = (color: ColorObject | string) => ColorObject;
  
  export function converter(mode: string): Converter;
  export function formatHex(color: ColorObject): string;
  export function formatRgb(color: ColorObject): string;
  export function differenceEuclidean(color1: ColorObject, color2: ColorObject): number;
} 