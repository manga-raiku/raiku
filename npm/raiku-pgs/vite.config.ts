import esbuild from "esbuild"
import { defineConfig } from "vite"
import type { Plugin } from "vite"
import { replaceCodePlugin } from "vite-plugin-replace"

function vitePluginBuildRaw(): Plugin {
  return {
    name: "vite-plugin-build-raw",
    transform(src, id) {
      if (id.includes("?braw")) {
        id = id.replace(/\?braw$/, "")
        // console.log({ id })
        const code = esbuild.buildSync({
          entryPoints: [id],
          format: "iife",
          bundle: true,
          minify:
            id.includes("&minify") || process.env.NODE_ENV === "production",
          treeShaking: true,
          write: false,
        })
        const { text } = code.outputFiles[0]

        return {
          code: `export default ${JSON.stringify(text)}`,

          map: null,
        }
      }
    },
  }
}

export default defineConfig({
  build: {
    lib: {
      entry: ["./lib/plugin.ts", "./lib/thread.ts"],
      name: "RaikuPgs",
      formats: ["es", "cjs"],
      // fileName: (format, entry) => (entry + format === "es" ? ".js" : ".cjs"),
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ["cheerio", "htmlparser2"],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        // globals: {
        //   cheerio: "cheerio",
        //   htmlparser2: "htmlparser2",
        // },
      },
    },
  },
  plugins: [
    vitePluginBuildRaw(),
    replaceCodePlugin({
      replacements: [
        {
          from: "__DEV__",
          to: "process.env.NODE_ENV === 'development'",
        },
      ],
    }),
  ],
})