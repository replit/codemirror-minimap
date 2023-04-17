# codemirror-minimap

```
Develop: pnpm dev
Build: pnpm build
```

### TODO

[x] Allow scroll to propagate through to cm-scroller - potentially use https://discuss.codemirror.net/t/is-it-possible-to-style-custom-gutter-on-right-side/3776
[] Diagnostics: should we show diagnostics in lines that are collapsed? - VSCode does not. Right now we do
[] Collapsed lines: actual text isn't collapsing. Just unchanged for some reason. Seems like regression
[] Clean up selection styling
[x] Selection seems to be off by one line. - only for blocks. not for text
[] Long documents that extend minimap beyond height
[x] Bug: jumping width when long line leaves viewport
[x] small: add back box shadow when we have h-scroll
[x] block rendering has some extra black boxes at the end of some lines
[x] Bug: overlay not actually showing up now that I extracted it.
[] Bug: smol v-scroll caused by minimap when code otherwise doesn't have scroll

Later:

- Git integration?
- Optimize font rendering
