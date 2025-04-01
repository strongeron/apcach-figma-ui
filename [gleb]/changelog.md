Now our plugin will properly extract the background color from Figma and update the UI accordingly. The changes I made:
Extract the RGB values (r, g, b) directly from the message.color object sent by Figma.
Convert these RGB values to a hex color string format.
Use this extracted color to update the background by calling the updateBackgroundColor function.
Generate dynamic colors using the actual RGB values from Figma.
Log the extracted background color for debugging purposes.
The updateBackgroundColor function will take care of:
Updating the global currentBackground variable
Setting the background color in the preview section
Updating both the input color picker (bgColorInput) and the text display (bgColorValue)
Recalculating colors with the new background
This ensures that the background control in the UI will now reflect the actual background color from Figma rather than using a default value.


Let's review our complete solution:
Initial Plugin Load:
We send the page background color to the UI
We check for any selected nodes and send the selection state with detected background
The UI requests the actual color data if a valid selection with fill is detected
Selection Change Flow:
When the selection changes, we detect the background and send selection state to the UI
We do NOT automatically send color data to prevent unwanted updates
The UI requests the color data if it detects a valid selection with fill
The UI shows a notification that it's fetching the color
Color Update Flow:
The UI sends color updates to Figma only when explicitly triggered by user interaction
The UI displays the detected background color in the background control
The color preview in the UI shows the actual selected color from Figma
This approach solves the issue by ensuring:
We extract and properly display the background color depending on where the highlighted element is located
We don't update the color in Figma with a default value on every selection change
We wait for the UI to explicitly request color data
The user can see clearly what's happening with appropriate notifications
This implementation creates a clear separation between background detection/display and color selection/updating, ensuring each process happens at the appropriate time.

Conclusion
I've improved the Figma plugin to address all the issues you identified:
Enhanced Background Detection:
Added special handling for text elements to properly detect backgrounds in auto layouts
Improved detection order to check: parent (for text), intersecting shapes, containers, and finally page background
Added recursive checking of ancestor containers to handle nested layouts
Fixed selection state logic to always provide background colors to the UI
Fixed UI Initialization:
Added a dedicated initializeUIWithDefaults function to ensure all UI values are properly set on load
Ensured default values are displayed correctly in all UI elements
Added more detailed logging to help debug initialization issues
Improved Color Parsing:
Enhanced the parseRgb function to correctly handle hex colors and other formats
Added multiple fallback mechanisms when parsing fails
Improved error handling throughout the color processing pipeline
Better Background Color Management:
Updated the updateBackgroundColor function with better normalization of color formats
Added extensive error handling and fallbacks for all color-related functions
Ensured consistent background color information is saved and reused
These changes should provide a more robust implementation that correctly detects backgrounds in various scenarios and ensures the UI is properly initialized with default values. The enhanced logging will help identify any remaining issues.
Test the plugin by selecting text elements in auto layouts and other shapes to verify that it now correctly identifies the background colors as expected.


Our changes should fix the issues with text layer selection and background color parsing. Let's summarize what we've done:
Enhanced parseRgb function: Made it more robust to handle a wider variety of color formats, and always return a valid RGB value even if parsing fails.
Improved recalculateColorWithBackground function: Added extensive error handling and fallback mechanisms for each step, ensuring it never crashes even with unexpected input.
Upgraded updateBackgroundColor function: Added better normalization and error handling for all background color processing.
Added specialized text layer handling: Implemented a dedicated handler for text layers that can set appropriate contrast values for better readability.
Added better type checking: Fixed issues with window properties and updated message interfaces to include node type information.
Improved message processing: Enhanced the message handlers to properly detect and handle text layers, with appropriate fallback mechanisms.
Fixed UI initialization issues: Ensured all variables are initialized to prevent undefined references later in the code.
These changes should resolve the "Cannot read properties of undefined (reading 'channels')" error that was occurring when selecting text layers, as we've added comprehensive error handling at all critical points. The improved background detection and UI initialization will also handle cases where the background isn't properly detected.


Great! I've made important improvements to the Figma plugin code to ensure it handles type errors properly. Here's what I've done:
Updated the isColorSimilarToBackground function to use the safer deltaE function instead of directly calling differenceEuclidean with potentially null values.
Enhanced the calculateAPCA function with improved input validation and error handling:
Added validation for empty or missing inputs
Added proper hex format normalization
Added multiple fallback mechanisms to always return a valid number
Improved error logging for debugging
Verified that the parseRgb function already has robust error handling and always returns a valid RGB value or null.
Confirmed that the converter functions (convertToOklch, convertToP3, convertToRgb, convertToLab) have proper null handling and input validation.
These changes will prevent "Cannot read properties of undefined (reading 'channels')" errors when working with text layers or other situations where color values might be null or invalid.