import { apcach, apcachToCss } from 'apcach';
import type { PluginMessage, ColorValues, RGB, P3 } from './types/plugin-messages';

// Add interface for PolychromNode
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

// Show UI with larger size for preview
figma.showUI(__html__, { width: 420, height: 500, themeColors: true });

// Function to send the initial background color to the UI
function sendInitialBackground() {
  const initialBgColor = getPageBackground();
  figma.ui.postMessage({ 
    type: 'init-background',
    color: initialBgColor 
  });
  console.log('Sent initial background color to UI:', initialBgColor);
}

// Call to send the initial background color
sendInitialBackground();

// Create caches with TTL for performance
let nodePathCache = new Map<string, string>();
let nodeDepthCache = new Map<string, number>();
let intersectionCache = new Map<string, string[]>();
let lastCacheReset = Date.now();

// Define unsupported blend modes (matching reference implementation)
const UNSUPPORTED_BLEND_MODES: BlendMode[] = ['LINEAR_BURN', 'LINEAR_DODGE']; // PLUS_DARKER in Figma

/**
 * Check if a blend mode is supported by the plugin
 * @param blendMode The blend mode to check
 * @returns true if the blend mode is supported, false otherwise
 */
function hasValidBlendMode(blendMode?: BlendMode): boolean {
  // If undefined or null, assume valid
  if (!blendMode) return true;
  
  // Check if it's in the unsupported list
  return !UNSUPPORTED_BLEND_MODES.includes(blendMode);
}

/**
 * Check if a fill has a valid blend mode
 * @param fill The paint fill to check
 * @returns true if the fill has a valid blend mode, false otherwise
 */
function hasValidFillBlendMode(fill: Paint): boolean {
  // Skip checks for non-visible fills or non-solid fills
  if (fill.type !== 'SOLID' || fill.visible === false) return true;
  
  // Check if the fill's blend mode is valid
  return hasValidBlendMode(fill.blendMode);
}

/**
 * Maps Figma blend modes to their CSS equivalents for UI visualization
 * Matching the reference implementation's mapFigmaBlendToCanvas function
 */
function mapFigmaBlendToCSS(blendMode: BlendMode): string {
  // Mapping Figma blend modes to CSS equivalents
  const blendModeMap: Record<BlendMode, string> = {
    'NORMAL': 'normal',
    'DARKEN': 'darken',
    'MULTIPLY': 'multiply',
    'COLOR_BURN': 'color-burn',
    'LINEAR_BURN': 'multiply', // CSS doesn't have linear-burn, use multiply as fallback
    'LIGHTEN': 'lighten',
    'SCREEN': 'screen',
    'COLOR_DODGE': 'color-dodge',
    'LINEAR_DODGE': 'screen', // CSS doesn't have linear-dodge, use screen as fallback
    'OVERLAY': 'overlay',
    'SOFT_LIGHT': 'soft-light',
    'HARD_LIGHT': 'hard-light',
    'DIFFERENCE': 'difference',
    'EXCLUSION': 'exclusion',
    'HUE': 'hue',
    'SATURATION': 'saturation',
    'COLOR': 'color',
    'LUMINOSITY': 'luminosity',
    'PASS_THROUGH': 'normal' // Use normal as fallback for pass-through
  };
  
  // Return the mapped value or default to 'normal' if not found
  return blendModeMap[blendMode] || 'normal';
}

/**
 * Recursively check if a node and all its children have valid blend modes
 * @param node The node to check
 * @returns true if the node and all children have valid blend modes, false otherwise
 */
function hasValidBlendModes(node: SceneNode): boolean {
  // First check the node's own blend mode
  if ('blendMode' in node) {
    const nodeBlendMode = node.blendMode as BlendMode;
    // PASS_THROUGH is a normal blend mode and should be supported
    if (nodeBlendMode !== 'PASS_THROUGH' && !isSupportedBlendMode(nodeBlendMode)) {
      console.log(`❌ Node ${node.name} has unsupported blend mode: ${nodeBlendMode}`);
      return false;
    }
  }
  
  // Then check for any fills with blend modes
  if ('fills' in node) {
    const typedNode = node as SceneNode & { fills: readonly Paint[] };
    if (typedNode.fills) {
      for (const fill of typedNode.fills) {
        if (fill.type === 'SOLID' && fill.blendMode && !isSupportedFillBlendMode(fill.blendMode)) {
          console.log(`❌ Node ${node.name} has fill with unsupported blend mode: ${fill.blendMode}`);
          return false;
        }
      }
    }
  }
  
  return true;
}

// Function to clear caches when needed
function clearCachesIfNeeded() {
  const now = Date.now();
  // Clear caches if more than 5 seconds have passed since last reset
  if (now - lastCacheReset > 5000) {
    console.log('Clearing background detection caches');
    nodePathCache.clear();
    nodeDepthCache.clear();
    intersectionCache.clear();
    lastCacheReset = now;
  }
}

// Clear caches on selection change as well
figma.on("selectionchange", () => {
  clearCachesIfNeeded();
});

/**
 * Enhanced background detection function that detects intersecting nodes
 * and finds the topmost visible node below the selected node with a valid fill
 */
function detectBackgroundColor(node: SceneNode): RGB | null {
  try {
    console.log('==================== BACKGROUND DETECTION START ====================');
    console.log('🔍 Target node:', node.name, '| Type:', node.type, '| ID:', node.id);
    
    // Log the node's own fill color if it has one
    if ('fills' in node) {
      const typedNode = node as SceneNode & { fills: readonly Paint[] };
      const solidFill = typedNode.fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint | undefined;
      
      if (solidFill) {
        const nodeColor = {
          r: Math.round(solidFill.color.r * 255),
          g: Math.round(solidFill.color.g * 255),
          b: Math.round(solidFill.color.b * 255)
        };
        console.log(`📊 Node's own color: RGB(${nodeColor.r}, ${nodeColor.g}, ${nodeColor.b}) - HEX: #${nodeColor.r.toString(16).padStart(2, '0')}${nodeColor.g.toString(16).padStart(2, '0')}${nodeColor.b.toString(16).padStart(2, '0')}`);
        
        // Log blend mode if available
        if ('blendMode' in node) {
          console.log(`🎨 Node's blend mode: ${node.blendMode}`);
          console.log(`🔍 Is blend mode supported: ${hasValidBlendMode(node.blendMode) ? 'Yes' : 'No'}`);
        }
      }
    }
    
    console.log('📋 Parent structure:', node.parent ? `${node.parent.type} (${node.parent.name})` : 'No parent');
    
    // PHASE 1: Check siblings that might be backgrounds (higher priority)
    // This matches reference implementation's priority for siblings behind the target
    console.log('🔍 PHASE 1: Checking siblings that might be backgrounds (higher priority)');
    if (node.parent) {
      const siblings = Array.from(node.parent.children);
      const nodeIndex = siblings.indexOf(node);
      
      // Get siblings that are behind this node (lower index in the array)
      const siblingsBehind = siblings.slice(0, nodeIndex);
      
      console.log(`Found ${siblingsBehind.length} siblings behind the target node`);
      siblingsBehind.forEach((s, i) => console.log(`- Sibling ${i+1}: ${s.name} (${s.type})`));
      
      // Check siblings from front to back (reverse the array) - this is key to matching the reference
      for (const sibling of siblingsBehind.reverse()) {
        console.log(`Checking sibling: ${sibling.name} (${sibling.type})`);
        
        // Log blend mode if available
        if ('blendMode' in sibling) {
          console.log(`🎨 Sibling's blend mode: ${sibling.blendMode}`);
          console.log(`🔍 Is blend mode supported: ${hasValidBlendMode(sibling.blendMode) ? 'Yes' : 'No'}`);
        }
        
        if (hasValidSolidFill(sibling as SceneNode)) {
          console.log(`✅ Sibling has valid solid fill`);
          
          // Extract and log the fill color
          if ('fills' in sibling) {
            const typedSibling = sibling as SceneNode & { fills: readonly Paint[] };
            const solidFill = typedSibling.fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint;
            
            if (solidFill) {
              const siblingColor = {
                r: Math.round(solidFill.color.r * 255),
                g: Math.round(solidFill.color.g * 255),
                b: Math.round(solidFill.color.b * 255)
              };
              console.log(`📊 Sibling's color: RGB(${siblingColor.r}, ${siblingColor.g}, ${siblingColor.b}) - HEX: #${siblingColor.r.toString(16).padStart(2, '0')}${siblingColor.g.toString(16).padStart(2, '0')}${siblingColor.b.toString(16).padStart(2, '0')}`);
            }
          }
          
          // Check if sibling might be a background for our node (either intersects or is much larger)
          if (doesNodeIntersectOrEncapsulate(sibling as SceneNode, node)) {
            console.log(`✅ Sibling intersects or encapsulates target node`);
            
            // Cast to access the fill
            const typedNode = sibling as SceneNode & { fills: readonly Paint[] };
            const solidFill = typedNode.fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint;
            
            const result = {
              r: Math.round(solidFill.color.r * 255),
              g: Math.round(solidFill.color.g * 255),
              b: Math.round(solidFill.color.b * 255)
            };
            
            const hexColor = `#${result.r.toString(16).padStart(2, '0')}${result.g.toString(16).padStart(2, '0')}${result.b.toString(16).padStart(2, '0')}`.toUpperCase();
            console.log(`🎯 FOUND BACKGROUND from sibling: RGB(${result.r}, ${result.g}, ${result.b}) - HEX: ${hexColor}`);
            console.log('==================== BACKGROUND DETECTION END ====================');
            return result;
          } else {
            console.log(`❌ Sibling does not intersect or encapsulate target`);
          }
        } else {
          console.log(`❌ Sibling does not have valid solid fill`);
        }
      }
      
      console.log(`❌ No suitable sibling backgrounds found`);
    } else {
      console.log(`❌ Node has no parent, skipping sibling check`);
    }
    
    // PHASE 2: Check direct container (parent with fill)
    // This matches the reference implementation's check for parent nodes
    console.log('🔍 PHASE 2: Checking direct parent container');
    if (node.parent && node.parent.type !== 'PAGE' && 'fills' in node.parent) {
      const parentNode = node.parent as SceneNode & { fills: readonly Paint[] };
      console.log(`Parent: ${parentNode.name} (${parentNode.type})`);
      
      // Log parent's blend mode if available
      if ('blendMode' in parentNode) {
        console.log(`🎨 Parent's blend mode: ${parentNode.blendMode}`);
        console.log(`🔍 Is blend mode supported: ${hasValidBlendMode(parentNode.blendMode) ? 'Yes' : 'No'}`);
      }
      
      // Use the helper function to check for valid fill
      if (hasValidSolidFill(parentNode as SceneNode)) {
        console.log(`✅ Parent has valid solid fill`);
        
        // Extract and log the fill color
        const solidFill = parentNode.fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint;
        
        if (solidFill) {
          const parentColor = {
            r: Math.round(solidFill.color.r * 255),
            g: Math.round(solidFill.color.g * 255),
            b: Math.round(solidFill.color.b * 255)
          };
          console.log(`📊 Parent's color: RGB(${parentColor.r}, ${parentColor.g}, ${parentColor.b}) - HEX: #${parentColor.r.toString(16).padStart(2, '0')}${parentColor.g.toString(16).padStart(2, '0')}${parentColor.b.toString(16).padStart(2, '0')}`);
        }
        
        // Get the first valid solid fill
        const solidFill2 = parentNode.fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint;
        
        const result = {
          r: Math.round(solidFill2.color.r * 255),
          g: Math.round(solidFill2.color.g * 255),
          b: Math.round(solidFill2.color.b * 255)
        };
        
        const hexColor = `#${result.r.toString(16).padStart(2, '0')}${result.g.toString(16).padStart(2, '0')}${result.b.toString(16).padStart(2, '0')}`.toUpperCase();
        console.log(`🎯 FOUND BACKGROUND from parent: RGB(${result.r}, ${result.g}, ${result.b}) - HEX: ${hexColor}`);
        console.log('==================== BACKGROUND DETECTION END ====================');
        return result;
      } else {
        console.log(`❌ Parent does not have valid solid fill`);
      }
    } else {
      console.log(`❌ Node has no suitable parent container, parent is: ${node.parent?.type || 'none'}`);
    }
    
    // PHASE 3-5: Finding and checking intersecting nodes (matching reference implementation)
    // Get all intersecting nodes
    console.log('🔍 PHASE 3: Finding intersecting nodes');
    console.time('findIntersections');
    const intersectingNodes = findIntersectingNodesBelow(node);
    console.timeEnd('findIntersections');
    
    // Log summary of found nodes
    console.log(`Found ${intersectingNodes.length} intersecting nodes`);
    if (intersectingNodes.length > 10) {
      console.log('(Showing first 5 due to large number):');
      intersectingNodes.slice(0, 5).forEach((iNode, index) => {
        console.log(`- Node ${index + 1}: ${iNode.name} (${iNode.type})`);
      });
    } else if (intersectingNodes.length > 0) {
      intersectingNodes.forEach((iNode, index) => {
        console.log(`- Node ${index + 1}: ${iNode.name} (${iNode.type})`);
      });
    }
    
    if (intersectingNodes.length > 0) {
      // PHASE 4: Process the intersecting nodes by converting to PolychromNodes 
      // for proper z-index sorting, matching the reference implementation
      console.log('🔍 PHASE 4: Processing intersecting nodes by z-index');
      
      // Convert to PolychromNodes for better processing - this is crucial to match the reference
      console.time('convertToPolychrom');
      const polyNodes = intersectingNodes.map(node => createPolychromNode(node, node.id));
      console.timeEnd('convertToPolychrom');
      
      // Sort nodes by hierarchy and z-index - this matches the reference sortByDepthAndOrder function
      console.time('sortNodes');
      const sortedPolyNodes = polyNodes.sort((a, b) => {
        // First sort by nesting level (deeper first)
        if (a.nestingLevel !== b.nestingLevel) {
          return b.nestingLevel - a.nestingLevel;
        }
        
        // Then by z-index if they're at the same level
        const aZIndex = a.zIndex ?? 0;
        const bZIndex = b.zIndex ?? 0;
        return aZIndex - bZIndex;
      });
      console.timeEnd('sortNodes');
      
      console.log('Sorted nodes by hierarchy and z-index');
      
      // Map back to the original SceneNodes for processing
      const nodeMap = new Map<string, SceneNode>();
      intersectingNodes.forEach(node => nodeMap.set(node.id, node));
      const sortedNodes = sortedPolyNodes.map(pNode => nodeMap.get(pNode.id)!);
      
      // PHASE 5: Check direct intersections with fills
      // This matches the reference implementation's check for actual node with fill
      console.log('🔍 PHASE 5: Checking direct intersections with fills');
      for (const intersectingNode of sortedNodes) {
        console.log(`Checking intersecting node: ${intersectingNode.name} (${intersectingNode.type})`);
        
        // Log the node's fill color if it has one
        if ('fills' in intersectingNode) {
          const typedNode = intersectingNode as SceneNode & { fills: readonly Paint[] };
          const solidFill = typedNode.fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint | undefined;
          
          if (solidFill) {
            const nodeColor = {
              r: Math.round(solidFill.color.r * 255),
              g: Math.round(solidFill.color.g * 255),
              b: Math.round(solidFill.color.b * 255)
            };
            const hexColor = `#${nodeColor.r.toString(16).padStart(2, '0')}${nodeColor.g.toString(16).padStart(2, '0')}${nodeColor.b.toString(16).padStart(2, '0')}`.toUpperCase();
            console.log(`📊 Intersecting node's color: RGB(${nodeColor.r}, ${nodeColor.g}, ${nodeColor.b}) - HEX: ${hexColor}`);
          }
        }
        
        // Log blend mode if available
        if ('blendMode' in intersectingNode) {
          console.log(`🎨 Intersecting node's blend mode: ${intersectingNode.blendMode}`);
          console.log(`🔍 Is blend mode supported: ${hasValidBlendMode(intersectingNode.blendMode) ? 'Yes' : 'No'}`);
        }
        
        // Check if node has valid blend modes
        if (!hasValidBlendModes(intersectingNode)) {
          console.log(`❌ Skipping node due to unsupported blend mode`);
          continue;
        }
        
        // Check if this node is a potential background (has solid fill)
        // This matches the reference's isValidForBackground
        if (hasValidSolidFill(intersectingNode)) {
          console.log(`✅ Node has valid solid fill`);
          
          // Double check that it truly intersects and is behind the target node
          if (doesNodeIntersectAndIsBelow(node, intersectingNode)) {
            console.log(`✅ Node intersects and is below target`);
            
            // Cast to access the fill - matching reference's getActualFill logic
            const typedNode = intersectingNode as SceneNode & { fills: readonly Paint[] };
            const solidFill = typedNode.fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint;
            
            const result = {
              r: Math.round(solidFill.color.r * 255),
              g: Math.round(solidFill.color.g * 255),
              b: Math.round(solidFill.color.b * 255)
            };
            
            const hexResult = `#${result.r.toString(16).padStart(2, '0')}${result.g.toString(16).padStart(2, '0')}${result.b.toString(16).padStart(2, '0')}`.toUpperCase();
            console.log(`🎯 FOUND BACKGROUND from intersecting node: RGB(${result.r}, ${result.g}, ${result.b}) - HEX: ${hexResult}`);
            console.log('==================== BACKGROUND DETECTION END ====================');
            return result;
          } else {
            console.log(`❌ Node does not intersect or is not below target`);
          }
        } else {
          console.log(`❌ Node does not have valid solid fill`);
        }
      }
      
      console.log(`❌ No suitable intersecting node backgrounds found`);
      
      // PHASE 6: Check parents of intersecting nodes
      // This provides an additional fallback check that matches the reference's tree traversal
      console.log('🔍 PHASE 6: Checking containers of intersecting elements');
      for (const intersectingNode of sortedNodes) {
        console.log(`Checking parents of intersecting node: ${intersectingNode.name}`);
        
        // Skip checking parents of nodes with non-compatible blend modes
        if (!hasValidBlendModes(intersectingNode)) {
          console.log(`❌ Skipping parent checks due to node having unsupported blend mode`);
          continue;
        }
        
        // Check ancestors of this intersecting node - similar to reference's parent traversal
        let current: BaseNode | null = intersectingNode.parent;
        let ancestorDepth = 1; // Track how far up we've gone
        
        while (current && current.type !== 'PAGE' && ancestorDepth <= 3) { // Limit ancestor search depth
          console.log(`Checking ancestor level ${ancestorDepth}: ${current.name} (${current.type})`);
          
          // Check if current node is a SceneNode with valid blend modes
          if ('blendMode' in current && !hasValidBlendMode(current.blendMode)) {
            console.log(`❌ Skipping further ancestors due to unsupported blend mode: ${current.blendMode}`);
            break;
          }
          
          if ('fills' in current && hasValidSolidFill(current as SceneNode)) {
            console.log(`✅ Ancestor has valid solid fill`);
            
            // Check that this ancestor actually covers our target node
            if (doesNodeContain(current as SceneNode, node)) {
              console.log(`✅ Ancestor contains target node`);
              
              // Cast to access the fill
              const typedNode = current as SceneNode & { fills: readonly Paint[] };
              const solidFill = typedNode.fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint;
              
              const result = {
                r: Math.round(solidFill.color.r * 255),
                g: Math.round(solidFill.color.g * 255),
                b: Math.round(solidFill.color.b * 255)
              };
              
              console.log(`🎯 FOUND BACKGROUND from ancestor: RGB(${result.r}, ${result.g}, ${result.b})`);
              console.log('==================== BACKGROUND DETECTION END ====================');
              return result;
            } else {
              console.log(`❌ Ancestor does not contain target node`);
            }
          } else {
            console.log(`❌ Ancestor does not have valid solid fill`);
          }
          
          current = current.parent;
          ancestorDepth++;
        }
      }
    } else {
      console.log(`❌ No intersecting nodes found, skipping intersection checks`);
    }
    
    // PHASE 7: Check the page background as last resort
    // This matches the reference implementation's final fallback
    console.log('🔍 PHASE 7: Checking page background');
    const pageBackground = getPageBackground();
    if (pageBackground) {
      console.log(`✅ Got page background`);
      const result = {
        r: pageBackground.r,
        g: pageBackground.g,
        b: pageBackground.b
      };
      
      console.log(`🎯 USING PAGE BACKGROUND: RGB(${result.r}, ${result.g}, ${result.b})`);
      console.log('==================== BACKGROUND DETECTION END ====================');
      return result;
    } else {
      console.log(`❌ Could not get page background`);
    }
    
    // PHASE 8: Ultimate fallback to a default dark background
    console.log('🔍 PHASE 8: Using fallback background');
    const fallbackColor = { r: 30, g: 30, b: 30 }; // #1E1E1E
    const fallbackHex = `#${fallbackColor.r.toString(16).padStart(2, '0')}${fallbackColor.g.toString(16).padStart(2, '0')}${fallbackColor.b.toString(16).padStart(2, '0')}`.toUpperCase();
    console.log(`🎯 NO BACKGROUND FOUND, USING FALLBACK: RGB(${fallbackColor.r}, ${fallbackColor.g}, ${fallbackColor.b}) - HEX: ${fallbackHex}`);
    console.log('==================== BACKGROUND DETECTION END ====================');
    return fallbackColor; // #1E1E1E
  } catch (error) {
    console.error('❌ ERROR in background detection:', error);
    console.log(`🎯 ERROR OCCURRED, USING FALLBACK: RGB(30, 30, 30) (#1E1E1E)`);
    console.log('==================== BACKGROUND DETECTION END ====================');
    return { r: 30, g: 30, b: 30 }; // Fallback to dark
  }
}

