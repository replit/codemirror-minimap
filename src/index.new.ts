import { foldedRanges, highlightingFor, language } from "@codemirror/language";
import {
  EditorState,
  Text,
  SelectionRange,
  Extension,
} from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

import { highlightTree, getStyleTags, Highlighter } from "@lezer/highlight";

type LineData = { text: Array<LineText>; selections: Array<LineSelection> };
type LineText = { text: string; tags?: string };
type LineSelection = { from: number; to: number; continues: boolean };

type FontInfo = { color: string; font: string; fontSize: number };
type SelectionInfo = { backgroundColor: string };

class Minimap {
  private _container: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _view: EditorView;

  private _fontInfoMap: Map<string, FontInfo> = new Map();
  private _selectionInfo: SelectionInfo | undefined;

  public constructor(view: EditorView) {
    this._view = view;

    this._canvas = document.createElement("canvas");
    this._container = document.createElement("div");

    this._container.style.position = "relative";
    this._container.style.minWidth = MINIMAP_WIDTH + "px";
    this._container.style.width = MINIMAP_WIDTH + "px";
    this._container.style.boxShadow = "12px 0px 20px 5px #6c6c6c";

    this._container.appendChild(this._canvas);
    this._view.dom.appendChild(this._container);
  }

  public buildLines(state: EditorState): Array<LineData> {
    const parser = state.facet(language)?.parser;
    if (!parser) {
      console.log("TODO: Handle no parser....");
      return [];
    }

    const doc = Text.of(state.doc.toString().split("\n"));
    const tree = parser.parse(doc.toString());
    const foldedRangeCursor = foldedRanges(state).iter();
    const highlighter: Highlighter = {
      style: (tags) => highlightingFor(state, tags),
    };

    const lines: Array<LineData> = [];
    let selectionIndex = 0;

    for (let i = 1; i <= doc.lines; i++) {
      let { from: lineFrom, to: lineTo, text: lineText } = doc.line(i);

      /* START FOLDED RANGES */
      // Iterate through folded ranges until we're at or past the current line
      while (foldedRangeCursor.value && foldedRangeCursor.to < lineFrom) {
        foldedRangeCursor.next();
      }

      const { from: foldFrom, to: foldTo } = foldedRangeCursor;
      const lineStartInFold = lineFrom >= foldFrom && lineFrom < foldTo;
      const lineEndInFold = lineTo > foldFrom && lineTo <= foldTo;

      // If we have a fold beginning part way through the line
      // we drop the folded tokens
      if (!lineStartInFold && lineEndInFold) {
        lineTo = foldFrom;
      }

      // If the line is fully within the fold we exclude it
      if (lineStartInFold && lineEndInFold) {
        continue;
      }

      // If we have a fold ending part way through the line
      // we append the remaining tokens to the previous line
      let appendingToPreviousLine = false;
      if (lineStartInFold && !lineEndInFold) {
        lineFrom = foldTo;
        appendingToPreviousLine = true;
      }
      /* END FOLDED RANGES */

      /* START SELECTIONS */
      const selectionsInLine: Array<LineSelection> = [];
      do {
        if (!state.selection.ranges[selectionIndex]) {
          break;
        }
        const { from: sFrom, to: sTo } = state.selection.ranges[selectionIndex];

        const startsInLine = lineFrom <= sFrom && lineTo >= sFrom;
        const endsInLine = lineFrom <= sTo && lineTo >= sTo;
        const crossesLine = lineFrom > sFrom && lineTo < sTo;

        if (startsInLine || endsInLine || crossesLine) {
          // Only add if selection length is greater than 0
          if (sFrom != sTo) {
            selectionsInLine.push({
              from: Math.max(sFrom - lineFrom, 0),
              to: Math.min(sTo - lineFrom, lineTo - lineFrom),
              continues: !endsInLine,
            });

            if (!endsInLine) {
              break;
            }
          }
        } else {
          break;
        }

        selectionIndex += 1;
      } while (selectionIndex < state.selection.ranges.length);
      /* END SELECTIONS */

      if (lineText === "") {
        lines.push({
          text: [{ text: "" }],
          selections: selectionsInLine,
        });
        continue;
      }

      const spans: Array<LineText> = [];

      let pos = lineFrom;
      highlightTree(
        tree,
        highlighter,
        (from, to, tags) => {
          if (from > pos) {
            spans.push({ text: doc.sliceString(pos, from) });
          }

          spans.push({ text: doc.sliceString(from, to), tags });

          pos = to;
        },
        lineFrom,
        lineTo
      );

      if (pos < lineTo) {
        spans.push({ text: doc.sliceString(pos, lineTo) });
      }

      if (appendingToPreviousLine) {
        const prevLine = lines[lines.length - 1];

        // Add spacer, trailing line text to previous line
        const spacer = { text: "…" };
        prevLine.text = prevLine.text.concat([spacer, ...spans]);

        // Update previous selections
        if (prevLine.selections.length > 0) {
          // If our last selection continued, add a selection for the spacer
          if (prevLine.selections[prevLine.selections.length - 1].continues) {
            prevLine.selections[prevLine.selections.length - 1].to += 1;
          }

          // Selections in this line can no longer continue, as we're appending to it
          prevLine.selections = prevLine.selections.map((s) => ({
            ...s,
            continues: false,
          }));
        }

        // Adjust trailing line selection positions
        const spansLength = spans.reduce((p, c) => p + c.text.length, 0);
        const prevLength = prevLine.text.reduce((v, c) => v + c.text.length, 0);
        let adjustedSelections = selectionsInLine.map((s) => ({
          ...s,
          from: s.from + prevLength - spansLength,
          to: s.to + prevLength - spansLength,
        }));

        if (prevLine.selections.length > 0 && adjustedSelections.length > 0) {
          const last = prevLine.selections.slice(-1)[0];
          const firstAdditional = adjustedSelections.slice(-1)[0];
          // Combine consecutive selections if possible
          if (last.to === firstAdditional.from) {
            prevLine.selections[prevLine.selections.length - 1] = {
              from: last.from,
              to: firstAdditional.to,
              continues: firstAdditional.continues,
            };

            // Remove that selection
            adjustedSelections = adjustedSelections.slice(1);
          }
        }

        // Add remaining trailing line selections to previous line
        prevLine.selections = prevLine.selections.concat(adjustedSelections);

        console.log(prevLine.selections);
        continue;
      }

      // Otherwise, just append the line as normal
      lines.push({ text: spans, selections: selectionsInLine });
    }

    return lines;
  }

