/**
 * Large photos are split into tiles.
 *
 * iPad Safari limits a single canvas to about 16.7 million pixels, but a Nikon D5600
 * photo is 24 million. Storing the photo as 2048 × 2048 tiles avoids that limit and
 * prepares for later phases, where edits are processed tile by tile.
 *
 * Each tile also includes a couple of pixels from its right and bottom neighbours
 * (`TILE_OVERLAP`). When tiles are drawn at fractional screen positions, the overlap
 * hides the thin seams that would otherwise appear between them.
 */

export const TILE_SIZE = 2048;
export const TILE_OVERLAP = 2;

export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function tileGrid(
  width: number,
  height: number,
  tileSize = TILE_SIZE,
  overlap = TILE_OVERLAP,
): TileRect[] {
  const tiles: TileRect[] = [];
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      tiles.push({
        x,
        y,
        width: Math.min(tileSize + overlap, width - x),
        height: Math.min(tileSize + overlap, height - y),
      });
    }
  }
  return tiles;
}