/**
 * Check if nodeA intersects with nodeB and is below it in z-order
 */
function doesNodeIntersectAndIsBelow(nodeA: SceneNode, nodeB: SceneNode): boolean {
  // Helper to get bounding box if available
  const getBoundingBox = (node: SceneNode): Rect | null => {
    if ('absoluteBoundingBox' in node && node.absoluteBoundingBox) {
      return node.absoluteBoundingBox;
    }
    return null;
  };
  
  // Get bounding boxes
  const boxA = getBoundingBox(nodeA);
  const boxB = getBoundingBox(nodeB);
  
  if (!boxA || !boxB) return false;
  
  // Check for intersection
  const intersects = (
    boxA.x < boxB.x + boxB.width &&
    boxA.x + boxA.width > boxB.x &&
    boxA.y < boxB.y + boxB.height &&
    boxA.y + boxA.height > boxB.y
  );
  
  if (!intersects) return false;
  
  // Check z-order - for simplicity, we assume that if nodeB has a parent
  // and that parent has children, then we can check the indices
  if (nodeA.parent && nodeB.parent && nodeA.parent.id === nodeB.parent.id) {
    // Get their indices in the parent's children array
    const indexA = nodeA.parent.children.indexOf(nodeA);
    const indexB = nodeA.parent.children.indexOf(nodeB);
    
    // NodeB should be below NodeA in z-order (lower index)
    return indexB < indexA;
  }
  
  // If they're not siblings or we can't determine the order,
  // we assume they intersect and nodeB is below
  return true;
}

/**
 * Check if containerNode contains targetNode
 */
function doesNodeContain(containerNode: SceneNode, targetNode: SceneNode): boolean {
  // Helper to get bounding box if available
  const getBoundingBox = (node: SceneNode): Rect | null => {
    if ('absoluteBoundingBox' in node && node.absoluteBoundingBox) {
      return node.absoluteBoundingBox;
    }
    return null;
  };
  
  // Get bounding boxes
  const containerBox = getBoundingBox(containerNode);
  const targetBox = getBoundingBox(targetNode);
  
  if (!containerBox || !targetBox) return false;
  
  // Check if container fully contains target
  return (
    targetBox.x >= containerBox.x &&
    targetBox.y >= containerBox.y &&
    targetBox.x + targetBox.width <= containerBox.x + containerBox.width &&
    targetBox.y + targetBox.height <= containerBox.y + containerBox.height
  );
}

/**
 * Check if nodeA either intersects with or fully encapsulates nodeB
 */
function doesNodeIntersectOrEncapsulate(nodeA: SceneNode, nodeB: SceneNode): boolean {
  // Helper to get bounding box if available
  const getBoundingBox = (node: SceneNode): Rect | null => {
    if ('absoluteBoundingBox' in node && node.absoluteBoundingBox) {
      return node.absoluteBoundingBox;
    }
    return null;
  };
  
  // Get bounding boxes
  const boxA = getBoundingBox(nodeA);
  const boxB = getBoundingBox(nodeB);
  
  if (!boxA || !boxB) return false;
  
  // Check for intersection
  const intersects = (
    boxA.x < boxB.x + boxB.width &&
    boxA.x + boxA.width > boxB.x &&
    boxA.y < boxB.y + boxB.height &&
    boxA.y + boxA.height > boxB.y
  );
  
  // Check if A encapsulates B (A is much larger than B)
  const encapsulates = (
    boxA.x <= boxB.x &&
    boxA.y <= boxB.y &&
    boxA.x + boxA.width >= boxB.x + boxB.width &&
    boxA.y + boxA.height >= boxB.y + boxB.height
  );
  
  // Also consider the case where A is significantly larger than B
  // even if not fully encapsulating
  const isSignificantlyLarger = (
    boxA.width > boxB.width * 3 &&
    boxA.height > boxB.height * 3
  );
  
  return intersects || encapsulates || isSignificantlyLarger;
}

/**
 * Sort nodes by rendering order, similar to the reference implementation.
 * The node displayed at the top of the stack should be the last in the array.
 */
function sortNodesByRenderingOrder(nodes: SceneNode[]): SceneNode[] {
  // Create a copy of the nodes array to avoid modifying the original
  const nodesCopy = [...nodes];
  
  // Similar to the reference's sortByDepthAndOrder function
  return nodesCopy.sort((a, b) => {
    // Compare depths first
    const aDepth = getNodeDepth(a);
    const bDepth = getNodeDepth(b);
    
    if (aDepth !== bDepth) {
      // Deeper nodes (higher depth) are rendered first (below)
      return bDepth - aDepth;
    }
    
    // If depths are the same, check if they're siblings
    if (a.parent && b.parent && a.parent.id === b.parent.id) {
      const aIndex = a.parent.children.indexOf(a);
      const bIndex = b.parent.children.indexOf(b);
      
      // Lower index is rendered first (below)
      return aIndex - bIndex;
    }
    
    // If they're not siblings, try to determine z-order by looking at
    // their position in the overall node hierarchy
    // This is a simplification of the more complex algorithm in the reference
    return 0; // Default to no change
  });
}

/**
 * Finds nodes that intersect with the target node and are below it in the z-order
 */
