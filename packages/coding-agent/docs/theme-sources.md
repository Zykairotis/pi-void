# Bundled Theme Sources

Ice bundles all 98 JSON themes from [OhMyPi](https://github.com/can1357/oh-my-pi) commit [`e06ac0b787d9d30adfbe13aca46784376d54c35a`](https://github.com/can1357/oh-my-pi/commit/e06ac0b787d9d30adfbe13aca46784376d54c35a), sourced from [`packages/coding-agent/src/modes/theme/defaults/`](https://github.com/can1357/oh-my-pi/tree/e06ac0b787d9d30adfbe13aca46784376d54c35a/packages/coding-agent/src/modes/theme/defaults).

Each Ice filename matches its OhMyPi source filename. Adaptations remove OhMyPi-only color and symbol tokens and point `$schema` to Ice's theme schema. Poimandres' translucent selection color is preblended against its dark or light background because Ice themes use opaque terminal colors. Prism's color-token aliases are resolved to its palette variable, and Onyx's `$variable` references use Ice's unprefixed variable syntax. Other compatible palette, UI, syntax, diff, and HTML export colors remain unchanged. Ice's native `dark` and `light` themes remain bundled separately, for 100 built-in themes total.

## OhMyPi license

MIT License

Copyright (c) 2025 Mario Zechner
Copyright (c) 2025-2026 Can Bölük

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
