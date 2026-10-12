/**
 * Large photos are split into tiles.
 *
 * GPUs and iPad Safari limit how big one image can be, and a Nikon D5600 photo is
 * 6000 × 4000 pixels. Splitting it into 2048 × 2048 tiles stays well inside every limit.
 *
 * Each tile has a `core` (the area it is responsible for drawing) and a `padded`
 * area that adds a few pixels from its neighbours. When the GPU smooths pixels at a
 * tile's edge, or sharpening and noise reduction look at nearby pixels (up to 4 away),
 * it reads those borrowed pixels, so no seams appear between tiles.
 */

export const TILE_SIZE = 2048;
export const TILE_BORDER = 8;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Tile {
  core: Rect;
  padded: Rect;
}

export function tileGrid(
  width: number,
  height: number,
  tileSize = TILE_SIZE,
  border = TILE_BORDER,
): Tile[] {
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const core = {
        x,
        y,
        width: Math.min(tileSize, width - x),
        height: Math.min(tileSize, height - y),
      };
      const px = Math.max(0, x - border);
      const py = Math.max(0, y - border);
      const padded = {
        x: px,
        y: py,
        width: Math.min(width, core.x + core.width + border) - px,
        height: Math.min(height, core.y + core.height + border) - py,
      };
      tiles.push({ core, padded });
    }
  }
  return tiles;
}
