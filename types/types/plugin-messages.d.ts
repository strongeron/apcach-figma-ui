export interface RGB {
    r: number;
    g: number;
    b: number;
}
export interface P3 {
    x: number;
    y: number;
    z: number;
}
export interface ColorValues {
    apcach?: string;
    oklch?: string;
    hex?: string;
    p3?: string;
    figmaP3: string;
    apca: string;
    apcaDescription?: string;
    textColor: string;
    textColorP3?: string;
    textSecondary?: string;
    textSecondaryP3?: string;
    textTertiary?: string;
    textTertiaryP3?: string;
    gamut?: {
        p3: boolean;
        srgb: boolean;
    };
}
interface BaseMessage {
    type: string;
}
export interface GeneratePreviewMessage extends BaseMessage {
    type: 'generate-preview';
    color: string;
    background: string;
    previewColor: string;
    values: ColorValues;
    styling?: any;
    backgroundInfo?: {
        color: string;
        type: 'white' | 'black' | 'custom';
        rgb: {
            r: number;
            g: number;
            b: number;
        };
    };
    cssBlendMode?: string;
    hasMultipleFills?: boolean;
    useRgbBackground?: boolean;
}
export interface UpdateFigmaSelectionMessage extends BaseMessage {
    type: 'update-figma-selection';
    color: string;
    nodeId?: string;
    opacity?: number;
}
export interface GetSelectedColorMessage extends BaseMessage {
    type: 'get-selected-color';
}
export interface RealTimeUpdateMessage extends BaseMessage {
    type: 'real-time-update';
    color: string;
    nodeId?: string;
    opacity?: number;
}
export interface InitialColorMessage extends BaseMessage {
    type: 'initial-color';
    color: string;
    isFigmaP3: boolean;
    nodeId?: string;
    nodeType?: string;
    opacity?: number;
    detectedBackground?: string;
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
}
export interface InitialStateMessage extends BaseMessage {
    type: 'initial-state';
    hasSelection: boolean;
    hasValidFill: boolean;
}
export interface InitBackgroundMessage extends BaseMessage {
    type: 'init-background';
    color: {
        r: number;
        g: number;
        b: number;
        opacity: number;
    };
}
export interface PreviewCreatedMessage extends BaseMessage {
    type: 'preview-created';
    success: boolean;
    error?: string;
}
export interface SelectionChangedMessage extends BaseMessage {
    type: 'selection-changed';
    hasSelection: boolean;
    hasValidFill: boolean;
    nodeId?: string;
    nodeType?: string;
    detectedBackground?: string;
}
export interface ColorAppliedMessage extends BaseMessage {
    type: 'color-applied';
    success: boolean;
    error?: string;
    noSelection?: boolean;
}
export interface ColorValuesMessage extends BaseMessage {
    type: 'color-values';
    values: ColorValues;
}
export interface UpdateBackgroundMessage extends BaseMessage {
    type: 'update-background';
    color: string;
}
export type PluginMessage = GeneratePreviewMessage | UpdateFigmaSelectionMessage | GetSelectedColorMessage | RealTimeUpdateMessage | InitialColorMessage | InitialStateMessage | InitBackgroundMessage | PreviewCreatedMessage | SelectionChangedMessage | ColorAppliedMessage | ColorValuesMessage | UpdateBackgroundMessage;
export {};
