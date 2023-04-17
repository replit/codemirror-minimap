import { foldedRanges, highlightingFor, language } from "@codemirror/language";
import {
  EditorState,
  Text,
  SelectionRange,
  Extension,
  Facet,
  combineConfig,
} from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  PluginValue,
} from "@codemirror/view";
import {
  Diagnostic,
  forEachDiagnostic,
  setDiagnosticsEffect,
} from "@codemirror/lint";
import { highlightTree, getStyleTags, Highlighter } from "@lezer/highlight";
import { overlay } from "./overlay";
import { Config, config as minimapConfig } from "./config";

type LineData = {
  text: Array<LineText>;
  selections: Array<LineSelection>;
  diagnostic: Diagnostic["severity"] | undefined;
};
type LineText = { text: string; tags?: string };
type LineSelection = { from: number; to: number; continues: boolean };

type FontInfo = { color: string; font: string; fontSize: number };
type SelectionInfo = { backgroundColor: string };

const minimapTheme = EditorView.theme({
  "&": {
    // display: "flex",
    // flexDirection: "row",
    height: "100%",
    overflowY: "auto",
  },
  "& .cm-focused": {
    outline: "none",
  },
  "& .cm-scroller": {
    // flexGrow: 1,
    // overflowX: "auto",
    // flexShrink: 1,
  },
  "& .cm-content": {
    overflowX: "auto",
    flexShrink: 1,
  },
});

const CANVAS_MAX_WIDTH = 120;
const SCALE = 3;

export class Minimap {
  public _gutter: HTMLDivElement;
  /*private*/ public _container: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _view: EditorView;

  private _themeClasses: string;
  private _fontInfoMap: Map<string, FontInfo> = new Map();
  private _selectionInfo: SelectionInfo | undefined;

  private _displayText: Required<Config>["displayText"];

  public constructor(view: EditorView) {
    this._view = view;

    this._canvas = document.createElement("canvas");
    this._container = document.createElement("div");
    this._container.classList.add("cm-minimap");

    this._gutter = document.createElement("div");
    this._gutter.style.width = CANVAS_MAX_WIDTH + "px";
    // this._gutter.style.minHeight = this._view.contentHeight + "px";
    this._gutter.style.flexShrink = "0";
    this._gutter.style.position = "sticky";
    this._gutter.style.top = "0";
    // this._gutter.style.height = "100%";

    // this._gutter.style.backgroundColor = "red";
    this._view.scrollDOM.insertBefore(
      this._gutter,
      this._view.contentDOM.nextSibling
    );

    this._canvas.style.maxWidth = CANVAS_MAX_WIDTH + "px";

    this._canvas.addEventListener("click", (e) => {
      const mappedPosition = e.clientY * SCALE * 2 * 1.4;
      const halfEditorHeight = this._view.scrollDOM.clientHeight / 2;
      this._view.scrollDOM.scrollTop = mappedPosition - halfEditorHeight;

      e.preventDefault();
      e.stopPropagation();
    });

    // this._container.style.position = "relative";
    // this._container.style.overflow = "hidden";

    this._container.style.position = "absolute";
    this._container.style.top = 0 + "px";
    this._container.style.right = 0 + "px";
    this._container.style.height = "100%";

    this._container.appendChild(this._canvas);
    this._gutter.appendChild(this._container);
    // this._view.dom.appendChild(this._container);
    // this._view.dom.insert

    const config = view.state.facet(minimapConfig);
    this.setDisplayText(config.displayText);
    this._themeClasses = view.dom.classList.value;
  }

  public setDisplayText(displayText: Required<Config>["displayText"]) {
    this._displayText = displayText;
  }

  /**
   * build lines could have all the line data, then we have different "decorators"
   * off of that line data state
   *
   * - State -> Line Data State
   *
   * --> Decorators:
   *   - Text decorator
   *   - Box decorator
   *   - Selection decorator
   *   - Diagnostics decorator
   *   - (Future) git decorator
   *   - (Future) search decorator
   */

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

    const diagnostics = updateDiagnostics(state);
    console.log(diagnostics);

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

      /* START DIAGNOSTICS */

      /* END DIAGNOSTICS */

      if (lineText === "") {
        lines.push({
          text: [{ text: "" }],
          selections: selectionsInLine,
          diagnostic: diagnostics.get(i),
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

        continue;
      }

      // Otherwise, just append the line as normal
      lines.push({
        text: spans,
        selections: selectionsInLine,
        diagnostic: diagnostics.get(i),
      });
    }

    return lines;
  }

  public render(lines: Array<LineData>) {
    console.log("Rerender");
    if (this._themeClasses !== this._view.dom.classList.value) {
      this.clearFontInfo();
      this._themeClasses = this._view.dom.classList.value;
    }

    const containerX = this._view.scrollDOM.clientWidth;
    const contentX = this._view.scrollDOM.scrollWidth;

    // console.log(containerX, contentX);

    if (containerX < contentX) {
      this._container.style.boxShadow = "12px 0px 20px 5px #6c6c6c";
    } else {
      this._container.style.boxShadow = "inherit";
    }

    if (containerX <= SCALE * CANVAS_MAX_WIDTH) {
      const ratio = containerX / (SCALE * CANVAS_MAX_WIDTH);

      this._canvas.width = CANVAS_MAX_WIDTH * ratio * 2;
    } else {
      this._canvas.width = CANVAS_MAX_WIDTH * 2;
    }

    // this._canvas.height = this._container.clientHeight * 2;
    // this._canvas.style.height = this._container.clientHeight + "px";
    this._canvas.height = 1000;
    this._canvas.style.height = "500px";

    const context = this._canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, this._canvas.width, this._canvas.height);

