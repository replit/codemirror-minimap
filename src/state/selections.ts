import { LineBasedState } from ".";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { LineData } from "../index";

type Selection = { from: number; to: number; extends: boolean };
type DrawInfo = { backgroundColor: string };

// TODO: this should be a package-wide type
export type RangesWithState = {
  update: ViewUpdate;
  lines: LineData;
};

// TODO: this should be a package-wide type
export type DrawContext = {
  context: CanvasRenderingContext2D;
  offsetY: number;
  lineHeight: number;
  charWidth: number;
};

const SCALE = 3; // TODO global config

export class SelectionState extends LineBasedState<Array<Selection>> {
  private _drawInfo: DrawInfo | undefined;

  public constructor(view: EditorView) {
    super(view);
    this.getDrawInfo();
  }

  public update({ lines, update }: RangesWithState) {
    this.map.clear();

    let lineIndex = 0;
    for (const range of update.state.selection.ranges) {
      // Ignore selections of length 0
      if (range.from === range.to) {
        continue;
      }

      // Iterate through lines until we reach the line where the selection begins
      while (lineIndex < lines.length && lines[lineIndex].to < range.from) {
        lineIndex++;
      }

      do {
        // Create the `Selection` instance
        const line = lines[lineIndex];
        const selection = {
          from: Math.max(line.from, range.from) - line.from,
          to: Math.min(line.to, range.to) - line.from,
          extends: range.to > line.to,
        };

        // Lines are indexed beginning at 1 instead of 0
        const lineNumber = lineIndex + 1;

        // Add the selection to the line map
        const previous = this.map.get(lineNumber);
        this.map.set(
          lineNumber,
          previous ? previous.concat(selection) : [selection]
        );

        if (!selection.extends) {
          // The selection finished on our current line
          break;
        }
        lineIndex++;
      } while (lineIndex < lines.length);
    }
  }

  public drawLine(ctx: DrawContext, lineNumber: number) {
    const { context, lineHeight, charWidth, offsetY } = ctx;
    const selections = this.get(lineNumber);
    if (!selections) {
      return;
    }

    // TODO: Collapsed selections don't work
    for (const selection of selections) {
      const offsetX = selection.from * charWidth;
      const textWidth = (selection.to - selection.from) * charWidth;
      const fullWidth = context.canvas.width * SCALE /* Why? */ - offsetX;

      if (selection.extends) {
        // Draw the full width rectangle in the background
        context.globalAlpha = 0.5;
        context.beginPath();
        context.rect(offsetX, offsetY, fullWidth, lineHeight);
        context.fillStyle = this.getDrawInfo().backgroundColor;
        context.fill();
      }

      // Draw text selection rectangle in the foreground
      context.globalAlpha = 1;
      context.beginPath();
      context.rect(offsetX, offsetY, textWidth, lineHeight);
      context.fillStyle = this.getDrawInfo().backgroundColor;
      context.fill();
    }
  }

  private getDrawInfo(): DrawInfo {
    let result: DrawInfo;
    if (this._drawInfo) {
      result = this._drawInfo;
      // TODO: We should be exiting early here...
    } else {
      // Default to transparent
      result = { backgroundColor: "rgba(0, 0, 0, 0)" };
    }

    // Query for existing selection
    const selection = this.view.dom.querySelector(".cm-selectionBackground");

    // Get style information
    if (selection) {
      const style = window.getComputedStyle(selection);
      result = { backgroundColor: style.backgroundColor };
    }

    // Store the result for the next update
    this._drawInfo = result;

    return result;
  }
}

export function selections(view: EditorView): SelectionState {
  return new SelectionState(view);
}
