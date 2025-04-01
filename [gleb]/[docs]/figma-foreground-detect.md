I'll extract the complete logic of how the Figma Polychrom plugin handles foreground colors, including multiple fills, opacity, and color presentation. Let me search through the relevant code.

Ran tool
Let me try a broader search:

Ran tool
Let's check some of the most important files for foreground color handling:

Read file: src/api/services/figma/nodes/get-node-fills.ts

Read file: src/utils/figma/get-actual-fill.ts

Read file: src/api/services/figma/nodes/create-polychrom-node.ts

Read file: src/api/services/figma/nodes/is-valid-for-selection.ts

Read file: src/ui/services/figma/find-fg-and-bg-nodes.ts

Read file: src/ui/services/blend/blend-colors.ts

Read file: src/ui/services/blend/format-color-data.ts

Read file: src/ui/services/blend/get-color-data.ts

Read file: src/ui/services/canvas/get-fill-from-ctx.ts

Read file: src/ui/services/svg/draw-nodes-on-svg.ts

Read file: src/utils/colors/formatters.ts
Based on my analysis of the codebase, I'll create a comprehensive markdown document about the logic for extracting foreground colors in the Figma Polychrom plugin.

# Foreground Color Extraction Logic in Figma Polychrom

## Overview

The Figma Polychrom plugin extracts foreground colors from selected Figma nodes, handling multiple fills, opacity, and various color spaces. This document outlines the complete process from node selection to color presentation in the UI.

## Core Data Structures

### PolychromNode

Custom representation of Figma nodes with additional properties:

```typescript
interface PolychromNode {
  blendMode: BlendMode;
  children: PolychromNode[];
  fills: FigmaPaint[];  // Contains foreground colors
  id: string;
  isSelected?: boolean;
  name: string;
  nestingLevel: number;
  opacity?: number;     // Node-level opacity
  parents: readonly SceneNode[];
  visible?: boolean;
  zIndex?: number;
}
```

### ColorData

Structure used to represent extracted pixel color data:

```typescript
interface ColorData {
  alpha: number;
  b: number;
  g: number;
  r: number;
}
```

### UIColor (Processed Color for Display)

Final structure used for UI display:

```typescript
interface UIColor {
  hex: string;
  oklch: Oklch;
  isBlended: boolean;  // Indicates if the color has any transparency
}
```

## Foreground Extraction Process

### 1. Node Selection Validation

Before processing a node as a foreground, the plugin validates it:

```typescript
export const isValidForSelection = (node: SceneNode): boolean => {
  // Reject invisible nodes
  if (!node.visible) {
    return false;
  }

  // Reject fully transparent nodes
  if ('opacity' in node && node.opacity === 0) return false;

  // Check if the node has fills
  if ('fills' in node) {
    if (typeof node.fills === 'symbol') {
      return false;
    } else {
      // Find the topmost visible fill
      const actualFill = getActualFill(node.fills);

      if (notEmpty(actualFill)) {
        // Only solid fills are supported
        return actualFill.type === 'SOLID';
      } else {
        return false;
      }
    }
  }

  return false;
};
```

### 2. Extracting Node Fills

The plugin extracts fills from the Figma node:

```typescript
export const getNodeFills = (
  node: PageNode | PolychromNode | SceneNode
): Paint[] => {
  if ('fills' in node) {
    return typeof node.fills === 'symbol' ? [] : Array.from(node.fills);
  }

  // Handle page nodes which use 'backgrounds' instead of 'fills'
  if ('backgrounds' in node) {
    return typeof node.backgrounds === 'symbol'
      ? []
      : Array.from(node.backgrounds);
  }

  return [];
};
```

### 3. Finding Active Fill When Multiple Fills Exist

Figma nodes can have multiple fills. The plugin uses this logic to find the active fill:

```typescript
export const getActualFill = (
  fills: FigmaPaint[] | readonly Paint[]
): Paint | undefined => {
  return Array.from(fills)
    .reverse()  // Process fills from top to bottom
    .find(
      (fill) =>
        fill.visible === true && notEmpty(fill.opacity) && fill.opacity > 0
    );
};
```

### 4. Converting Figma Node to PolychromNode

The plugin converts Figma nodes to internal PolychromNodes with enriched color information:

