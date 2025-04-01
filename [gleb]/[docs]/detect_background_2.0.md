I'll thoroughly check the code again to extract the complete background extraction logic from Figma nodes and create a comprehensive markdown file.

Ran tool
Let's examine the key files for background extraction:

Read file: src/api/services/figma/intersections/get-intersecting-nodes.ts

Read file: src/api/services/figma/intersections/are-nodes-intersecting.ts

Read file: src/api/services/figma/intersections/is-contained-in.ts

Read file: src/api/services/figma/intersections/has-bounding-box.ts

Read file: src/api/services/figma/intersections/traverse-and-check-intersections.ts

Read file: src/api/services/figma/intersections/get-siblings-that-are-below-by-z-index.ts

Read file: src/api/services/figma/nodes/is-valid-for-background.ts

Read file: src/utils/figma/flatten-polychrom-nodes-tree.ts

Read file: src/utils/figma/get-actual-node.ts

Read file: src/utils/figma/get-actual-fill.ts

Read file: src/utils/figma/sort-by-depth-and-order.ts

Read file: src/ui/services/figma/find-fg-and-bg-nodes.ts

Read file: src/api/services/figma/nodes/create-polychrom-node.ts

Read file: src/api/services/figma/nodes/get-node-fills.ts

Read file: src/api/services/figma/nodes/collect-node-parents.ts

Read file: src/api/services/payload/build-general-selection-payload.ts
Based on the code I've examined, I'll create a comprehensive markdown document detailing the background extraction logic from Figma nodes.

# Background Extraction Logic in Figma Polychrom Plugin

## Overview

The Figma Polychrom plugin extracts background colors from elements beneath selected nodes by finding intersecting nodes, processing their stacking order, and validating suitable background colors. This document details the complete background extraction process.

## Core Data Structures

### PolychromNode

The plugin uses a custom data structure to represent Figma nodes with additional properties:

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

## Background Extraction Process

### 1. Entry Point: Finding Intersecting Nodes

The process starts by identifying all nodes that intersect with the selected node:

```typescript
export const getIntersectingNodes = (
  selectedNode: SceneNode
): PolychromNode => {
  // Get all nodes on the current page
  const currentPageNodes = Array.from(figma.currentPage.children);

  // Check if the selected node is at the root level
  const isNodeInRoot = currentPageNodes.some(
    (node) => node.id === selectedNode.id
  );

  // If at root level, only consider nodes below the selected node in z-index
  // Otherwise, consider all nodes on the page
  const lookUpNodes = isNodeInRoot
    ? getSiblingsThatAreBelowByZIndex(selectedNode, currentPageNodes)
    : currentPageNodes;

  // Find all intersecting nodes
  const intersectingNodes = traverseAndCheckIntersections(
    lookUpNodes,
    selectedNode
  );

  // Create a wrapper node representing the page
  const polychromPageNode = createPolychromNode(
    figma.currentPage,
    selectedNode.id
  );

  // Attach the intersecting nodes to the page wrapper
  polychromPageNode.children = intersectingNodes;

  return polychromPageNode;
};
```

### 2. Z-Index Handling: Getting Nodes Below Selection

When a node is at the root level, we need to consider only nodes that are below it in the stacking order:

```typescript
export const getSiblingsThatAreBelowByZIndex = (
  targetNode: SceneNode,
  allNodes: readonly SceneNode[]
): SceneNode[] => {
  const targetIndex = allNodes.indexOf(targetNode);
  
  // Return all nodes up to and including the target node
  // (Figma's z-index ordering goes from bottom to top)
  return targetIndex === -1 ? [] : allNodes.slice(0, targetIndex + 1);
};
```

### 3. Recursive Node Traversal and Intersection Checking

Recursively traverse the node tree to find all nodes that intersect with the selected node:

```typescript
export const traverseAndCheckIntersections = (
  nodes: SceneNode[],
  selectedNode: SceneNode
): PolychromNode[] => {
  return nodes.reduce((accumulator: PolychromNode[], node) => {
    if (areNodesIntersecting(node, selectedNode)) {
      // Convert Figma node to PolychromNode
      const polychromNode = createPolychromNode(node, selectedNode.id);

      // If the node has children, process them recursively
      if ('children' in node && node.children.length > 0) {
        // Special handling if the selected node is a child of the current node
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

// Helper to check if the selected node is a child of the current node
const ifSelectedNodeIsChild = (
  node: SceneNode,
  selectedNode: SceneNode
): boolean => {
  return (
    'children' in node && node.children.some((n) => n.id === selectedNode.id)
  );
};
```

