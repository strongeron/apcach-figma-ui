I'll review the project and extract the background detection logic. Let me start by exploring the project structure.

Ran tool
Let's look at the manifest.json to understand the plugin's configuration:

Read file: manifest.json
Now let's look at the source code:

Ran tool
Let's look at the API side of the plugin first which is likely to contain background detection logic:

Ran tool
Let's check the main API entry point:

Read file: src/api/index.ts
Now let's look at the services directory which likely contains the background detection logic:

Ran tool
Let's look at the selection services since that's likely where the background detection occurs:

Ran tool

Read file: src/api/services/selection/get-current-page-selection.ts
Let's check the figma services:

Ran tool
Let's check the intersections directory as it might contain background detection logic:

Ran tool
These files look relevant to our background detection task. Let's examine them:

Read file: src/api/services/figma/intersections/get-intersecting-nodes.ts

Read file: src/api/services/figma/intersections/are-nodes-intersecting.ts

Read file: src/api/services/figma/intersections/traverse-and-check-intersections.ts

Read file: src/api/services/figma/intersections/get-siblings-that-are-below-by-z-index.ts
Let's check how the Figma nodes are processed:

Ran tool
Let's examine the key files that relate to background detection:

Read file: src/api/services/figma/nodes/is-valid-for-background.ts

Read file: src/api/services/figma/nodes/get-node-fills.ts

Read file: src/api/services/figma/nodes/create-polychrom-node.ts
Let's check the utils directory for more relevant functions:

Ran tool
Let's examine these utility functions:

Read file: src/utils/figma/get-actual-fill.ts

Read file: src/utils/figma/get-actual-node.ts

Read file: src/utils/figma/sort-by-depth-and-order.ts

Read file: src/utils/figma/flatten-polychrom-nodes-tree.ts
Let's check the message service that sends the selection data to the UI:

Read file: src/api/services/messages/send-selection-data-to-ui.ts
Now let's check how the message payload is built:

Read file: src/api/services/payload/build-message-payload.ts
Let's check both the general and pair selection payloads:

Read file: src/api/services/payload/build-general-selection-payload.ts




Read file: src/api/services/payload/build-pair-selection-payload.ts
Let's check the common types as well:

Read file: src/types/common.ts
Based on my review of the codebase, I'll now create a comprehensive document that outlines the background detection logic.

# Background Detection Logic in Figma Polychrom Plugin

## Overview

The Figma Polychrom plugin determines the background color beneath selected objects. It works by detecting the colors of objects that intersect with or are below the selected object in the z-index stack.

## Data Structures

### PolychromNode
A custom wrapper for Figma nodes with additional properties:
```typescript
interface PolychromNode {
  blendMode: BlendMode;
  children: PolychromNode[];
  fills: FigmaPaint[];
  id: string;
  isSelected?: boolean;
  name: string;
  nestingLevel: number;
  opacity?: number;
  parents: readonly SceneNode[];
  visible?: boolean;
  zIndex?: number;
}
```

## Core Functions

### 1. Detection Entry Point

The main flow starts when a selection changes in Figma:

```typescript
// src/api/index.ts
figma.on('selectionchange', sendSelectionDataToUi);
figma.on('run', sendSelectionDataToUi);
figma.on('documentchange', sendSelectionDataToUi);
```

### 2. Selection Data Processing

```typescript
// src/api/services/messages/send-selection-data-to-ui.ts
export const sendSelectionDataToUi = (): void => {
  try {
    const currentSelection = getCurrentPageSelection();
    const messagePayload = buildMessagePayload(currentSelection);
    
    figma.ui.postMessage({
      payload: messagePayload,
      type: MessageTypes.SelectionChange,
    });
  } catch (error) {
    // Send empty payload on error
  }
};
```

### 3. Building the Message Payload

The plugin handles both single and paired selections differently:

```typescript
// src/api/services/payload/build-message-payload.ts
export const buildMessagePayload = (
  currentSelection: readonly SceneNode[]
): SelectionChangeEvent => {
  if (currentSelection.length === 0)
    return {
      colorSpace: figma.root.documentColorProfile,
      selectedNodePairs: [],
    };

  if (currentSelection.length === 2) {
    return buildPairSelectionPayload(currentSelection);
  }

  return buildGeneralSelectionPayload(currentSelection);
};
```

### 4. Background Detection for Single Selection