```typescript
export const createPolychromNode = (
  node: PageNode | SceneNode,
  selectedNodeId?: string
): PolychromNode => {
  const fills = getNodeFills(node);
  const parents = collectNodeParents(node);

  return {
    blendMode: 'blendMode' in node ? node.blendMode : 'PASS_THROUGH',
    children: [],
    fills: fills.map((fill) => {
      if (fill.type === 'SOLID') {
        return {
          ...fill,
          hex: formatHex({ ...fill.color, mode: 'rgb' }),  // Add hex format
          oklch: convertToOklch({ ...fill.color, mode: 'rgb' }, 'oklch'),  // Convert to OKLCH
        };
      } else {
        return fill;
      }
    }),
    id: node.id,
    isSelected: node.id === selectedNodeId,
    name: node.name,
    nestingLevel: parents.length,
    opacity: 'opacity' in node ? node.opacity : 1,  // Preserve opacity
    parents,
    visible: 'visible' in node ? node.visible : true,
    zIndex: node.parent?.children.findIndex((child) => {
      return child.id === node.id;
    }),
  };
};
```

### 5. Identifying Foreground and Background Nodes

For any node selection, the plugin identifies which is foreground and which is background:

```typescript
export const findFgAndBgNodes = (
  polychromNodesTree: PolychromNode
): {
  closestBgNode?: PolychromNode;
  selectedNode?: PolychromNode;
} => {
  const flattedNodes = flattenPolychromNodesTree(polychromNodesTree);
  const sortedFlattenNodes = sortByDepthAndOrder(flattedNodes);

  // The selected node is the foreground
  const selectedNode = sortedFlattenNodes.find((node) => node.isSelected);
  const [, ...flattenWithoutSelected] = sortedFlattenNodes;

  // Find first visible node with valid fills below the selected node
  const closestBgNode = getActualNode(flattenWithoutSelected);

  return {
    closestBgNode,
    selectedNode,  // This is the foreground node
  };
};
```

### 6. Identifying If a Color is Blended (Has Transparency)

The plugin detects if a color has any transparency that would affect its appearance:

```typescript
export const isBlendedFill = (
  node?: PolychromNode,
  fill?: FigmaPaint
): boolean => {
  return (
    (notEmpty(node) && node.opacity !== 1) ||  // Node-level opacity
    (notEmpty(fill) && fill.opacity !== 1)     // Fill-level opacity
  );
};
```

## Color Rendering for Analysis

### 1. Rendering for Color Extraction

To analyze colors accurately, the plugin renders nodes to a canvas:

```typescript
const blendSelectionPair = async (
  pair: PolychromNode,
  figmaColorSpace: FigmaColorSpace
): Promise<ContrastConclusion | null> => {
  // Create an offscreen canvas
  const canvas = new OffscreenCanvas(
    BACKGROUND_BOX.width,
    BACKGROUND_BOX.height
  );

  // Set up the context with proper color space
  const ctx = canvas.getContext('2d', {
    colorSpace: isSupportsOKLCH ? CanvasColorSpace[figmaColorSpace] : 'srgb',
    willReadFrequently: true,
  });

  if (isEmpty(ctx)) return null;

  // Draw nodes to the context
  await drawNodesOnContext(ctx, pair, figmaColorSpace);

  // Extract background color
  const bgColorData = getColorData(
    getFillFromCtx(
      ctx,
      BACKGROUND_BOX.eyeDropperX,
      BACKGROUND_BOX.eyeDropperY,
      figmaColorSpace
    )
  );

  // Extract foreground color
  const fgColorData = getColorData(
    getFillFromCtx(
      ctx,
      FOREGROUND_BOX.eyeDropperX,
      FOREGROUND_BOX.eyeDropperY,
      figmaColorSpace
    )
  );

  if (isEmpty(bgColorData) || isEmpty(fgColorData)) return null;

  // Identify the nodes
  const { closestBgNode, selectedNode } = findFgAndBgNodes(pair);

  if (isEmpty(selectedNode) || isEmpty(closestBgNode)) return null;

  // Check if either color is blended
  const isFgBlended = checkIfFillBlended(selectedNode);
  const isBgBlended = checkIfFillBlended(closestBgNode);

  // Calculate contrast
  const apcaScore = calculateApcaScore(
    fgColorData,
    bgColorData,
    figmaColorSpace
  );

  // Format the result
  return {
    apca: apcaScore,
    bg: formatColorData(bgColorData, isBgBlended),
    fg: formatColorData(fgColorData, isFgBlended),  // Format the foreground
    id: formatPolychromNodeId(selectedNode.id) || nanoid(),
  };
};
```

### 2. SVG Rendering for Visual Accuracy

The plugin uses SVG to render nodes with correct blend modes:

