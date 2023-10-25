## 0.5.1 (2023-10-25)

### Bug fixes

Remove circular imports to fix build

## 0.5.0 (2023-10-25)

### Breaking changes

The `minimap` function to register the main extension was removed from the library and replaced with the `showMinimap` facet.

The `MinimapGutterDecoration` facet to register gutters in the minimap was removed from the library and replaced with an option within the `showMinimap` facet.

### Bug fixes

Bump postcss (dependency of Vite) patch version to 8.4.31
