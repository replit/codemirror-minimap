import { foldedRanges, highlightingFor, language } from "@codemirror/language";
import { Text, Extension } from "@codemirror/state";
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
import { overlay } from "./overlay";
import { Config, config as minimapConfig } from "./config";
import { DiagnosticState, diagnostics } from "./state/diagnostics";
import { SelectionState, selections } from "./state/selections";
import { TextState, text } from "./state/text";

export type LineData = Array<
  Array<{
    from: number;
    to: number;
    folded: boolean;
  }>
>;

const minimapTheme = EditorView.theme({
  "&": {
    height: "100%",
    overflowY: "auto",
  },
  "& .cm-focused": {
    outline: "none",
  },
  "& .cm-content": {
    // overflowX: "auto",
    // flexShrink: 1,
  },
  "& .cm-minimap-gutter": {
    flexShrink: 0,
    position: "sticky",
    top: 0,
    right: 0,
  },
  "& .cm-minimap-container": {
    position: "absolute",
    top: 0,
    right: 0,
    // display: "flex",
    // height: "100%",
  },
});

const CANVAS_MAX_WIDTH = 120;
const SCALE = 3;

export const minimapClass = ViewPlugin.fromClass(
  class {
    public _gutter: HTMLDivElement;
    /*private*/ public _container: HTMLDivElement;
    /*private*/ public _canvas: HTMLCanvasElement;
    /*private*/ public _view: EditorView;

    // private _cachedTreeFragments: Array<TreeFragment>;

    public text: TextState;
    public selection: SelectionState;
    public diagnostic: DiagnosticState;

    public lines: Array<
      Array<{
        from: number;
        to: number;
        // text: string;
        folded: boolean;
      }>
    >;

    public constructor(view: EditorView) {
      this._view = view;

      this.lines = [];

      this.text = text(view);
      this.selection = selections(view);
      this.diagnostic = diagnostics(view);

      this._gutter = document.createElement("div");
      // this._gutter.classList.add("cm-minimap-gutter");
      this._gutter.classList.add("cm-gutters");
      this._gutter.style.position = "sticky";
      this._gutter.style.left = "unset";
      this._gutter.style.right = "0px";
      this._gutter.style.top = "0px";
      this._gutter.style.width = CANVAS_MAX_WIDTH + "px";
      this._gutter.style.borderRight = "0px"; // If we could get the gutter border on the left though..

      this._container = document.createElement("div");
      this._container.classList.add("cm-minimap-container");
      // console.log(this._view.dom.style.backgroundColor);

      this._canvas = document.createElement("canvas");
      this._canvas.style.display = "block"; // Needed to prevent minor scroll
      this._canvas.style.maxWidth = CANVAS_MAX_WIDTH + "px";
      this._canvas.addEventListener("click", (e) => {
        // TODO: This isn't working at all yet

        const target = e.currentTarget as HTMLCanvasElement;
        const relativeY = e.clientY - target.getBoundingClientRect().top;

        const scroller = this._view.scrollDOM;
        const currentScrollTop = scroller.scrollTop;
        const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;

        const halfViewportHeight = this._view.scrollDOM.clientHeight / 2;
        const ratio =
          scroller.scrollTop *
          (1 / (scroller.scrollHeight - scroller.clientHeight));

        // console.log(
        //   "Previous relativeY",
        //   Math.round((currentScrollTop + halfViewportHeight) / (SCALE * 2 * 1.4))
        // );

        console.log(
          "The max we can render on one canvas",
          Math.round(target.getBoundingClientRect().height)
        );
        console.log(
          "The max we need to render the whole document",
          scroller.scrollHeight / SCALE / 2 / 1.4
        );
        console.log("We just went to ", relativeY, "offset");
        console.log(
          relativeY,
          "is ",
          relativeY / (scroller.scrollHeight / SCALE / 2 / 1.4),
          "% of the whole doc"
        );

        const percent = relativeY / (scroller.scrollHeight / SCALE / 2 / 1.4);
        const above = percent * target.getBoundingClientRect().height;
        const below = target.getBoundingClientRect().height - above;
        console.log("That puts us at render min", relativeY - above);
        console.log("That puts us at render max", relativeY + below);

        console.log(
          "Now for the next render, we'll use render min as our starting place. We will add it to relativeY"
        );

        console.log(
          "Adding it to relativeY will give us our total relY, which we will then multiply and adjust half hight, etc"
        );

        console.log("So how can we get render min on the next render?");

        const relysub =
          (scroller.scrollTop + halfViewportHeight) / (SCALE * 2 * 1.4);
        const percent2 = relysub / (scroller.scrollHeight / SCALE / 2 / 1.4);
        const above2 = percent2 * target.getBoundingClientRect().height;
        const renderMin = relysub - above2;
        /***
         * scrollTop + Half Height       (scale * 2 * 1.4)                boundclient.height
         * -----------------------   X  ----------------------------- X
         * scale * 2 * 1.4               scrollHeight
         *
         *
         * const above = (scrollTop + HH) / scrollHeight * boundClient.height
         * const min =
         */
        // console.log(
        //   "Current above",
        //   ((scroller.scrollTop + halfViewportHeight) / scroller.scrollHeight) *
        //     target.getBoundingClientRect().height
        // );
        // console.log(
        //   "Current relY",
        //   (scroller.scrollTop + halfViewportHeight) / (SCALE * 2 * 1.4)
        // );

        const previousRenderMin =
          (scroller.scrollTop + halfViewportHeight) / (SCALE * 2 * 1.4) -
          ((scroller.scrollTop + halfViewportHeight) / scroller.scrollHeight) *
            target.getBoundingClientRect().height;
        console.log("Previous renderMin", previousRenderMin);

        console.log("Previous top + relY", previousRenderMin + relativeY);

        // Note we might be off by 2x?

        // scale multiplier goes from X pixel offset on canvas --> Y pixel offset on scroller
        // scale divider goes from Y pixel offset on scroller --> X pixel offset on canvas

        // console.log("Current scrollTop", currentScrollTop);
        // console.log(
        //   "currentScrollTop div scale",
        //   currentScrollTop / (SCALE * 2 * 1.4)
        // );
        // console.log("Relative times scale", relativeY * SCALE * 2 * 1.4);
        // console.log("New RelativeY", relativeY);
        // console.log("We're ", ratio, "percent through doc");
        // console.log(
        //   "We just clicked at the ",
        //   relativeY / target.getBoundingClientRect().height,
        //   "percent of the view"
        // );
        // console.log(
        //   "new value",
        //   relativeY * SCALE * 2 * 1.4 - halfViewportHeight + currentScrollTop
        // );

        // ScrollTop = relativeY * SCALE * 2 * 1.4 - halfViewportHeight
        // ScrollTop + HalfVP = relativeY * SCALE * 2 * 1.4
        // The current scrolltop + half / scale thing should give me the relativeY. Then I compare that against the new relativeY?

        // The position should be centered in the middle of the editor if possible
        // scrollTop will round up to 0 if it's set to a value < 0.
        // const halfViewportHeight = this._view.scrollDOM.clientHeight / 2;

        // OK so this works almost perfectly. slightly off on overscroll. perfect on non overscroll
        console.log("Previous render min", previousRenderMin);
        this._view.scrollDOM.scrollTop =
          (Math.max(previousRenderMin, 0) + relativeY) * SCALE * 2 * 1.4 -
          halfViewportHeight;

        e.preventDefault();
        e.stopPropagation();
      });

      this._container.appendChild(this._canvas);
      this._gutter.appendChild(this._container);
      this._view.scrollDOM.insertBefore(
        this._gutter,
        this._view.contentDOM.nextSibling
      );
    }

    public buildLines(update: ViewUpdate): LineData {
      const state = update.state;

      const parser = state.facet(language)?.parser;
      if (!parser) {
        console.log("TODO: Handle no parser....");
        return [];
      }

      const doc = Text.of(state.doc.toString().split("\n"));

      let foldedRangeCursor = foldedRanges(state).iter();

      const lineRangesNew: LineData = [];

      for (let i = 1; i <= doc.lines; i++) {
        let { from, to } = doc.line(i);

        // Iterate through folded ranges until we're at or past the current line
        while (foldedRangeCursor.value && foldedRangeCursor.to < from) {
          foldedRangeCursor.next();
        }
        const { from: foldFrom, to: foldTo } = foldedRangeCursor;

        const lineStartInFold = from >= foldFrom && from < foldTo;
        const lineEndsInFold = to > foldFrom && to <= foldTo;

        if (lineStartInFold) {
          let lastLine = lineRangesNew.pop() ?? [];
          let lastRange = lastLine.pop();

          // If the last range is folded, we extend the folded range
          if (lastRange && lastRange.folded) {
            lastRange.to = foldTo;
          }

          // If we popped the last range, add it back
          if (lastRange) {
            lastLine.push(lastRange);
          }

          // If we didn't have a previous range, or the previous range wasn't folded add a new range
          if (!lastRange || !lastRange.folded) {
            lastLine.push({ from: foldFrom, to: foldTo, folded: true });
          }

          // If the line doesn't end in a fold, we add another token for the unfolded section
          if (!lineEndsInFold) {
            lastLine.push({ from: foldTo, to, folded: false });
          }

          lineRangesNew.push(lastLine);
          continue;
        }

        if (lineEndsInFold) {
          lineRangesNew.push([
            { from, to: foldFrom, folded: false },
            { from: foldFrom, to: foldTo, folded: true },
          ]);
          continue;
        }

        lineRangesNew.push([{ from, to, folded: false }]);
      }

      this.text.update({ update, lines: lineRangesNew });
      this.selection.update({ update, lines: lineRangesNew });
      this.diagnostic.update({ update, lines: lineRangesNew });

      return lineRangesNew;
    }

    update(update: ViewUpdate) {
      // if (
      //   updatedDiagnostics ||
      //   configChanged ||
      //   update.heightChanged ||
      //   update.docChanged ||
      //   update.selectionSet ||
      //   update.geometryChanged
      // ) {
      // TODO: We can decouple the rendering from the line building by caching the line data
      // We already cache individual renderer data, we just need to cache the line ranges in a facet
      // const lines = this.minimap.buildLines(update);
      this.lines = this.buildLines(update);
      this.render();
    }

    public render() {
      const lines = this.lines;

      const containerX = this._view.contentDOM.clientWidth;
      updateBoxShadow(this._view);

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
      let offsetY = paddingTop;

      let lineHeight = 13; /* HACKING THIS IN */ /* We should be incrementing this within the drawer, I guess? */ /* Or just computing it globally */

      const maxLinesForCanvas = Math.round(
        context.canvas.height / (lineHeight / SCALE)
      );

      const middleOfViewport =
        this._view.scrollDOM.scrollTop + this._view.scrollDOM.clientHeight / 2;

      // console.log(this._view.scrollDOM.scrollTop * )
      // const ratio = middleOfViewport / this._view.scrollDOM.scrollHeight;

      // console.log(
      //   this._view.scrollDOM.scrollTop,
      //   this._view.scrollDOM.scrollHeight,
      //   this._view.scrollDOM.clientHeight,
      //   this._view.dom.scrollHeight,
      //   this._view.dom.scrollTop,
      //   this._view.dom.clientHeight
      // );

      // At scrolltop = 0; startline should = 0;
      // At scrolltop scrollHeight - clientH; startline should = lines - max lines in viewport

      // const ratio = middleOfViewport / this._view.scrollDOM.scrollHeight;
      // const startLine = lines.length * ratio - maxLinesForCanvas * ratio;
      // console.log("Range", startLine, startLine + maxLinesForCanvas);

      // THIS IS WORKING FOR OVERSCROLLING HEIGHT!!! :)
      const scroller = this._view.scrollDOM;
      const ratio =
        scroller.scrollTop *
        (1 / (scroller.scrollHeight - scroller.clientHeight));

      const startLine =
        (lines.length - maxLinesForCanvas) * (isNaN(ratio) ? 0 : ratio);

      // Using Math.max keeps us at 0 if the document doesn't overflow the height
      let startIndex = Math.max(0, Math.round(startLine));

      for (let i = startIndex; i < startIndex + maxLinesForCanvas; i++) {
        // for (const [index, line] of lines.entries()) {
        const drawContext = {
          context,
          offsetY,
          lineHeight,
          charWidth: context.measureText("_").width,
        };
        this.text.drawLine(drawContext, i + 1);

        // TODO: temporarily commenting out bc distracting
        // this.selection.drawLine(drawContext, i + 1);
        // this.diagnostic.drawLine(drawContext, i + 1);

        offsetY += lineHeight;
      }

      // for (let i = 0; i < lines.length; i++) {
      //   const line = lines[i];
      //   let x = 0;

      //   // const lineText = line.text.map((t) => t.text).join("");

      //   let lineHeight = 0;
      //   lineHeight = 12;
      //   for (let j = 0; j < line.to - line.from; j++) {
      //   context.textBaseline = "ideographic";
      // const info = this.getFontInfo(line.text[j]);
      //   context.fillStyle = info.color;
      // context.font = info.font;
      // lineHeight = Math.max(lineHeight, info.fontSize);
      // lineHeight = 12;
      //   if (this._displayText === "characters") {
      //     // TODO: `fillText` takes up the majority of profiling time in `render`
      //     // Try speeding it up with `drawImage`
      //     // https://stackoverflow.com/questions/8237030/html5-canvas-faster-filltext-vs-drawimage/8237081
      //     context.fillText(line.text[j].text, x, offsetY + lineHeight);
      //     x += context.measureText(line.text[j].text).width;
      //   }
      //   if (this._displayText === "blocks") {
      //     const characters = line.text[j].text;
      //     /* Each block's width is 3/4 of its height */
      //     // const widthMultiplier = 0.75;
      //     const charWidth = context.measureText("_").width;
      //     const nonWhitespaceRegex = /\S+/g;
      //     // const whitespaceRanges: [number, number][] = [];
      //     let match: RegExpExecArray | null;
      //     while ((match = nonWhitespaceRegex.exec(characters)) !== null) {
      //       const start = match.index;
      //       const end = nonWhitespaceRegex.lastIndex;
      //       context.globalAlpha = 0.65; // Make the blocks a bit faded
      //       context.beginPath();
      //       context.rect(
      //         x + start * charWidth,
      //         offsetY,
      //         (end - start) * charWidth,
      //         lineHeight - 2 /* 2px buffer between lines */
      //       );
      //       context.fill();
      //     }
      //     x += characters.length * charWidth;
      //   }
      // }

      // if (line.selections) {
      //   // console.log(line.selections);

      //   for (let j = 0; j < line.selections.length; j++) {
      //     const selection = line.selections[j];
      //     // console.log("A selection", selection);
      //     const prefix = context.measureText(lineText.slice(0, selection.from));
      //     const text = context.measureText(
      //       lineText.slice(selection.from, selection.to)
      //     );

      //     context.beginPath();
      //     context.rect(
      //       prefix.width,
      //       heightOffset,
      //       selection.extends
      //         ? this._canvas.width * SCALE - prefix.width
      //         : text.width,
      //       lineHeight
      //     );
      //     context.fillStyle = this.getSelectionInfo().backgroundColor;

      //     context.fill();
      //   }
      // }
      /* Each block's width is 3/4 of its height */
      // const widthMultiplier = 0.75;

      // if (line.diagnostic) {
      //   context.globalAlpha = 0.65;
      //   context.fillStyle =
      //     line.diagnostic === "error"
      //       ? "red"
      //       : line.diagnostic === "warning"
      //       ? "yellow"
      //       : "blue"; // TODO: Does this need to be customized?
      //   context.beginPath();
      //   context.rect(
      //     0,
      //     heightOffset,
      //     this._canvas.width * SCALE,
      //     lineHeight /* - 2 */ /* Do we want 2px buffer between lines? */
      //   );
      //   context.fill();
      // }

      // offsetY += lineHeight;
      // }

      context.restore();
    }

    destroy() {
      this._gutter.remove();
      this._container.remove();
    }
  }
);