```typescript
export const drawNodesOnSvg = (
  svg: SVGSVGElement,
  pair: PolychromNode,
  foregroundBox: CanvasRect,
  backgroundBox: CanvasRect,
  colorSpace: FigmaColorSpace
): void => {
  const drawNode = (node: PolychromNode, parentGroup: SVGGElement): void => {
    const svgGroup = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'g'
    );

    svgGroup.setAttribute('id', `layer-${node.id}`);

    // Apply node opacity
    if (node.opacity !== 1) {
      svgGroup.setAttribute('opacity', `${node.opacity?.toFixed(2) ?? 1}`);
    }

    // Apply blend mode
    const mappedBlendMode = mapFigmaBlendToCanvas(node.blendMode);
    if (notEmpty(mappedBlendMode)) {
      svgGroup.setAttribute(
        'style',
        `mix-blend-mode: ${mappedBlendMode}; isolation: isolate;`
      );
    }

    // Filter to only visible solid fills
    const visibleFills = node.fills.filter(isVisibleSolidFill);

    // Draw each fill
    visibleFills.forEach((fill) => {
      const svgRect = drawFillAsRect(
        fill,
        node.isSelected === true ? foregroundBox : backgroundBox,  // Use foreground box for selected nodes
        colorSpace
      );

      if (isEmpty(svgRect)) return;

      svgGroup.appendChild(svgRect);
    });

    parentGroup.appendChild(svgGroup);

    // Recursively draw children
    node.children.forEach((childNode) => {
      drawNode(childNode, svgGroup);
    });
  };

  drawNode(pair, svg);
};
```

### 3. Fill Rendering with Opacity

Individual fills are rendered with their own opacity:

```typescript
export const drawFillAsRect = (
  fill: FigmaPaint,
  rectBox: CanvasRect,
  colorSpace: FigmaColorSpace
): null | SVGGElement => {
  const svgRect = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'rect'
  );

  svgRect.setAttribute('width', String(rectBox.width));
  svgRect.setAttribute('height', String(rectBox.height));

  // Apply blend mode
  if (notEmpty(fill.blendMode)) {
    const mappedBlendMode = mapFigmaBlendToCanvas(fill.blendMode);

    if (notEmpty(mappedBlendMode)) {
      svgRect.setAttribute('style', `mix-blend-mode: ${mappedBlendMode};`);
    }
  }

  // Get the fill style
  const fillStyle = determineFillStyle(fill, colorSpace);

  if (isEmpty(fillStyle)) return null;

  svgRect.setAttribute('fill', fillStyle);

  // Apply fill opacity
  if (fill.opacity !== 1) {
    svgRect.setAttribute('opacity', `${fill.opacity?.toFixed(2) ?? 1}`);
  }

  return svgRect;
};
```

### 4. Determining Fill Color Style

The plugin formats the fill color based on the color space:

```typescript
export const determineFillStyle = (
  fill: FigmaPaint,
  colorSpace: FigmaColorSpace
): string | undefined => {
  if (fill.type === 'SOLID') {
    const { b, g, r } = fill.color;

    // Use display-p3 if supported and needed
    if (colorSpace === 'DISPLAY_P3' && isSupportsOKLCH) {
      return `color(display-p3 ${r} ${g} ${b})`;
    }

    // Otherwise use hex format
    return formatHex({ b, g, mode: 'rgb', r });
  }
};
```

## Color Data Processing

### 1. Extracting Color from Canvas

After rendering, the plugin extracts the actual pixel color data:

```typescript
export const getFillFromCtx = (
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  colorSpace: FigmaColorSpace
): Uint8ClampedArray => {
  return ctx.getImageData(x, y, 1, 1, {
    colorSpace: isSupportsOKLCH ? CanvasColorSpace[colorSpace] : 'srgb',
  }).data;
};
```

### 2. Converting Raw Pixel Data to Color Data

Raw pixel data is converted to a normalized format:

```typescript
export const getColorData = (fill: Uint8ClampedArray): ColorData | null => {
  const [r, g, b, alpha] = fill;

  if (isEmpty(r) || isEmpty(g) || isEmpty(b)) return null;

  // Convert 0-255 values to 0-1 range
  return convert255ScaleRGBtoDecimal({ alpha, b, g, r });
};
```

### 3. Formatting Color for UI Display

Colors are formatted with standardized properties for the UI:

```typescript
export const formatColorData = (
  color: RGB,
  isBlended: boolean
): {
  hex: string;
  isBlended: boolean;
  oklch: Oklch;
} => ({
  hex: formatHex({ ...color, mode: 'rgb' }),
  isBlended,  // Indicates if color has transparency
  oklch: convertToOklch({ ...color, mode: 'rgb' }, 'oklch'),
});
```

## Color Space Handling and Formatting

### 1. Converting Between Color Spaces

The plugin converts between RGB, OKLCH, and HEX:

