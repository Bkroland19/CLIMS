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

const config: Config = {
  title: "CLIMS Documentation",
  tagline: "Condom Logistics Information Management System",
  favicon: "img/favicon.ico",
  // Served by the production Nginx under /handbook/; the host is the deployment's own.
  url: process.env.DOCS_SITE_URL || "https://clims.example.invalid",
  baseUrl: "/handbook/",
  trailingSlash: true,
  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  markdown: {
    // Plain .md is CommonMark; only .mdx files are parsed as MDX.
    format: "detect",
    hooks: { onBrokenMarkdownLinks: "throw" },
  },
  i18n: { defaultLocale: "en", locales: ["en"] },

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
                // pathname:// skips route checks; the file is copied in by the plugin below.
                openApiUrl: "pathname:///openapi.json",
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

  plugins: [
    // Publish docs/api/openapi.json as /handbook/openapi.json. Docusaurus prefixes its baseUrl to
    // every same-host link, so docs cannot point at the API's own /docs/openapi.json.
    () => ({
      name: "clims-openapi-document",
      async postBuild({ outDir }) {
        fs.copyFileSync(
          path.join(docsDir, "api", "openapi.json"),
          path.join(outDir, "openapi.json"),
        );
      },
    }),
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
        // Raw HTML so Docusaurus does not prefix /handbook/ to the API's own Swagger UI at /docs/.
        {
          type: "html",
          position: "left",
          value: '<a class="navbar__item navbar__link" href="/docs/">API reference</a>',
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