```typescript
// src/api/services/payload/build-general-selection-payload.ts
export const buildGeneralSelectionPayload = (
  selection: readonly SceneNode[]
): SelectionChangeEvent => {
  const selectedNodePairs = selection
    .filter(isValidForSelection)
    .map((selectedNode) => {
      const intersectingNodesTree = getIntersectingNodes(selectedNode);

      if (!hasOnlyValidBlendModes(intersectingNodesTree)) {
        return PairState.InvalidBlendMode;
      }

      if (isValidForBackground(intersectingNodesTree)) {
        return intersectingNodesTree;
      } else {
        return PairState.InvalidBackground;
      }
    });

  // Handle error states and return results
  // ...
};
```

### 5. Finding Intersecting Nodes

```typescript
// src/api/services/figma/intersections/get-intersecting-nodes.ts
export const getIntersectingNodes = (
  selectedNode: SceneNode
): PolychromNode => {
  const currentPageNodes = Array.from(figma.currentPage.children);
  
  const isNodeInRoot = currentPageNodes.some(
    (node) => node.id === selectedNode.id
  );

  // If selected node is in root, only look at nodes below it in z-index
  // Otherwise, check all page nodes
  const lookUpNodes = isNodeInRoot
    ? getSiblingsThatAreBelowByZIndex(selectedNode, currentPageNodes)
    : currentPageNodes;

  const intersectingNodes = traverseAndCheckIntersections(
    lookUpNodes,
    selectedNode
  );

  const polychromPageNode = createPolychromNode(
    figma.currentPage,
    selectedNode.id
  );

  polychromPageNode.children = intersectingNodes;

  return polychromPageNode;
};
```

### 6. Z-Index Handling

```typescript
// src/api/services/figma/intersections/get-siblings-that-are-below-by-z-index.ts
export const getSiblingsThatAreBelowByZIndex = (
  targetNode: SceneNode,
  allNodes: readonly SceneNode[]
): SceneNode[] => {
  const targetIndex = allNodes.indexOf(targetNode);
  
  return targetIndex === -1 ? [] : allNodes.slice(0, targetIndex + 1);
};
```

### 7. Intersection Detection

```typescript
// src/api/services/figma/intersections/are-nodes-intersecting.ts
export const areNodesIntersecting = (
  node: SceneNode,
  selectedNode: SceneNode
): boolean => {
  if (!hasBoundingBox(selectedNode)) return false;

  return (
    hasBoundingBox(node) &&
    isContainedIn(node.absoluteBoundingBox, selectedNode.absoluteBoundingBox) &&
    'visible' in node &&
    node.visible
  );
};
```

```typescript
// src/api/services/figma/intersections/is-contained-in.ts
export const isContainedIn = (
  nodeBoundingBox: Rect,
  selectedNodeBoundingBox: Rect
): boolean => {
  return (
    nodeBoundingBox.x < selectedNodeBoundingBox.x + selectedNodeBoundingBox.width &&
    nodeBoundingBox.x + nodeBoundingBox.width > selectedNodeBoundingBox.x &&
    nodeBoundingBox.y < selectedNodeBoundingBox.y + selectedNodeBoundingBox.height &&
    nodeBoundingBox.y + nodeBoundingBox.height > selectedNodeBoundingBox.y
  );
};
```

### 8. Recursive Node Traversal

```typescript
// src/api/services/figma/intersections/traverse-and-check-intersections.ts
export const traverseAndCheckIntersections = (
  nodes: SceneNode[],
  selectedNode: SceneNode
): PolychromNode[] => {
  return nodes.reduce((accumulator: PolychromNode[], node) => {
    if (areNodesIntersecting(node, selectedNode)) {
      const polychromNode = createPolychromNode(node, selectedNode.id);

      if ('children' in node && node.children.length > 0) {
        const childrenNodes = ifSelectedNodeIsChild(node, selectedNode)
          ? getSiblingsThatAreBelowByZIndex(selectedNode, node.children)
          : Array.from(node.children);

        polychromNode.children = traverseAndCheckIntersections(
          childrenNodes,
          selectedNode
        );
      }

      accumulator.push(polychromNode);
    }

    return accumulator;
  }, []);
};
```

