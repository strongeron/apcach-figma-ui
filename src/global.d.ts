declare const __html__: string;

interface Window {
  onmessage: ((this: Window, ev: MessageEvent) => any) | null;
  isProcessingAPCACH?: boolean;
  apcachObserverInitialized?: boolean;
  userChangedColor?: boolean;
  lastTextPreviewColor?: string;
} 