export const minimapView = ViewPlugin.fromClass(
  class {
    // minimap: Minimap;
    // private config: Config;

    constructor(readonly view: EditorView) {
      // this.minimap = new Minimap(view);
      // this.config = view.state.facet(minimapConfig);
      // view.scrollDOM.addEventListener("scroll", (e) => {
      //   console.log("Handling scroll from event listener directly");
      //   this.minimap.render();
      // });
    }

    // TODO: This can be completely cleaned up :D
    update(update: ViewUpdate) {
      // const config = update.state.facet(minimapConfig);
      // const previousConfig = update.startState.facet(minimapConfig);
      // const configChanged = previousConfig !== config;
      // if (
      //   updatedDiagnostics ||
      //   configChanged ||
      //   update.heightChanged ||
      //   update.docChanged ||
      //   update.selectionSet ||
      //   update.geometryChanged
      // ) {
      // TODO: We can decouple the rendering from the line building by caching the line data
      // We already cache individual renderer data, we just need to cache the line ranges in a facet
      // const lines = this.minimap.buildLines(update);
      // this.minimap.lines = this.minimap.buildLines(update);
      // this.minimap.render();
      // }
    }

    destroy() {
      // this.minimap.destroy();
    }
  },
  {
    eventHandlers: {
      scroll: (event, view) => {
        console.log("Handling scroll from event handler");
        updateBoxShadow(view);

        // TODO: Clean up naming of all this stuff
        const minimap = view.plugin(minimapClass);
        if (!minimap) {
          return;
        }
        minimap.render();
      },
    },
    provide: () => [minimapClass, overlay()],
  }
);

function updateBoxShadow(view: EditorView) {
  const minimap = view.plugin(minimapClass);
  if (!minimap) {
    return;
  }

  // Hacking in box shadow stuff, this needs to re-render when other things do not...
  // Also, had to make a couple things public here, so likely not the right place.
  // Could be a method w/i minimap
  const containerX = view.scrollDOM.clientWidth;
  const contentX = view.scrollDOM.scrollWidth;
  const scrollLeft = view.scrollDOM.scrollLeft;

  if (containerX + scrollLeft < contentX) {
    // minimap._canvas.style.boxShadow = "12px 0px 20px 5px #6c6c6c";
  } else {
    minimap._canvas.style.boxShadow = "inherit";
  }
  // End box shadow stuff
}

export function minimap(config: Config = {}): Extension {
  return [minimapTheme, minimapConfig.of(config), minimapView];
}
