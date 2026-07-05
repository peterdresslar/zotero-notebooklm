// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

export default zotero({
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        // We disable this rule here because the template
        // contains some unused examples and variables
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
    {
      files: ["chrome-extension/**/*.js"],
      languageOptions: {
        globals: {
          atob: "readonly",
          chrome: "readonly",
          clearInterval: "readonly",
          clearTimeout: "readonly",
          console: "readonly",
          DataTransfer: "readonly",
          document: "readonly",
          DragEvent: "readonly",
          Element: "readonly",
          Event: "readonly",
          EventTarget: "readonly",
          fetch: "readonly",
          File: "readonly",
          HTMLInputElement: "readonly",
          MouseEvent: "readonly",
          MutationObserver: "readonly",
          PointerEvent: "readonly",
          queueMicrotask: "readonly",
          setInterval: "readonly",
          setTimeout: "readonly",
          URL: "readonly",
          window: "readonly",
        },
      },
    },
  ],
});
