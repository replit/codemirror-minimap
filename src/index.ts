import { Facet } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Overlay } from "./Overlay";
import { Config, Options, Scale } from "./Config";
import { DiagnosticState, diagnostics } from "./diagnostics";
import { SelectionState, selections } from "./selections";
import { TextState, text } from "./text";
import { LinesState } from "./LinesState";
import crelt from "crelt";
import { GUTTER_WIDTH, drawLineGutter } from "./Gutters";

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
  '& .cm-minimap-autohide': {
    opacity: 0.0,
    transition: 'opacity 0.3s',
  },
  '& .cm-minimap-autohide:hover': {
    opacity: 1.0,
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
    private dom: HTMLElement | undefined;
    private inner: HTMLElement | undefined;
    private canvas: HTMLCanvasElement | undefined;

    public text: TextState;
    public selection: SelectionState;
    public diagnostic: DiagnosticState;

    public constructor(private view: EditorView) {
      this.text = text(view);
      this.selection = selections(view);
      this.diagnostic = diagnostics(view);

      if (view.state.facet(showMinimap)) {
        this.create(view);
      }
    }

    private create(view: EditorView) {
      const config = view.state.facet(showMinimap);
      if (!config) {
        throw Error("Expected nonnull");
      }

      this.inner = crelt("div", { class: "cm-minimap-inner" });
      this.canvas = crelt("canvas") as HTMLCanvasElement;

      this.dom = config.create(view).dom;
      this.dom.classList.add("cm-gutters");
      this.dom.classList.add("cm-minimap-gutter");

      this.inner.appendChild(this.canvas);
      this.dom.appendChild(this.inner);

      // For now let's keep this same behavior. We might want to change
      // this in the future and have the extension figure out how to mount.
      // Or expose some more generic right gutter api and use that
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

      if (config.autohide) {
        this.dom.classList.add('cm-minimap-autohide');
      }
    }

    private remove() {
      if (this.dom) {
        this.dom.remove();
      }
    }

    update(update: ViewUpdate) {
      const prev = update.startState.facet(showMinimap);
      const now = update.state.facet(showMinimap);

      if (prev && !now) {
        this.remove();
        return;
      }

      if (!prev && now) {
        this.create(update.view);
      }

      if (now) {
        this.text.update(update);
        this.selection.update(update);
        this.diagnostic.update(update);
        this.render();
      }
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
      // If we don't have elements to draw to exit early
      if (!this.dom || !this.canvas || !this.inner) {
        return;
      }

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

      let { startIndex, endIndex, offsetY } = this.canvasStartAndEndIndex(
        context,
        lineHeight
      );

      const gutters = this.view.state.facet(Config).gutters;

      for (let i = startIndex; i < endIndex; i++) {
        const lines = this.view.state.field(LinesState);
        if (i >= lines.length) break;

        const drawContext = {
          offsetX: 0,
          offsetY,
          context,
          lineHeight,
          charWidth,
        };

        if (gutters.length) {
          /* Small leading buffer */
          drawContext.offsetX += 2;

          for (let gutter of gutters) {
            drawLineGutter(gutter, drawContext, i + 1);
            drawContext.offsetX += GUTTER_WIDTH;
          }

          /* Small trailing buffer */
          drawContext.offsetX += 2;
        }

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
      let { top: pTop, bottom: pBottom } = this.view.documentPadding;
      (pTop /= Scale.SizeRatio), (pBottom /= Scale.SizeRatio);

      const canvasHeight = context.canvas.height;
      const { clientHeight, scrollHeight, scrollTop } = this.view.scrollDOM;
      let scrollPercent = scrollTop / (scrollHeight - clientHeight);
      if (isNaN(scrollPercent)) {
        scrollPercent = 0;
      }

      const lineCount = this.view.state.field(LinesState).length;
      const totalHeight = pTop + pBottom + lineCount * lineHeight;

      const canvasTop = Math.max(
        0,
        scrollPercent * (totalHeight - canvasHeight)
      );
      const offsetY = Math.max(0, pTop - canvasTop);

      const startIndex = Math.round(Math.max(0, canvasTop - pTop) / lineHeight);
      const spaceForLines = Math.round((canvasHeight - offsetY) / lineHeight);

      return {
        startIndex,
        endIndex: startIndex + spaceForLines,
        offsetY,
      };
    }

    private updateBoxShadow() {
      if (!this.canvas) {
        return;
      }

      const { clientWidth, scrollWidth, scrollLeft } = this.view.scrollDOM;

      if (clientWidth + scrollLeft < scrollWidth) {
        this.canvas.classList.add("cm-minimap-box-shadow");
      } else {
        this.canvas.classList.remove("cm-minimap-box-shadow");
      }
    }

    destroy() {
      this.remove();
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

export interface MinimapConfig extends Omit<Options, "enabled"> {
  /**
   * A function that creates the element that contains the minimap
   */
  create: (view: EditorView) => { dom: HTMLElement };
}

/**
 * Facet used to show a minimap in the right gutter of the editor using the
 * provided configuration.
 *
 * If you return `null`, a minimap will not be shown.
 */
const showMinimap = Facet.define<MinimapConfig | null, MinimapConfig | null>({
  combine: (c) => c.find((o) => o !== null) ?? null,
  enables: (f) => {
    return [
      [
        Config.compute([f], (s) => s.facet(f)),
        Theme,
        LinesState,
        minimapClass, // TODO, codemirror-ify this one better
        Overlay,
      ],
    ];
  },
});

export { showMinimap };
