# How to Use APCACH UI

## Getting Started

1. **Install the Plugin**: Add APCACH UI to your Figma plugins.
2. **Launch the Plugin**: Right-click in Figma and select Plugins > APCACH UI.
3. **Initial Setup**: The plugin will detect your current selection or provide default colors to start with.

## Basic Usage

### Generating Colors

1. **Adjust Contrast**: Use the contrast slider to set your desired APCA contrast value (0-108).
2. **Set Chroma**: Adjust the chroma (saturation) slider to control color intensity.
3. **Choose Hue**: Select a hue value to determine the color's position on the color wheel.
4. **Preview**: See your color update in real-time in the preview area.

### Creating Previews in Figma

1. **Generate Preview**: Click the "Generate Preview" button to create a color preview frame in your Figma document.
2. **Preview Content**: The preview includes:
   - Color swatch with your selected color
   - Color values in multiple formats (HEX, P3, OKLCH)
   - APCA contrast information
   - Accessibility recommendations

### Applying Colors

1. **Select an Element**: Click on a shape, text, or other element in your Figma document.
2. **Apply Color**: Click "Apply to Selection" to apply the current color to the selected element.

## Advanced Features

### Background Color Management

- **Auto-Detection**: The plugin automatically detects the background color of your selection.
- **Manual Setting**: Use the background color picker to manually set a background color.
- **Toggle Background**: Switch between light and dark backgrounds to test contrast in different contexts.

### Color Format Options

- **HEX**: Standard web color format (#RRGGBB)
- **P3**: Display P3 color space for wider gamut colors
- **OKLCH**: Perceptually uniform color space with intuitive parameters
- **APCACH**: Our custom format that encodes contrast, chroma, and hue information

### Accessibility Features

- **APCA Value**: See the exact APCA contrast value for your color combination.
- **Accessibility Status**: Get immediate feedback on whether your colors meet accessibility standards.
- **Recommendations**: Receive suggestions for improving accessibility while maintaining your design intent.

## Tips for Best Results

1. **Start with Contrast**: Begin by setting your desired contrast level, then adjust chroma and hue.
2. **Check Multiple Backgrounds**: Test your colors against both light and dark backgrounds.
3. **Use P3 Colors**: When available, P3 colors offer a wider range of vibrant options while maintaining accessibility.
4. **Save Favorites**: Generate previews of colors you like to create a collection of accessible options.
5. **Consider Context**: Higher contrast is needed for smaller text; lower contrast may be acceptable for larger UI elements.

## Troubleshooting

- **Color Not Applying**: Make sure you have a valid element selected in Figma.
- **Preview Not Generating**: Check that you have edit permissions in the current Figma file.
- **Colors Look Different**: Display P3 colors may appear differently on non-P3 displays.

For additional help or to report issues, please contact us through the Figma Community. 