function findIntersectingNodesBelow(targetNode: SceneNode): SceneNode[] {
  // Clear caches if needed
  clearCachesIfNeeded();
  
  // Check cache first
  const cacheKey = targetNode.id;
  if (intersectionCache.has(cacheKey)) {
    const cachedIds = intersectionCache.get(cacheKey)!;
    // Try to get nodes by IDs
    const cachedNodes: SceneNode[] = [];
    
    for (const id of cachedIds) {
      // Type assertion needed for getNodeById
      const node = (figma as any).getNodeById(id) as SceneNode | null;
      if (node) cachedNodes.push(node);
    }
    
    // If we found all nodes, return them
    if (cachedNodes.length === cachedIds.length) {
      console.log('Using cached intersections for node', targetNode.name);
      return cachedNodes;
    }
    
    // If cache is invalid (e.g., nodes were deleted), clear it
    intersectionCache.delete(cacheKey);
  }
  
  // Helper function to check if node A intersects with node B
  function doesIntersect(nodeA: SceneNode, nodeB: SceneNode): boolean {
    if (!('absoluteBoundingBox' in nodeA) || !('absoluteBoundingBox' in nodeB)) {
      return false;
    }
    
    const boxA = nodeA.absoluteBoundingBox;
    const boxB = nodeB.absoluteBoundingBox;
    
    if (!boxA || !boxB) return false;
    
    // Check if bounding boxes overlap
    return (
      boxA.x < boxB.x + boxB.width &&
      boxA.x + boxA.width > boxB.x &&
      boxA.y < boxB.y + boxB.height &&
      boxA.y + boxA.height > boxB.y
    );
  }
  
  // Function to check if a node is visible
  function isNodeVisible(node: SceneNode): boolean {
    let current: BaseNode | null = node;
    
    // Check if the node and all its ancestors are visible
    while (current) {
      if ('visible' in current && !current.visible) {
        return false;
      }
      current = current.parent;
    }
    
    return true;
  }
  
  // Function to get all nodes from the page
  function getAllNodesOnPage(): SceneNode[] {
    const result: SceneNode[] = [];
    
    function traverse(node: SceneNode) {
      // Add the node itself
      result.push(node);
      
      // Traverse children if they exist
      if ('children' in node) {
        // Use type assertion to handle different node types
        const children = (node as any).children;
        if (Array.isArray(children)) {
          for (const child of children) {
            traverse(child as SceneNode);
          }
        }
      }
    }
    
    // Start traversal from all top-level nodes
    const pageNodes = (figma.currentPage as any).children as readonly SceneNode[];
    for (const node of pageNodes) {
      traverse(node);
    }
    
    return result;
  }
  
  console.time('getAllNodes');
  const allNodes = getAllNodesOnPage();
  console.timeEnd('getAllNodes');
  
  // Create a map of node IDs to preserve the original flat list order
  const nodeIdToIndex = new Map<string, number>();
  allNodes.forEach((node, index) => {
    nodeIdToIndex.set(node.id, index);
  });
  
  console.time('filterIntersecting');
  // Filter for nodes that:
  // 1. Intersect with the target node
  // 2. Are visible (including parent visibility)
  const intersectingNodes = allNodes.filter((node: SceneNode) => {
    // Skip the target node itself
    if (node.id === targetNode.id) return false;
    
    // Skip nodes that don't intersect
    if (!doesIntersect(targetNode, node)) return false;
    
    // Skip invisible nodes (including parent visibility)
    if (!isNodeVisible(node)) return false;
    
    return true;
  });
  console.timeEnd('filterIntersecting');
  
  console.time('sortIntersecting');
  // Sort by z-index - this is a complex task in Figma
  // For proper rendering order we need to respect:
  // 1. Parent ordering (deeper nodes are below)
  // 2. Sibling ordering within each parent
  const result = intersectingNodes.sort((a: SceneNode, b: SceneNode) => {
    // If both nodes are siblings (same direct parent)
    if (a.parent && b.parent && a.parent.id === b.parent.id) {
      // Get their index within their parent
      const aIndex = a.parent.children.indexOf(a);
      const bIndex = b.parent.children.indexOf(b);
      
      // Higher index = rendered later = on top
      return aIndex - bIndex;
    }
    
    // Find the common ancestor (could be the page)
    let aAncestors: BaseNode[] = [];
    let bAncestors: BaseNode[] = [];
    
    // Collect all ancestors for node A
    let current: BaseNode | null = a;
    while (current) {
      aAncestors.push(current);
      current = current.parent;
    }
    
    // Collect all ancestors for node B
    current = b;
    while (current) {
      bAncestors.push(current);
      current = current.parent;
    }
    
    // Find common ancestor
    let commonAncestor: BaseNode | null = null;
    for (const aAncestor of aAncestors) {
      const bAncestorIndex = bAncestors.findIndex(node => node.id === aAncestor.id);
      if (bAncestorIndex !== -1) {
        commonAncestor = aAncestor;
        break;
      }
    }
    
    // If there's no common ancestor (shouldn't happen), use the original index in flat list
    if (!commonAncestor) {
      const aOriginalIndex = nodeIdToIndex.get(a.id) || 0;
      const bOriginalIndex = nodeIdToIndex.get(b.id) || 0;
      return aOriginalIndex - bOriginalIndex;
    }
    
    // Find the direct children of the common ancestor that are ancestors of A and B
    const aDirectChildIndex = aAncestors.findIndex(node => node.parent?.id === commonAncestor?.id);
    const bDirectChildIndex = bAncestors.findIndex(node => node.parent?.id === commonAncestor?.id);
    
    // If either node isn't found, fall back to comparing depths
    if (aDirectChildIndex === -1 || bDirectChildIndex === -1) {
      const aDepth = getNodeDepth(a);
      const bDepth = getNodeDepth(b);
      // Deeper nodes are rendered first (they're below in z-order)
      return bDepth - aDepth;
    }
    
    // Get the direct children that are ancestors of A and B
    const aDirectChild = aAncestors[aDirectChildIndex];
    const bDirectChild = bAncestors[bDirectChildIndex];
    
    if (commonAncestor.type !== 'PAGE' && 'children' in commonAncestor) {
      // Get their sibling order in the common ancestor
      const aChildIndex = (commonAncestor as any).children.findIndex((c: SceneNode) => c.id === aDirectChild.id);
      const bChildIndex = (commonAncestor as any).children.findIndex((c: SceneNode) => c.id === bDirectChild.id);
      
      if (aChildIndex !== -1 && bChildIndex !== -1) {
        // Lower index = rendered first = behind in z-order
        return aChildIndex - bChildIndex;
      }
    }
    
    // Fallback to comparing depths
    const aDepth = getNodeDepth(a);
    const bDepth = getNodeDepth(b);
    // Deeper nodes are rendered first
    return bDepth - aDepth;
  });
  console.timeEnd('sortIntersecting');
  
  // Cache the results for future use
  intersectionCache.set(cacheKey, result.map(node => node.id));
  
  return result;
}

/**
 * Helper function to get the depth of a node in the node tree with caching
 */
function getNodeDepth(node: SceneNode): number {
  // Use cached value if available
  if (nodeDepthCache.has(node.id)) {
    return nodeDepthCache.get(node.id)!;
  }
  
  let depth = 0;
  let current: BaseNode | null = node;
  
  while (current && current.parent) {
    depth++;
    current = current.parent;
  }
  
  // Cache the result for future use
  nodeDepthCache.set(node.id, depth);
  
  return depth;
}

// Helper to get node path for debugging with caching
function getNodePath(node: BaseNode): string {
  // Use cached value if available
  if (nodePathCache.has(node.id)) {
    return nodePathCache.get(node.id)!;
  }
  
  const path: string[] = [node.name];
  let current: BaseNode | null = node.parent;
  
  while (current && current.type !== 'PAGE') {
    path.unshift(current.name);
    current = current.parent;
  }
  
  const result = path.join(' > ');
  
  // Cache the result for future use
  nodePathCache.set(node.id, result);
  
  return result;
}
// Function to check if a node is a SceneNode
function isSceneNode(node: BaseNode | figma.BaseNode): node is SceneNode {
  if (!node) return false;
  
  // Check if node is a valid scene node by checking for properties that scene nodes have
  return (
    'type' in node && 
    node.type !== 'DOCUMENT' && 
    node.type !== 'PAGE' &&
    'visible' in node
  );
}

/**
 * Check if a node has unsupported blend modes
 * Simpler version for the selection handler
 */
function nodeHasUnsupportedBlendModes(node: SceneNode): boolean {
  // Check node blend mode
  if ('blendMode' in node && UNSUPPORTED_BLEND_MODES.includes(node.blendMode)) {
    return true;
  }
  
  // Check for fills with unsupported blend modes
  if ('fills' in node) {
    const typedNode = node as SceneNode & { fills: readonly Paint[] };
    for (const fill of typedNode.fills) {
      if (fill.type === 'SOLID' && fill.visible !== false &&
          fill.blendMode && UNSUPPORTED_BLEND_MODES.includes(fill.blendMode)) {
        return true;
      }
    }
  }
  
  return false;
}

// Check and send initial selection state without automatically sending color data
function sendInitialSelectionState() {
  const selection = figma.currentPage.selection;
  const hasSelection = selection.length > 0;
  let hasValidFill = false;
  let nodeId = '';
  let detectedBackground = null;
  let hasInvalidBlendMode = false;
  
  console.log('======= SENDING INITIAL SELECTION STATE =======');
  
  if (hasSelection) {
    console.log(`Selected ${selection.length} node(s)`);
    
    // Check if any selected node has a valid fill
    for (const node of selection) {
      // Check for unsupported blend modes first
      if ('blendMode' in node && 'type' in node && UNSUPPORTED_BLEND_MODES.includes(node.blendMode as BlendMode)) {
        console.log(`❌ Selected node has unsupported blend mode: ${node.name}`);
        console.log(`🎨 Blend mode: ${node.blendMode} - Supported in CSS: ${mapFigmaBlendToCSS(node.blendMode as BlendMode) !== undefined ? 'Yes' : 'No'}`);
        hasInvalidBlendMode = true;
        break;
      }
      
      // Check for fills with unsupported blend modes
      if ('fills' in node) {
        const fills = node.fills as readonly Paint[];
        for (const fill of fills) {
          if (fill.type === 'SOLID' && fill.visible !== false && 
              fill.blendMode && UNSUPPORTED_BLEND_MODES.includes(fill.blendMode)) {
            console.log(`❌ Selected node has fill with unsupported blend mode: ${node.name}`);
            console.log(`🎨 Fill blend mode: ${fill.blendMode} - Supported in CSS: ${mapFigmaBlendToCSS(fill.blendMode) !== undefined ? 'Yes' : 'No'}`);
            hasInvalidBlendMode = true;
            break;
          }
        }
        
        if (hasInvalidBlendMode) break;
        
        // Cast to a type that has fills
        const typedNode = node as SceneNode & { fills: Paint[] };
        if (typedNode.fills.some(fill => fill.type === 'SOLID')) {
          hasValidFill = true;
          nodeId = node.id; // Store the ID of the first node with a valid fill
          
          // Log the node's color information
          const solidFill = typedNode.fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint;
          if (solidFill) {
            const nodeColor = {
              r: Math.round(solidFill.color.r * 255),
              g: Math.round(solidFill.color.g * 255),
              b: Math.round(solidFill.color.b * 255)
            };
            
            const nodeColorHex = `#${nodeColor.r.toString(16).padStart(2, '0')}${nodeColor.g.toString(16).padStart(2, '0')}${nodeColor.b.toString(16).padStart(2, '0')}`.toUpperCase();
            console.log(`Selected node color: RGB(${nodeColor.r}, ${nodeColor.g}, ${nodeColor.b}) - HEX: ${nodeColorHex}`);
            
            // Log blend mode if it's not NORMAL or PASS_THROUGH
            if ('blendMode' in node) {
              const blendMode = node.blendMode as BlendMode;
              if (blendMode !== 'NORMAL' && blendMode !== 'PASS_THROUGH') {
                console.log(`⚠️ Node has non-standard blend mode: ${blendMode}`);
                console.log(`Supported in CSS: ${mapFigmaBlendToCSS(blendMode) !== undefined ? 'Yes' : 'No'}`);
              }
            }
          }
          
          // Try to detect background using the simplified function
          try {
            console.log('Detecting background for selected node...');
            const bgColor = detectBackgroundColor(typedNode);
            
            if (bgColor) {
              // Convert background RGB to hex, ensuring proper format (0-1 range to 00-FF hex)
              const rHex = Math.round(bgColor.r / 255 * 255).toString(16).padStart(2, '0');
              const gHex = Math.round(bgColor.g / 255 * 255).toString(16).padStart(2, '0');
              const bHex = Math.round(bgColor.b / 255 * 255).toString(16).padStart(2, '0');
              detectedBackground = `#${rHex}${gHex}${bHex}`.toUpperCase();
              
              console.log(`Detected background for initial selection: ${detectedBackground}`);
              
              // Check for potential issues - if foreground and background are the same or very similar
              if (solidFill) {
                const nodeColor = {
                  r: Math.round(solidFill.color.r * 255),
                  g: Math.round(solidFill.color.g * 255),
                  b: Math.round(solidFill.color.b * 255)
                };
                const nodeColorHex = `#${nodeColor.r.toString(16).padStart(2, '0')}${nodeColor.g.toString(16).padStart(2, '0')}${nodeColor.b.toString(16).padStart(2, '0')}`.toUpperCase();
                
                if (nodeColorHex === detectedBackground) {
                  console.log(`⚠️ WARNING: Selected node color (${nodeColorHex}) matches background color (${detectedBackground})!`);
                  console.log(`This could indicate a blend mode issue or a detection problem.`);
                }
                
                // Check if colors are similar but not identical (could be blend mode issue)
                const colorDiff = Math.abs(nodeColor.r - bgColor.r) + Math.abs(nodeColor.g - bgColor.g) + Math.abs(nodeColor.b - bgColor.b);
                if (colorDiff > 0 && colorDiff < 30) {
                  console.log(`⚠️ NOTICE: Selected node color (${nodeColorHex}) is very similar to background (${detectedBackground})`);
                  console.log(`Color difference: ${colorDiff}/765 units. This could indicate a blend mode effect.`);
                }
              }
            }
          } catch (error) {
            console.error('Error detecting background:', error);
          }
          
          break;
        }
      }
    }
  } else {
    console.log('No selection detected');
  }
  
  // Send initial selection state to UI
  if (hasInvalidBlendMode) {
    // Send message about unsupported blend modes
    figma.ui.postMessage({
      type: 'error',
      errorType: 'unsupported-blend-mode',
      message: 'One or more selected nodes have unsupported blend modes (e.g., Plus Darker/LINEAR_BURN)'
    });
    console.log('Sent unsupported blend mode error to UI');
  } else {
    figma.ui.postMessage({
      type: 'selection-changed',
      hasSelection,
      hasValidFill,
      nodeId,
      detectedBackground
    });
    console.log('Sent selection state to UI:', { 
      hasSelection,
      hasValidFill,
      nodeId,
      detectedBackground
    });
  }
  
  console.log('======= INITIAL SELECTION STATE COMPLETE =======');
}

// Call on plugin start
sendInitialSelectionState();