### 9. Converting Figma Nodes to Polychrom Nodes

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
    children: [],
    fills: fills.map((fill) => {
      if (fill.type === 'SOLID') {
        return {
          ...fill,
          hex: formatHex({ ...fill.color, mode: 'rgb' }),
          oklch: convertToOklch({ ...fill.color, mode: 'rgb' }, 'oklch'),
        };
      } else {
        return fill;
      }
    }),
    id: node.id,
    isSelected: node.id === selectedNodeId,
    name: node.name,
    nestingLevel: parents.length,
    opacity: 'opacity' in node ? node.opacity : 1,
    parents,
    visible: 'visible' in node ? node.visible : true,
    zIndex: node.parent?.children.findIndex((child) => {
      return child.id === node.id;
    }),
  };
};
```

### 10. Extracting Fills

```typescript
// src/api/services/figma/nodes/get-node-fills.ts
export const getNodeFills = (
  node: PageNode | PolychromNode | SceneNode
): Paint[] => {
  if ('fills' in node) {
    return typeof node.fills === 'symbol' ? [] : Array.from(node.fills);
  }

  if ('backgrounds' in node) {
    return typeof node.backgrounds === 'symbol'
      ? []
      : Array.from(node.backgrounds);
  }

  return [];
};
```

### 11. Background Validation

```typescript
// src/api/services/figma/nodes/is-valid-for-background.ts
export const isValidForBackground = (nodesTree: PolychromNode): boolean => {
  const flattenNodesList = flattenPolychromNodesTree(nodesTree);
  const sortedFlattenNodesList = sortByDepthAndOrder(flattenNodesList);
  
  const sortedFlattenNodesWithoutSelected = sortedFlattenNodesList.filter(
    (node) => node.isSelected === false
  );

  const actualNode = getActualNode(sortedFlattenNodesWithoutSelected);
  if (isEmpty(actualNode)) return false;

  const actualFill = getActualFill(actualNode?.fills);
  if (isEmpty(actualFill)) return false;

  return actualFill.type === 'SOLID';
};
```

### 12. Node Flattening and Sorting

```typescript
// src/utils/figma/flatten-polychrom-nodes-tree.ts
export const flattenPolychromNodesTree = (
  nodesTree: PolychromNode,
  parentNestingLevel = 0
): PolychromNode[] => {
  let flatNodes: PolychromNode[] = [nodesTree];

  nodesTree.children.forEach((node) => {
    const updatedNode = { ...node, nestingLevel: parentNestingLevel + 1 };
    flatNodes.push(updatedNode);

    if (node.children.length > 0) {
      flatNodes = flatNodes.concat(
        flattenPolychromNodesTree(node, updatedNode.nestingLevel)
      );
    }
  });

  return flatNodes;
};
```

```typescript
// src/utils/figma/sort-by-depth-and-order.ts
export const sortByDepthAndOrder = (
  flatNodesList: PolychromNode[]
): PolychromNode[] => {
  return flatNodesList.sort((a, b) => {
    const levelDifference = b.nestingLevel - a.nestingLevel;
    const zIndexDifference = Math.abs(b.zIndex ?? 0) - Math.abs(a.zIndex ?? 0);

    return levelDifference !== 0 ? levelDifference : zIndexDifference;
  });
};
```

### 13. Finding the Actual Node and Fill

```typescript
// src/utils/figma/get-actual-node.ts
export const getActualNode = (
  nodes: PolychromNode[]
): PolychromNode | undefined => {
  return nodes.find(
    (node) =>
      node.visible === true &&
      notEmpty(node.opacity) &&
      node.opacity > 0 &&
      node.fills.length > 0 &&
      node.fills.some(
        (fill) =>
          fill.visible === true && notEmpty(fill.opacity) && fill.opacity > 0
      )
  );
};
```

```typescript
// src/utils/figma/get-actual-fill.ts
export const getActualFill = (
  fills: FigmaPaint[] | readonly Paint[]
): Paint | undefined => {
  return Array.from(fills)
    .reverse()
    .find(
      (fill) =>
        fill.visible === true && notEmpty(fill.opacity) && fill.opacity > 0
    );
};
```

## Dependencies

1. **culori** - Used for color conversion and handling
   - Functions used: `converter`, `formatHex`

2. **Figma Plugin API** - Core API for interacting with Figma
   - Important methods: `figma.currentPage`, `figma.on`, `figma.ui.postMessage`

## Overall Logic Flow

1. Plugin activates on selection change, document change, or plugin run
2. Gets current selection from Figma
3. For each selected node:
   - Determines if the node is valid for selection
   - Finds all nodes that intersect with the selected node
   - Filters to only nodes below the selected node in z-index
   - Traverses the node tree to find all intersecting nodes
   - Converts Figma nodes to custom PolychromNode structure with color information
   - Flattens and sorts the node tree by depth and z-index
   - Finds the topmost visible node with a valid fill
   - Validates if the background has a solid color fill
   - Extracts color information from the fill
4. Returns the selection data to the UI for display

The plugin accurately detects background colors by finding the topmost visible node that intersects with the selected node and has a valid solid fill.
