import { useEffect, useRef } from "react";
import { CLOTHES_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from "@cameroon-life/shared";

const FW = 16;
const FH = 24;
const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

/** Draws a white-mask sprite frame tinted with `color` (multiply, like Phaser's tint). */
function drawTinted(ctx: CanvasRenderingContext2D, img: HTMLImageElement, color: string, scale: number) {
  const off = document.createElement("canvas");
  off.width = FW;
  off.height = FH;
  const o = off.getContext("2d")!;
  o.drawImage(img, 0, 0, FW, FH, 0, 0, FW, FH);
  o.globalCompositeOperation = "multiply";
  o.fillStyle = color;
  o.fillRect(0, 0, FW, FH);
  o.globalCompositeOperation = "destination-in";
  o.drawImage(img, 0, 0, FW, FH, 0, 0, FW, FH);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, FW, FH, 0, 0, FW * scale, FH * scale);
}

export function CharacterPreview({ hair, skin, clothes, scale = 6 }: { hair: number; skin: number; clothes: number; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [body, cloth, hairImg] = await Promise.all([
        loadImage("/assets/sprites/body.png"),
        loadImage("/assets/sprites/clothes.png"),
        loadImage(`/assets/sprites/hair_${hair % HAIR_STYLES.length}.png`),
      ]);
      const canvas = ref.current;
      if (cancelled || !canvas) return;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawTinted(ctx, body, SKIN_TONES[skin % SKIN_TONES.length], scale);
      drawTinted(ctx, cloth, CLOTHES_COLORS[clothes % CLOTHES_COLORS.length], scale);
      drawTinted(ctx, hairImg, HAIR_COLORS[hair % HAIR_COLORS.length], scale);
    })();
    return () => {
      cancelled = true;
    };
  }, [hair, skin, clothes, scale]);

  return <canvas ref={ref} width={FW * scale} height={FH * scale} aria-label="Character preview" />;
}