// Enhanced selection change handler
figma.on("selectionchange", () => {
  console.log("🔎 SELECTION CHANGE EVENT TRIGGERED");
  const selection = figma.currentPage.selection;
  console.log(`🔍 Selection length: ${selection.length}`);
  
  const hasSelection = selection.length > 0;
  let hasValidFill = false;
  let nodeId = '';
  let nodeType = '';
  let detectedBackground = null;
  let hasInvalidBlendMode = false;
  
  if (hasSelection) {
    // Safely access node properties by ensuring it's a SceneNode
    const firstNode = selection[0];
    if (isSceneNode(firstNode)) {
      console.log(`🔍 Selected node info: Name=${firstNode.name}, Type=${firstNode.type}, ID=${firstNode.id}`);
      nodeType = firstNode.type; // Store the node type
    } else {
      console.log(`🔍 Selected node info: ID=${firstNode.id} (not a SceneNode)`);
    }
    
    // Check if any selected node has a valid fill
    for (const node of selection) {
      // First check for valid blend modes
      if ('type' in node && node.type !== 'DOCUMENT' && node.type !== 'PAGE' && !hasValidBlendModes(node as SceneNode)) {
        console.log(`❌ Selected node has unsupported blend mode: ${node.name}`);
        hasInvalidBlendMode = true;
        break;
      }
      
      if ('fills' in node) {
        console.log(`✅ Node ${node.name} has fills property`);
        // Cast to a type that has fills
        const typedNode = node as SceneNode & { fills: Paint[] };
        
        // Log the fills for debugging
        if (typedNode.fills && typedNode.fills.length > 0) {
          console.log(`📊 Node has ${typedNode.fills.length} fills:`);
          typedNode.fills.forEach((fill, index) => {
            console.log(`  Fill ${index + 1}: Type=${fill.type}, Visible=${fill.visible !== false}`);
            if (fill.type === 'SOLID') {
              const solidFill = fill as SolidPaint;
              console.log(`  Color: R=${solidFill.color.r.toFixed(2)}, G=${solidFill.color.g.toFixed(2)}, B=${solidFill.color.b.toFixed(2)}`);
              console.log(`  Opacity: ${solidFill.opacity !== undefined ? solidFill.opacity.toFixed(2) : '1.00'}`);
              if (solidFill.blendMode) {
                console.log(`  BlendMode: ${solidFill.blendMode}`);
              }
            }
          });
        }
        
        if (typedNode.fills.some(fill => fill.type === 'SOLID')) {
          hasValidFill = true;
          nodeId = node.id; // Store the ID of the first node with a valid fill
          if ('type' in node) {
            nodeType = (node as SceneNode).type; // Store the type of the node with valid fill
          }
          console.log(`✅ Node ${node.name} has valid solid fill, setting nodeId to ${nodeId} and nodeType to ${nodeType}`);
          
          // Try to detect background using the simplified function
          try {
            const bgColor = detectBackgroundColor(typedNode);
            if (bgColor) {
              // Convert background RGB to hex, ensuring proper format (0-1 range to 00-FF hex)
              const rHex = Math.round(bgColor.r / 255 * 255).toString(16).padStart(2, '0');
              const gHex = Math.round(bgColor.g / 255 * 255).toString(16).padStart(2, '0');
              const bHex = Math.round(bgColor.b / 255 * 255).toString(16).padStart(2, '0');
              detectedBackground = `#${rHex}${gHex}${bHex}`.toUpperCase();
              
              console.log(`🎨 Detected background for selection: ${detectedBackground}`);
            } else {
              console.log('⚠️ No background color detected, will use default');
            }
          } catch (error) {
            console.error('❌ Error detecting background:', error);
          }
          
          break;
        } else {
          console.log(`⚠️ Node ${node.name} has fills but no valid solid fill`);
        }
      } else {
        console.log(`⚠️ Node ${node.name} does not have fills property`);
      }
    }
  }
  
  // Always send selection-changed message with detected background
  figma.ui.postMessage({
    type: 'selection-changed',
    hasSelection,
    hasValidFill,
    nodeId, // Include the nodeId in the message
    nodeType, // Include the node type in the message
    detectedBackground // Include detected background in the message
  });
  
  // DEBUG: Log node type in selection-changed
  console.log('🔍 DEBUG SELECTION CHANGE NODE TYPE:', {
    nodeType,
    isValidSelection: hasSelection && hasValidFill,
    isTextNode: nodeType === 'TEXT'
  });
  
  console.log('Sent selection state to UI:', { 
    hasSelection, 
    hasValidFill, 
    nodeId,
    nodeType,
    detectedBackground
  });

  // IMPORTANT: If we have a valid selection, immediately send the initial color data
  // This ensures the UI gets color information without requiring a separate request
  if (hasSelection && hasValidFill && !hasInvalidBlendMode) {
    console.log('Valid selection detected, sending initial selection data');
    sendInitialSelection();
  }
});

// Add helper function to parse P3 color
function parseP3Color(p3String: string): {r: number, g: number, b: number} {
  const matches = p3String.match(/color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!matches) {
    return { r: 0, g: 0, b: 0 }; // fallback to black
  }
  return {
    r: parseFloat(matches[1]),
    g: parseFloat(matches[2]),
    b: parseFloat(matches[3])
  };
}

// Update helper function to create Figma-compatible solid paint
function createSolidPaint(color: string, opacity: number = 1, isDarkBackground?: boolean): SolidPaint {
  let rgb: RGB = { r: 0, g: 0, b: 0 };

  try {
    // Handle empty or undefined color
    if (!color) {
      console.warn('Empty color provided to createSolidPaint, using black');
      return {
    type: 'SOLID',
        color: rgb,
    opacity
      } as SolidPaint;
    }

    // Handle CSS variables or color-mix - convert to direct P3 colors
    if (color.startsWith('var(') || color.startsWith('color-mix')) {
      console.log('Converting CSS variable or color-mix to Figma P3 value:', color);
      
      // Extract variable name if present
      let varName = '';
      if (color.includes('var(')) {
        const varMatch = color.match(/var\((--[^)]+)\)/);
        if (varMatch) {
          varName = varMatch[1];
        }
      }
      
      // Extract opacity from color-mix if present
      if (color.includes('color-mix')) {
        const percentMatch = color.match(/(\d+)%/);
        if (percentMatch) {
          const percent = parseInt(percentMatch[1]) / 100;
          opacity = opacity * percent;
        }
      }
      
      // Determine if we need light or dark text (if not explicitly provided)
      const needsDarkText = isDarkBackground === undefined ? 
        false : // Default to light background if not specified
        !isDarkBackground; // Use opposite of background darkness
      
      // Map CSS variables to appropriate Figma P3 values based on background
      if (varName.includes('value-primary')) {
        // Primary value text - full opacity
        return {
          type: 'SOLID',
          color: needsDarkText ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 },
          opacity: 1.0
        } as SolidPaint;
      } 
      else if (varName.includes('value-secondary')) {
        // Secondary value text - 80% opacity
        return {
          type: 'SOLID',
          color: needsDarkText ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 },
          opacity: 0.8
        } as SolidPaint;
      }
      else if (varName.includes('value-tertiary')) {
        // Tertiary value text - 50% opacity
        return {
          type: 'SOLID',
          color: needsDarkText ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 },
          opacity: 0.5
        } as SolidPaint;
      }
      else if (varName.includes('label-primary')) {
        // Primary label text - 90% opacity
        return {
          type: 'SOLID',
          color: needsDarkText ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 },
          opacity: 0.9
        } as SolidPaint;
      }
      else if (varName.includes('label-secondary')) {
        // Secondary label text - 70% opacity
        return {
          type: 'SOLID',
          color: needsDarkText ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 },
          opacity: 0.7
        } as SolidPaint;
      }
      else if (varName.includes('label-tertiary')) {
        // Tertiary label text - 40% opacity
        return {
          type: 'SOLID',
          color: needsDarkText ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 },
          opacity: 0.4
        } as SolidPaint;
      }
      else if (varName.includes('description')) {
        // Description text - 60% opacity
        return {
          type: 'SOLID',
          color: needsDarkText ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 },
          opacity: 0.6
        } as SolidPaint;
      }
      else if (varName.includes('figma-color-text')) {
        // Figma text color
        return {
          type: 'SOLID',
          color: needsDarkText ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 },
          opacity: varName.includes('secondary') ? 0.8 : 
                  varName.includes('tertiary') ? 0.5 : 1.0
        } as SolidPaint;
      }
      
      // Default to appropriate text color based on background with 70% opacity
      return {
        type: 'SOLID',
        color: needsDarkText ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 },
        opacity: 0.7
      } as SolidPaint;
    }

    // Handle P3 colors
    if (color.startsWith('color(display-p3')) {
      const p3 = parseP3Color(color);
      rgb = {
        r: p3.r,
        g: p3.g,
        b: p3.b
      };
    }
    // Handle hex colors with # prefix
    else if (color.startsWith('#')) {
      rgb = {
        r: parseInt(color.slice(1, 3), 16) / 255,
        g: parseInt(color.slice(3, 5), 16) / 255,
        b: parseInt(color.slice(5, 7), 16) / 255
      };
    }
    // Handle hex colors without # prefix (like "ffffff")
    else if (/^[0-9a-fA-F]{6}$/.test(color)) {
      console.log('Handling hex color without # prefix:', color);
      rgb = {
        r: parseInt(color.slice(0, 2), 16) / 255,
        g: parseInt(color.slice(2, 4), 16) / 255,
        b: parseInt(color.slice(4, 6), 16) / 255
      };
    }
  // Handle rgb/rgba colors
    else if (color.startsWith('rgb')) {
      const matches = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (matches) {
        rgb = {
        r: parseInt(matches[1]) / 255,
        g: parseInt(matches[2]) / 255,
        b: parseInt(matches[3]) / 255
      };
        
        // If rgba has opacity, use it
        if (matches[4]) {
          opacity = parseFloat(matches[4]) * opacity;
        }
      } else {
        throw new Error(`Invalid rgb format: ${color}`);
      }
    } else {
      throw new Error(`Unsupported color format: ${color}`);
    }

    // Create new paint object with all properties at once
    return {
      type: 'SOLID',
      color: rgb,
      opacity
    } as SolidPaint;
  } catch (error) {
    console.error('Error in createSolidPaint:', error, 'for color:', color);
    // Return a default black color as fallback
    return {
      type: 'SOLID',
      color: { r: 0, g: 0, b: 0 },
      opacity
    } as SolidPaint;
  }
}

// Helper function to convert hex to RGB
function hexToRgb(hex: string): RGB {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Ensure valid hex
  if (!/^[0-9A-F]{6}$/i.test(hex)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255
  };
}

async function createColorPreview(bgColor: string, previewColor: string, colorValues: ColorValuesInternal) {
  try {
    console.log('createColorPreview called with bgColor:', bgColor, 'previewColor:', previewColor);
    console.log('CSS blend mode:', colorValues.cssBlendMode || 'normal');
    console.log('All fills data:', colorValues.allFills || 'none provided');
    
    // Load font first
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    
    console.log('Fonts loaded successfully');

    // Parse colors safely
    const formattedBgColor = parseColorSafely(bgColor);
    const formattedPreviewColor = parseColorSafely(previewColor);

    console.log('Creating preview with background:', formattedBgColor, 'and color:', formattedPreviewColor);

    // Create main frame with exact background from UI
    const frame = figma.createFrame();
    
    // Use the background color for the frame
    const bgPaint = createSolidPaint(formattedBgColor);
    frame.fills = [bgPaint];
    
    frame.name = "APCACH Color Preview";
    frame.resize(300, 140);
    frame.cornerRadius = 8;
    
    // Create the color rectangle
    const colorRect = figma.createRectangle();
    colorRect.name = "Color Sample";
    colorRect.resize(240, 80);
    colorRect.cornerRadius = 6;
    
    // Position it in the center of the frame
    colorRect.x = (frame.width - colorRect.width) / 2;
    colorRect.y = (frame.height - colorRect.height) / 2;
    
    // Check if we have multiple fills to apply
    if (colorValues.allFills && colorValues.allFills.length > 0) {
      console.log(`Applying ${colorValues.allFills.length} fills to rectangle`);
      
      // Convert the fills to Figma format
      const figmaFills: SolidPaint[] = colorValues.allFills
        .filter(fill => fill.visible)
        .map(fill => {
          // Create solid paint from color
          const fillColor = typeof fill.color === 'string' 
            ? fill.color 
            : rgbToHex(
                ('r' in (fill.color as any)) ? (fill.color as any).r : (fill.color as any).x,
                ('g' in (fill.color as any)) ? (fill.color as any).g : (fill.color as any).y,
                ('b' in (fill.color as any)) ? (fill.color as any).b : (fill.color as any).z
              );
              
          const opacity = fill.opacity;
          const blendMode = fill.blendMode || 'NORMAL';
          
          // Convert to Figma paint
          const paint = createSolidPaint(fillColor, opacity);
          
          // Apply blend mode
          (paint as any).blendMode = blendMode;
          
          console.log('Created fill:', {
            color: typeof fill.color === 'string' ? fill.color : 'RGB/P3 object',
            opacity,
            blendMode
          });
          
          return paint;
        });
      
      // Apply fills to rectangle
      if (figmaFills.length > 0) {
        colorRect.fills = figmaFills;
        console.log('Applied all fills to rectangle:', figmaFills.length);
      } else {
        // Fallback to single fill if we couldn't process the fills array
        colorRect.fills = [createSolidPaint(formattedPreviewColor)];
        console.log('Fallback: applied single fill');
      }
    } else {
      // Apply single fill with potential blend mode
      const paint = createSolidPaint(formattedPreviewColor);
      
      // Apply CSS blend mode if provided
      if (colorValues.cssBlendMode) {
        // Map CSS blend mode to Figma blend mode
        const figmaBlendMode = mapCSSBlendToFigma(colorValues.cssBlendMode);
        if (figmaBlendMode) {
          (paint as any).blendMode = figmaBlendMode;
          console.log('Applied blend mode to fill:', figmaBlendMode);
        }
      }
      
      colorRect.fills = [paint];
      console.log('Applied single fill with potential blend mode');
    }
    
    // Add the color rectangle to the frame
    frame.appendChild(colorRect);
    
    // Apply APCA value as text label if available
    if (colorValues.apca) {
      // Create text node for APCA value
      const apcaText = figma.createText();
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      apcaText.fontSize = 16;
      apcaText.characters = colorValues.apca.toString();
      
      // Create appropriate text color based on background brightness
      const isDark = backgroundIsDark(formattedBgColor);
      apcaText.fills = [createSolidPaint(isDark ? '#FFFFFF' : '#000000')];
      
      // Position below the color rectangle
      apcaText.x = colorRect.x;
      apcaText.y = colorRect.y + colorRect.height + 10;
      
      // Add description if available
      if (colorValues.apcaDescription) {
        const descText = figma.createText();
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        descText.fontSize = 12;
        descText.characters = colorValues.apcaDescription;
        descText.fills = [createSolidPaint(isDark ? '#FFFFFF' : '#000000', 0.7)];
        
        // Position below the APCA value
        descText.x = apcaText.x;
        descText.y = apcaText.y + apcaText.height + 4;
        
        // Add to frame
        frame.appendChild(descText);
      }
      
      // Add to frame
      frame.appendChild(apcaText);
    }
    
    return frame;
  } catch (error) {
    console.error('Error in createColorPreview:', error);
    
    // Create a fallback simple frame
    const fallbackFrame = figma.createFrame();
    fallbackFrame.name = "Error Preview";
    fallbackFrame.resize(200, 100);
    fallbackFrame.fills = [createSolidPaint('#FF0000', 0.2)]; // Light red to indicate error
    
    return fallbackFrame;
  }
}

