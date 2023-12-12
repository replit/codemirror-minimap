import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Config, Scale } from "./Config";
import crelt from "crelt";

const Theme = EditorView.theme({
  ".cm-minimap-overlay-container": {
    position: "absolute",
    top: 0,
    height: "100%",
    width: "100%",
    "&.cm-minimap-overlay-mouse-over": {
      opacity: 0,
      transition: "visibility 0s linear 300ms, opacity 300ms",
    },
    "&.cm-minimap-overlay-mouse-over:hover": {
      opacity: 1,
      transition: "visibility 0s linear 0ms, opacity 300ms",
    },
    "&.cm-minimap-overlay-off": {
      display: "none",
    },
    "& .cm-minimap-overlay": {
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
    "&.cm-minimap-overlay-active": {
      opacity: 1,
      visibility: "visible",
      transition: "visibility 0s linear 0ms, opacity 300ms",
      "& .cm-minimap-overlay": {
        opacity: "0.4",
      },
    },
  },
});

const SCALE = Scale.PixelMultiplier * Scale.SizeRatio;

const OverlayView = ViewPlugin.fromClass(
  class {
    private container: HTMLElement | undefined;
    private dom: HTMLElement | undefined;

    private _isDragging: boolean = false;
    private _dragStartY: number | undefined;

    public constructor(private view: EditorView) {
      if (view.state.facet(Config).enabled) {
        this.create(view);
      }
    }

    private create(view: EditorView) {
      this.container = crelt("div", { class: "cm-minimap-overlay-container" });
      this.dom = crelt("div", { class: "cm-minimap-overlay" });
      this.container.appendChild(this.dom);

      // Attach event listeners for overlay
      this.container.addEventListener("mousedown", this.onMouseDown.bind(this));
      window.addEventListener("mouseup", this.onMouseUp.bind(this));
      window.addEventListener("mousemove", this.onMouseMove.bind(this));

      // Attach the overlay elements to the minimap
      const inner = view.dom.querySelector(".cm-minimap-inner");
      if (inner) {
        inner.appendChild(this.container);
      }

      // Initially set overlay configuration styles, height, top
      this.computeShowOverlay();
      this.computeHeight();
      this.computeTop();
    }

    private remove() {
      if (this.container) {
        this.container.removeEventListener("mousedown", this.onMouseDown);
        window.removeEventListener("mouseup", this.onMouseUp);
        window.removeEventListener("mousemove", this.onMouseMove);
        this.container.remove();
      }
    }

    update(update: ViewUpdate) {
      const prev = update.startState.facet(Config).enabled;
      const now = update.state.facet(Config).enabled;

      if (prev && !now) {
        this.remove();
        return;
      }

      if (!prev && now) {
        this.create(update.view);
      }

      if (now) {
        this.computeShowOverlay();

        if (update.geometryChanged) {
          this.computeHeight();
          this.computeTop();
        }
      }
    }

    public computeHeight() {
      if (!this.dom) {
        return;
      }

      const height = this.view.dom.clientHeight / SCALE;
      this.dom.style.height = height + "px";
    }

    public computeTop() {
      if (!this._isDragging && this.dom) {
        const { clientHeight, scrollHeight, scrollTop } = this.view.scrollDOM;

        const maxScrollTop = scrollHeight - clientHeight;
        const topForNonOverflowing = scrollTop / SCALE;

        const height = clientHeight / SCALE;
        const maxTop = clientHeight - height;
        let scrollRatio = scrollTop / maxScrollTop;
        if (isNaN(scrollRatio)) scrollRatio = 0;
        const topForOverflowing = maxTop * scrollRatio;

        const top = Math.min(topForOverflowing, topForNonOverflowing);
        this.dom.style.top = top + "px";
      }
    }

    public computeShowOverlay() {
      if (!this.container) {
        return;
      }

      const { showOverlay } = this.view.state.facet(Config);

      if (showOverlay === "mouse-over") {
        this.container.classList.add("cm-minimap-overlay-mouse-over");
      } else {
        this.container.classList.remove("cm-minimap-overlay-mouse-over");
      }

      const { clientHeight, scrollHeight } = this.view.scrollDOM;
      if (clientHeight === scrollHeight) {
        this.container.classList.add("cm-minimap-overlay-off");
      } else {
        this.container.classList.remove("cm-minimap-overlay-off");
      }
    }

    private onMouseDown(event: MouseEvent) {
      if (!this.container) {
        return;
      }

      // Ignore right click
      if (event.button === 2) {
        return;
      }

      // If target is the overlay start dragging
      const { clientY, target } = event;
      if (target === this.dom) {
        this._dragStartY = event.clientY;
        this._isDragging = true;
        this.container.classList.add("cm-minimap-overlay-active");
        return;
      }

      // Updates the scroll position of the EditorView based on the
      // position of the MouseEvent on the minimap canvas
      const { clientHeight, scrollHeight, scrollTop } = this.view.scrollDOM;
      const targetTop = (target as HTMLElement).getBoundingClientRect().top;
      const deltaY = (clientY - targetTop) * SCALE;

      const scrollRatio = scrollTop / (scrollHeight - clientHeight);
      const visibleRange = clientHeight * SCALE - clientHeight;
      const visibleTop = visibleRange * scrollRatio;

      const top = Math.max(0, scrollTop - visibleTop);
      this.view.scrollDOM.scrollTop = top + deltaY - clientHeight / 2;
    }

    private onMouseUp(_event: MouseEvent) {
      // Stop dragging on mouseup
      if (this._isDragging && this.container) {
        this._dragStartY = undefined;
        this._isDragging = false;
        this.container.classList.remove("cm-minimap-overlay-active");
      }
    }

    private onMouseMove(event: MouseEvent) {
      if (!this._isDragging || !this.dom) {
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
      const canvasRelTopDouble = parseFloat(this.dom.style.top);

      const scrollPosition = this.view.scrollDOM.scrollTop;
      const editorHeight = this.view.scrollDOM.clientHeight;
      const contentHeight = this.view.scrollDOM.scrollHeight;

      const atTop = scrollPosition === 0;
      const atBottom =
        Math.round(scrollPosition) >= Math.round(contentHeight - editorHeight);

      // We allow over-dragging past the top/bottom, but the overlay just sticks
      // to the top or bottom of its range. These checks prevent us from immediately
      // moving the overlay when the drag changes direction. We should wait until
      // the cursor has returned to, and begun to pass the bottom/top of the range
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
      const scrollHeight = this.view.scrollDOM.scrollHeight;
      const clientHeight = this.view.scrollDOM.clientHeight;

      const maxTopNonOverflowing = (scrollHeight - clientHeight) / SCALE;
      const maxTopOverflowing = clientHeight - clientHeight / SCALE;

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

      const scrollPosNonOverflowing = change * SCALE;
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
      this.remove();
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

export const Overlay = [Theme, OverlayView];
