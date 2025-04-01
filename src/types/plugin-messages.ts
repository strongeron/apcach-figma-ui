// Color types
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
    textColor: string;  // Add text color for labels
    textColorP3?: string; // P3 version of textColor
    textSecondary?: string;
    textSecondaryP3?: string; // P3 version of textSecondary
    textTertiary?: string;
    textTertiaryP3?: string; // P3 version of textTertiary
    gamut?: {
        p3: boolean;
        srgb: boolean;
    };
}

// Base message interface
interface BaseMessage {
  type: string;
}

// Generate preview message
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
    rgb: { r: number, g: number, b: number };
  };
  cssBlendMode?: string;
  hasMultipleFills?: boolean;
  useRgbBackground?: boolean;
}

// Update Figma selection message
export interface UpdateFigmaSelectionMessage extends BaseMessage {
  type: 'update-figma-selection';
  color: string;
  nodeId?: string;
  opacity?: number;
}

// Get selected color message
export interface GetSelectedColorMessage extends BaseMessage {
  type: 'get-selected-color';
}

// Real-time update message
export interface RealTimeUpdateMessage extends BaseMessage {
  type: 'real-time-update';
  color: string;
  nodeId?: string;
  opacity?: number;
}

// Initial color message
export interface InitialColorMessage extends BaseMessage {
  type: 'initial-color';
  color: string;
  isFigmaP3: boolean;
  nodeId?: string;
  nodeType?: string; // Add node type (TEXT, RECTANGLE, etc.)
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

// Initial state message
export interface InitialStateMessage extends BaseMessage {
  type: 'initial-state';
  hasSelection: boolean;
  hasValidFill: boolean;
}

// Init background message
export interface InitBackgroundMessage extends BaseMessage {
  type: 'init-background';
  color: {
    r: number;
    g: number;
    b: number;
    opacity: number;
  };
}

// Preview created message
export interface PreviewCreatedMessage extends BaseMessage {
  type: 'preview-created';
  success: boolean;
  error?: string;
}

// Selection changed message
export interface SelectionChangedMessage extends BaseMessage {
  type: 'selection-changed';
  hasSelection: boolean;
  hasValidFill: boolean;
  nodeId?: string;
  nodeType?: string; // Add node type (TEXT, RECTANGLE, etc.)
  detectedBackground?: string;
}

// Color applied message
export interface ColorAppliedMessage extends BaseMessage {
  type: 'color-applied';
  success: boolean;
  error?: string;
  noSelection?: boolean;
}

// Color values message
export interface ColorValuesMessage extends BaseMessage {
  type: 'color-values';
  values: ColorValues;
}

// Update background message - for when user manually changes background
export interface UpdateBackgroundMessage extends BaseMessage {
  type: 'update-background';
  color: string;
}

// Union type of all possible plugin messages
export type PluginMessage =
  | GeneratePreviewMessage
  | UpdateFigmaSelectionMessage
  | GetSelectedColorMessage
  | RealTimeUpdateMessage
  | InitialColorMessage
  | InitialStateMessage
  | InitBackgroundMessage
  | PreviewCreatedMessage
  | SelectionChangedMessage
  | ColorAppliedMessage
  | ColorValuesMessage
  | UpdateBackgroundMessage; 