  public render(lines: Array<LineData>) {
    const context = this._canvas.getContext("2d");
    if (!context) {
      return;
    }

    const MINIMAP_SCALE = 1;
    // const fontFamily = "monospace";
    // const fontSize = 12;
    const lineHeightMultiple = 1;
    // ctx.font = `${fontSize}px ${fontFamily}`;

    /* TODO height+scale is challenging. Right now this clips overflow... */
    // canvas.style.height = "100%";
    // canvas.height = canvas.offsetHeight;

    context.scale(1 / MINIMAP_SCALE, 1 / MINIMAP_SCALE);
    // canvas.height = lineHeight * lines.length;
    // canvas.height = lines.length * lineHeight;
    let heightOffset = 0;
    // canvas.height +=

    this._canvas.height = 2500;
    // ctx.scale(1 / 2, 1 / 2);
    // Each time canvas height is set, canvas contents are cleared

    console.log("Painting..");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let x = 0;

      // const y = (i + 1) * lineHeightMultiple; /* line height */

      const lineText = line.text.map((t) => t.text).join("");

      let lineHeight = 0;

      for (let j = 0; j < line.text.length; j++) {
        context.textBaseline = "ideographic";
        const info = this.getFontInfo(line.text[j]);
        // console.log(info);
        context.fillStyle = info.color;
        context.font = info.font;
        // console.log(ctx.font);

        lineHeight = Math.max(lineHeight, info.fontSize);

        context.fillText(line.text[j].text, x, heightOffset + lineHeight);

        x += context.measureText(line.text[j].text).width;
      }

      for (let j = 0; j < line.selections.length; j++) {
        const selection = line.selections[j];
        const prefix = context.measureText(lineText.slice(0, selection.from));
        const text = context.measureText(
          lineText.slice(selection.from, selection.to)
        );

        // console.log("Painting at ", heightOffset, " height", lineHeight);
        context.beginPath();
        context.rect(
          prefix.width,
          heightOffset,
          selection.continues ? this._canvas.width - prefix.width : text.width,
          lineHeight
        );
        context.fillStyle = this.getSelectionInfo().backgroundColor;
        console.log(this.getSelectionInfo().backgroundColor);
        context.fill();
      }

      // canvas.height += lineHeight;
      heightOffset += lineHeight;

      // canvas.height += Math.round(lineHeightMultiple * )
    }

