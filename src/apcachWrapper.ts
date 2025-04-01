import type { ApcachColor, ExtendedApcachColor } from './types';

// Now you can use ApcachColor type
export function someFunction(color: ApcachColor): ExtendedApcachColor {
  return {
    ...color,
    // Add any additional properties here
  };
} 