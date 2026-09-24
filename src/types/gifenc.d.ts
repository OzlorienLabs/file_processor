/** The slice of gifenc (https://github.com/mattdesl/gifenc) FileKit uses; the package ships no types. */
declare module 'gifenc' {
  export type Palette = number[][];

  export interface WriteFrameOptions {
    palette?: Palette;
    /** Frame delay in milliseconds; GIF stores it rounded to hundredths of a second. */
    delay?: number;
    transparent?: boolean;
    transparentIndex?: number;
    /** -1 plays once, 0 loops forever, a positive number repeats that many times. */
    repeat?: number;
    dispose?: number;
  }

  export interface GifEncoderStream {
    writeFrame(index: Uint8Array, width: number, height: number, options?: WriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): GifEncoderStream;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: 'rgb565' | 'rgb444' | 'rgba4444' },
  ): Palette;
}
