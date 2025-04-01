I'll extract the full logic for how the Figma Polychrom plugin handles blend modes. Let me search through the code to find all relevant sections.

Ran tool
Let's look at the actual implementation of the blend modes handling functions:

Read file: src/api/services/figma/nodes/has-only-valid-blend-modes.ts

Read file: src/ui/services/blend-modes/map-figma-blend-to-canvas.ts

Read file: src/ui/services/blend/is-blended-fill.ts

Read file: src/utils/figma/is-visible-solid-fill.ts

Read file: src/ui/services/svg/draw-nodes-on-svg.ts

Read file: src/ui/services/svg/draw-fill-as-rect.ts

Read file: src/ui/services/blend/determine-fill-style.ts

Read file: src/ui/components/UnprocessedBlendModesSelectionMessage.tsx
Now let's check how the blend mode handling is used in the payload builders:

Read file: src/api/services/payload/build-general-selection-payload.ts

Read file: src/api/services/payload/build-pair-selection-payload.ts
Based on my analysis of the codebase, I'll create a comprehensive markdown document about how blend modes are handled in the Figma Polychrom plugin.

# Blend Mode Handling in Figma Polychrom Plugin

## Overview

The Figma Polychrom plugin handles blend modes in several key areas:
1. **Validation**: Determining if a node uses supported blend modes
2. **Rendering**: Mapping Figma blend modes to CSS/SVG equivalents for visualization
3. **Processing**: Calculating color results based on blend mode application
4. **UI Feedback**: Providing users with information about unsupported blend modes

This document outlines the complete logic of blend mode handling throughout the plugin.

## Blend Mode Validation

### Defining Unsupported Blend Modes

The plugin explicitly identifies which blend modes it cannot process:

```typescript
// src/api/services/figma/nodes/has-only-valid-blend-modes.ts
// PLUS_DARKER is LINEAR_BURN
const unprocessedBlendModes = ['LINEAR_BURN'];
```

### Validating Individual Fill Blend Modes

Each fill can have its own blend mode, which the plugin validates:

```typescript
const hasValidBlendMode = (fill: FigmaPaint): boolean => {
  if (isEmpty(fill.blendMode)) return true;

  return !unprocessedBlendModes.includes(fill.blendMode);
};
```

### Recursive Validation of Node Trees

The plugin recursively checks all nodes and their fills for valid blend modes:

```typescript
export const hasOnlyValidBlendModes = (nodes: PolychromNode): boolean =>
  flattenPolychromNodesTree(nodes).every(
    (node) =>
      node.fills
        .filter((fill) => isVisibleSolidFill(fill))
        .every(hasValidBlendMode) &&
      !unprocessedBlendModes.includes(node.blendMode)
  );
```

Only visible solid fills are checked, as defined by:

```typescript
// src/utils/figma/is-visible-solid-fill.ts
export const isVisibleSolidFill = (fill: FigmaPaint): boolean =>
  fill.visible === true &&
  (notEmpty(fill.opacity) ? fill.opacity > 0 : true) &&
  fill.type === 'SOLID';
```

## Mapping Figma Blend Modes to CSS/SVG

### Comprehensive Blend Mode Mapping

The plugin converts Figma blend modes to their CSS equivalents:

```typescript
// src/ui/services/blend-modes/map-figma-blend-to-canvas.ts
export const mapFigmaBlendToCanvas = (
  figmaBlend?: BlendMode
): CSSProperties['mixBlendMode'] => {
  const mapping: Record<BlendMode, CSSProperties['mixBlendMode']> = {
    COLOR: 'color',
    COLOR_BURN: 'color-burn',
    COLOR_DODGE: 'color-dodge',
    DARKEN: 'darken',
    DIFFERENCE: 'difference',
    EXCLUSION: 'exclusion',
    HARD_LIGHT: 'hard-light',
    HUE: 'hue',
    LIGHTEN: 'lighten',
    // unsupported
    LINEAR_BURN: 'color-burn',  // approximation
    LINEAR_DODGE: 'plus-lighter',
    LUMINOSITY: 'luminosity',
    MULTIPLY: 'multiply',
    NORMAL: 'normal',
    OVERLAY: 'overlay',
    // only for layers, not for fills
    PASS_THROUGH: undefined,
    SATURATION: 'saturation',
    SCREEN: 'screen',
    SOFT_LIGHT: 'soft-light',
  };

  return notEmpty(figmaBlend) ? mapping[figmaBlend] : undefined;
};
```

Note that some unsupported Figma blend modes are mapped to approximations in CSS, while others (like PASS_THROUGH) have special handling.

