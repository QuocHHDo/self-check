# Tesseract.js (vendored)

Reads label photos in the browser for "Read a label photo". Nothing is uploaded: the photo, the OCR engine and the
English model all stay on the device. Loaded only when someone taps the button.

| File | From | Version | License |
|---|---|---|---|
| tesseract.min.js, worker.min.js | [tesseract.js](https://github.com/naptha/tesseract.js) `dist/` | 5.1.1 | Apache-2.0 (LICENSE-tesseract.js.md); bundled parts are MIT/BSD-3 as noted in their headers |
| tesseract-core-simd-lstm.wasm.js, tesseract-core-lstm.wasm.js | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) | 5.1.1 | Apache-2.0 (LICENSE-tesseract.js-core) |
| eng.traineddata.gz | [@tesseract.js-data/eng](https://www.npmjs.com/package/@tesseract.js-data/eng) `4.0.0_best_int`, from [tessdata_best](https://github.com/tesseract-ocr/tessdata_best) | 1.0.0 | Apache-2.0 |

Unmodified copies from npm. The non-SIMD core is only fetched by browsers without WebAssembly SIMD.
