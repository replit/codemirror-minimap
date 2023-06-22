import { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Overlay } from "./Overlay";
import { Config, Options, Scale } from "./Config";
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
    overflowY: "hidden",
    "& canvas": {
      display: "block",
    },
  },
  "& .cm-minimap-box-shadow": {
    boxShadow: "12px 0px 20px 5px #6c6c6c",
  },
});

const WIDTH_RATIO = 6;

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
      this.inner = crelt("div", { class: "cm-minimap-inner" });
      this.canvas = crelt("canvas") as HTMLCanvasElement;

      this.inner.appendChild(this.canvas);
      this.dom.appendChild(this.inner);
      this.view.scrollDOM.insertBefore(
        this.dom,
        this.view.contentDOM.nextSibling
      );

      for (const key in this.view.state.facet(Config).eventHandlers) {
        const handler = this.view.state.facet(Config).eventHandlers[key];
        if (handler) {
          this.dom.addEventListener(key, (e) => handler(e, this.view));
        }
      }
    }

    update(update: ViewUpdate) {
      this.text.update(update);
      this.selection.update(update);
      this.diagnostic.update(update);
      /* TODO: brady - Render phase needs to be split up to correctly read and write.
         Currently we perform everything in read to avoid CM throwing */
      this.view.requestMeasure({
        read: () => {
          this.render()
        },
      });
    }

    getWidth(): number {
      const editorWidth = this.view.dom.clientWidth;
      if (editorWidth <= Scale.MaxWidth * WIDTH_RATIO) {
        const ratio = editorWidth / (Scale.MaxWidth * WIDTH_RATIO);
        return Scale.MaxWidth * ratio;
      }
      return Scale.MaxWidth;
    }

    render() {
      this.text.beforeDraw();

      this.updateBoxShadow();

      this.dom.style.width = this.getWidth() + "px";
      this.canvas.style.maxWidth = this.getWidth() + "px";
      this.canvas.width = this.getWidth() * Scale.PixelMultiplier;

      const domHeight = this.view.dom.getBoundingClientRect().height;
      this.inner.style.minHeight = domHeight + "px";
      this.canvas.height = domHeight * Scale.PixelMultiplier;
      this.canvas.style.height = domHeight + "px";

      const context = this.canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.clearRect(0, 0, this.canvas.width, this.canvas.height);

      /* We need to get the correct font dimensions before this to measure characters */
      const { charWidth, lineHeight } = this.text.measure(context);

      let { startNumber, endNumber, offsetY } = this.canvasStartAndEndLineNumber(
        context,
        lineHeight
      );

      for (let i = startNumber; i < endNumber; i++) {
        const lines = this.view.state.field(LinesState);
        if (i > lines.length) break;

        const drawContext = {
          context,
          offsetY,
          lineHeight,
          charWidth,
        };

        this.text.drawLine(drawContext, i);
        this.selection.drawLine(drawContext, i);
        this.diagnostic.drawLine(drawContext, i);

        // This is pretty close, now we need to wrap the actual elements
        const totalLineHeight = this.view.lineBlockAt(this.view.state.doc.line(i).from).height / Scale.SizeRatio;
        offsetY += totalLineHeight;
      }

      context.restore();
    }

    private canvasStartAndEndLineNumber(
      context: CanvasRenderingContext2D,
      lineHeight: number
    ) {
      let { top: pTop, bottom: pBottom } = this.view.documentPadding;
      (pTop /= Scale.SizeRatio), (pBottom /= Scale.SizeRatio);

      const canvasHeight = context.canvas.height;
      const { clientHeight, scrollHeight, scrollTop } = this.view.scrollDOM;
      let scrollPercent = scrollTop / (scrollHeight - clientHeight);
      if (isNaN(scrollPercent)) {
        scrollPercent = 0;
      }

      const totalHeight = this.view.contentHeight / Scale.SizeRatio;

      const canvasTop = Math.max(
        0,
        scrollPercent * (totalHeight - canvasHeight)
      );
      const offsetY = Math.max(0, pTop - canvasTop);

      const heightAtTop = Math.max(0, canvasTop - pTop);

      // TODO: This can potentially be more precise, we actually might be in the middle of a block
      const startNumber = this.view.state.doc.lineAt(this.view.lineBlockAtHeight(heightAtTop).from).number;
      const spaceForLines = Math.round((canvasHeight - offsetY) / lineHeight);

      return {
        startNumber,
        endNumber: startNumber + spaceForLines,
        offsetY,
      };
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
    provide: (plugin) => {
      return EditorView.scrollMargins.of((view) => {
        const width = view.plugin(plugin)?.getWidth();
        if (!width) {
          return null;
        }

        return { right: width };
      });
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
