function updateAPCADescription(apcaValue: number) {
  const apcaDescription = document.getElementById('apcaDescription');
  if (!apcaDescription) return;
  
  // Get the description text based on the APCA value
  const description = getAPCADescription(apcaValue);
  
  // Set the description text
  apcaDescription.textContent = description;
  
  // Set the color based on Figma color variables rather than dynamic variables
  // This ensures consistent styling regardless of the current color preview
  apcaDescription.style.color = 'var(--figma-color-text-secondary)';
  
  // Set the color based on Figma color variables rather than dynamic variables
  // This ensures consistent styling regardless of the current color preview
  apcaDescription.style.color = 'var(--figma-color-text-secondary)';
  
  // Set the color based on Figma color variables rather than dynamic variables
  // This ensures consistent styling regardless of the current color preview
  apcaDescription.style.color = 'var(--figma-color-text-secondary)';
  
  // Force a repaint to ensure the color is updated
  apcaDescription.style.display = 'block';

  // Set the description text
  apcaDescription.textContent = description;
  
  // Set the color based on Figma color variables rather than dynamic variables
  // This ensures consistent styling regardless of the current color preview
  apcaDescription.style.color = 'var(--figma-color-text-secondary)';
  
  // Force a repaint to ensure the color is updated
  apcaDescription.style.display = 'block';
}