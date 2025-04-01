declare namespace figma {
  function showUI(html: string, options?: ShowUIOptions): void;
  function createFrame(): FrameNode;
  function createRectangle(): RectangleNode;
  function createText(): TextNode;
  function loadFontAsync(options: { family: string, style: string }): Promise<void>;
  function closePlugin(message?: string): void;
  function notify(message: string, options?: NotificationOptions): NotificationHandler;
  
  interface ShowUIOptions {
    visible?: boolean;
    width?: number;
    height?: number;
    title?: string;
    themeColors?: boolean;
  }

  interface PluginAPI {
    readonly apiVersion: "1.0.0";
    readonly command: string;
    readonly root: DocumentNode;
    readonly currentPage: PageNode;
    readonly viewport: ViewportAPI;
    readonly ui: UIAPI;

    notify(message: string, options?: NotificationOptions): NotificationHandler;
    showUI(html: string, options?: ShowUIOptions): void;
  }

  interface UIAPI {
    show(): void;
    hide(): void;
    resize(width: number, height: number): void;
    close(): void;
    postMessage(pluginMessage: any, options?: UIPostMessageOptions): void;
    onmessage: ((pluginMessage: any) => void) | undefined;
  }

  interface ViewportAPI {
    center: Vector;
    zoom: number;
    scrollAndZoomIntoView(nodes: ReadonlyArray<BaseNode>): void;
  }

  interface NotificationHandler {
    cancel: () => void;
  }

  interface NotificationOptions {
    timeout?: number;
    error?: boolean;
    button?: {
      text: string;
      action: () => void;
    };
  }

  type Vector = {
    readonly x: number;
    readonly y: number;
  };

  interface BaseNode {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
    removed: boolean;
  }

  interface SceneNode extends BaseNode {
    x: number;
    y: number;
    width: number;
    height: number;
    fills: Paint[];
    resize(width: number, height: number): void;
  }

  interface FrameNode extends SceneNode {
    layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
    itemSpacing: number;
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
    cornerRadius: number;
    appendChild(child: SceneNode): void;
  }

  interface RectangleNode extends SceneNode {
    cornerRadius: number;
  }

  interface TextNode extends SceneNode {
    characters: string;
    fontSize: number;
    fontFamily: string;
  }

  interface PageNode extends BaseNode {
    selection: ReadonlyArray<BaseNode>;
  }

  interface DocumentNode extends BaseNode {
    readonly type: "DOCUMENT";
    children: ReadonlyArray<PageNode>;
  }

  interface ChildrenMixin {
    readonly children: ReadonlyArray<BaseNode>;
  }

  const viewport: {
    center: { x: number, y: number };
    scrollAndZoomIntoView(nodes: ReadonlyArray<BaseNode>): void;
  };
  
  const currentPage: PageNode;
  
  const util: {
    solidPaint(color: string): Paint;
  };

  interface Paint {
    readonly type: string;
    readonly visible?: boolean;
    readonly opacity?: number;
  }

  interface RGB {
    readonly r: number;  // 0-1
    readonly g: number;  // 0-1
    readonly b: number;  // 0-1
  }

  interface UIPostMessageOptions {
    pluginMessage: any;
    origin?: string;
  }

  const ui: UIAPI;

  function on(type: "selectionchange", callback: () => void): void;
  function off(type: "selectionchange", callback: () => void): void;

  interface SolidPaint extends Paint {
    readonly type: "SOLID";
    readonly color: RGB;
  }

  interface GradientPaint extends Paint {
    type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND";
    gradientTransform: Transform;
    gradientStops: ColorStop[];
  }

  interface ImagePaint extends Paint {
    type: "IMAGE";
    scaleMode: "FILL" | "FIT" | "CROP" | "TILE";
    imageHash: string | null;
  }

  interface VideoPaint extends Paint {
    type: "VIDEO";
    videoHash: string;
    scaleMode: "FILL" | "FIT" | "CROP" | "TILE";
  }

  type Transform = [[number, number, number], [number, number, number]];

  interface ColorStop {
    position: number;
    color: RGBA;
  }

  interface RGBA extends RGB {
    a: number;
  }
}

declare module '*.html' {
  const content: string;
  export default content;
} 