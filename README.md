# codemirror-minimap

```
Develop: pnpm dev
Build: pnpm build
```

### TODO

[] Diagnostics: should we show diagnostics in lines that are collapsed? - VSCode does not. Right now we do
[] Diagnostics: appears to be showing on wrong lines when lines are collapsed
[] Clean up selection styling
[] Long documents that extend minimap beyond height
[] Bug: smol v-scroll caused by minimap when code otherwise doesn't have scroll
[] Need to handle word-wrap situations. Right now I split on '\n', and we will need to treat word
wrap differently, unfortunately
[] look into canvas scale - see if there's a way to make blocks/chars more crisp

[] Need to test/handle changing editor heights
[] There's probably no way to fix the background color issue, for now we just use gutter BG color...

- Converstions to new API
  [x] text
  [] diag
  [] sele

Later:

- Git integration?
- Optimize font rendering
- Handle inline widgets....
