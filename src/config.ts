import { Facet, combineConfig } from "@codemirror/state";

type Config = {
  /**
   * Determines how to render text. Defaults to `characters`.
   */
  displayText?: "blocks" | "characters";

  /**
   * The overlay shows the portion of the file currently in the viewport.
   * Defaults to `always`.
   */
  showOverlay?: "always" | "mouse-over";
};

const config = Facet.define<Config, Required<Config>>({
  combine: (configs) => {
    return combineConfig(configs, {
      displayText: "characters",
      showOverlay: "always",
    });
  },
});

export { Config, config };
