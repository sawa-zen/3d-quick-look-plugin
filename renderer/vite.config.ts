import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// WKWebView の loadFileURL では、別ファイルの JS/CSS を読み込む際に
// allowingReadAccessTo の指定がシビアで詰まりやすい。
// そこで vite-plugin-singlefile で JS/CSS をすべて index.html に
// インライン化し、単一ファイルだけ配置すれば動く構成にしている。
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'esnext',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    cssCodeSplit: false,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