    // canvas.height = totalLineHeight;
    context.restore();
  }

  public destroy() {
    this._container.remove();
  }

  private getFontInfo(token: LineText): FontInfo {
    const tags = token.tags ?? "";
    const cached = this._fontInfoMap.get(tags);
    if (cached) {
      return cached;
    }

    // Create a mock token
    const mockToken = document.createElement("span");
    mockToken.setAttribute("class", tags);
    this._view.contentDOM.appendChild(mockToken);

    // Get style information and store it
    const style = window.getComputedStyle(mockToken);
    const fontSize = Math.floor(
      parseFloat(style.fontSize) / /* MINIMAP_SCALE*/ 1
    );
    const result = {
      color: style.color,
      font: `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`,
      fontSize,
    };
    this._fontInfoMap.set(tags, result);

    // Clean up and return
    this._view.contentDOM.removeChild(mockToken);
    return result;
  }

  private getSelectionInfo(): SelectionInfo {
    let result: SelectionInfo;
    if (this._selectionInfo) {
      result = this._selectionInfo;
    } else {
      result = { backgroundColor: "rgba(0, 0, 0, 0)" };
    }
    // Query for existing selection
    const selection = this._view.dom.querySelector(".cm-selectionBackground");

    // // If null, temporarily return transparent. After one paint, we'll get the color
    // if (!selection) {
    //   return { backgroundColor: "rgba(0, 0, 0, 0)" };
    // }

    // Get style information
    if (selection) {
      const style = window.getComputedStyle(selection);
      result = { backgroundColor: style.backgroundColor };
    }

    this._selectionInfo = result;

    return result;
  }
}

const minimapTheme = EditorView.theme({
  "&": {
    display: "flex",
    flexDirection: "row",
    overflowY: "auto",
  },
  "& .cm-focused": {
    outline: "none",
  },
  "& .cm-scroller": {
    flexGrow: 1,
  },
});

const MINIMAP_WIDTH = 300;
const minimapView = ViewPlugin.fromClass(
  class {
    minimap: Minimap;

    constructor(readonly view: EditorView) {
      this.minimap = new Minimap(view);

      // overlayCanvas.style.opacity = "0.1";
      // overlayCanvas.style.backgroundColor = "black";
      // overlayCanvas.style.position = "absolute";
      // overlayCanvas.style.width = MINIMAP_WIDTH + "px";
      // overlayCanvas.style.height = getOverlayHeight(view);
      // overlayCanvas.style.top = getOverlayTop(view);
    }

    update(update: ViewUpdate) {
      const lines = this.minimap.buildLines(update.state);
      this.minimap.render(lines);
    }

    destroy() {
      this.minimap.destroy();
    }
  }
);

export function minimap(/* config: {...} */): Extension {
  return [minimapTheme, minimapView];
}