## Applying Blend Modes in SVG Rendering

### Node-Level Blend Mode Application

When rendering nodes to SVG for visualization, blend modes are applied:

```typescript
// src/ui/services/svg/draw-nodes-on-svg.ts
export const drawNodesOnSvg = (
  svg: SVGSVGElement,
  pair: PolychromNode,
  foregroundBox: CanvasRect,
  backgroundBox: CanvasRect,
  colorSpace: FigmaColorSpace
): void => {
  const drawNode = (node: PolychromNode, parentGroup: SVGGElement): void => {
    // ...
    
    // Handle opacity (part of blending)
    if (node.opacity !== 1) {
      svgGroup.setAttribute('opacity', `${node.opacity?.toFixed(2) ?? 1}`);
    }

    // Map and apply blend mode
    const mappedBlendMode = mapFigmaBlendToCanvas(node.blendMode);

    if (notEmpty(mappedBlendMode)) {
      svgGroup.setAttribute(
        'style',
        `mix-blend-mode: ${mappedBlendMode}; isolation: isolate;`
      );
    }
    
    // ...
  };
}
```

### Fill-Level Blend Mode Application

Individual fills can also have blend modes, which are applied separately:

```typescript
// src/ui/services/svg/draw-fill-as-rect.ts
export const drawFillAsRect = (
  fill: FigmaPaint,
  rectBox: CanvasRect,
  colorSpace: FigmaColorSpace
): null | SVGGElement => {
  // ...
  
  // Apply fill-specific blend mode
  if (notEmpty(fill.blendMode)) {
    const mappedBlendMode = mapFigmaBlendToCanvas(fill.blendMode);

    if (notEmpty(mappedBlendMode)) {
      svgRect.setAttribute('style', `mix-blend-mode: ${mappedBlendMode};`);
    }
  }
  
  // ...
  
  // Handle opacity (part of blending)
  if (fill.opacity !== 1) {
    svgRect.setAttribute('opacity', `${fill.opacity?.toFixed(2) ?? 1}`);
  }
  
  return svgRect;
};
```

## Identifying Blended Elements

### Detecting Blended Fills

The plugin recognizes when a node or fill has blending applied (not necessarily a blend mode, but any kind of transparency):

```typescript
// src/ui/services/blend/is-blended-fill.ts
export const isBlendedFill = (
  node?: PolychromNode,
  fill?: FigmaPaint
): boolean => {
  return (
    (notEmpty(node) && node.opacity !== 1) ||
    (notEmpty(fill) && fill.opacity !== 1)
  );
};
```

## Integration with Selection Processing

### Validation in General Selection Processing

When processing a general selection (single or multiple nodes), blend mode validation is performed:

```typescript
// src/api/services/payload/build-general-selection-payload.ts
export const buildGeneralSelectionPayload = (
  selection: readonly SceneNode[]
): SelectionChangeEvent => {
  const selectedNodePairs = selection
    .filter(isValidForSelection)
    .map((selectedNode) => {
      const intersectingNodesTree = getIntersectingNodes(selectedNode);

      // Check for valid blend modes first
      if (!hasOnlyValidBlendModes(intersectingNodesTree)) {
        return PairState.InvalidBlendMode;
      }
      
      // Continue with background validation
      if (isValidForBackground(intersectingNodesTree)) {
        return intersectingNodesTree;
      } else {
        return PairState.InvalidBackground;
      }
    });

  // ...
  
  // Return unsupported blend mode error if applicable
  if (selectedNodePairs.some((pair) => pair === PairState.InvalidBlendMode)) {
    return {
      colorSpace: figma.root.documentColorProfile,
      text: SelectionMessageTypes.unprocessedBlendModes,
    };
  }
  
  // ...
};
```

### Validation in Paired Selection Processing

For two-node selections, both nodes are checked for valid blend modes:

```typescript
// src/api/services/payload/build-pair-selection-payload.ts
export const buildPairSelectionPayload = (
  selection: readonly SceneNode[]
): SelectionChangeEvent => {
  // ...
  
  // Sort nodes to determine foreground and background
  const [fg, bg] = sortByDepthAndOrder([
    firstPolychromNode,
    secondPolychromNode,
  ]);
  
  // ...
  
  // Validate blend modes for both nodes
  if (!hasOnlyValidBlendModes(bg) || !hasOnlyValidBlendModes(fg)) {
    return {
      colorSpace: figma.root.documentColorProfile,
      text: SelectionMessageTypes.unprocessedBlendModes,
    };
  }
  
  // ...
  
  // Create synthetic node with normal blend mode for pair visualization
  return {
    colorSpace: figma.root.documentColorProfile,
    selectedNodePairs: [
      {
        blendMode: 'NORMAL',  // Force normal blend for the container
        children: [
          // Map background and foreground nodes
          // ...
        ],
        // ...
      },
    ],
  };
};
```

