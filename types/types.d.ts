import type { ApcachColor as BaseApcachColor, ColorFormat, ContrastConfig } from 'apcach';
export type { ColorFormat, ContrastConfig };
export type ApcachColor = BaseApcachColor;
export interface ExtendedApcachColor extends BaseApcachColor {
}
export type PluginMessage = {
    type: 'real-time-update';
    color: string;
    contrast: number;
} | {
    type: 'update-figma-selection';
} | {
    type: 'generate-preview';
} | {
    type: 'get-selected-color';
} | {
    type: 'initial-color';
    color: string;
    nodeId?: string;
    nodeType?: string;
    detectedBackground?: string;
    isFigmaP3?: boolean;
    opacity?: number;
    blendMode?: string;
    cssBlendMode?: string;
    hasUnsupportedBlendMode?: boolean;
    allFills?: Array<{
        color: string;
        opacity: number;
        blendMode?: string;
        cssBlendMode?: string;
        visible: boolean;
    }>;
} | {
    type: 'initial-state';
    hasSelection: boolean;
    hasValidFill: boolean;
} | {
    type: 'init-background';
    color: RGBColor;
} | {
    type: 'init';
    notificationCount?: number;
} | {
    type: 'preview-created';
    imageData: string;
} | {
    type: 'selection-changed';
    hasSelection: boolean;
    hasValidFill: boolean;
    nodeId?: string;
    detectedBackground?: string;
} | {
    type: 'color-applied';
    success: boolean;
    message?: string;
} | {
    type: 'color-values';
    color: string;
    contrast: number;
    p3: string;
    hex: string;
} | {
    type: 'update-background';
    color: string;
} | {
    type: 'error';
    errorType: string;
    message: string;
};
export interface RGBColor {
    r: number;
    g: number;
    b: number;
}
