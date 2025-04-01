Based on the background detection logic you've implemented and the Figma Plugin Parameters API, here's how you could enhance your plugin with parameters and quick actions:

## Current Logic Analysis

Your background detection system is robust and handles:
- Tree traversal to find background colors
- Node type-specific processing (TEXT, VECTOR, FRAMES, etc.)
- Color composition with opacity handling
- Geometric overlap detection

## Plugin Parameters Integration Plan

### 1. Parameter Configuration

Add parameters to your manifest.json to enable quick actions:

```json
{
  "name": "APCA Contrast Adjuster",
  "parameters": [
    {
      "name": "Chroma Level",
      "key": "chroma-level",
      "allowFreeform": true
    },
    {
      "name": "APCA Contrast",
      "key": "apca-contrast",
      "allowFreeform": true
    },
    {
      "name": "Apply To",
      "key": "target",
      "optional": true
    }
  ]
}
```

### 2. Suggestion Handler Implementation

```javascript
figma.parameters.on('input', ({ parameters, key, query, result }) => {
  switch (key) {
    case 'chroma-level':
      // Suggest chroma levels from 0-100
      const chromaLevels = [25, 50, 75, 100];
      result.setSuggestions(
        chromaLevels
          .filter(c => c.toString().includes(query))
          .map(c => ({ name: `${c}%`, data: c }))
      );
      break;
      
    case 'apca-contrast':
      // Common APCA contrast levels
      const apcaLevels = [45, 60, 75, 90];
      result.setSuggestions(
        apcaLevels
          .filter(l => l.toString().includes(query))
          .map(l => ({ name: `${l} (${getAPCADescription(l)})`, data: l }))
      );
      break;
      
    case 'target':
      // Options for what to apply to
      result.setSuggestions([
        { name: 'Selected Nodes', data: 'selection' },
        { name: 'Current Frame', data: 'frame' },
        { name: 'All Similar Colors', data: 'similar' }
      ].filter(s => s.name.toLowerCase().includes(query.toLowerCase())));
      break;
  }
});

function getAPCADescription(level) {
  if (level >= 90) return 'Body text';
  if (level >= 75) return 'Headlines';
  if (level >= 60) return 'Large UI elements';
  if (level >= 45) return 'Large buttons';
  return 'Decorative only';
}
```

### 3. Plugin Run Handler

```javascript
figma.on('run', ({ parameters }) => {
  // If parameters aren't provided, show the normal UI
  if (!parameters) {
    figma.showUI(__html__, { width: 320, height: 520 });
    return;
  }
  
  // Process selected nodes with the parameters
  const selectedNodes = figma.currentPage.selection;
  if (selectedNodes.length === 0) {
    figma.notify('Please select at least one node');
    figma.closePlugin();
    return;
  }
  
  const chromaLevel = parameters['chroma-level'] || 100;
  const apcaContrast = parameters['apca-contrast'] || 60;
  const target = parameters['target'] || 'selection';
  
  // Apply changes based on parameters
  processNodesWithParameters(selectedNodes, chromaLevel, apcaContrast, target);
  figma.closePlugin(`Applied ${apcaContrast} APCA with ${chromaLevel}% chroma`);
});

function processNodesWithParameters(nodes, chromaLevel, apcaContrast, target) {
  // Process each node
  for (const node of nodes) {
    // Use your existing background detection logic
    const bgColor = compBackgroundColor(node);
    
    if (node.type === "TEXT") {
      // Adjust text colors
      adjustTextNodeColors(node, bgColor, chromaLevel, apcaContrast);
    } else if (node.fills && node.fills.length > 0) {
      // Adjust fill colors
      adjustFillColors(node, bgColor, chromaLevel, apcaContrast);
    }
  }
}

function adjustTextNodeColors(textNode, bgColor, chromaLevel, apcaContrast) {
  // Implementation using your existing APCA adjustment logic
  // This would use your existing functions like setApcachContrast
}

function adjustFillColors(node, bgColor, chromaLevel, apcaContrast) {
  // Implementation for non-text nodes
}
```

## Use Cases and Possibilities

### 1. Quick APCA Adjustments
You can select multiple elements and use the quick action to set a specific APCA contrast level for all of them at once. For example:
- Select multiple text elements
- Press ⌘/ (Command+/) to open quick actions
- Type "APCA" to find your plugin
- Set "APCA Contrast" to 75 for all headlines

### 2. Batch Chroma Adjustments
You can adjust the maximum chroma (color saturation) for multiple elements at once:
- Select multiple colored elements
- Use quick actions
- Set "Chroma Level" to 50% to reduce saturation

### 3. Smart Target Selection
The "Apply To" parameter allows different targeting options:
- "Selected Nodes" - just apply to what's selected
- "Current Frame" - apply to all nodes in the current frame
- "All Similar Colors" - find all nodes with similar colors and apply the change

### 4. Combined Operations
You can adjust both APCA contrast and chroma together in one quick action:
- Select text elements
- Set APCA to 60 and chroma to 75% in one operation

## Advanced Implementation Ideas

1. **Color Theme Generation**: Generate an accessible color theme with consistent APCA levels by selecting a key color and using parameters to adjust its derivatives

2. **Contextual Suggestions**: Show different suggestions based on the current selection (e.g., suggest higher contrast for small text)

3. **Remember Recent Values**: Store recently used values for quicker access next time

4. **Apply to Styles**: Detect and modify Figma color styles to maintain design system consistency

This approach leverages your existing background detection while adding powerful batch operations through Figma's parameters API, significantly improving workflow efficiency for accessibility adjustments.
