/// <reference types="plugin-typings" />
export declare function parseP3Color(p3String: string): {
    r: number;
    g: number;
    b: number;
};
export declare function figmaRGBToP3(color: RGB): string;
export declare function getOKLCHFromP3(p3Color: string, background?: string): {
    chroma: number;
    hue: number;
    contrast: number;
};
