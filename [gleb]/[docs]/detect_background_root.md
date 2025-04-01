I'll examine how the plugin detects background colors when a node doesn't have a frame or autolayout container, and specifically how it handles document backgrounds.

Ran tool
Let's look at how the plugin handles nodes without containers by examining how it processes page children:

Ran tool
Let's check getNodeFills function to see how it handles page backgrounds:

Ran tool
Now let's check how the plugin processes nodes at the page level:

Read file: src/api/services/figma/intersections/get-intersecting-nodes.ts
Let's examine how the plugin creates a PolychromNode from a page:

Read file: src/api/services/figma/nodes/get-node-fills.ts
Let's check the test cases for getNodeFills to understand better how it handles different node types:

Read file: src/api/services/figma/nodes/specs/get-node-fills.spec.ts
Let's examine how background detection works for nodes at the root level by reviewing the key functions:

Read file: src/api/services/figma/nodes/is-valid-for-background.ts
Let's specifically look at how the plugin handles PageNode types and their backgrounds:

Read file: src/api/services/figma/nodes/create-polychrom-node.ts
Now let's look at the UI side to see how it handles nodes that don't have a proper background:

Read file: src/ui/services/figma/find-fg-and-bg-nodes.ts
Let's see how the plugin handles the case where there is no valid background:

Read file: src/ui/components/InvalidBackgroundSelectionMessage.tsx
Based on my review of the code, I'll extract the logic for how the plugin handles background detection when a node doesn't have a frame or autolayout container, and specifically how it handles document backgrounds.

# Background Detection for Nodes Without Containers

## Overview

The Figma Polychrom plugin includes logic to detect background colors for nodes that don't have a container (like a frame or autolayout), including nodes placed directly on the document canvas. This document outlines how this specific scenario is handled.

## Key Concepts

1. When a node doesn't have a container, the plugin treats the document page as the potential background source
2. The plugin differentiates between nodes at the "root level" (direct children of the page) and nested nodes
3. Page nodes in Figma have `backgrounds` property instead of `fills`

## Detection Process for Nodes at Root Level

### 1. Identifying Root-Level Nodes

The plugin first determines if the selected node is at the root level (direct child of the page):

```typescript
export const getIntersectingNodes = (
  selectedNode: SceneNode
): PolychromNode => {
  const currentPageNodes = Array.from(figma.currentPage.children);

  // Check if the selected node is at the root level
  const isNodeInRoot = currentPageNodes.some(
    (node) => node.id === selectedNode.id
  );

  // Different handling based on whether the node is at root level
  const lookUpNodes = isNodeInRoot
    ? getSiblingsThatAreBelowByZIndex(selectedNode, currentPageNodes)
    : currentPageNodes;
  
  // ...
};
```

### 2. Z-Index Handling for Root-Level Nodes

If the node is at the root level, the plugin only considers nodes that are below it in the z-index stacking order:

```typescript
export const getSiblingsThatAreBelowByZIndex = (
  targetNode: SceneNode,
  allNodes: readonly SceneNode[]
): SceneNode[] => {
  const targetIndex = allNodes.indexOf(targetNode);
  
  // Return all nodes up to and including the target node
  // (In Figma, lower indices are further back in z-order)
  return targetIndex === -1 ? [] : allNodes.slice(0, targetIndex + 1);
};
```

### 3. Using the Page as a Background

When no other valid background is found (or for nodes at the bottom of the z-stack), the plugin includes the page itself in the node tree:

```typescript
export const getIntersectingNodes = (
  selectedNode: SceneNode
): PolychromNode => {
  // ... (find intersecting nodes)
  
  const intersectingNodes = traverseAndCheckIntersections(
    lookUpNodes,
    selectedNode
  );

  // Create a wrapper node representing the page
  // This ensures the page itself can serve as a background
  const polychromPageNode = createPolychromNode(
    figma.currentPage,
    selectedNode.id
  );

  polychromPageNode.children = intersectingNodes;

  return polychromPageNode;
};
```