    context.scale(1 / SCALE, 1 / SCALE);

    const { top: paddingTop } = this._view.documentPadding;
    let heightOffset = paddingTop;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let x = 0;

      const lineText = line.text.map((t) => t.text).join("");

      let lineHeight = 0;

      for (let j = 0; j < line.text.length; j++) {
        context.textBaseline = "ideographic";
        const info = this.getFontInfo(line.text[j]);

        context.fillStyle = info.color;
        context.font = info.font;
        lineHeight = Math.max(lineHeight, info.fontSize);

        if (this._displayText === "characters") {
          // TODO: `fillText` takes up the majority of profiling time in `render`
          // Try speeding it up with `drawImage`
          // https://stackoverflow.com/questions/8237030/html5-canvas-faster-filltext-vs-drawimage/8237081
          context.fillText(line.text[j].text, x, heightOffset + lineHeight);
          x += context.measureText(line.text[j].text).width;
        }

        if (this._displayText === "blocks") {
          const characters = line.text[j].text;

          /* Each block's width is 3/4 of its height */
          const widthMultiplier = 0.75;

          const nonWhitespaceRegex = /\S+/g;
          // const whitespaceRanges: [number, number][] = [];
          let match: RegExpExecArray | null;
          while ((match = nonWhitespaceRegex.exec(characters)) !== null) {
            const start = match.index;
            const end = nonWhitespaceRegex.lastIndex;

            context.globalAlpha = 0.65; // Make the blocks a bit faded
            context.beginPath();
            context.rect(
              x + start * lineHeight,
              heightOffset,
              (end - start) * lineHeight * widthMultiplier,
              lineHeight - 2 /* 2px buffer between lines */
            );
            context.fill();
          }

          x += characters.length * lineHeight * widthMultiplier;
        }
      }

      for (let j = 0; j < line.selections.length; j++) {
        const selection = line.selections[j];
        const prefix = context.measureText(lineText.slice(0, selection.from));
        const text = context.measureText(
          lineText.slice(selection.from, selection.to)
        );

        context.beginPath();
        context.rect(
          prefix.width,
          heightOffset,
          selection.continues
            ? this._canvas.width * SCALE - prefix.width
            : text.width,
          lineHeight
        );
        context.fillStyle = this.getSelectionInfo().backgroundColor;

        context.fill();
      }

      if (line.diagnostic) {
        context.globalAlpha = 0.65;
        context.fillStyle =
          line.diagnostic === "error"
            ? "red"
            : line.diagnostic === "warning"
            ? "yellow"
            : "blue"; // TODO: Does this need to be customized?
        context.beginPath();
        context.rect(
          0,
          heightOffset,
          this._canvas.width * SCALE,
          lineHeight /* - 2 */ /* Do we want 2px buffer between lines? */
        );
        context.fill();
      }

      heightOffset += lineHeight;
    }

    context.restore();
  }

  public destroy() {
    this._gutter.remove();
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

  /**
   * Clears the font info storage. Useful when themes change and we need to
   * recompute font info for new theme classes
   */
  private clearFontInfo(): void {
    this._fontInfoMap.clear();
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

const minimapView = ViewPlugin.fromClass(
  class {
    minimap: Minimap;
    config: Config;

    constructor(readonly view: EditorView) {
      this.minimap = new Minimap(view);
      this.config = view.state.facet(minimapConfig);
      minimapElement.of(this.minimap._container);
    }

    update(update: ViewUpdate) {
      const config = update.state.facet(minimapConfig);
      const previousConfig = update.startState.facet(minimapConfig);
      const configChanged = previousConfig !== config;
      if (configChanged) {
        this.minimap.setDisplayText(config.displayText);
      }

      let diagnostics;
      for (const tr of update.transactions) {
        for (const ef of tr.effects) {
          if (ef.is(setDiagnosticsEffect)) {
            // We shouldn't have to recompute this in render, we should pass it in to a "diagnostics decorator"
            diagnostics = updateDiagnostics(update.state);
          }
        }
      }

      if (
        diagnostics ||
        configChanged ||
        update.heightChanged ||
        update.docChanged ||
        update.selectionSet ||
        update.geometryChanged
      ) {
        const lines = this.minimap.buildLines(update.state);
        this.minimap.render(lines);
      }
    }

    destroy() {
      this.minimap.destroy();
    }
  },
  { provide: () => [overlay()] }
);

function updateDiagnostics(state: EditorState) {
  const linesWithDiagnostics = new Set<number>();
  const severityMap = new Map<number, Diagnostic["severity"]>();
  forEachDiagnostic(state, (diagnostic, diagnosticFrom, diagnosticTo) => {
    const fromLine = state.doc.lineAt(diagnosticFrom);
    const toLine = state.doc.lineAt(diagnosticTo);
    let severity = diagnostic.severity;

    for (let i = fromLine.number; i <= toLine.number; i++) {
      linesWithDiagnostics.add(i);

      const existing = severityMap.get(i);
      if (existing) {
        severity = [severity, existing]
          .sort(
            (a, b) =>
              (b === "error" ? 3 : b === "warning" ? 2 : 1) -
              (a === "error" ? 3 : a === "warning" ? 2 : 1)
          )
          .slice(0, 1)[0];
      }
      severityMap.set(i, severity);
    }
  });

  return severityMap;
}

// TODO: Move this out. This shouldn't be here
export const minimapElement = Facet.define<HTMLDivElement, HTMLDivElement>({
  combine: (el) => el[0],
});

export function minimap(config: Config = {}): Extension {
  return [minimapTheme, minimapConfig.of(config), minimapView];
}