## User Interface for Blend Mode Errors

### Error State in Store

The plugin maintains a reactive state to track unsupported blend modes:

```typescript
// src/ui/stores/selected-nodes.ts
export const $isUnprocessedBlendModes = computed(
  $userSelection,
  (selection) => {
    return (
      'text' in selection &&
      selection.text === SelectionMessageTypes.unprocessedBlendModes
    );
  }
);
```

### Error Message Component

A dedicated component displays a message for unsupported blend modes:

```typescript
// src/ui/components/UnprocessedBlendModesSelectionMessage.tsx
export const UnprocessedBlendModesSelectionMessage = (): ReactElement => {
  return (
    <p
      style={{
        backgroundImage: `url(${layersImage})`,
      }}
      className="mx-auto flex h-[200px] w-[250px] select-none items-end justify-center bg-[length:180px_180px] bg-center bg-no-repeat pt-2 text-center font-martianMono text-xxs text-secondary-75"
    >
      The blending mode Plus Darker is not supported
    </p>
  );
};
```

### Integration in Application Flow

The error message is shown when unsupported blend modes are detected:

```typescript
// src/ui/components/AppContent.tsx
export const AppContent = (): ReactElement => {
  // ...
  const isUnprocessedBlendModes = useStore($isUnprocessedBlendModes);
  
  // ...
  
  if (isUnprocessedBlendModes) {
    return <UnprocessedBlendModesSelectionMessage />;
  }
  
  // ...
};
```

## Fill Style Determination

### Color Space and Format Handling

When rendering fills, the plugin determines appropriate fill styles based on color space:

```typescript
// src/ui/services/blend/determine-fill-style.ts
export const determineFillStyle = (
  fill: FigmaPaint,
  colorSpace: FigmaColorSpace
): string | undefined => {
  if (fill.type === 'SOLID') {
    const { b, g, r } = fill.color;

    if (colorSpace === 'DISPLAY_P3' && isSupportsOKLCH) {
      return `color(display-p3 ${r} ${g} ${b})`;
    }

    return formatHex({ b, g, mode: 'rgb', r });
  }
};
```

## Creating PolychromNodes with Blend Mode Information

When creating internal node representations, blend mode information is preserved:

```typescript
// src/api/services/figma/nodes/create-polychrom-node.ts
export const createPolychromNode = (
  node: PageNode | SceneNode,
  selectedNodeId?: string
): PolychromNode => {
  const fills = getNodeFills(node);
  const parents = collectNodeParents(node);

  return {
    blendMode: 'blendMode' in node ? node.blendMode : 'PASS_THROUGH',
    // ... other properties
  };
};
```

## Flow Summary: Blend Mode Handling

The complete flow of blend mode handling in the plugin is:

1. **Selection Detection**:
   - User selects one or more nodes in Figma
   - Plugin captures the selection and begins processing

2. **Intersection Detection**:
   - Plugin identifies nodes that intersect with the selection
   - Builds a tree of nodes, preserving blend mode information

3. **Blend Mode Validation**:
   - Plugin recursively checks all nodes and fills in the tree
   - Identifies any unsupported blend modes (currently LINEAR_BURN)
   - If unsupported blend modes are found, early exit with error

4. **Visual Rendering**:
   - For valid selections, plugin maps Figma blend modes to CSS equivalents
   - Applies blend modes to SVG elements for visualization
   - Handles both node-level and fill-level blend modes
   - Accounts for opacity as part of the blending process

5. **User Feedback**:
   - If unsupported blend modes are detected, shows error message
   - Otherwise, displays color information with accurate blending

## Considerations and Limitations

1. **Limited Blend Mode Support**:
   - LINEAR_BURN (Plus Darker in Figma) is explicitly unsupported
   - Other blend modes are mapped to CSS equivalents, but may not be pixel-perfect

2. **Special Handling**:
   - PASS_THROUGH blend mode is handled specially (undefined in CSS)
   - Approximations are used for some unsupported blend modes

3. **Transparency**:
   - Both node-level and fill-level opacity are considered part of blending
   - The plugin recognizes when elements are "blended" due to transparency

4. **Multiple Layer Handling**:
   - Blend modes are correctly maintained in the node hierarchy
   - When calculating colors, the stacking order and blend mode application are preserved

The plugin carefully manages blend modes to accurately represent Figma designs, with clear error handling for the few unsupported cases.
