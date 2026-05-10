const ASSET_PATHS = {
  field: new URL("../../assets/field.png", import.meta.url).href,
  ball: new URL("../../assets/ball.png", import.meta.url).href,
  up: new URL("../../assets/running-up-nonbg.png", import.meta.url).href,
  down: new URL("../../assets/running-down-nonbg.png", import.meta.url).href,
  right: new URL("../../assets/running-right-nonbg.png", import.meta.url).href,
  shoot: new URL("../../assets/shoot-right-nonbg.png", import.meta.url).href,
  slideBlue: new URL("../../assets/slide-blue.png", import.meta.url).href,
  slideRed: new URL("../../assets/slide-red.png", import.meta.url).href,
};

export interface SpriteSet {
  up: ImageBitmap[];
  down: ImageBitmap[];
  right: ImageBitmap[];
  shoot: ImageBitmap[];
}

export const assets: {
  field: HTMLImageElement | null;
  ball: HTMLImageElement | null;
  blue: SpriteSet | null;
  red: SpriteSet | null;
  slideBlue: ImageBitmap[] | null;
  slideRed: ImageBitmap[] | null;
} = { field: null, ball: null, blue: null, red: null, slideBlue: null, slideRed: null };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function recolorBlueToRed(srcImg: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = srcImg.width;
  canvas.height = srcImg.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(srcImg, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 8) continue;
    // Blue jersey pixels: blue dominates over red, brightness not near black
    if (b > r + 20 && b > 50 && b > g - 20) {
      d[i] = b;     // R = old B (now red-dominant)
      d[i + 1] = g;
      d[i + 2] = r; // B = old R
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function getAlphaBBox(canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] >= 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function sliceSheet(source: CanvasImageSource, totalW: number, totalH: number, frames: number): Promise<ImageBitmap[]> {
  const fw = Math.floor(totalW / frames);
  const out: ImageBitmap[] = [];
  const tmp = document.createElement("canvas");
  tmp.width = fw; tmp.height = totalH;
  const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
  for (let i = 0; i < frames; i++) {
    tctx.clearRect(0, 0, fw, totalH);
    tctx.drawImage(source, i * fw, 0, fw, totalH, 0, 0, fw, totalH);
    const bbox = getAlphaBBox(tmp);
    if (bbox) {
      out.push(await createImageBitmap(tmp, bbox.x, bbox.y, bbox.w, bbox.h));
    } else {
      out.push(await createImageBitmap(tmp));
    }
  }
  return out;
}

async function buildSpritePair(url: string, frames: number): Promise<{ blue: ImageBitmap[]; red: ImageBitmap[] }> {
  const img = await loadImage(url);
  const w = img.width, h = img.height;
  const redCanvas = recolorBlueToRed(img);
  const [blue, red] = await Promise.all([
    sliceSheet(img, w, h, frames),
    sliceSheet(redCanvas, w, h, frames),
  ]);
  return { blue, red };
}

export async function preloadAndTintAssets(): Promise<void> {
  const [field, ball, up, down, right, shoot] = await Promise.all([
    loadImage(ASSET_PATHS.field),
    loadImage(ASSET_PATHS.ball),
    buildSpritePair(ASSET_PATHS.up, 8),
    buildSpritePair(ASSET_PATHS.down, 8),
    buildSpritePair(ASSET_PATHS.right, 8),
    buildSpritePair(ASSET_PATHS.shoot, 6),
  ]);
  assets.field = field;
  assets.ball = ball;
  assets.blue = { up: up.blue, down: down.blue, right: right.blue, shoot: shoot.blue };
  assets.red = { up: up.red, down: down.red, right: right.red, shoot: shoot.red };

  // Optional slide sprite sheets — 8 frames horizontally
  const [sbImg, srImg] = await Promise.all([
    loadImage(ASSET_PATHS.slideBlue).catch(() => null),
    loadImage(ASSET_PATHS.slideRed).catch(() => null),
  ]);
  if (sbImg) assets.slideBlue = await sliceSheetEqual(sbImg, 8);
  if (srImg) assets.slideRed  = await sliceSheetEqual(srImg, 8);
}

async function sliceSheetEqual(img: HTMLImageElement, frames: number): Promise<ImageBitmap[]> {
  const fw = Math.floor(img.width / frames);
  const fh = img.height;
  const out: ImageBitmap[] = [];
  for (let i = 0; i < frames; i++) {
    out.push(await createImageBitmap(img, i * fw, 0, fw, fh));
  }
  return out;
}

export function playSfx(_name: string): void {
  // No-op per GDD section 10
}
