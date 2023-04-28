import { EditorView, ViewUpdate } from "@codemirror/view";
import {
  Diagnostic,
  forEachDiagnostic,
  setDiagnosticsEffect,
} from "@codemirror/lint";

import { LineBasedState } from ".";
import { DrawContext } from "../types";
import { Lines, LinesState } from "../LinesState";

type Severity = Diagnostic["severity"];

export class DiagnosticState extends LineBasedState<Severity> {
  public constructor(view: EditorView) {
    super(view);
  }

  private shouldUpdate(update: ViewUpdate) {
    // If the doc changed
    if (update.docChanged) {
      return true;
    }

    // If the diagnostics changed
    for (const tr of update.transactions) {
      for (const ef of tr.effects) {
        if (ef.is(setDiagnosticsEffect)) {
          return true;
        }
      }
    }

    /* TODO handle folds changing */
    const changedFolds = true;
    if (changedFolds) {
      return true;
    }

    return false;
  }

  public update(update: ViewUpdate) {
    if (!this.shouldUpdate(update)) {
      return;
    }

    this.map.clear();
    const lines = update.state.field(LinesState);

    forEachDiagnostic(update.state, (diagnostic, from, to) => {
      // Find the start and end lines for the diagnostic
      const lineStart = this.findLine(from, lines);
      const lineEnd = this.findLine(to, lines);

      // Populate each line in the range with the highest severity diagnostic
      let severity = diagnostic.severity;
      for (let i = lineStart; i <= lineEnd; i++) {
        const previous = this.get(i);
        if (previous) {
          severity = [severity, previous].sort(this.sort).slice(0, 1)[0];
        }
        this.set(i, severity);
      }
    });
  }

  public drawLine(ctx: DrawContext, lineNumber: number) {
    const { context, lineHeight, offsetY, scale } = ctx;
    const severity = this.get(lineNumber);
    if (!severity) {
      return;
    }

    // Draw the full line width rectangle in the background
    context.globalAlpha = 0.65;
    context.beginPath();
    context.rect(
      0,
      offsetY /* TODO Scaling causes anti-aliasing in rectangles */,
      context.canvas.width * scale,
      lineHeight
    );
    context.fillStyle = this.color(severity);
    context.fill();

    // Draw diagnostic range rectangle in the foreground
    // TODO: We need to update the state to have specific ranges
    // context.globalAlpha = 1;
    // context.beginPath();
    // context.rect(offsetX, offsetY, textWidth, lineHeight);
    // context.fillStyle = this.color(severity);
    // context.fill();
  }

  /**
   * Given a position and a set of line ranges, return
   * the line number the position falls within
   */
  private findLine(pos: number, lines: Lines) {
    const index = lines.findIndex((spans) => {
      const start = spans.slice(0, 1)[0];
      const end = spans.slice(-1)[0];

      if (!start || !end) {
        return false;
      }

      return start.from <= pos && pos <= end.to;
    });

    // Line numbers begin at 1
    return index + 1;
  }

  /**
   * Colors from @codemirror/lint
   * https://github.com/codemirror/lint/blob/e0671b43c02e72766ad1afe1579b7032fdcdb6c1/src/lint.ts#L597
   */
  private color(severity: Severity) {
    return severity === "error"
      ? "#d11"
      : severity === "warning"
      ? "orange"
      : "#999";
  }

  /**
   * Sorts severity from most to least severe, where
   * error > warning > info
   */
  private sort(a: Severity, b: Severity) {
    return (
      (b === "error" ? 3 : b === "warning" ? 2 : 1) -
      (a === "error" ? 3 : a === "warning" ? 2 : 1)
    );
  }
}

export function diagnostics(view: EditorView): DiagnosticState {
  return new DiagnosticState(view);
}
