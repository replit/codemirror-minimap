import { Extension, Facet } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Config, config } from "./config";
import { minimapView } from "./index.new";
// import { minimapElement } from "./index.new";

/* TODO: Some kind of rendering config */
const SCALE = 3;
const RATIO = SCALE * 2 /* Canvas is 2x'ed */ * 1.4; /* line height */

// TODO: This need to be unique classnames
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
    private container: HTMLDivElement;
    private dom: HTMLDivElement;
    private _isDragging: boolean = false;
    private _dragStartY: number | undefined;

    public constructor(private view: EditorView) {
      this.dom = document.createElement("div");
      this.dom.classList.add("current-view");

      this.container = document.createElement("div");
      this.container.classList.add("container");
      this.container.appendChild(this.dom);

      this.computeHeight();
      this.computeTop();

      // Attach event listeners for overlay
      this.dom.addEventListener("mousedown", this.onMouseDown.bind(this));
      window.addEventListener("mouseup", this.onMouseUp.bind(this));
      window.addEventListener("mousemove", this.onMouseMove.bind(this));

      // Attach the dom elements to the minimap
      const minimap = view.plugin(minimapView)?.minimap;
      if (!minimap) {
        return;
      }
      minimap._container.appendChild(this.container);
      // this.view.state.facet(minimapElement)?.appendChild(container);
      // console.log(this.view.state.facet(minimapElement));

      // Initially set overlay configuration styles
      const { showOverlay } = view.state.facet(config);
      this.setShowOverlay(showOverlay);
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
      if (!this._isDragging) {
        // Previous implementation:
        // const top = this.view.scrollDOM.scrollTop / RATIO;
        // this.dom.style.top = top + "px";

        const scroller = this.view.scrollDOM;
        const currentScrollTop = scroller.scrollTop;
        const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;

        const topForNonOverflowing = currentScrollTop / RATIO;

        const height = this.view.dom.clientHeight / RATIO;
        const maxTop = this.view.dom.clientHeight - height;
        const scrollRatio = currentScrollTop / maxScrollTop;
        const topForOverflowing = maxTop * scrollRatio;

        // Use tildes to negate any `NaN`s
        const top = Math.min(~~topForOverflowing, ~~topForNonOverflowing);
        this.dom.style.top = top + "px";
      }
    }

    public setShowOverlay(showOverlay: Required<Config>["showOverlay"]) {
      // TODO: Should instead we just create like a transparent overlay
      // within this class, then we don't need to add stuff to the minimap class/outside of
      // this file
      const minimap = this.view.plugin(minimapView)?.minimap;
      if (!minimap) {
        return;
      }
      const el = minimap._container;
      // minimap._container.appendChild(container);
      // const el = this.view.state.facet(minimapElement);
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
      this.container.classList.add("active");
    }

    private onMouseUp(_event: MouseEvent) {
      // Stop dragging on mouseup
      if (this._isDragging) {
        this._dragStartY = undefined;
        this._isDragging = false;
        this.container.classList.remove("active");
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
      const canvasRelTopDouble = parseFloat(this.dom.style.top);

      const scrollPosition = this.view.scrollDOM.scrollTop;
      const editorHeight = this.view.scrollDOM.clientHeight;
      const contentHeight = this.view.scrollDOM.scrollHeight;

      const atTop = scrollPosition === 0;
      const atBottom = scrollPosition >= contentHeight - editorHeight;

      // We allow over-dragging past the top/bottom, but the overlay just sticks
      // to the top or bottom of its range. These checks prevent us from immediately
      // moving the overlay when the drag changes direction. We should wait until
      // the cursor has returned to, and begun to pass the bottom/top of the range
      if ((atTop && movingUp) || (atTop && event.clientY < canvasAbsTop)) {
        console.log("At top");
        return;
      }
      if (
        (atBottom && movingDown) ||
        (atBottom && event.clientY > canvasAbsBot)
      ) {
        console.log("At bottom");
        return;
      }

      // Set view scroll directly

      const scrollHeight = this.view.scrollDOM.scrollHeight;
      const clientHeight = this.view.scrollDOM.clientHeight;

      const maxTopNonOverflowing = (scrollHeight - clientHeight) / RATIO;
      const maxTopOverflowing = clientHeight - clientHeight / RATIO;

      const change = canvasRelTopDouble + deltaY;

      /**
       * ScrollPosOverflowing is calculated by:
       * - Calculating the offset (change) relative to the total height of the container
       * - Multiplying by the maximum scrollTop position for the scroller
       * - The maximum scrollTop position for the scroller is the total scroll height minus the client height
       */
      const relativeToMax = change / maxTopOverflowing;
      const scrollPosOverflowing =
        (scrollHeight - clientHeight) * relativeToMax;

      const scrollPosNonOverflowing = change * RATIO;
      this.view.scrollDOM.scrollTop = Math.max(
        scrollPosOverflowing,
        scrollPosNonOverflowing
      );

      // view.scrollDOM truncates if out of bounds. We need to mimic that behavior here with min/max guard
      const top = Math.min(
        Math.max(0, change),
        Math.min(maxTopOverflowing, maxTopNonOverflowing)
      );
      this.dom.style.top = top + "px";
    }

    public destroy() {
      this.dom.removeEventListener("mousedown", this.onMouseDown);
      window.removeEventListener("mouseup", this.onMouseUp);
      window.removeEventListener("mousemove", this.onMouseMove);
      this.container.remove(); // ? This right?
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