## Handling Page Backgrounds

### 1. Extracting Page Background Colors

The `getNodeFills` function specifically checks for the `backgrounds` property that exists on page nodes:

```typescript
export const getNodeFills = (
  node: PageNode | PolychromNode | SceneNode
): Paint[] => {
  if ('fills' in node) {
    return typeof node.fills === 'symbol' ? [] : Array.from(node.fills);
  }

  // Special handling for page nodes which use 'backgrounds' instead of 'fills'
  if ('backgrounds' in node) {
    return typeof node.backgrounds === 'symbol'
      ? []
      : Array.from(node.backgrounds);
  }

  return [];
};
```

### 2. Converting Page Node to PolychromNode

The page node is converted to a PolychromNode, which processes its background colors:

```typescript
export const createPolychromNode = (
  node: PageNode | SceneNode,
  selectedNodeId?: string
): PolychromNode => {
  // Extract fills (or backgrounds for page nodes)
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
    // ...other properties
  };
};
```

## Background Validation and Selection

### 1. Flattening and Sorting the Node Tree

The plugin flattens and sorts the node tree, which includes the page node:

```typescript
export const isValidForBackground = (nodesTree: PolychromNode): boolean => {
  // Flatten the node tree (includes the page node)
  const flattenNodesList = flattenPolychromNodesTree(nodesTree);

  // Sort by depth and z-index
  const sortedFlattenNodesList = sortByDepthAndOrder(flattenNodesList);

  // Remove the selected node
  const sortedFlattenNodesWithoutSelected = sortedFlattenNodesList.filter(
    (node) => node.isSelected === false
  );

  // ...
};
```

### 2. Finding the Topmost Visible Node

The plugin finds the topmost visible node with valid fills, which can be the page itself:

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

### 3. Finding a Valid Background Fill

Once the background node is identified (which could be the page node), the plugin finds the topmost visible fill:

```typescript
export const isValidForBackground = (nodesTree: PolychromNode): boolean => {
  // ... (flatten and sort)
  
  // Find the actual background node
  const actualNode = getActualNode(sortedFlattenNodesWithoutSelected);

  if (isEmpty(actualNode)) return false;

  // Get the topmost visible fill
  const actualFill = getActualFill(actualNode?.fills);

  if (isEmpty(actualFill)) return false;

  // Must be a solid fill
  return actualFill.type === 'SOLID';
};
```

## Handling Nodes Without Valid Backgrounds

When no valid background is found (including the page background), the plugin shows an error message:

```typescript
export const buildGeneralSelectionPayload = (
  selection: readonly SceneNode[]
): SelectionChangeEvent => {
  const selectedNodePairs = selection
    .filter(isValidForSelection)
    .map((selectedNode) => {
      // ... (get intersecting nodes)

      if (isValidForBackground(intersectingNodesTree)) {
        return intersectingNodesTree;
      } else {
        return PairState.InvalidBackground;
      }
    });

  // If all selections have invalid backgrounds, show error
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

  // ...
};
```

## Example Flow for a Node at Root Level

1. User selects a node placed directly on the page (no container)
2. Plugin checks if the node is at root level (direct child of the page)
3. Plugin collects all nodes below the selected node in z-index
4. Plugin also includes the page node itself as a potential background
5. All nodes (including the page) are checked for intersection with the selected node
6. Nodes are converted to PolychromNodes, with special handling for the page's backgrounds
7. The node tree is flattened and sorted by depth and z-index
8. The topmost visible node with valid fills is identified as the background
9. If the page is the only node below the selection, its background color is used

## Summary

The plugin handles nodes without containers by:

1. Including the page node in the background detection process
2. Special handling for extracting backgrounds from the page node
3. Considering z-index for nodes at the root level
4. Using the page's background color when no other valid background is found
5. Showing an error message when no valid background (including the page background) is available

This approach ensures that even nodes placed directly on the document can have their backgrounds correctly identified for contrast calculations.
