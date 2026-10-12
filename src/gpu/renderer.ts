/**
 * Draws photos with the GPU (WebGL2) and applies the develop settings live.
 *
 * Each frame, the visible tiles are drawn as rectangles; the fragment shader develops
 * every screen pixel from the stored linear data. Moving a slider only changes a few
 * numbers ("uniforms") sent to the GPU, so even a 24 MP photo updates instantly.
 */
import { rec2020From, rec2020To, type DisplayColorSpace, type Matrix3 } from '../color/colorSpaces';
import type { DevelopParams } from '../develop/developMath';
import { computeHistogram, type Histogram } from '../render/histogram';
import type { Rotation, SourceImage } from '../render/sourceImage';
import type { Rect } from '../render/tiles';
import type { View } from '../render/viewTransform';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';
import { applyToPoint, imageToClipMatrix } from './transform';

const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Above this zoom, pixels are drawn as crisp squares (useful for checking focus). */
const PIXELATED_FROM_SCALE = 2;
/** Long edge of the image rendered for the histogram. */
const HISTOGRAM_SIZE = 512;
/** Viewer background (#161616), drawn behind the photo. */
const BACKGROUND = 0x16 / 255;

interface GpuTile {
  core: Rect;
  padded: Rect;
  texture: WebGLTexture;
}

export interface GpuImage {
  width: number;
  height: number;
  rotation: Rotation;
  kind: SourceImage['kind'];
  isPreview: boolean;
  tiles: GpuTile[];
  overview: { texture: WebGLTexture; width: number; height: number };
}

/** `null` shows the image unedited (camera previews). */
export type RenderSettings = DevelopParams | null;

type UniformName =
  | 'u_rect'
  | 'u_toClip'
  | 'u_texRect'
  | 'u_tex'
  | 'u_sourceToRec2020'
  | 'u_develop'
  | 'u_input'
  | 'u_saturation'
  | 'u_vibrance'
  | 'u_blackPoint'
  | 'u_whitePoint'
  | 'u_shadows'
  | 'u_highlights'
  | 'u_contrast'
  | 'u_baseContrast'
  | 'u_output';

export class DevelopRenderer {
  readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms: Record<UniformName, WebGLUniformLocation | null>;
  private readonly outputMatrix: Matrix3;
  private readonly srgbToRec2020 = rec2020From('srgb');

  constructor(canvas: HTMLCanvasElement, displaySpace: DisplayColorSpace) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      // Keeps the last frame readable (used by tests and future "copy to clipboard").
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('This browser does not support WebGL2, which Chitra needs.');
    this.gl = gl;
    if ('drawingBufferColorSpace' in gl) gl.drawingBufferColorSpace = displaySpace;
    this.outputMatrix = rec2020To(displaySpace);

    this.program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    const names: UniformName[] = [
      'u_rect',
      'u_toClip',
      'u_texRect',
      'u_tex',
      'u_sourceToRec2020',
      'u_develop',
      'u_input',
      'u_saturation',
      'u_vibrance',
      'u_blackPoint',
      'u_whitePoint',
      'u_shadows',
      'u_highlights',
      'u_contrast',
      'u_baseContrast',
      'u_output',
    ];
    this.uniforms = Object.fromEntries(
      names.map((name) => [name, gl.getUniformLocation(this.program, name)]),
    ) as Record<UniformName, WebGLUniformLocation | null>;

