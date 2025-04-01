export interface ColorValues {
  oklch: string;
  hex: string;
  p3: string;
  figmaP3: string;
}

export interface ColorValuesMessage {
  type: 'color-values';
  values: ColorValues;
}

export type PluginMessage = ColorValuesMessage; 