### 4. Intersection Detection

Determining if nodes intersect involves checking their bounding boxes and visibility:

```typescript
export const areNodesIntersecting = (
  node: SceneNode,
  selectedNode: SceneNode
): boolean => {
  // Make sure the selected node has a valid bounding box
  if (!hasBoundingBox(selectedNode)) return false;

  return (
    hasBoundingBox(node) &&
    isContainedIn(node.absoluteBoundingBox, selectedNode.absoluteBoundingBox) &&
    'visible' in node &&
    node.visible
  );
};

// Check if a node has a valid bounding box
export const hasBoundingBox = (
  node: SceneNode
): node is SceneNode & { absoluteBoundingBox: Rect } =>
  'absoluteBoundingBox' in node && notEmpty(node.absoluteBoundingBox);

// Check if two bounding boxes intersect
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

### 5. Node Conversion: From Figma Node to PolychromNode

Converting Figma nodes to the plugin's internal PolychromNode structure:

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

### 6. Fill Extraction: Getting Node Fills

Extract fills from nodes, handling both page backgrounds and regular fills:

```typescript
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

### 7. Parent Collection: Building Node Hierarchy

Collect all parent nodes to determine nesting level:

```typescript
export const collectNodeParents = (
  node: PageNode | SceneNode,
  parents: SceneNode[] = []
): SceneNode[] => {
  if (notEmpty(node.parent)) {
    if (node.parent.type === 'PAGE' || node.parent.type === 'DOCUMENT')
      return parents;

    parents.push(node.parent);

    collectNodeParents(node.parent, parents);
  }
  return parents;
};
```

### 8. Background Validation: Finding Valid Background Nodes

Once we have the tree of intersecting nodes, we need to determine which node can serve as a valid background:

```typescript
export const isValidForBackground = (nodesTree: PolychromNode): boolean => {
  // Flatten the node tree into a list
  const flattenNodesList = flattenPolychromNodesTree(nodesTree);

  // Sort nodes by depth and z-index
  const sortedFlattenNodesList = sortByDepthAndOrder(flattenNodesList);

  // Filter out the selected node
  const sortedFlattenNodesWithoutSelected = sortedFlattenNodesList.filter(
    (node) => node.isSelected === false
  );

  // Find the topmost visible node with valid fills
  const actualNode = getActualNode(sortedFlattenNodesWithoutSelected);

  if (isEmpty(actualNode)) return false;

  // Get the topmost visible fill
  const actualFill = getActualFill(actualNode?.fills);

  if (isEmpty(actualFill)) return false;

  // Background must be a solid fill
  return actualFill.type === 'SOLID';
};
```

### 9. Tree Flattening: Converting Tree to List

Flatten the hierarchical node tree into a flat list for easier processing:

```typescript
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

### 10. Depth and Order Sorting

Sort nodes by nesting level and z-index to determine the stacking order:

```typescript
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

### 11. Finding Actual Node: Topmost Visible Node

Find the topmost visible node with valid fills:

```typescript
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

### 12. Getting Actual Fill: Topmost Visible Fill

Get the topmost visible fill from a node:

```typescript
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

### 13. Finding Foreground and Background: In UI Processing

When displaying the results, the plugin needs to identify which nodes are foreground and which are background:

```typescript
export const findFgAndBgNodes = (
  polychromNodesTree: PolychromNode
): {
  closestBgNode?: PolychromNode;
  selectedNode?: PolychromNode;
} => {
  const flattedNodes = flattenPolychromNodesTree(polychromNodesTree);
  const sortedFlattenNodes = sortByDepthAndOrder(flattedNodes);

  // The selected node is identified by isSelected flag
  const selectedNode = sortedFlattenNodes.find((node) => node.isSelected);
  
  // Get all nodes except the first one (which is the selected node)
  const [, ...flattenWithoutSelected] = sortedFlattenNodes;

  // Find the closest background node (first visible node with valid fills)
  const closestBgNode = getActualNode(flattenWithoutSelected);

  return {
    closestBgNode,
    selectedNode,
  };
};
```

