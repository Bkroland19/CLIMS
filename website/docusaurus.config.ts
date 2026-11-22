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

// The site serves the repository's own Swagger UI (docs/api: page, vendored bundle and
// openapi.json) at /handbook/api-reference/. It is copied whenever the config loads, so both
// docs-serve and docs-build use it; restart docs-serve to pick up OpenAPI changes.
const generatedDir = path.join(__dirname, "generated");
const swaggerDir = path.join(generatedDir, "api-reference");
fs.rmSync(generatedDir, { recursive: true, force: true });
fs.mkdirSync(swaggerDir, { recursive: true });
for (const name of ["index.html", "swagger-initializer.js", "openapi.json", "assets"]) {
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
  staticDirectories: ["static", "generated"],

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
                openApiUrl: "pathname:///api-reference/openapi.json",
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
        // A plain link: Swagger UI is a static page, not a Docusaurus route.
        {
          type: "html",
          position: "left",
          value: `<a class="navbar__item navbar__link" href="${baseUrl}api-reference/">API reference</a>`,
        },
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