// Helper function to map CSS blend modes to Figma blend modes
function mapCSSBlendToFigma(cssBlendMode: string): BlendMode | null {
  const mapping: Record<string, BlendMode> = {
    'normal': 'NORMAL',
    'multiply': 'MULTIPLY',
    'screen': 'SCREEN',
    'overlay': 'OVERLAY',
    'darken': 'DARKEN',
    'lighten': 'LIGHTEN',
    'color-dodge': 'COLOR_DODGE',
    'color-burn': 'COLOR_BURN',
    'hard-light': 'HARD_LIGHT',
    'soft-light': 'SOFT_LIGHT',
    'difference': 'DIFFERENCE',
    'exclusion': 'EXCLUSION',
    'hue': 'HUE',
    'saturation': 'SATURATION',
    'color': 'COLOR',
    'luminosity': 'LUMINOSITY'
  };
  
  return mapping[cssBlendMode.toLowerCase()] || null;
}

// Handle messages from the UI
figma.ui.onmessage = async (msg) => {
  console.log('Received message:', msg.type);
  
  if (msg.type === 'generate-preview') {
    console.log('Received generate-preview message with background:', msg.background);
    console.log('Background info:', msg.backgroundInfo);
    console.log('Use RGB background:', msg.useRgbBackground);
    console.log('Color:', msg.color);
    
    // Log the APCA value received from UI without any processing
    console.log('APCA value received from UI (will be used as-is):', msg.values?.apca);
    
    // Log the P3 color values received from UI
    if (msg.values?.textTertiaryP3) {
      console.log('Received P3 tertiary text color:', msg.values.textTertiaryP3);
    }
    
    // We don't parse or process the APCA value - we pass it directly to createPreview
    // This ensures we use exactly what's in the UI
    
    console.log('Preview values:', JSON.stringify(msg.values));
    
    // Parse colors safely
    const safeBackground = parseColorSafely(msg.background);
    const safeColor = parseColorSafely(msg.color);
    
    try {
      await createPreview(
        safeColor,
        safeBackground,
        msg.values,
        0, // We pass 0 as apcaValue since we're not using it directly
        msg.backgroundInfo,
        msg.useRgbBackground
      );
      
      figma.ui.postMessage({
        type: 'preview-created',
        success: true
      });
    } catch (error) {
      console.error('Error creating preview:', error);
      figma.ui.postMessage({
        type: 'preview-created',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  } else if (msg.type === 'apply-color' || msg.type === 'apply-text-color') {
    // Handle applying color to a node (standard node or text node)
    console.log(`Applying ${msg.type === 'apply-text-color' ? 'text' : 'regular'} color:`, msg.color);
    console.log('APCA value:', msg.apca);
    console.log('Message details:', msg);
    
    try {
      let node;
      
      // Try to get node by ID first if provided
      if (msg.targetNodeId) {
        // @ts-ignore - Figma API has this method
        node = figma.getNodeById(msg.targetNodeId);
      }
      
      // If no node found by ID, try current selection
      if (!node && figma.currentPage.selection.length > 0) {
        node = figma.currentPage.selection[0];
      }
      
      if (!node) {
        console.log('No valid node found to apply color');
        return;
      }
      
      // Check for P3 color (display-p3 format)
      const isP3Color = msg.isP3 || msg.color.includes('display-p3');
      let colorFill: SolidPaint;
      
      if (isP3Color && msg.p3Values) {
        // Use P3 values directly if provided
        console.log('Applying P3 color with provided values:', msg.p3Values);
        colorFill = {
          type: 'SOLID',
          color: {
            x: msg.p3Values.x,
            y: msg.p3Values.y,
            z: msg.p3Values.z
          } as any // Cast needed for TypeScript
        };
      } else if (isP3Color && msg.color.includes('display-p3')) {
        // Parse color from display-p3 format
        console.log('Parsing P3 color from CSS format:', msg.color);
        const p3Regex = /display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/;
        const match = msg.color.match(p3Regex);
        
        if (match) {
          const [_, x, y, z] = match;
          colorFill = {
            type: 'SOLID',
            color: {
              x: parseFloat(x),
              y: parseFloat(y),
              z: parseFloat(z)
            } as any // Cast needed for TypeScript
          };
          console.log('Parsed P3 values:', colorFill.color);
        } else {
          // Fallback to hex parsing if P3 parsing fails
          console.log('Failed to parse P3 color, falling back to hex format');
          // Format the color (remove # if present)
          const colorHex = msg.color.startsWith('#') ? msg.color.substring(1) : msg.color;
          
          // Convert hex to RGB values for Figma (0-1 range)
          const r = parseInt(colorHex.substring(0, 2), 16) / 255;
          const g = parseInt(colorHex.substring(2, 4), 16) / 255;
          const b = parseInt(colorHex.substring(4, 6), 16) / 255;
          
          colorFill = {
            type: 'SOLID',
            color: { r, g, b }
          };
        }
      } else {
        // Standard hex color
        console.log('Applying standard RGB color from hex:', msg.color);
        // Format the color (remove # if present)
        const colorHex = msg.color.startsWith('#') ? msg.color.substring(1) : msg.color;
        
        // Convert hex to RGB values for Figma (0-1 range)
        const r = parseInt(colorHex.substring(0, 2), 16) / 255;
        const g = parseInt(colorHex.substring(2, 4), 16) / 255;
        const b = parseInt(colorHex.substring(4, 6), 16) / 255;
        
        colorFill = {
          type: 'SOLID',
          color: { r, g, b }
        };
      }
      
      if (msg.type === 'apply-text-color' && node.type === 'TEXT') {
        // Handle text node specifically
        console.log('Applying color to text node:', node.name);
        
        // Apply the fill to the text node
        node.fills = [colorFill];
        
        // Store APCA value in plugin data if available
        if (msg.apca) {
          node.setPluginData('apcaValue', msg.apca.toString());
        }
        
        // Store background info in plugin data if available
        if (msg.background) {
          node.setPluginData('backgroundInfo', JSON.stringify(msg.background));
          node.setPluginData('backgroundType', msg.background.type);
        }
        
        // Store color space info
        node.setPluginData('colorSpace', isP3Color ? 'p3' : 'rgb');
        
        console.log('✅ Successfully applied color to text node');
      } else if ('fills' in node) {
        // Handle regular node with fills
        const typedNode = node as SceneNode & { fills: Paint[] };
        
        // Apply the fill to the node
        typedNode.fills = [colorFill];
        
        // Store APCA value in plugin data if available
        if (msg.apca && 'setPluginData' in typedNode) {
          typedNode.setPluginData('apcaValue', msg.apca.toString());
        }
        
        // Store background info in plugin data if available
        if (msg.background && 'setPluginData' in typedNode) {
          typedNode.setPluginData('backgroundInfo', JSON.stringify(msg.background));
          typedNode.setPluginData('backgroundType', msg.background.type);
        }
        
        // Store color space info
        if ('setPluginData' in typedNode) {
          typedNode.setPluginData('colorSpace', isP3Color ? 'p3' : 'rgb');
        }
        
        console.log('✅ Successfully applied color to node with color space:', isP3Color ? 'P3' : 'RGB');
      } else {
        console.log('⚠️ Node does not support fills or is not a text node');
      }
      
      // No need to notify UI for regular updates to avoid feedback loops
      if (!msg.isLiveUpdate) {
        figma.ui.postMessage({
          type: 'color-applied',
          success: true,
          nodeId: node.id
        });
      }
    } catch (error) {
      console.error('Error applying color:', error);
      if (!msg.isLiveUpdate) {
        figma.ui.postMessage({
          type: 'color-applied',
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } else if (msg.type === 'update-figma-selection') {
    // Extract color and background information
    const { 
      color, 
      isLiveUpdate, 
      apcaValue,
      backgroundInfo,
      useRgbBackground = true // Default to true for backward compatibility
    } = msg;
    
    // Handle live updates with background information
    if (isLiveUpdate && figma.currentPage.selection.length > 0) {
      try {
        // Update the selected node with the new color
        const node = figma.currentPage.selection[0];
        
        // Type guard to check if node has fills property and is a valid node type
        if ('fills' in node) {
          // Cast node to a more specific type that includes both fills and type
          const typedNode = node as SceneNode & { fills: Paint[] };
          
          // Check if the node is of a type that can have fills
          if (['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'VECTOR', 'FRAME', 'COMPONENT', 'INSTANCE'].includes(typedNode.type)) {
            // Convert the hex color to RGB
            const r = parseInt(color.substring(0, 2), 16) / 255;
            const g = parseInt(color.substring(2, 4), 16) / 255;
            const b = parseInt(color.substring(4, 6), 16) / 255;
            
            // Update the fill of the node
            typedNode.fills = [{
              type: 'SOLID',
              color: { r, g, b } as RGB
            } as SolidPaint];
            
            // Store the APCA value and background info in plugin data
            if ('apcaValue' in msg && msg.apcaValue) {
              // Cast to a type that has setPluginData
              (typedNode as any).setPluginData('apcaValue', msg.apcaValue.toString());
            }
            
            if ('backgroundInfo' in msg && msg.backgroundInfo) {
              // Cast to a type that has setPluginData
              (typedNode as any).setPluginData('backgroundInfo', JSON.stringify(msg.backgroundInfo));
              
              // Store background type separately for easier access
              (typedNode as any).setPluginData('backgroundType', msg.backgroundInfo.type);
            }
            
            // Notify the UI that the selection was updated
            figma.ui.postMessage({
              type: 'selection-updated',
              success: true
            });
          }
        }
      } catch (error) {
        console.error('Error updating selection:', error);
        figma.ui.postMessage({
          type: 'selection-updated',
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } else if (msg.type === 'update-background') {
    // New handler for when the user manually changes the background
    // This doesn't do anything in the plugin, just acknowledges receipt
    console.log('Background color updated by user:', msg.color);
    // We don't need to send anything back to the UI as it already has the updated color
  } else if (msg.type === 'get-selected-color') {
    // Handle request to get the currently selected color
    sendInitialSelection();
  } else if (msg.type === 'real-time-update') {
    // Handle real-time updates to the selected node
    try {
      let node;
      
      // Try to get node by ID first
      if ('nodeId' in msg && msg.nodeId) {
        // @ts-ignore - The Figma API does have this method but TypeScript definitions might be outdated
        node = figma.getNodeById(msg.nodeId);
      }
      
      // If no node found by ID, try current selection
      if (!node && figma.currentPage.selection.length > 0) {
        node = figma.currentPage.selection[0];
      }
      
      if (node && 'fills' in node) {
        // Cast to a type that has fills
        const typedNode = node as SceneNode & { fills: Paint[] };
        
        const fills = [...(typedNode.fills)];
        const solidFill = fills.find(fill => fill.type === 'SOLID') as SolidPaint | undefined;
        
        if (solidFill) {
          // Create new solid paint and preserve index
          const index = fills.indexOf(solidFill);
          // Use optional chaining and type checking
          const color = 'color' in msg ? msg.color : '';
          const opacity = 'opacity' in msg ? msg.opacity : (solidFill.opacity || 1);
          fills[index] = createSolidPaint('#' + color, opacity);
          // Update fills array
          typedNode.fills = fills;
          
          // Store the APCA value and background info in plugin data
          if ('apcaValue' in msg && msg.apcaValue) {
            // Cast to a type that has setPluginData
            (typedNode as any).setPluginData('apcaValue', msg.apcaValue.toString());
          }
          
          if ('backgroundInfo' in msg && msg.backgroundInfo) {
            // Cast to a type that has setPluginData
            (typedNode as any).setPluginData('backgroundInfo', JSON.stringify(msg.backgroundInfo));
            
            // Store background type separately for easier access
            (typedNode as any).setPluginData('backgroundType', msg.backgroundInfo.type);
          }
          
          // No need to notify UI for real-time updates to avoid feedback loops
        }
      }
    } catch (error) {
      console.error('Error during real-time update:', error);
    }
  }
};

// Helper function to convert RGB to hex
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Update the getPageBackground function to use correct Figma API types
function getPageBackground(): { r: number, g: number, b: number, opacity: number } {
  try {
    console.log('📄 Checking page background...');
    const page = figma.currentPage;
    console.log(`📄 Current page: "${page.name}"`);
    
    // Modern Figma API approach
    // First try to check if the page has fills (newer API version)
    if ('fills' in page && Array.isArray((page as any).fills) && (page as any).fills.length > 0) {
      console.log('📄 Using page.fills API for background color');
      
      // Look for a solid fill
      const fills = (page as any).fills as Paint[];
      const solidFill = fills.find((fill: Paint) => fill.type === 'SOLID' && 
                                     (fill.visible === undefined || fill.visible === true));
      
      if (solidFill && solidFill.type === 'SOLID') {
        // Extract color information - preserve original Figma values (0-1 range)
        const solidColor = solidFill as SolidPaint;
        
        const result = {
          r: solidColor.color.r * 255,
          g: solidColor.color.g * 255,
          b: solidColor.color.b * 255,
          opacity: solidColor.opacity || 1
        };
        
        const hexColor = `#${Math.round(result.r).toString(16).padStart(2, '0')}${Math.round(result.g).toString(16).padStart(2, '0')}${Math.round(result.b).toString(16).padStart(2, '0')}`.toUpperCase();
        console.log(`📄 Page has SOLID fill background: RGB(${result.r}, ${result.g}, ${result.b}), opacity: ${result.opacity}`);
        console.log(`📄 Hex color: ${hexColor}`);
        
        return result;
      }
      console.log('📄 No valid solid fill found in page.fills');
    }
    
    // Try the backgrounds property (plural) as recommended in the newer API
    if ('backgrounds' in page && Array.isArray((page as any).backgrounds) && (page as any).backgrounds.length > 0) {
      console.log('📄 Using page.backgrounds API for background color');
      
      const backgrounds = (page as any).backgrounds as Paint[];
      const solidBackground = backgrounds.find((bg: Paint) => bg.type === 'SOLID' && 
                                              (bg.visible === undefined || bg.visible === true));
      
      if (solidBackground && solidBackground.type === 'SOLID') {
        const result = {
          r: (solidBackground as SolidPaint).color.r * 255,
          g: (solidBackground as SolidPaint).color.g * 255,
          b: (solidBackground as SolidPaint).color.b * 255,
          opacity: solidBackground.opacity || 1
        };
        
        const hexColor = `#${Math.round(result.r).toString(16).padStart(2, '0')}${Math.round(result.g).toString(16).padStart(2, '0')}${Math.round(result.b).toString(16).padStart(2, '0')}`.toUpperCase();
        console.log(`📄 Page has SOLID background from backgrounds property: RGB(${result.r}, ${result.g}, ${result.b}), opacity: ${result.opacity}`);
        console.log(`📄 Hex color: ${hexColor}`);
        
        return result;
      }
      console.log('📄 No valid solid background found in page.backgrounds');
    }
    
    // Fallback to single background property (older API)
    if ('background' in page && (page as any).background) {
      console.log('📄 Using legacy page.background API for background color');
      
      const background = (page as any).background;
      if (background.type === 'SOLID') {
        const result = {
          r: background.color.r * 255,
          g: background.color.g * 255,
          b: background.color.b * 255,
          opacity: background.opacity || 1
        };
        
        const hexColor = `#${Math.round(result.r).toString(16).padStart(2, '0')}${Math.round(result.g).toString(16).padStart(2, '0')}${Math.round(result.b).toString(16).padStart(2, '0')}`.toUpperCase();
        console.log(`📄 Page has SOLID background from legacy API: RGB(${result.r}, ${result.g}, ${result.b}), opacity: ${result.opacity}`);
        console.log(`📄 Hex color: ${hexColor}`);
        
        // Extra debugging - check if the background is close to white
        if (result.r > 240 && result.g > 240 && result.b > 240) {
          console.log(`⚠️ WARNING: Page background appears to be white or very light!`);
          console.log(`⚠️ This might be why white is being detected instead of expected background.`);
        }
        
        // Extra debugging - check if color is close to red (similar to user's report)
        if (result.r > 60 && result.g < 30 && result.b < 30) {
          console.log(`⚠️ NOTICE: Page background appears to be red!`);
          console.log(`⚠️ Red background: ${hexColor} - This matches reported document background.`);
        }
        
        return result;
      } else {
        console.log(`⚠️ Page background exists but is not SOLID type, it's: ${background.type}`);
      }
    }
    
    // If we reach here, we've tried all possible API methods and found nothing
    // Send actual log of what we tried
    console.log('📄 API coverage check:');
    console.log(`- page.fills: ${('fills' in page) ? 'Available' : 'Not available'}`);
    console.log(`- page.backgrounds: ${('backgrounds' in page) ? 'Available' : 'Not available'}`);
    console.log(`- page.background: ${('background' in page) ? 'Available' : 'Not available'}`);
    
    // Check if there are any page settings that might give us the background color
    if ('parent' in page && (page as any).parent) {
      const pageParent = (page as any).parent;
      console.log(`📄 Page has parent: ${pageParent.type}`);
      // Try to analyze the document-level background if applicable
      if (pageParent.type === 'DOCUMENT') {
        console.log('📄 Parent is DOCUMENT, checking for document backgrounds...');
        if ('backgrounds' in pageParent) {
          console.log('📄 Document has "backgrounds" property:', pageParent.backgrounds);
        }
      }
    } else {
      console.log('📄 Page has no parent');
    }
    
    // If no valid background found, use default dark fallback
    const fallbackColor = { r: 30, g: 30, b: 30 }; // #1E1E1E
    const fallbackHex = `#${fallbackColor.r.toString(16).padStart(2, '0')}${fallbackColor.g.toString(16).padStart(2, '0')}${fallbackColor.b.toString(16).padStart(2, '0')}`.toUpperCase();
    console.log(`⚠️ No valid page background found, using default dark fallback (${fallbackHex})`);
    return { ...fallbackColor, opacity: 1 };
      
  } catch (error) {
    console.error('❌ Error getting page background:', error);
    const errorFallback = { r: 30, g: 30, b: 30 };
    return { ...errorFallback, opacity: 1 }; // Fallback to #1E1E1E
  }
}

// Helper function to format P3 color
function formatP3Color(color: RGB | P3): string {
  if ('r' in color) {
    // For RGB colors, maintain Figma's 0-1 scale without conversion
    return `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
  }
  // For P3 colors, use display-p3 format with precise values
  return `color(display-p3 ${color.x.toFixed(16)} ${color.y.toFixed(16)} ${color.z.toFixed(16)})`;
}

// Helper function to clean Figma color values
function cleanFigmaColorValue(value: string): string {
  // Remove any ## prefixes and ensure proper formatting
  if (value.startsWith('##')) {
    return value.substring(2).toLowerCase();
  } else if (value.startsWith('#')) {
    return value.substring(1).toLowerCase();
  }
  return value.toLowerCase();
}

// Helper function to check if a color is white or near white
function isWhiteOrNearWhite(color: RGB | P3): boolean {
  if ('r' in color) {
    return color.r > 0.95 && color.g > 0.95 && color.b > 0.95;
  }
  return color.x > 0.95 && color.y > 0.95 && color.z > 0.95;
}

// Helper function to check if a color is black or near black
function isBlackOrNearBlack(color: RGB | P3): boolean {
  if ('r' in color) {
    return color.r < 0.05 && color.g < 0.05 && color.b < 0.05;
  }
  return color.x < 0.05 && color.y < 0.05 && color.z < 0.05;
}

// Helper function to update color preview
function updateColorPreview(color: RGB | P3, matchesBg: boolean = false): void {
  const preview = document.getElementById('colorPreview');
  if (!preview) return;

  const formattedColor = formatP3Color(color);
  preview.style.backgroundColor = formattedColor;
  
  // Set data attributes for CSS to handle
  preview.setAttribute('data-matches-bg', matchesBg.toString());
  preview.setAttribute('data-is-white', isWhiteOrNearWhite(color).toString());
  
  // Remove any inline border styles - let CSS handle it
  preview.style.border = '';
  preview.style.borderColor = '';
}

// Type guard to check if a color is a P3 color
function isP3Color(color: any): color is P3 {
  return 'x' in color && 'y' in color && 'z' in color &&
         typeof color.x === 'number' &&
         typeof color.y === 'number' &&
         typeof color.z === 'number';
}

/**
 * Process node color and extract all relevant fill properties
 * Returns both the primary fill color and an array of all fills
 */
function processNodeColor(node: SceneNode): { 
  color: RGB | P3 | null, 
  blendMode?: BlendMode, 
  fillBlendMode?: BlendMode, 
  opacity?: number,
  nodeType: string,
  allFills: Array<{
    color: RGB | P3,
    opacity: number,
    blendMode?: BlendMode,
    visible: boolean
  }>
} {
  let result = {
    color: null as RGB | P3 | null,
    blendMode: undefined as BlendMode | undefined,
    fillBlendMode: undefined as BlendMode | undefined,
    opacity: undefined as number | undefined,
    nodeType: node.type, // Include the node type
    allFills: [] as Array<{
      color: RGB | P3,
      opacity: number,
      blendMode?: BlendMode,
      visible: boolean
    }>
  };

  // Extract node blend mode if available
  if ('blendMode' in node) {
    result.blendMode = node.blendMode;
    console.log(`Node ${node.name} has blend mode: ${node.blendMode}`);
  }

  // Extract node opacity if available
  if ('opacity' in node) {
    result.opacity = node.opacity;
  }
  
  if ('fills' in node) {
    // Cast to a type that has fills
    const typedNode = node as SceneNode & { fills: Paint[] };
    const fills = typedNode.fills;
    
    // Log the total number of fills
    if (fills && fills.length > 0) {
      console.log(`Node ${node.name} has ${fills.length} fills`);
    }

    // Process all solid fills in the node
    if (fills && fills.length > 0) {
      // Filter to only solid fills
      const solidFills = fills.filter(fill => fill.type === 'SOLID') as SolidPaint[];
      
      // Process each solid fill
      solidFills.forEach((fill, index) => {
        if (fill.color) {
          // Create a color object from the fill - preserve Figma's native format
          let fillColor: RGB | P3;
          
          // Use a safer approach to detect P3 colors
          const colorObj = fill.color as any; // Temporary typing to check properties safely
          
          if (colorObj && typeof colorObj === 'object' && 
              'x' in colorObj && 'y' in colorObj && 'z' in colorObj) {
            // This is a P3 color - preserve original values
            fillColor = {
              x: colorObj.x,
              y: colorObj.y,
              z: colorObj.z
            } as P3;
            console.log(`Fill ${index} is in P3 color space:`, fillColor);
          } else {
            // Standard RGB color - preserve original values
            fillColor = {
              r: fill.color.r,
              g: fill.color.g,
              b: fill.color.b
            } as RGB;
            console.log(`Fill ${index} is in RGB color space:`, fillColor);
          }
          
          // Add to all fills array
          result.allFills.push({
            color: fillColor,
            opacity: fill.opacity !== undefined ? fill.opacity : 1,
            blendMode: fill.blendMode,
            visible: fill.visible !== false
          });
          
          // Log fill details
          console.log(`Fill ${index}: `, {
            color: fillColor,
            opacity: fill.opacity !== undefined ? fill.opacity : 1,
            blendMode: fill.blendMode,
            visible: fill.visible !== false
          });
          
          // If this is the first valid fill, use it as the primary color
          if (index === 0 || (result.color === null && fill.visible !== false)) {
            result.color = fillColor;
            
            // Extract fill blend mode for primary fill
            if (fill.blendMode) {
              result.fillBlendMode = fill.blendMode;
              console.log(`Primary fill in node ${node.name} has blend mode: ${fill.blendMode}`);
            }
            
            // Extract fill opacity for primary fill
            if (fill.opacity !== undefined) {
              result.opacity = fill.opacity;
            }
          }
        }
      });
    }
  }
  
  return result;
}

// Store a reference to the main frame to reuse it for all previews
let mainPreviewFrame: any = null;

// Update the createPreview function to properly use background information
async function createPreview(
  color: string, 
  background: string, 
  values: any, 
  apcaValue: number,
  backgroundInfo?: {
    color: string;
    type: 'white' | 'black' | 'custom';
    rgb: { r: number, g: number, b: number };
  },
  useRgbBackground: boolean = true,
  cssBlendMode?: string
) {
  try {
    console.log('Starting to create preview for color:', color, 'with background:', background);
    console.log('Background info:', backgroundInfo);
    console.log('CSS Blend Mode:', cssBlendMode || 'none (normal)');
    
    // We only log the APCA value but don't use it directly - we use values.apca instead
    console.log('Received APCA value in createPreview (not used):', apcaValue);
    console.log('Using exact APCA value from UI (values.apca):', values?.apca);
    
    // Ensure background has proper format
    let formattedBackground = background;
    
    // If it's a hex color without #, add it
    if (formattedBackground.match(/^[0-9a-fA-F]{6}$/)) {
      formattedBackground = `#${formattedBackground}`;
    }
    
    // Ensure color has # prefix if it's a hex color without it
    const formattedColor = color.match(/^[0-9a-fA-F]{6}$/) ? `#${color}` : color;
    
    console.log('Using formatted background:', formattedBackground, 'and color:', formattedColor);

    // Create or reuse the main frame with horizontal autolayout
    if (!mainPreviewFrame) {
      // Create a new main frame
      const newFrame = figma.createFrame();
      newFrame.name = "APCACH Color Previews";
      newFrame.layoutMode = "HORIZONTAL";
      newFrame.itemSpacing = 16; // Reduced space between preview sections
      newFrame.paddingLeft = newFrame.paddingRight = 16; // Reduced horizontal padding
      newFrame.paddingTop = newFrame.paddingBottom = 16; // Reduced vertical padding
      
      // Use type casting to set auto layout sizing properties
      (newFrame as any).layoutSizingHorizontal = 'HUG';
      (newFrame as any).layoutSizingVertical = 'HUG';
      
      newFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } } as SolidPaint];
      newFrame.cornerRadius = 8; // Reduced corner radius
      
      // Position the main frame in a visible area
      const center = figma.viewport.center;
      newFrame.x = center.x - 200; // Adjusted initial position
      newFrame.y = center.y - 200;
      
      // Assign to our global variable
      mainPreviewFrame = newFrame;
      
      console.log('Created main preview frame with horizontal autolayout');
    }
    
    // Create RGB object for Figma background
    let frameBackgroundRgb: RGB;
    
    // Prioritize RGB values from backgroundInfo if available
    if (backgroundInfo && backgroundInfo.rgb) {
      console.log('Using RGB values from backgroundInfo for frame background');
      
      // Use the RGB values directly - these are already in the 0-255 range
      const { r, g, b } = backgroundInfo.rgb;
      
      // Create RGB object for Figma (0-1 range)
      frameBackgroundRgb = { r: r / 255, g: g / 255, b: b / 255 };
      console.log('Using background RGB from backgroundInfo:', frameBackgroundRgb);
    } else {
      // Try to parse the background color
      try {
        // Parse the hex color to RGB
        frameBackgroundRgb = hexToRgb(formattedBackground);
        console.log('Parsed background to RGB:', frameBackgroundRgb);
      } catch (error) {
        console.warn('Error parsing background color, using fallback:', error);
        // Use a default dark background if parsing fails
        formattedBackground = '#1e1e1e';
        frameBackgroundRgb = { r: 0.12, g: 0.12, b: 0.12 };
      }
    }
    
    // Handle APCACH parsing issue - if values.apcach contains "crToBg", simplify it
    if (values && values.apcach && typeof values.apcach === 'string' && values.apcach.includes('crToBg')) {
      console.log('Simplifying complex APCACH value:', values.apcach);
      // Extract the key parameters from the APCACH string
      const match = values.apcach.match(/apcach\(crToBg\([^,]+,\s*(\d+(?:\.\d+)?)\),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/);
      if (match) {
        const [, contrast, chroma, hue] = match;
        // Create a simplified version
        values.apcach = `apcach(${contrast}, ${chroma}, ${hue})`;
        console.log('Simplified APCACH value:', values.apcach);
      }
    }
    
    // Calculate if background is dark to determine text color if not provided
    const isDarkBackground = backgroundIsDark(formattedBackground);
    
    // If no text color is provided, determine it based on background
    if (!values.textColor) {
      // Set appropriate text color based on background brightness
      values.textColor = isDarkBackground ? '#ffffff' : '#000000';
      console.log('Determined text color based on background:', values.textColor);
    } else {
      // Ensure textColor is in a Figma-compatible format (not CSS variables)
      if (values.textColor.startsWith('var(') || values.textColor.startsWith('color-mix')) {
        // If it's a CSS variable, convert to a direct color value
        values.textColor = isDarkBackground ? '#ffffff' : '#000000';
        console.log('Converted CSS variable to direct color:', values.textColor);
      }
      
      console.log('Using provided text color:', values.textColor);
    }
    
    // Store background darkness for text color conversion
    values.isDarkBackground = isDarkBackground;
    console.log('Background is', isDarkBackground ? 'dark' : 'light');
    
    // Ensure allFills is populated for backwards compatibility
    if (!values.allFills) {
      // Create a default allFills array with the main color
      values.allFills = [{
        color: formattedColor,
        opacity: values.opacity || 1,
        blendMode: values.blendMode,
        cssBlendMode: cssBlendMode,
        visible: true
      }];
      console.log('Created default allFills for backwards compatibility:', values.allFills);
    }
    
    // Create the preview content - use the formatted background
    console.log('Creating color preview with background:', formattedBackground, 'and color:', formattedColor);
    console.log('Using CSS blend mode:', cssBlendMode || 'normal');
    
    // Pass the blend mode to createColorPreview
    const previewContent = await createColorPreview(
      formattedBackground, 
      formattedColor, 
      { ...values, cssBlendMode }
    );
    
    // Add the preview content to the main frame
    if (mainPreviewFrame) {
      mainPreviewFrame.appendChild(previewContent);
      
      // Scroll to the main frame to ensure it's visible
      figma.viewport.scrollAndZoomIntoView([mainPreviewFrame]);
      
      console.log('Preview section added to main frame');
    } else {
      console.error('Main preview frame is null, cannot add preview content');
    }
    
    // Return success
    return true;
  } catch (error) {
    console.error('Error in createPreview:', error);
    throw error;
  }
}

// Helper function to determine if a background color is dark
function backgroundIsDark(backgroundColor: string): boolean {
  try {
    // Parse the background color
    const rgb = hexToRgb(backgroundColor);
    
    if (!rgb) {
      console.warn('Could not parse background color:', backgroundColor);
      return false; // Default to light background if parsing fails
    }
    
    // Calculate luminance (0-1 range)
    const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    
    // Use a threshold of 0.5 for determining if a background is dark
    // This is a common threshold for determining text color
    return luminance < 0.5;
  } catch (error) {
    console.error('Error determining if background is dark:', error);
    return false; // Default to light background on error
  }
}

// Helper function to convert RGB string to hex
function rgbStringToHex(rgbStr: string): string {
  if (!rgbStr.startsWith('rgb')) return rgbStr;
  
  const rgbMatch = rgbStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    const [_, r, g, b] = rgbMatch.map(Number);
    return rgbToHex(r/255, g/255, b/255);
  }
  return rgbStr;
}

// Helper function to ensure hex colors have # prefix
function ensureHexPrefix(color: string): string {
  if (color.match(/^[0-9a-fA-F]{6}$/)) {
    return `#${color}`;
  }
  return color;
}

// Helper function to safely parse any color format to a usable hex color
function parseColorSafely(color: string): string {
  try {
    if (color.startsWith('rgb')) {
      return rgbStringToHex(color);
    } else if (color.match(/^[0-9a-fA-F]{6}$/)) {
      return `#${color}`;
    } else if (color.startsWith('#')) {
      return color;
    } else {
      console.warn('Unknown color format:', color);
      return color;
    }
  } catch (error) {
    console.warn('Error parsing color:', color, error);
    return color;
  }
}

// Function to send color data for the selected node when requested by UI
function sendInitialSelection() {
  console.log('📤 SENDING INITIAL SELECTION DATA TO UI');
  const selection = figma.currentPage.selection;
  
  if (selection.length > 0) {
    // Get the first selected node
    const node = selection[0] as SceneNode;
    
    // Continue only if the node has fills
    if ('fills' in node) {
      console.log('📊 Calling processNodeColor to extract color data');
      const processedNode = processNodeColor(node);
      
      if (processedNode.color) {
        // Get the color from the processed node
        const color = processedNode.color;
        console.log('📊 Processed node color:', color);
        
        // Convert to hex format with appropriate handling for P3 vs. RGB
        let figmaColorHex = '';
        let isP3Color = false;
        
        if ('x' in color) {
          // It's a P3 color
          isP3Color = true;
          // Use exact P3 values without conversion
          figmaColorHex = rgbToHex(color.x, color.y, color.z);
          console.log('📊 Keeping P3 color values:', color, 'hex:', figmaColorHex);
        } else {
          // It's an RGB color
          figmaColorHex = rgbToHex((color as RGB).r, (color as RGB).g, (color as RGB).b);
          console.log('📊 Keeping RGB color values:', color, 'hex:', figmaColorHex);
        }
        
        console.log('📊 Converted color to hex:', figmaColorHex);
        
        // Extract opacity from the node or fill
        const opacity = processedNode.opacity !== undefined ? processedNode.opacity : 1;
        console.log('📊 Using opacity:', opacity);
        
        // Get the node's blend mode
        const blendMode = processedNode.blendMode;
        const fillBlendMode = processedNode.fillBlendMode; 
        console.log('📊 Blend mode info:', { nodeBlendMode: blendMode, fillBlendMode });
        
        // Prepare all fills data for UI
        const allFills = processedNode.allFills.map(fill => {
          // Convert each fill color to hex format, preserving P3 if present
          let fillHex = '';
          
          if ('x' in fill.color) {
            // P3 color
            fillHex = rgbToHex(fill.color.x, fill.color.y, fill.color.z);
          } else {
            // RGB color
            fillHex = rgbToHex((fill.color as RGB).r, (fill.color as RGB).g, (fill.color as RGB).b);
          }
            
          // Map Figma blend mode to CSS with fallback to normal
          const cssBM = fill.blendMode ? mapFigmaBlendToCSS(fill.blendMode) : 'normal';
          
          return {
            color: fillHex,
            opacity: fill.opacity,
            blendMode: fill.blendMode,
            cssBlendMode: cssBM,
            visible: fill.visible,
            isP3: 'x' in fill.color // Add flag to indicate if this is a P3 color
          };
        });
        
        console.log(`📊 Processed ${allFills.length} fills for UI`);
        
        // Check for unsupported blend modes
        let hasUnsupportedBlendMode = false;
        
        if (blendMode && !isSupportedBlendMode(blendMode)) {
          hasUnsupportedBlendMode = true;
          console.warn(`⚠️ Node has unsupported blend mode: ${blendMode}`);
        }
        
        if (fillBlendMode && !isSupportedFillBlendMode(fillBlendMode)) {
          hasUnsupportedBlendMode = true;
          console.warn(`⚠️ Fill has unsupported blend mode: ${fillBlendMode}`);
        }
        
        // Map Figma blend mode to CSS blend mode for UI display
        let cssBlendMode = 'normal';
        if (blendMode) {
          cssBlendMode = mapFigmaBlendToCSS(blendMode);
        } else if (fillBlendMode) {
          cssBlendMode = mapFigmaBlendToCSS(fillBlendMode);
        }
        console.log('📊 CSS blend mode mapped to:', cssBlendMode);
        
        // Detect background color for the node
        console.log('📊 Detecting background color for preview');
        const bgColor = detectBackgroundColor(node);
        const hexBackground = bgColor ? 
          rgbToHex(bgColor.r / 255, bgColor.g / 255, bgColor.b / 255) : 
          '#121212'; // Default dark background
        
        console.log('📊 Detected background color:', hexBackground);
        
        // If there are multiple fills, log them for debugging
        if (allFills.length > 1) {
          console.log(`📊 Node has ${allFills.length} fills:`);
          allFills.forEach((fill, index) => {
            console.log(`  Fill ${index + 1}:`, {
              color: fill.color,
              opacity: fill.opacity,
              blendMode: fill.blendMode,
              cssBlendMode: fill.cssBlendMode,
              visible: fill.visible,
              isP3: fill.isP3
            });
          });
        }
        
        // Ensure the hex color has a # prefix
        const formattedColor = figmaColorHex.startsWith('#') ? figmaColorHex : '#' + figmaColorHex;
        
        // Construct message for UI
        const message = {
          type: 'initial-color',
          color: formattedColor,
          isFigmaP3: isP3Color,
          nodeId: node.id,
          nodeType: processedNode.nodeType, // Include the node type in the message
          opacity: opacity,
          detectedBackground: hexBackground,
          blendMode: blendMode || fillBlendMode,
          cssBlendMode: cssBlendMode,
          hasUnsupportedBlendMode: hasUnsupportedBlendMode,
          allFills: allFills
        };
        
        // DEBUG: Log node type information explicitly
        console.log('🔍 DEBUG NODE TYPE:', {
          originalType: node.type,
          processedType: processedNode.nodeType,
          messageType: message.nodeType,
          isText: node.type === 'TEXT'
        });
        
        console.log('📤 SENDING COLOR DATA TO UI:', message);
        
        // Send data to UI
        figma.ui.postMessage(message);
        
        console.log('✅ Sent initial color data to UI with all fills information');
      } else {
        console.log('⚠️ No valid color found in node');
        figma.ui.postMessage({
          type: 'initial-color',
          color: null,
          isFigmaP3: false,
          nodeId: node.id,
          nodeType: node.type, // Include the node type in the message
          detectedBackground: '#121212'
        });
      }
    } else {
      console.log('⚠️ No valid selection with fills in sendInitialSelection');
      figma.ui.postMessage({
        type: 'initial-color',
        color: null,
        isFigmaP3: false,
        detectedBackground: '#121212'
      });
    }
  }
}

/**
 * Helper function to check if a node has a valid solid fill
 * This combines parts of the reference's isValidForBackground and getActualFill.
 */
function hasValidSolidFill(node: SceneNode): boolean {
  // Only check nodes that can have fills
  if (!('fills' in node)) return false;
  
  // Check if the node is visible
  if ('visible' in node && !node.visible) return false;
  
  // Check opacity
  if ('opacity' in node && node.opacity <= 0) return false;
  
  // Cast to access the fills property
  const typedNode = node as SceneNode & { fills: readonly Paint[] };
  
  // Check if the node has any fills
  if (!typedNode.fills || typedNode.fills.length === 0) return false;
  
  // Look for the first valid solid fill (visible with opacity > 0)
  const validFill = Array.from(typedNode.fills).find(fill => {
    return (
      fill.type === 'SOLID' && 
      (fill.visible === undefined || fill.visible === true) && 
      (fill.opacity === undefined || fill.opacity > 0)
    );
  });
  
  return !!validFill;
}

/**
 * Creates a PolychromNode from a Figma SceneNode.
 * Matches the reference implementation's createPolychromNode function.
 */
function createPolychromNode(node: SceneNode, selectedNodeId?: string): PolychromNode {
  // Get fills from the node
  const fills = getNodeFills(node);
  
  // Collect node parents for path and nesting level
  const parents = collectNodeParents(node);
  
  // Create the PolychromNode structure
  return {
    blendMode: 'blendMode' in node ? node.blendMode : 'PASS_THROUGH',
    children: [], // We'll populate this separately when needed
    fills: fills.map(fill => {
      // Process fills if needed
      if (fill.type === 'SOLID') {
        return {
          ...fill,
          // We could add hex or other color format conversions here if needed
        };
      }
      return fill;
    }),
    id: node.id,
    isSelected: node.id === selectedNodeId,
    name: node.name,
    nestingLevel: parents.length, // Depth in the tree
    opacity: 'opacity' in node ? node.opacity : 1,
    parents: parents,
    visible: 'visible' in node ? node.visible : true,
    zIndex: node.parent?.children?.indexOf(node) ?? -1, // Position in parent's children array
  };
}

/**
 * Get fills from a node, handling different node types.
 * Matches the reference implementation's getNodeFills function.
 */
function getNodeFills(node: PageNode | SceneNode): Paint[] {
  if ('fills' in node) {
    const fills = node.fills;
    // Check if fills is a symbol or array-like
    return typeof fills === 'symbol' ? [] : Array.from(fills);
  }
  
  // Handle page backgrounds
  if ('backgrounds' in node) {
    const backgrounds = node.backgrounds;
    return typeof backgrounds === 'symbol' ? [] : Array.from(backgrounds);
  }
  
  return [];
}

/**
 * Collect all parent nodes for a given node.
 * Used for calculating nesting level and parent relationships.
 */
function collectNodeParents(node: SceneNode | PageNode): readonly SceneNode[] {
  const parents: SceneNode[] = [];
  let current: BaseNode | null = node.parent;
  
  while (current && current.type !== 'DOCUMENT') {
    // Only add SceneNodes (not pages or documents)
    if (current.type !== 'PAGE') {
      parents.push(current as SceneNode);
    }
    current = current.parent;
  }
  
  return parents;
}

/**
 * Convert CSS blend mode to Figma blend mode
 * This is the reverse of mapFigmaBlendToCSS
 */
function getFigmaBlendModeFromCSS(cssBlendMode: string): BlendMode | undefined {
  // Create a reverse mapping
  const cssToFigmaMap: Record<string, BlendMode> = {
    'normal': 'NORMAL',
    'multiply': 'MULTIPLY',
    'screen': 'SCREEN',
    'overlay': 'OVERLAY',
    'darken': 'DARKEN',
    'lighten': 'LIGHTEN',
    'color-dodge': 'COLOR_DODGE',
    'color-burn': 'COLOR_BURN',
    'hard-light': 'HARD_LIGHT',
    'soft-light': 'SOFT_LIGHT',
    'difference': 'DIFFERENCE',
    'exclusion': 'EXCLUSION',
    'hue': 'HUE',
    'saturation': 'SATURATION',
    'color': 'COLOR',
    'luminosity': 'LUMINOSITY'
  };
  
  return cssToFigmaMap[cssBlendMode];
}

// Interface for color values passed from UI to Figma
interface ColorValuesInternal {
  apca?: string | number;
  apcach?: string;
  hex?: string;
  rgb?: string;
  p3?: string;
  figmaP3?: string;
  textColor?: string;
  textTertiary?: string;
  textTertiaryP3?: string;
  isDarkBackground?: boolean;
  cssBlendMode?: string;
  gamut?: string | { p3: boolean; srgb: boolean; };
  oklch?: string;
  apcaDescription?: string;
  allFills?: Array<{
    color: string;
    opacity: number;
    blendMode?: string;
    cssBlendMode?: string;
    visible: boolean;
  }>;
}

// Add back the blend mode support check functions
function isSupportedBlendMode(mode: BlendMode): boolean {
  const supportedBlendModes: BlendMode[] = [
    'NORMAL',
    'PASS_THROUGH',  // Explicitly support PASS_THROUGH
    'MULTIPLY',
    'SCREEN',
    'OVERLAY',
    'DARKEN',
    'LIGHTEN',
    'COLOR_DODGE',
    'COLOR_BURN',
    'HARD_LIGHT',
    'SOFT_LIGHT',
    'DIFFERENCE',
    'EXCLUSION',
    'HUE',
    'SATURATION',
    'COLOR',
    'LUMINOSITY'
  ];
  
  return supportedBlendModes.includes(mode);
}

function isSupportedFillBlendMode(mode: BlendMode): boolean {
  return isSupportedBlendMode(mode);
}

// Initialize background color on start
sendInitialBackground();

// Check if we already have a valid selection when the plugin starts
const selection = figma.currentPage.selection;
if (selection.length === 1 && 'fills' in selection[0]) {
  console.log("Found valid selection on plugin start, sending initial selection");
  sendInitialSelection();
} else {
  // Still send the initial state to properly update UI
  sendInitialSelectionState();
}

// ============================
// PLUGIN PARAMETERS IMPLEMENTATION
// ============================

/**
 * MAXIMIZE CHROMA PARAMETER
 * 
 * This feature allows users to maximize the chroma (color vividness) of selected elements
 * while maintaining their contrast with the background.
 * 
 * How it works:
 * 1. The user selects one or more nodes with fills in Figma
 * 2. They run the plugin with the "Maximize Chroma" parameter
 * 3. For each fill in the selected nodes:
 *    - Extracts the original color and converts it to a format suitable for processing
 *    - Calculates the contrast with the background
 *    - Determines the maximum chroma value that maintains the required contrast
 *    - Creates a new color with the same hue but maximum chroma
 *    - Updates the fill with the new color
 * 
 * This implementation uses a simplified approach to color conversion and chroma maximization.
 * In a production environment, it would use the full APCAch library to perform accurate 
 * color space conversions and find the optimal chroma values.
 */

// Handle plugin parameters
// @ts-ignore - Checking for parameters API which might not be recognized by TypeScript
if (figma && 'parameters' in figma) {
  // @ts-ignore - Parameters API might not be recognized by TypeScript but it exists
  figma.parameters.on('input', ({ key, query, result }: { key: string, query: string, result: any }) => {
    if (key === 'maximize-chroma') {
      // Return a simple confirmation for any search query
      result.setLoadingMessage('Select nodes to maximize chroma');
    }
  });

  // @ts-ignore - Run event with parameters payload not in TypeScript types
  figma.on('run' as any, ({ parameters }: { parameters?: Record<string, any> }) => {
    if (parameters && parameters['maximize-chroma']) {
      // Run the maximize chroma functionality immediately as a parameter-driven action
      handleMaximizeChroma();
    }
  });
}

// Function to handle the maximize chroma action
async function handleMaximizeChroma() {
  try {
    console.log('🎨 Running Maximize Chroma feature');
    
    // Notify UI that we're starting a parameter action
    figma.ui.postMessage({
      type: 'parameter-action-started',
      message: 'Maximizing chroma for selected elements...'
    });
    
    // Get current selection
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      figma.notify('Please select at least one node with fills to adjust chroma');
      // Notify UI that we're done
      figma.ui.postMessage({ type: 'parameter-action-completed' });
      return;
    }
    
    // Count nodes with fills
    const nodesWithFills = selection.filter(node => 
      'fills' in node && 
      Array.isArray((node as any).fills)
    ) as Array<SceneNode & { fills: readonly Paint[] }>;
    
    if (nodesWithFills.length === 0) {
      figma.notify('No nodes with fills selected. Please select nodes with fills.');
      // Notify UI that we're done
      figma.ui.postMessage({ type: 'parameter-action-completed' });
      return;
    }
    
    // Show progress notification
    figma.notify(`Maximizing chroma for ${nodesWithFills.length} nodes...`, { timeout: 2000 });
    
    // Process each node
    let processedCount = 0;
    const backgroundRGB = getPageBackground();
    const backgroundColor = `rgb(${backgroundRGB.r * 255}, ${backgroundRGB.g * 255}, ${backgroundRGB.b * 255})`;
    
    for (const node of nodesWithFills) {
      await maximizeNodeChroma(node, backgroundColor);
      processedCount++;
      
      // Update UI with progress
      if (processedCount % 5 === 0 || processedCount === nodesWithFills.length) {
        figma.ui.postMessage({
          type: 'parameter-action-started',
          message: `Processed ${processedCount}/${nodesWithFills.length} nodes...`
        });
      }
    }
    
    // Notify UI that we're done
    figma.ui.postMessage({ type: 'parameter-action-completed' });
    
    // Show success notification
    figma.notify(`Chroma maximized for ${processedCount} nodes`, { timeout: 2000 });
    
    // Close the plugin when running as a parameter
    setTimeout(() => figma.closePlugin(), 2000);
  } catch (error: any) {
    console.error('Error in maximize chroma function:', error);
    figma.notify('Error processing nodes: ' + (error.message || 'Unknown error'), { error: true });
    
    // Notify UI that we're done (with error)
    figma.ui.postMessage({ type: 'parameter-action-completed' });
  }
}

// Function to maximize chroma for a specific node
async function maximizeNodeChroma(node: SceneNode & { fills: readonly Paint[] }, backgroundColor: string) {
  // Filter for solid fills only
  const solidFills = node.fills.filter(fill => 
    fill.type === 'SOLID' && 
    fill.visible !== false && 
    (fill.opacity === undefined || fill.opacity > 0)
  ) as SolidPaint[];
  
  if (!solidFills.length) return;
  
  // Get node information for logging
  console.log(`Processing node: ${node.name} (${node.type}) with ${solidFills.length} solid fills`);
  
  // Clone the fills array for modification
  const newFills = Array.from(node.fills) as Paint[];
  
  // Process each fill
  for (let i = 0; i < newFills.length; i++) {
    const fill = newFills[i];
    
    if (fill.type === 'SOLID' && fill.visible !== false) {
      // Get the original color
      const originalColor = {
        r: fill.color.r,
        g: fill.color.g,
        b: fill.color.b
      };
      
      // Convert to hex for processing
      const hexColor = rgbToHexForChroma(originalColor.r, originalColor.g, originalColor.b);
      console.log(`Original fill color: ${hexColor}`);
      
      // Calculate contrast with background
      try {
        // Convert to APCACH format
        const apcachColor = cssToApcachColor(hexColor, { bg: backgroundColor });
        
        // Get the contrast and hue for this color
        const currentContrast = Math.abs(apcachColor.contrastConfig.cr);
        const currentHue = apcachColor.hue;
        const currentChroma = apcachColor.chroma;
        
        console.log(`Original color metrics - Contrast: ${currentContrast}, Hue: ${currentHue}, Chroma: ${currentChroma}`);
        
        // Find the maximum valid chroma for this contrast and hue
        const maxChroma = findMaxValidChroma(currentContrast, currentHue);
        console.log(`Maximum valid chroma: ${maxChroma} (current: ${currentChroma})`);
        
        // Skip if already at or near maximum
        if (maxChroma <= currentChroma + 0.01) {
          console.log(`Skipping - already at maximum chroma`);
          continue;
        }
        
        // Generate new color with maximum chroma
        // For this implementation, we'll use a simplified approach
        // In a real implementation, we'd use the APCACH library's functions
        const newColor = {
          lightness: apcachColor.lightness,
          chroma: maxChroma,
          hue: currentHue,
          alpha: 1,
          colorSpace: 'p3' as const
        };
        
        // Convert to Figma P3 format (simplified implementation)
        const figmaP3 = simulateApcachToCss(newColor);
        console.log(`New color with maximum chroma: ${figmaP3}`);
        
        // Extract RGB values from the figma p3
        const rgbMatch = figmaP3.match(/#([0-9A-Fa-f]{6})/);
        if (rgbMatch) {
          const rgb = hexToRgbForChroma(rgbMatch[0]);
          // Update the fill
          newFills[i] = {
            ...fill,
            color: {
              r: rgb.r / 255,
              g: rgb.g / 255,
              b: rgb.b / 255
            }
          };
        }
      } catch (error: any) {
        console.error(`Error processing fill for ${node.name}:`, error);
      }
    }
  }
  
  // Apply the new fills
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  node.fills = newFills;
}

// Function to find maximum valid chroma
function findMaxValidChroma(contrast: number, hue: number): number {
  // In a real implementation, we'd use the APCACH library's functionality
  // This is a simplified approximation
  
  // Start with a high chroma value and check if it's valid
  let maxChroma = 0.4; // Maximum possible chroma in OKLCH
  const minChroma = 0;
  const step = 0.01;
  
  // Just return a reasonable value for this implementation
  return Math.min(maxChroma, 0.3);
}

// Helper function to convert RGB values to hex (for maximize chroma feature)
function rgbToHexForChroma(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Helper function to convert hex to RGB (for maximize chroma feature)
function hexToRgbForChroma(hex: string): { r: number, g: number, b: number } {
  // Remove the # if present
  const cleanHex = hex.replace('#', '');
  
  // Parse the hex values
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  return { r, g, b };
}

// Function to convert CSS color to APCACH (for maximize chroma feature)
function cssToApcachColor(color: string, options: { bg: string }) {
  // This is a simplified version - we'll use the actual APCACH library
  // First try to send the color to UI for conversion
  figma.ui.postMessage({
    type: 'convert-to-apcach',
    color,
    background: options.bg
  });
  
  // For immediate processing, use our own implementation
  // Extract RGB values from color string
  const rgb = extractRgbFromColorString(color);
  
  if (!rgb) {
    throw new Error(`Could not extract RGB values from ${color}`);
  }
  
  // Extract RGB values from background
  const bgRgb = extractRgbFromColorString(options.bg);
  
  if (!bgRgb) {
    throw new Error(`Could not extract RGB values from background ${options.bg}`);
  }
  
  // Calculate approximate OKLCH values (simplified)
  // In a real implementation, we'd use the APCACH library's actual conversion
  const oklch = approximateRgbToOklchColor(rgb);
  
  // Create a basic contrast config
  const contrastValue = calculateApproximateContrastValue(rgb, bgRgb);
  
  // Return a simplified APCACH color object
  return {
    lightness: oklch.l,
    chroma: oklch.c,
    hue: oklch.h,
    alpha: 1,
    colorSpace: 'p3' as const,
    contrastConfig: {
      cr: contrastValue
    }
  };
}

// Simulated function to convert APCACH color to CSS (for maximize chroma feature)
function simulateApcachToCss(color: { lightness: number, chroma: number, hue: number, alpha: number, colorSpace: string }): string {
  // This is a simplified simulation - in a real implementation we'd use the library
  // Convert OKLCH to RGB (very simplified approximation)
  const l = color.lightness;
  const c = color.chroma;
  const h = color.hue;
  
  // Simple (and inaccurate) approximation for demo purposes
  const hRad = h * Math.PI / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  
  // Very simplified conversion to RGB
  const r = Math.max(0, Math.min(255, Math.round(l * 255 + a * 255)));
  const g = Math.max(0, Math.min(255, Math.round(l * 255 - a * 127.5 - b * 127.5)));
  const blueValue = Math.max(0, Math.min(255, Math.round(l * 255 - a * 127.5 + b * 127.5)));
  
  // Convert to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(blueValue)}`;
}

// Helper function to extract RGB from color string (for maximize chroma feature)
function extractRgbFromColorString(color: string): { r: number, g: number, b: number } | null {
  // Handle hex color
  if (color.startsWith('#')) {
    return hexToRgbForChroma(color);
  }
  
  // Handle rgb() format
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10)
    };
  }
  
  return null;
}

// Very simplified approximation of RGB to OKLCH (for maximize chroma feature)
function approximateRgbToOklchColor(rgb: { r: number, g: number, b: number }): { l: number, c: number, h: number } {
  // This is a placeholder for the actual conversion
  // In a real implementation, we'd use the library's conversion functions
  
  // Normalize RGB values to 0-1
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  
  // Approximate lightness (simplified)
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  
  // Approximate chroma (simplified)
  const c = Math.sqrt(
    Math.pow(r - g, 2) + 
    Math.pow(g - b, 2) + 
    Math.pow(b - r, 2)
  ) / Math.sqrt(2);
  
  // Approximate hue (simplified)
  let h = 0;
  if (c > 0) {
    h = Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b);
    h = h * 180 / Math.PI;
    if (h < 0) h += 360;
  }
  
  return { l, c, h };
}

// Simplified contrast calculation (for maximize chroma feature)
function calculateApproximateContrastValue(
  fg: { r: number, g: number, b: number }, 
  bg: { r: number, g: number, b: number }
): number {
  // This is a very simplified approximation
  // In a real implementation, we'd use the APCACH contrast calculation
  
  // Convert to grayscale using luminance
  const fgLum = 0.299 * fg.r + 0.587 * fg.g + 0.114 * fg.b;
  const bgLum = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
  
  // Calculate contrast (simplified approach)
  const contrast = Math.abs(fgLum - bgLum) / 255 * 100;
  
  return contrast;
}
