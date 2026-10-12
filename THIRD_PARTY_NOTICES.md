# Third-party software

Chitra is MIT-licensed. It ships the following open-source components in the website
bundle. Each keeps its own licence.

| Component                                                     | Used for                           | Licence                     | Source                                 |
| ------------------------------------------------------------- | ---------------------------------- | --------------------------- | -------------------------------------- |
| [LibRaw](https://www.libraw.org/)                             | Decoding camera RAW files (NEF…)   | LGPL-2.1 or CDDL-1.0 (dual) | https://github.com/LibRaw/LibRaw       |
| [libraw-wasm](https://github.com/ybouane/LibRaw-Wasm)         | LibRaw compiled to WebAssembly     | ISC                         | https://github.com/ybouane/LibRaw-Wasm |
| [Little CMS](https://www.littlecms.com/) (inside libraw-wasm) | Colour management in LibRaw        | MIT                         | https://github.com/mm2/Little-CMS      |
| [exifr](https://github.com/MikeKovarik/exifr)                 | Reading EXIF shooting information  | MIT                         | https://github.com/MikeKovarik/exifr   |
| [UTIF.js](https://github.com/photopea/UTIF.js)                | Decoding TIFF files                | MIT                         | https://github.com/photopea/UTIF.js    |
| [pako](https://github.com/nodeca/pako) (used by UTIF.js)      | Decompression                      | MIT and Zlib                | https://github.com/nodeca/pako         |
| [React](https://react.dev/)                                   | User interface                     | MIT                         | https://github.com/facebook/react      |
| [Eruda](https://github.com/liriliri/eruda)                    | On-page debug console (`?debug=1`) | MIT                         | https://github.com/liriliri/eruda      |

LibRaw is used unmodified, as distributed by the `libraw-wasm` package. Its complete
source code is available at the link above.

Test photo used by the automated tests (downloaded at test time, not stored in this
repository): `iss030e122639.NEF`, a NASA photograph from the International Space Station
(public domain), from the [rawpy](https://github.com/letmaik/rawpy) test suite.
