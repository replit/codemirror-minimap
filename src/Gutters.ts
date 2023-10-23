import { DrawContext } from "./types";

const GUTTER_WIDTH = 4;

type Line = number;
type Color = string;
export type Gutter = Record<Line, Color>;


/** 
 * Draws a gutter to the canvas context for the given line number
 */
function drawLineGutter(gutter: Record<Line, Color>, ctx: DrawContext, lineNumber: number) {
  const color = gutter[lineNumber];
  if (!color) {
    return;
  }

  ctx.context.fillStyle = color;
  ctx.context.globalAlpha = 1;
  ctx.context.beginPath();
  ctx.context.rect(ctx.offsetX, ctx.offsetY, GUTTER_WIDTH, ctx.lineHeight);
  ctx.context.fill();
}


export { GUTTER_WIDTH, drawLineGutter }