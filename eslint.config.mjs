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
          Element: "readonly",
          Event: "readonly",
          fetch: "readonly",
          File: "readonly",
          HTMLInputElement: "readonly",
          MouseEvent: "readonly",
          MutationObserver: "readonly",
          queueMicrotask: "readonly",
          setInterval: "readonly",
          setTimeout: "readonly",
          window: "readonly",
        },
      },
    },
  ],
});
