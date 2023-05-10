import { Facet, combineConfig } from "@codemirror/state";
import { DOMEventMap, EditorView } from "@codemirror/view";

type EventHandler<event extends keyof DOMEventMap> = (
  e: DOMEventMap[event],
  v: EditorView
) => void;

type Options = {
  /**
   * Determines how to render text. Defaults to `characters`.
   */
  displayText?: "blocks" | "characters";

  /**
   * Attach event handlers to the minimap container element.
   */
  eventHandlers?: {
    [event in keyof DOMEventMap]?: EventHandler<event>;
  };

  /**
   * The overlay shows the portion of the file currently in the viewport.
   * Defaults to `always`.
   */
  showOverlay?: "always" | "mouse-over";
};

const Config = Facet.define<Options, Required<Options>>({
  combine: (configs) => {
    return combineConfig(configs, {
      displayText: "characters",
      eventHandlers: {},
      showOverlay: "always",
    });
  },
});

const Scale = {
  // Multiply the number of canvas pixels
  PixelMultiplier: 2,
  // Downscale the editor contents by this ratio
  SizeRatio: 4,
};

export { Config, Options, Scale };
