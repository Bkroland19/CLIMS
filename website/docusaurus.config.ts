import fs from "node:fs";
import path from "node:path";
import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import rewriteLinks from "./src/remark/rewrite-links.mjs";

const repoRoot = path.resolve(__dirname, "..");
const docsDir = path.join(repoRoot, "docs");
const version = fs.readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim();
const repository = "https://github.com/mohuganda/CLIMS";
const baseUrl = "/handbook/";

// The API reference page renders the repository's own Swagger UI (docs/api: vendored bundle,
// shared settings and openapi.json), published at /handbook/swagger/. It is copied whenever the
// config loads, so docs-serve and docs-build both have it; restart docs-serve after changing it.
// The dev container points this outside the bind-mounted website/ folder.
const generatedDir = process.env.DOCS_GENERATED_DIR || path.join(__dirname, "generated");
const swaggerDir = path.join(generatedDir, "swagger");
fs.rmSync(generatedDir, { recursive: true, force: true });
fs.mkdirSync(swaggerDir, { recursive: true });
for (const name of ["assets", "swagger-config.js", "openapi.json"]) {
  fs.cpSync(path.join(docsDir, "api", name), path.join(swaggerDir, name), { recursive: true });
}

const config: Config = {
  title: "CLIMS Documentation",
  tagline: "Condom Logistics Information Management System",
  favicon: "img/favicon.ico",
  // Served by the production Nginx under /handbook/; the host is the deployment's own.
  url: process.env.DOCS_SITE_URL || "https://clims.example.invalid",
  baseUrl,
  trailingSlash: true,
  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  markdown: {
    // Plain .md is CommonMark; only .mdx files are parsed as MDX.
    format: "detect",
    hooks: { onBrokenMarkdownLinks: "throw" },
  },
  i18n: { defaultLocale: "en", locales: ["en"] },
  staticDirectories: ["static", generatedDir],

  presets: [
    [
      "classic",
      {
        docs: {
          path: "../docs",
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: ({ docPath }) => `${repository}/edit/main/docs/${docPath}`,
          beforeDefaultRemarkPlugins: [
            [
              rewriteLinks,
              {
                repoRoot,
                docsDir,
                githubBlob: `${repository}/blob/main`,
                // pathname:// marks a static file rather than a page; see generatedDir above.
                openApiUrl: "pathname:///swagger/openapi.json",
              },
            ],
          ],
        },
        blog: false,
        pages: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      "@easyops-cn/docusaurus-search-local",
      {
        hashed: true,
        docsDir: "../docs",
        docsRouteBasePath: "/",
        indexBlog: false,
        indexPages: false,
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: "CLIMS Documentation",
      items: [
        { type: "docSidebar", sidebarId: "docs", position: "left", label: "Docs" },
        { type: "doc", docId: "api/reference", position: "left", label: "API reference" },
        {
          href: `${repository}/blob/main/docs/releases/${version}.md`,
          label: `v${version}`,
          position: "right",
        },
        { href: repository, label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      copyright: `CLIMS v${version}`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "go", "json", "sql", "yaml", "nginx"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