### 14. Building the Selection Payload

The plugin constructs a payload to send to the UI with the selection data:

```typescript
export const buildGeneralSelectionPayload = (
  selection: readonly SceneNode[]
): SelectionChangeEvent => {
  const selectedNodePairs = selection
    .filter(isValidForSelection)
    .map((selectedNode) => {
      const intersectingNodesTree = getIntersectingNodes(selectedNode);

      // Check for valid blend modes
      if (!hasOnlyValidBlendModes(intersectingNodesTree)) {
        return PairState.InvalidBlendMode;
      }

      // Check if there's a valid background
      if (isValidForBackground(intersectingNodesTree)) {
        return intersectingNodesTree;
      } else {
        return PairState.InvalidBackground;
      }
    });

  // Handle error cases
  const isSingleInvalidBackground =
    selectedNodePairs.some((pair) => pair === PairState.InvalidBackground) &&
    selectedNodePairs.length === 1;
  const areAllInvalidBackgrounds =
    selectedNodePairs.length > 1 &&
    selectedNodePairs.every((pair) => pair === PairState.InvalidBackground);

  if (isSingleInvalidBackground || areAllInvalidBackgrounds) {
    return {
      colorSpace: figma.root.documentColorProfile,
      text: SelectionMessageTypes.invalidBackground,
    };
  }

  if (selectedNodePairs.some((pair) => pair === PairState.InvalidBlendMode)) {
    return {
      colorSpace: figma.root.documentColorProfile,
      text: SelectionMessageTypes.unprocessedBlendModes,
    };
  }

  // Return valid selections
  return {
    colorSpace: figma.root.documentColorProfile,
    selectedNodePairs: selectedNodePairs.filter(isValidSelection),
  };
};
```

## Selection Validation

Only certain node types with solid fills are valid for selection and background detection:

```typescript
export const isValidForSelection = (node: SceneNode): boolean => {
  if ('fills' in node) {
    if (typeof node.fills === 'symbol') {
      return false;
    }

    const actualFill = getActualFill(node.fills);

    if (notEmpty(actualFill)) {
      return actualFill.type === 'SOLID';
    }
  }

  return false;
};
```

## Blend Mode Validation

The plugin can only handle certain blend modes:

```typescript
export const hasOnlyValidBlendModes = (node: PolychromNode): boolean => {
  // Skip checking the root node to allow for selection in the document level
  // because all elements in the document has the PASS_THROUGH blendMode
  if (node.parents.length === 0) return true;

  // Check the node's blend mode
  const hasInvalidBlendMode = !hasValidBlendMode(node);

  // Check all the node's fills
  const hasInvalidFillBlendMode = node.fills
    .filter((fill) => isVisibleSolidFill(fill))
    .some((fill) => !hasValidBlendMode(fill));

  if (hasInvalidBlendMode || hasInvalidFillBlendMode) return false;

  // Recursively check all children
  if (node.children.length === 0) return true;

  return node.children.every(hasOnlyValidBlendModes);
};
```

## Full Data Flow Summary

1. **Selection**: User selects one or more nodes in Figma
2. **Extraction**: For each selected node:
   - Get all nodes on the current page
   - Filter to only nodes that are below the selected node in z-index (if at root level)
   - Find all nodes that intersect with the selected node
   - Convert Figma nodes to PolychromNodes with extended properties
   - Build a tree of intersecting nodes
3. **Validation**:
   - Flatten the node tree
   - Sort by nesting level and z-index
   - Filter out the selected node
   - Find the topmost visible node with valid fills
   - Verify the fill is a solid type
4. **Processing**:
   - Check blend modes for compatibility
   - Validate background and foreground nodes
   - Extract color information
   - Prepare the payload for the UI
5. **Display**: UI receives the selection data and displays colors and contrast

The background extraction logic is sophisticated, handling complex cases like nested components, different blend modes, and proper z-index ordering to accurately determine which elements are behind the selected node and which colors should be used for contrast calculations.
