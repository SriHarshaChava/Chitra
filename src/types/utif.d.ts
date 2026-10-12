// Minimal types for UTIF.js (https://github.com/photopea/UTIF.js), which ships without them.
declare module 'utif' {
  interface IFD {
    width: number;
    height: number;
    [tag: string]: unknown;
  }
  const UTIF: {
    decode(buffer: ArrayBuffer): IFD[];
    decodeImage(buffer: ArrayBuffer, ifd: IFD, ifds?: IFD[]): void;
    toRGBA8(ifd: IFD): Uint8Array;
    encodeImage(rgba: Uint8Array, width: number, height: number): ArrayBuffer;
  };
  export default UTIF;
}
