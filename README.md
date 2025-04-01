# APCACH UI - Figma Plugin

A Figma plugin for advanced color handling with support for P3 colors, APCA contrast calculations, and multiple color spaces.

## Features

- **P3 Color Support**: Properly handles Display P3 colors from Figma nodes
- **APCA Contrast**: Uses APCA algorithm for better contrast calculations
- **Multiple Color Spaces**: Supports RGB, HEX, and P3 color formats
- **Multiple Fill Layers**: Handles complex Figma fills with blend modes
- **Real-time Preview**: Live color preview with accurate color representation
- **Accessibility**: Built-in contrast checking and color validation

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
4. Import the plugin into Figma:
   - Open Figma
   - Go to Plugins > Development > Import plugin from manifest
   - Select the manifest.json file from this project

## Development

### Project Structure

- `src/code.ts` - Figma plugin code
- `src/ui.ts` - UI logic and color handling
- `src/ui.html` - Plugin UI markup
- `src/types/` - TypeScript type definitions
- `src/apcachWrapper.ts` - APCA contrast calculation wrapper

### Color Handling

The plugin supports multiple color formats:
- HEX colors (#RRGGBB)
- RGB colors (rgb(r,g,b))
- P3 colors (color(display-p3 r g b))

P3 colors are preserved throughout the UI to maintain the wider color gamut when available.

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [APCA](https://github.com/Myndex/SAPC-APCA) for contrast calculations
- [Culori](https://culorijs.org/) for color space conversions
- Figma Plugin API team for the excellent documentation

Below are the steps to get your plugin running. You can also find instructions at:

  https://www.figma.com/plugin-docs/plugin-quickstart-guide/

This plugin template uses Typescript and NPM, two standard tools in creating JavaScript applications.

First, download Node.js which comes with NPM. This will allow you to install TypeScript and other
libraries. You can find the download link here:

  https://nodejs.org/en/download/

Next, install TypeScript using the command:

  npm install -g typescript

Finally, in the directory of your plugin, get the latest type definitions for the plugin API by running:

  npm install --save-dev @figma/plugin-typings

If you are familiar with JavaScript, TypeScript will look very familiar. In fact, valid JavaScript code
is already valid Typescript code.

TypeScript adds type annotations to variables. This allows code editors such as Visual Studio Code
to provide information about the Figma API while you are writing code, as well as help catch bugs
you previously didn't notice.

For more information, visit https://www.typescriptlang.org/

Using TypeScript requires a compiler to convert TypeScript (code.ts) into JavaScript (code.js)
for the browser to run.

We recommend writing TypeScript code using Visual Studio code:

1. Download Visual Studio Code if you haven't already: https://code.visualstudio.com/.
2. Open this directory in Visual Studio Code.
3. Compile TypeScript to JavaScript: Run the "Terminal > Run Build Task..." menu item,
    then select "npm: watch". You will have to do this again every time
    you reopen Visual Studio Code.

That's it! Visual Studio Code will regenerate the JavaScript file every time you save.

## Background Detection Logic

The plugin uses an advanced background detection algorithm to identify the background color beneath selected elements. The implementation is based on the Polychrom reference architecture for accurate detection. Here's how it works:

### Core Detection Process
1. **Blend Mode Check** - Evaluates if the selected node has a compatible blend mode
2. **Parent Check** - Checks if the selected node has a parent with a solid fill
3. **Intersection Detection** - Identifies all nodes that intersect with the selected node
4. **Polychrom Conversion** - Converts Figma nodes to PolychromNode data structure for enhanced processing
5. **Z-Index & Hierarchy Handling** - Processes nodes based on their rendering order in Figma
6. **Recursive Container Check** - Examines containers of intersecting nodes for possible backgrounds
7. **Page Background Fallback** - If no other backgrounds are found, uses the page background
8. **Default Fallback** - Provides a default dark background if all other methods fail

### PolychromNode Architecture
The system uses a custom node wrapper that extends Figma's native node properties:

```typescript
interface PolychromNode {
  id: string;
  name: string;
  fills: Paint[];
  blendMode: BlendMode;
  opacity?: number;
  visible?: boolean;
  children: PolychromNode[];
  nestingLevel: number;
  zIndex?: number;
  isSelected?: boolean;
  parents: readonly SceneNode[];
}
```

### Handling of Complex Cases
The algorithm properly handles:

1. **Blend Modes** - Skips nodes with non-compatible blend modes like Multiply, Screen, Overlay, etc.
2. **Nested Structures** - Accurately processes deeply nested groups and frames
3. **Z-Index Ordering** - Respects Figma's complex rendering order across different hierarchy levels
4. **Component Instances** - Special handling for component instances and their unique properties
5. **Visibility Chain** - Considers the entire visibility chain from node to root

### Performance Optimizations
The implementation includes several performance enhancements:

1. **Instrumentation** - Performance timing to identify bottlenecks
2. **Efficient Sorting** - Optimized algorithms for sorting nodes by render order
3. **Caching System** - Time-based cache for expensive calculations
4. **Early Returns** - Short-circuits processing when valid backgrounds are found
5. **Targeted Traversal** - Limits tree traversal to relevant nodes only

This implementation closely follows the reference architecture from the Polychrom system while adding optimizations for performance and robustness in complex design scenarios.
