declare global {
    interface Window {
        updateColorPreview?: typeof updateColorPreview;
        lastTextPreviewColor?: string;
    }
}
declare function updateColorPreview(preview: HTMLElement, color: string, background: string, allFills?: Array<{
    color: string;
    opacity: number;
    blendMode?: string;
    cssBlendMode?: string;
    visible: boolean;
}>): void;
export {};
