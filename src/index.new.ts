import { foldedRanges, highlightingFor, language } from "@codemirror/language";
import {
  EditorState,
  Text,
  SelectionRange,
  Extension,
  Facet,
  combineConfig,
} from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { forEachDiagnostic } from "@codemirror/lint";
import { highlightTree, getStyleTags, Highlighter } from "@lezer/highlight";

type LineData = { text: Array<LineText>; selections: Array<LineSelection> };
type LineText = { text: string; tags?: string };
type LineSelection = { from: number; to: number; continues: boolean };

type FontInfo = { color: string; font: string; fontSize: number };
type SelectionInfo = { backgroundColor: string };

const minimapTheme = EditorView.theme({
  "&": {
    display: "flex",
    flexDirection: "row",
    height: "100%",
    overflowY: "auto",
  },
  "& .cm-focused": {
    outline: "none",
  },
  "& .cm-scroller": {
    flexGrow: 1,
  },
  "& .overlay-show-mouse-over": {
    "& .overlay-container": {
      opacity: 0,
      visibility: "hidden",
      transition: "visibility 0s linear 300ms, opacity 300ms",
    },
  },
  "& .overlay-show-mouse-over:hover": {
    "& .overlay-container": {
      opacity: 1,
      visibility: "visible",
      transition: "visibility 0s linear 0ms, opacity 300ms",
    },
  },
  ".overlay": {
    background: "rgb(121, 121, 121)",
    opacity: "0.2",
    position: "absolute",
    right: 0,
    top: 0,
    width: "100%",
    transition: "top 0s ease-in 0ms",
    "&:hover": {
      opacity: "0.3",
    },
    "&.overlay-active": {
      opacity: "0.4",
    },
  },
});

const CANVAS_MAX_WIDTH = 120;
const SCALE = 3;

class Minimap {
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

    this._canvas.style.maxWidth = CANVAS_MAX_WIDTH + "px";

    this._canvas.addEventListener("click", (e) => {
      const mappedPosition = e.clientY * SCALE * 2 * 1.4;
      const halfEditorHeight = this._view.scrollDOM.clientHeight / 2;
      this._view.scrollDOM.scrollTop = mappedPosition - halfEditorHeight;

      e.preventDefault();
      e.stopPropagation();
    });

    this._container.style.position = "relative";
    this._container.style.overflow = "hidden";

    this._container.appendChild(this._canvas);
    this._view.dom.appendChild(this._container);

    const config = view.state.facet(minimapConfig);
    this.setShowOverlay(config.showOverlay);
    this.setDisplayText(config.displayText);
    this._themeClasses = view.dom.classList.value;
  }

  public setShowOverlay(showOverlay: Required<Config>["showOverlay"]) {
    if (showOverlay === "mouse-over") {
      this._container.classList.add("overlay-show-mouse-over");
    } else {
      this._container.classList.remove("overlay-show-mouse-over");
    }
  }
  public setDisplayText(displayText: Required<Config>["displayText"]) {
    this._displayText = displayText;
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

    let diagnosticRanges: Array<{ from: number; to: number }> = [];
    let diagnosticIndex = 0;
    forEachDiagnostic(state, (diagnostic, diagnosticFrom, diagnosticTo) => {
      diagnosticRanges.push({ from: diagnosticFrom, to: diagnosticTo });
    });

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
      // while (diagnosticIndex < diagnosticRanges.length) {
      //   const current = diagnosticRanges[diagnosticIndex];
      //   const { from: diagnosticFrom, to: diagnosticTo } = current;

      //   if (
      //     (diagnosticFrom >= lineFrom && diagnosticFrom < lineTo) ||
      //     (diagnosticTo > lineFrom && diagnosticTo <= lineTo)
      //   ) {
      //   }

      //   // if (diagnosticRanges[diagnosticIndex].from >= lineFrom &&)
      // }

      /* END DIAGNOSTICS */

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

        continue;
      }

      // Otherwise, just append the line as normal
      lines.push({ text: spans, selections: selectionsInLine });
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

    this._canvas.height = this._container.clientHeight * 2;
    this._canvas.style.height = this._container.clientHeight + "px";

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
              heightOffset + lineHeight,
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

      heightOffset += lineHeight;
    }

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

class Overlay {
  private _canvas: HTMLCanvasElement;
  private _view: EditorView;
  private _isDragging: boolean = false;
  private _dragStartY: number | undefined;

