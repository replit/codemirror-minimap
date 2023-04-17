import { Extension, Facet } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Config, config } from "./config";
import { minimapElement } from "./index.new";

/* TODO: Some kind of rendering config */
const SCALE = 3;
const RATIO = SCALE * 2 /* Canvas is 2x'ed */ * 1.4; /* line height */

const overlayTheme = EditorView.theme({
  "& .config-only-mouse-over": {
    "& .container": {
      opacity: 0,
      visibility: "hidden",
      transition: "visibility 0s linear 300ms, opacity 300ms",
    },
  },
  ".config-only-mouse-over:hover, ": {
    "& .container": {
      opacity: 1,
      visibility: "visible",
      transition: "visibility 0s linear 0ms, opacity 300ms",
    },
  },
  ".current-view": {
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
  },
  ".active > .current-view": {
    opacity: "0.4",
  },
  ".active.container": {
    opacity: 1,
    visibility: "visible",
    transition: "visibility 0s linear 0ms, opacity 300ms",
  },
});

const overlayView = ViewPlugin.fromClass(
  class {
    private dom: HTMLDivElement;
    private _isDragging: boolean = false;
    private _dragStartY: number | undefined;

    public constructor(private view: EditorView) {
      this.dom = document.createElement("div");
      this.dom.classList.add("current-view");

      const container = document.createElement("div");
      container.classList.add("container");
      container.appendChild(this.dom);

      this.computeHeight();
      this.computeTop();

      // Attach event listeners for overlay
      this.dom.addEventListener("mousedown", this.onMouseDown);
      window.addEventListener("mouseup", this.onMouseUp);
      window.addEventListener("mousemove", this.onMouseMove);

      // Attach the dom elements to the minimap
      this.view.state.facet(minimapElement)?.appendChild(container);
      console.log(this.view.state.facet(minimapElement));
    }

    update(update: ViewUpdate) {
      const { showOverlay } = update.state.facet(config);
      const { showOverlay: prevShowOverlay } = update.startState.facet(config);

      if (showOverlay !== prevShowOverlay) {
        this.setShowOverlay(showOverlay);
      }

      this.computeHeight();
    }

    public computeHeight() {
      const height = this.view.dom.clientHeight / RATIO;
      this.dom.style.height = height + "px";
    }

    public computeTop() {
      // console.log(this._isDragging);
      if (!this._isDragging) {
        const top = this.view.scrollDOM.scrollTop / RATIO;
        this.dom.style.top = top + "px";
      }
    }

    public setShowOverlay(showOverlay: Required<Config>["showOverlay"]) {
      // TODO: Should instead we just create like a transparent overlay
      // within this class, then we don't need to add stuff to the minimap class/outside of
      // this file
      const el = this.view.state.facet(minimapElement);
      if (showOverlay === "mouse-over") {
        el.classList.add("config-only-mouse-over");
      } else {
        el.classList.remove("config-only-mouse-over");
      }
    }

    private onMouseDown(event: MouseEvent) {
      // Ignore right click
      if (event.button === 2) {
        return;
      }

      // Start dragging on mousedown
      this._dragStartY = event.clientY;
      this._isDragging = true;
      this.dom.classList.add("active");
    }

    private onMouseUp(_event: MouseEvent) {
      // Stop dragging on mouseup
      if (this._isDragging) {
        this._dragStartY = undefined;
        this._isDragging = false;
        this.dom.classList.remove("active");
      }
    }

    private onMouseMove(event: MouseEvent) {
      if (!this._isDragging) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      // Without an existing position, we're just beginning to drag.
      if (!this._dragStartY) {
        this._dragStartY = event.clientY;
        return;
      }

      const deltaY = event.clientY - this._dragStartY;
      const movingUp = deltaY < 0;
      const movingDown = deltaY > 0;

      // Update drag position for the next tick
      this._dragStartY = event.clientY;

      const canvasHeight = this.dom.getBoundingClientRect().height;
      const canvasAbsTop = this.dom.getBoundingClientRect().y;
      const canvasAbsBot = canvasAbsTop + canvasHeight;
      const canvasRelTop = parseInt(this.dom.style.top);

      const scrollPosition = this.view.scrollDOM.scrollTop;
      const editorHeight = this.view.scrollDOM.clientHeight;
      const contentHeight = this.view.scrollDOM.scrollHeight;

      const atTop = scrollPosition === 0;
      const atBottom = scrollPosition >= contentHeight - editorHeight;

      if ((atTop && movingUp) || (atTop && event.clientY < canvasAbsTop)) {
        return;
      }
      if (
        (atBottom && movingDown) ||
        (atBottom && event.clientY > canvasAbsBot)
      ) {
        return;
      }

      // Set view scroll directly
      this.view.scrollDOM.scrollTop = (canvasRelTop + deltaY) * RATIO;

      // view.scrollDOM truncates if out of bounds. We need to mimic that behavior here with min/max guard
      this.dom.style.top =
        Math.min(
          Math.max(0, canvasRelTop + deltaY),
          (this.view.scrollDOM.scrollHeight -
            this.view.scrollDOM.clientHeight) /
            RATIO
        ) + "px";
    }

    public destroy() {
      this.dom.removeEventListener("mousedown", this.onMouseDown);
      window.removeEventListener("mouseup", this.onMouseUp);
      window.removeEventListener("mousemove", this.onMouseMove);
      this.dom.remove(); // ? This right?
    }
  },
  {
    eventHandlers: {
      scroll() {
        requestAnimationFrame(() => this.computeTop());
      },
    },
  }
);

export function overlay(): Extension {
  return [overlayTheme, overlayView];
}
