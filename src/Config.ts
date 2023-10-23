import { Facet, combineConfig } from "@codemirror/state";
import { DOMEventMap, EditorView } from "@codemirror/view";
import { MinimapConfig } from ".";
import { Gutter } from "./Gutters";

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

  /** 
   * Enables a gutter to be drawn on the given line to the left
   * of the minimap, with the given color. Accepts all valid CSS
   * color values.
   */
  gutters?: Array<Gutter>
};

const Config = Facet.define<MinimapConfig | null, Required<Options>>({
  combine: (c) => {
    const configs: Array<Omit<MinimapConfig, 'create'>> = [];
    for (let config of c) {
      if (!config) {
        continue;
      }

      const { create, gutters, ...rest } = config;

      configs.push({
        ...rest,
        gutters: gutters ? gutters.filter(v => Object.keys(v).length > 0) : undefined,
      });
    }

    return combineConfig(configs, {
      displayText: "characters",
      eventHandlers: {},
      showOverlay: "always",
      gutters: [],
    });
  },
});

const Scale = {
  // Multiply the number of canvas pixels
  PixelMultiplier: 2,
  // Downscale the editor contents by this ratio
  SizeRatio: 4,
  // Maximum width of the minimap in pixels
  MaxWidth: 120,
} as const;

export { Config, Options, Scale };
