import { Facet, combineConfig } from "@codemirror/state";

type Options = {
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

const Config = Facet.define<Options, Required<Options>>({
  combine: (configs) => {
    return combineConfig(configs, {
      displayText: "characters",
      showOverlay: "always",
    });
  },
});

export { Config, Options };