    // One unit square (two triangles), reused for every tile.
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(this.program, 'a_unit');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** Copies a decoded image to GPU memory. */
  upload(source: SourceImage): GpuImage {
    const gl = this.gl;
    const base = {
      width: source.width,
      height: source.height,
      rotation: source.rotation,
      kind: source.kind,
      isPreview: source.isPreview,
    };
    if (source.kind === 'linear') {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
      const tiles = source.tiles.map(({ core, padded, levels }) => ({
        core,
        padded,
        texture: this.halfTexture(levels),
      }));
      const top = source.overview[0]!;
      return {
        ...base,
        tiles,
        overview: {
          texture: this.halfTexture(source.overview),
          width: top.width,
          height: top.height,
        },
      };
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    const tiles = source.tiles.map(({ core, padded, bitmap }) => ({
      core,
      padded,
      texture: this.bitmapTexture(bitmap),
    }));
    return {
      ...base,
      tiles,
      overview: {
        texture: this.bitmapTexture(source.overview),
        width: source.overview.width,
        height: source.overview.height,
      },
    };
  }

  disposeImage(image: GpuImage) {
    for (const tile of image.tiles) this.gl.deleteTexture(tile.texture);
    this.gl.deleteTexture(image.overview.texture);
  }

  /** Draws `image` (or just the background) to the canvas. */
  draw(image: GpuImage | null, view: View | null, settings: RenderSettings) {
    const gl = this.gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(BACKGROUND, BACKGROUND, BACKGROUND, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!image || !view) return;

    const toClip = imageToClipMatrix(image, view, width, height);
    this.useProgram(image, toClip, settings);

    const overviewScale = image.overview.width / image.width;
    if (view.scale <= overviewScale) {
      this.drawRect(image.overview.texture, fullRect(image), fullRect(image), gl.LINEAR);
      return;
    }
    const magFilter = view.scale >= PIXELATED_FROM_SCALE ? gl.NEAREST : gl.LINEAR;
    for (const tile of image.tiles) {
      if (!isVisible(tile.core, toClip)) continue;
      this.drawRect(tile.texture, tile.core, tile.padded, magFilter);
    }
  }

  /** Develops a small version of the whole photo and counts its pixel values. */
  histogram(image: GpuImage, settings: RenderSettings): Histogram {
    const gl = this.gl;
    const scale = Math.min(1, HISTOGRAM_SIZE / Math.max(image.width, image.height));
    const w = Math.max(1, Math.round(image.width * scale));
    const h = Math.max(1, Math.round(image.height * scale));

    const target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.viewport(0, 0, w, h);

    // Map the whole (unrotated) image onto the small framebuffer.
    const toClip: Matrix3 = [2 / image.width, 0, -1, 0, 2 / image.height, -1, 0, 0, 1];
    this.useProgram(image, toClip, settings);
    this.drawRect(image.overview.texture, fullRect(image), fullRect(image), gl.LINEAR);

    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(target);
    return computeHistogram(pixels);
  }

  private useProgram(image: GpuImage, toClip: Matrix3, settings: RenderSettings) {
    const gl = this.gl;
    const u = this.uniforms;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u.u_tex, 0);
    // WebGL matrices are column-major; ours are row-major, so ask WebGL to transpose.
    gl.uniformMatrix3fv(u.u_toClip, true, toClip);
    gl.uniformMatrix3fv(
      u.u_sourceToRec2020,
      true,
      image.kind === 'linear' ? IDENTITY : this.srgbToRec2020,
    );
    gl.uniformMatrix3fv(u.u_output, true, this.outputMatrix);
    gl.uniform1i(u.u_develop, settings ? 1 : 0);
    if (settings) {
      gl.uniformMatrix3fv(u.u_input, true, settings.inputMatrix);
      gl.uniform1f(u.u_saturation, settings.saturation);
      gl.uniform1f(u.u_vibrance, settings.vibrance);
      gl.uniform1f(u.u_blackPoint, settings.blackPoint);
      gl.uniform1f(u.u_whitePoint, settings.whitePoint);
      gl.uniform1f(u.u_shadows, settings.shadows);
      gl.uniform1f(u.u_highlights, settings.highlights);
      gl.uniform1f(u.u_contrast, settings.contrast);
      gl.uniform1f(u.u_baseContrast, settings.baseContrast);
    }
  }

  /** Draws `area` (image pixels) using a texture that covers `textureArea`. */
  private drawRect(texture: WebGLTexture, area: Rect, textureArea: Rect, magFilter: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
    gl.uniform4f(this.uniforms.u_rect, area.x, area.y, area.width, area.height);
    gl.uniform4f(
      this.uniforms.u_texRect,
      (area.x - textureArea.x) / textureArea.width,
      (area.y - textureArea.y) / textureArea.height,
      area.width / textureArea.width,
      area.height / textureArea.height,
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Half-float RGB texture with precomputed smaller levels (mipmaps). */
  private halfTexture(levels: { width: number; height: number; data: Uint16Array }[]) {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    levels.forEach((level, i) => {
      gl.texImage2D(
        gl.TEXTURE_2D,
        i,
        gl.RGB16F,
        level.width,
        level.height,
        0,
        gl.RGB,
        gl.HALF_FLOAT,
        level.data,
      );
    });
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, levels.length - 1);
    setSampling(gl, levels.length > 1);
    return texture;
  }

  /** 8-bit sRGB texture; the GPU converts sRGB to linear when sampling. */
  private bitmapTexture(bitmap: ImageBitmap) {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.generateMipmap(gl.TEXTURE_2D);
    setSampling(gl, true);
    return texture;
  }
}

function setSampling(gl: WebGL2RenderingContext, mipmapped: boolean) {
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

const fullRect = (image: { width: number; height: number }): Rect => ({
  x: 0,
  y: 0,
  width: image.width,
  height: image.height,
});

/** Skips tiles that are completely off screen. */
function isVisible(rect: Rect, toClip: Matrix3): boolean {
  const corners = [
    applyToPoint(toClip, rect.x, rect.y),
    applyToPoint(toClip, rect.x + rect.width, rect.y),
    applyToPoint(toClip, rect.x, rect.y + rect.height),
    applyToPoint(toClip, rect.x + rect.width, rect.y + rect.height),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return (
    Math.max(...xs) >= -1 && Math.min(...xs) <= 1 && Math.max(...ys) >= -1 && Math.min(...ys) <= 1
  );
}

function linkProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader link error: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}
