// Docs keep repository-relative links so they work on GitHub. The site only publishes docs/,
// so links that leave it (or point at non-Markdown files) are rewritten at build time:
// the OpenAPI document goes to the site's Swagger UI copy, everything else to the file on GitHub.
import fs from "node:fs";
import path from "node:path";

const visit = (node, callback) => {
  if (node.type === "link") callback(node);
  for (const child of node.children ?? []) visit(child, callback);
};

export default function rewriteLinks({ repoRoot, docsDir, githubBlob, openApiUrl }) {
  return (tree, file) => {
    visit(tree, (node) => {
      const url = node.url;
      if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("#") || url.startsWith("/")) {
        return;
      }
      const [target, hash] = url.split("#");
      const resolved = path.resolve(path.dirname(file.path), target);
      const suffix = hash ? `#${hash}` : "";
      const insideDocs = resolved.startsWith(docsDir + path.sep);

      if (insideDocs && resolved === path.join(docsDir, "api", "openapi.json")) {
        node.url = openApiUrl + suffix;
      } else if (insideDocs && resolved.endsWith(".md")) {
        return;
      } else if (insideDocs && fs.existsSync(path.join(resolved, "README.md"))) {
        node.url =
          path.relative(path.dirname(file.path), path.join(resolved, "README.md")) + suffix;
      } else {
        const relative = path.relative(repoRoot, resolved).split(path.sep).join("/");
        node.url = `${githubBlob}/${relative}${suffix}`;
      }
    });
  };
}
