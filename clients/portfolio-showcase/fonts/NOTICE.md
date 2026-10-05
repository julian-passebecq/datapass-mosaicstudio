# Bundled fonts

Latin subsets served by Google Fonts, bundled with the build because the client CSP is `font-src 'self'`.
Both fonts are licensed under the SIL Open Font License, Version 1.1 (https://openfontlicense.org).

| File | Family | Axes | Copyright |
|---|---|---|---|
| `bricolage-grotesque-latin.woff2` | Bricolage Grotesque | opsz 12–96, wght 200–800 | Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage) |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | wght 400–700 | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) |

The fonts are used unmodified. The CSS registers them under private family names (`PF Bricolage`, `PF Mono`)
so they never collide with installed copies; that is not a renamed font under the OFL (no font file is changed).