  public constructor(
    view: EditorView,
    /* TODO: Move Overlay inside minimap instead */ minimap: Minimap
  ) {
    this._view = view;

    this._canvas = document.createElement("canvas");
    this._canvas.classList.add("overlay");

    const container = document.createElement("div");
    container.classList.add("overlay-container");

    container.addEventListener("mousedown", (e) => {
      if (e.button === 2) {
        // Right click
        return;
      }
      this._canvas.classList.add("overlay-active");
      this._dragStartY = e.clientY;
      this._isDragging = true;
    });
    window.addEventListener("mouseup", () => {
      if (this._isDragging) {
        this._canvas.classList.remove("overlay-active");
        this._isDragging = false;
        this._dragStartY = undefined;
      }
    });
    window.addEventListener("mousemove", (e) => {
      if (!this._isDragging) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      if (!this._dragStartY) {
        this._dragStartY = e.clientY;
        return;
      }

      const delta = e.clientY - this._dragStartY;
      this._dragStartY = e.clientY;
      const ratio = SCALE * 2 * 1.4;

      const canvasHeight = this._canvas.getBoundingClientRect().height;
      const canvasAbsTop = this._canvas.getBoundingClientRect().y;
      const canvasAbsBot = canvasAbsTop + canvasHeight;
      const canvasRelTop = parseInt(this._canvas.style.top);

      const atTop = view.scrollDOM.scrollTop === 0;
      const atBottom =
        view.scrollDOM.scrollTop >=
        view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;

      const movingUp = delta < 0;
      const movingDown = delta > 0;

      if ((atTop && movingUp) || (atTop && e.clientY < canvasAbsTop)) {
        return;
      }
      if ((atBottom && movingDown) || (atBottom && e.clientY > canvasAbsBot)) {
        return;
      }

      // Set view scroll directly
      view.scrollDOM.scrollTop = (canvasRelTop + delta) * ratio;

      // view.scrollDOM truncates if out of bounds. We need to mimic that behavior here with min/max guard
      this._canvas.style.top =
        Math.min(
          Math.max(0, canvasRelTop + delta),
          (view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight) / ratio
        ) + "px";
    });

    this.setTop();
    this.setHeight();

    container.appendChild(this._canvas);
    minimap._container.appendChild(container);
  }

  public setHeight() {
    const height = this._view.dom.clientHeight / SCALE / 2 / 1.4;
    this._canvas.style.height = height + "px";
  }

  public setTop() {
    if (!this._isDragging) {
      const top = this._view.scrollDOM.scrollTop / SCALE / 2 / 1.4;
      this._canvas.style.top = top + "px";
    }
  }

  public destroy() {
    this._canvas.remove();
  }
}

const minimapView = ViewPlugin.fromClass(
  class {
    minimap: Minimap;
    overlay: Overlay;
    config: Config;

    constructor(readonly view: EditorView) {
      this.minimap = new Minimap(view);
      this.overlay = new Overlay(view, this.minimap);
      this.config = view.state.facet(minimapConfig);
    }

    update(update: ViewUpdate) {
      const config = update.state.facet(minimapConfig);
      const previousConfig = update.startState.facet(minimapConfig);
      const configChanged = previousConfig !== config;
      if (configChanged) {
        this.minimap.setDisplayText(config.displayText);
        this.minimap.setShowOverlay(config.showOverlay);
      }

      if (
        configChanged ||
        update.heightChanged ||
        update.docChanged ||
        update.selectionSet ||
        update.geometryChanged
      ) {
        const lines = this.minimap.buildLines(update.state);
        this.minimap.render(lines);
      }

      this.overlay.setHeight();
    }

    destroy() {
      this.minimap.destroy();
      this.overlay.destroy();
    }
  },
  {
    eventHandlers: {
      scroll() {
        requestAnimationFrame(() => this.overlay.setTop());
      },
    },
  }
);

const minimapConfig = Facet.define<Config, Required<Config>>({
  combine: (configs) =>
    combineConfig(configs, {
      displayText: "characters",
      showOverlay: "always",
    }),
});

type Config = {
  /**
   * Determines how to render text. Defaults to `characters`.
   */
  displayText?: "blocks" | "characters";
  /**
   * The overlay shows the portion of the file currently in the viewport.
   * Defaults to `always`.
   */
  showOverlay?: "always" | "mouse-over";
};

export function minimap(config: Config = {}): Extension {
  return [minimapTheme, minimapConfig.of(config), minimapView];
}
