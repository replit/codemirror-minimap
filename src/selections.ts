import { LineBasedState } from "./linebasedstate";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { LinesState, foldsChanged } from "./LinesState";
import { DrawContext } from "./types";
import { Config } from "./Config";

type Selection = { from: number; to: number; extends: boolean };
type DrawInfo = { backgroundColor: string };

export class SelectionState extends LineBasedState<Array<Selection>> {
  private _drawInfo: DrawInfo | undefined;
  private _themeClasses: string;

  public constructor(view: EditorView) {
    super(view);

    this.getDrawInfo();
    this._themeClasses = view.dom.classList.value;
  }

  private shouldUpdate(update: ViewUpdate) {
    // If the minimap is disabled
    if (!update.state.facet(Config).enabled) {
      return false;
    }

    // If the doc changed
    if (update.docChanged) {
      return true;
    }

    // If the selection changed
    if (update.selectionSet) {
      return true;
    }

    // If the theme changed
    if (this._themeClasses !== this.view.dom.classList.value) {
      return true;
    }

    // If the folds changed
    if (foldsChanged(update.transactions)) {
      return true;
    }

    return false;
  }

  public update(update: ViewUpdate) {
    if (!this.shouldUpdate(update)) {
      return;
    }

    this.map.clear();

    /* If class list has changed, clear and recalculate the selection style */
    if (this._themeClasses !== this.view.dom.classList.value) {
      this._drawInfo = undefined;
      this._themeClasses = this.view.dom.classList.value;
    }

    const { ranges } = update.state.selection;

    let selectionIndex = 0;
    for (const [index, line] of update.state.field(LinesState).entries()) {
      const selections: Array<Selection> = [];

      let offset = 0;
      for (const span of line) {
        do {
          // We've already processed all selections
          if (selectionIndex >= ranges.length) {
            continue;
          }

          // The next selection begins after this span
          if (span.to < ranges[selectionIndex].from) {
            continue;
          }

          // Ignore 0-length selections
          if (ranges[selectionIndex].from === ranges[selectionIndex].to) {
            selectionIndex++;
            continue;
          }

          // Build the selection for the current span
          const range = ranges[selectionIndex];
          const selection = {
            from: offset + Math.max(span.from, range.from) - span.from,
            to: offset + Math.min(span.to, range.to) - span.from,
            extends: range.to > span.to,
          };

          const lastSelection = selections.slice(-1)[0];
          if (lastSelection && lastSelection.to === selection.from) {
            // The selection in this span may just be a continuation of the
            // selection in the previous span

            // Adjust `to` depending on if we're in a folded span
            let { to } = selection;
            if (span.folded && selection.extends) {
              to = selection.from + 1;
            } else if (span.folded && !selection.extends) {
              to = lastSelection.to;
            }

            selections[selections.length - 1] = {
              ...lastSelection,
              to,
              extends: selection.extends,
            };
          } else if (!span.folded) {
            // It's a new selection; if we're not in a folded span we
            // should push it onto the stack
            selections.push(selection);
          }

          // If the selection doesn't end in this span, break out of the loop
          if (selection.extends) {
            break;
          }

          // Otherwise, move to the next selection
          selectionIndex++;
        } while (
          selectionIndex < ranges.length &&
          span.to >= ranges[selectionIndex].from
        );

        offset += span.folded ? 1 : span.to - span.from;
      }

      // If we don't have any selections on this line, we don't need to store anything
      if (selections.length === 0) {
        continue;
      }

      // Lines are indexed beginning at 1 instead of 0
      const lineNumber = index + 1;
      this.map.set(lineNumber, selections);
    }
  }

  public drawLine(ctx: DrawContext, lineNumber: number) {
    let {
      context,
      lineHeight,
      charWidth,
      offsetX: startOffsetX,
      offsetY,
    } = ctx;
    const selections = this.get(lineNumber);
    if (!selections) {
      return;
    }

    for (const selection of selections) {
      const offsetX = startOffsetX + selection.from * charWidth;
      const textWidth = (selection.to - selection.from) * charWidth;
      const fullWidth = context.canvas.width - offsetX;

      if (selection.extends) {
        // Draw the full width rectangle in the background
        context.globalAlpha = 0.65;
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
    if (this._drawInfo) {
      return this._drawInfo;
    }

    // Create a mock selection
    const mockToken = document.createElement("span");
    mockToken.setAttribute("class", "cm-selectionBackground");
    this.view.dom.appendChild(mockToken);

    // Get style information
    const style = window.getComputedStyle(mockToken);
    const result = { backgroundColor: style.backgroundColor };

    // Store the result for the next update
    this._drawInfo = result;
    this.view.dom.removeChild(mockToken);

    return result;
  }
}

export function selections(view: EditorView): SelectionState {
  return new SelectionState(view);
}