```typescript
// Convert to OKLCH (for perceptual calculations)
const convertToOklch = converter('oklch');

// Convert OKLCH back to RGB
export const formatForRgbDisplay = (oklch: Oklch): string => {
  const { b, g, r } = convertToRgb(oklch);
  return `${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`;
};

// Format OKLCH for display
export const formatForOklchDisplay = (oklch: Oklch): string => {
  return `${toPercent(oklch.l)} ${clearValue(oklch.c)} ${clearValue(
    oklch.h ?? 0,
    1
  )}`;
};
```

### 2. Formatting for CSS and UI Display

Different formatters are used depending on the selected display mode:

```typescript
// Get appropriate formatter based on display mode
export const getFormatterForDisplaying = (
  colorSpaceDisplayMode: ColorSpaceDisplayModes
): ((oklch: Oklch) => string) => {
  const formatters = {
    HEX: formatHex,
    OKLCH: formatForOklchDisplay,
    RGB: formatForRgbDisplay,
  };

  return formatters[colorSpaceDisplayMode];
};

// Format for CSS output
export const formatForOklchCSS = (color: Oklch, opacity?: number): string => {
  const { c, h, l } = color;
  let postfix = '';

  if (notEmpty(opacity) && opacity < 1) {
    postfix = ` / ${toPercent(opacity)}`;
  }

  return `oklch(${toPercent(l)} ${clearValue(c, 3)} ${clearValue(
    h ?? 0,
    1
  )}${postfix})`;
};
```

## Multiple Fill Handling

### 1. Filtering Visible Solid Fills

When a node has multiple fills, the plugin considers only solid and visible ones:

```typescript
export const isVisibleSolidFill = (fill: FigmaPaint): boolean =>
  fill.visible === true &&
  (notEmpty(fill.opacity) ? fill.opacity > 0 : true) &&
  fill.type === 'SOLID';
```

### 2. Processing Multiple Fills in Visual Rendering

For visual rendering, all visible fills are processed in order:

```typescript
const visibleFills = node.fills.filter(isVisibleSolidFill);

visibleFills.forEach((fill) => {
  const svgRect = drawFillAsRect(
    fill,
    node.isSelected === true ? foregroundBox : backgroundBox,
    colorSpace
  );

  if (isEmpty(svgRect)) return;

  svgGroup.appendChild(svgRect);
});
```

### 3. Using Topmost Fill for Color Analysis

For color analysis, the plugin uses the topmost visible fill:

```typescript
const actualFill = getActualFill(node.fills);

if (isEmpty(actualFill)) return false;

return actualFill.type === 'SOLID';
```

## Opacity Handling

### 1. Node-Level Opacity

Node opacity is preserved and applied during rendering:

```typescript
// In PolychromNode creation
opacity: 'opacity' in node ? node.opacity : 1,

// In SVG rendering
if (node.opacity !== 1) {
  svgGroup.setAttribute('opacity', `${node.opacity?.toFixed(2) ?? 1}`);
}
```

### 2. Fill-Level Opacity

Each fill can have its own opacity, which is also preserved:

```typescript
// In SVG fill rendering
if (fill.opacity !== 1) {
  svgRect.setAttribute('opacity', `${fill.opacity?.toFixed(2) ?? 1}`);
}
```

### 3. Blended Color Identification

The plugin identifies if a color is affected by any level of transparency:

```typescript
const isFgBlended = checkIfFillBlended(selectedNode);

// ...

const checkIfFillBlended = (node: PolychromNode): boolean => {
  const actualFill = getActualFill(node.fills);

  return isBlendedFill(node, actualFill);
};

export const isBlendedFill = (
  node?: PolychromNode,
  fill?: FigmaPaint
): boolean => {
  return (
    (notEmpty(node) && node.opacity !== 1) ||  // Node opacity
    (notEmpty(fill) && fill.opacity !== 1)     // Fill opacity
  );
};
```

## Complete Flow

1. **Node Selection**:
   - User selects a node in Figma
   - Plugin validates if the node has valid fills for foreground extraction

2. **Node Processing**:
   - Extract all fills from the node
   - Convert the node to a PolychromNode with enhanced properties
   - Preserve opacity information at both node and fill levels
   - Process multiple fills if present

3. **Visual Rendering**:
   - Create an offscreen canvas with correct color space
   - Render node with all its fills, blend modes, and opacity
   - For multiple fills, render each in sequence
   - Apply correct blend modes and opacity to each element

4. **Color Extraction**:
   - Sample pixel colors from the rendered canvas
   - Convert raw pixel data to normalized color format
   - Calculate if the color is affected by transparency
   - Format color in multiple formats (HEX, RGB, OKLCH)

5. **UI Presentation**:
   - Format colors based on selected display mode
   - Indicate if a color is affected by transparency (blended)
   - Provide different formats for display and CSS usage

This comprehensive approach allows the plugin to accurately extract and represent foreground colors from Figma, handling the complexities of multiple fills, opacity, blend modes, and various color spaces.
