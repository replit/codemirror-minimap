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
import { currentTopFromScrollHeight, Overlay } from "./overlay";
import { Config, Options } from "./Config";
import { DiagnosticState, diagnostics } from "./state/diagnostics";
import { SelectionState, selections } from "./state/selections";
import { TextState, text } from "./state/text";
import { LinesState, Lines } from "./LinesState";
import crelt from "crelt";

export type LineData = Array<
  Array<{
    from: number;
    to: number;
    folded: boolean;
  }>
>;

const Theme = EditorView.theme({
  "&": {
    height: "100%",
    overflowY: "auto",
  },
  "& .cm-minimap-gutter": {
    borderRight: 0,
    flexShrink: 0,
    left: "unset",
    position: "sticky",
    right: 0,
    top: 0,
  },
  "& .cm-minimap-inner": {
    height: "100%",
    position: "absolute",
    right: 0,
    top: 0,
    "& canvas": {
      display: "block",
    },
  },
});

const CANVAS_MAX_WIDTH = 120;
const SCALE = 3;
const RATIO = SCALE * 2 * 1.4;

const minimapClass = ViewPlugin.fromClass(
  class {
    private dom: HTMLElement;
    /*private*/ public inner: HTMLElement;
    private canvas: HTMLCanvasElement;
    private view: EditorView;

    public text: TextState;
    public selection: SelectionState;
    public diagnostic: DiagnosticState;

    public constructor(view: EditorView) {
      this.view = view;

      this.text = text(view);
      this.selection = selections(view);
      this.diagnostic = diagnostics(view);

      this.dom = crelt("div", { class: "cm-gutters cm-minimap-gutter" });
      this.dom.style.width = CANVAS_MAX_WIDTH + "px";

      this.inner = crelt("div", { class: "cm-minimap-inner" });

      this.canvas = crelt("canvas") as HTMLCanvasElement;
      this.canvas.style.maxWidth = CANVAS_MAX_WIDTH + "px";

      this.inner.appendChild(this.canvas);
      this.dom.appendChild(this.inner);
      this.view.scrollDOM.insertBefore(
        this.dom,
        this.view.contentDOM.nextSibling
      );
    }

    update(update: ViewUpdate) {
      this.text.update(update);
      this.selection.update(update);
      this.diagnostic.update(update);
      this.render();
    }

    render() {
      const innerX = this.view.contentDOM.clientWidth;
      this.updateBoxShadow();
      // updateBoxShadow(this.view);

      if (innerX <= SCALE * CANVAS_MAX_WIDTH) {
        const ratio = innerX / (SCALE * CANVAS_MAX_WIDTH);

        this.canvas.width = CANVAS_MAX_WIDTH * ratio * 2;
      } else {
        this.canvas.width = CANVAS_MAX_WIDTH * 2;
      }

      this.canvas.height = this.inner.clientHeight * 2;
      this.canvas.style.height = this.inner.clientHeight + "px";

      const context = this.canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.clearRect(0, 0, this.canvas.width, this.canvas.height);

      context.scale(1 / SCALE, 1 / SCALE);

      const { top: paddingTop } = this.view.documentPadding;
      let offsetY = paddingTop;

      let lineHeight = 13; /* HACKING THIS IN */ /* We should be incrementing this within the drawer, I guess? */ /* Or just computing it globally */

      const lines = this.view.state.field(LinesState);

      const maxLinesForCanvas = Math.min(
        Math.round(context.canvas.height / (lineHeight / SCALE)),
        lines.length
      );

      // THIS IS WORKING FOR OVERSCROLLING HEIGHT!!! :)
      const scroller = this.view.scrollDOM;
      const overscroll = scroller.scrollHeight - scroller.clientHeight;
      const ratio = overscroll > 0 ? scroller.scrollTop * (1 / overscroll) : 0;

      const startLine = (lines.length - maxLinesForCanvas) * ratio;

      // Using Math.max keeps us at 0 if the document doesn't overflow the height
      let startIndex = Math.max(0, Math.round(startLine));

      /* We need to get the correct font size before this to measure characters */
      const charWidth = this.text.measure(context);

      for (let i = startIndex; i < startIndex + maxLinesForCanvas; i++) {
        const drawContext = {
          context,
          offsetY,
          lineHeight,
          charWidth,
        };

        this.text.drawLine(drawContext, i + 1);
        this.selection.drawLine(drawContext, i + 1);
        this.diagnostic.drawLine(drawContext, i + 1);

        offsetY += lineHeight;
      }

      context.restore();
    }

    private updateBoxShadow() {
      const { clientWidth, scrollWidth, scrollLeft } = this.view.scrollDOM;

      if (clientWidth + scrollLeft < scrollWidth) {
        this.canvas.style.boxShadow = "12px 0px 20px 5px #6c6c6c";
      } else {
        this.canvas.style.boxShadow = "inherit";
      }
    }

    destroy() {
      this.dom.remove();
    }
  },
  {
    eventHandlers: {
      scroll() {
        requestAnimationFrame(() => this.render());
      },
    },
  }
);

export function minimap(o: Options = {}): Extension {
  return [
    Theme,
    Config.of(o),

    LinesState,

    /** TODO CLEAN UP BELOW */
    [minimapClass],
    Overlay(),
  ];
}
