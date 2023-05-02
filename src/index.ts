import { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Overlay } from "./Overlay";
import { Config, Options } from "./Config";
import { DiagnosticState, diagnostics } from "./diagnostics";
import { SelectionState, selections } from "./selections";
import { TextState, text } from "./text";
import { LinesState } from "./LinesState";
import crelt from "crelt";

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
  "& .cm-minimap-box-shadow": {
    boxShadow: "12px 0px 20px 5px #6c6c6c",
  },
});

const CANVAS_MAX_WIDTH = 120;
const SCALE = 3;
const RATIO = SCALE * 2 * 1.4;

const minimapClass = ViewPlugin.fromClass(
  class {
    private dom: HTMLElement;
    private inner: HTMLElement;
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

      /* We need to get the correct font size before this to measure characters */
      const charWidth = this.text.measure(context);

      const [start, end] = this.canvasStartAndEndIndex(context, lineHeight);
      for (let i = start; i < end; i++) {
        const drawContext = {
          context,
          offsetY,
          lineHeight,
          charWidth,
          scale: SCALE,
        };

        this.text.drawLine(drawContext, i + 1);
        this.selection.drawLine(drawContext, i + 1);
        this.diagnostic.drawLine(drawContext, i + 1);

        offsetY += lineHeight;
      }

      context.restore();
    }

    private canvasStartAndEndIndex(
      context: CanvasRenderingContext2D,
      lineHeight: number
    ) {
      const lines = this.view.state.field(LinesState);
      const maxLines = Math.min(
        Math.round(context.canvas.height / (lineHeight / SCALE)),
        lines.length
      );

      const { clientHeight, scrollHeight, scrollTop } = this.view.scrollDOM;
      const overScroll = scrollHeight - clientHeight;
      const visibleRatio = overScroll > 0 ? scrollTop * (1 / overScroll) : 0;

      // Using Math.max keeps us at 0 if the document doesn't overflow the height
      const startIndex = Math.max(
        0,
        Math.round((lines.length - maxLines) * visibleRatio)
      );
      const endIndex = startIndex + maxLines;

      return [startIndex, endIndex];
    }

    private updateBoxShadow() {
      const { clientWidth, scrollWidth, scrollLeft } = this.view.scrollDOM;

      if (clientWidth + scrollLeft < scrollWidth) {
        this.canvas.classList.add("cm-minimap-box-shadow");
      } else {
        this.canvas.classList.remove("cm-minimap-box-shadow");
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

    minimapClass, // TODO, maybe can codemirror-ify this one better

    Overlay,
  ];
}
