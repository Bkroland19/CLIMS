# ADR 0004: A public documentation site built from docs/

- **Status:** Accepted
- **Date:** 2026-11-22
- **Applies to:** `docs/`, `website/`, the release images and the production Nginx

## Context

`docs/` holds the project's documentation: setup and environment guides, a guide per module, the
API reference, ADRs and release notes. It is read on GitHub, which works for the team but not for
anyone else. The project wants everyone, not only developers, to be able to read it.

The docs link to each other with relative paths, and `scripts/check_docs.py` checks those links in
CI. Some links leave `docs/`, for example to `frontend/README.md` or `infra/env/prod.env.example`,
and six pages link to `api/openapi.json`.

Production already runs behind one Nginx gateway. The Go API owns `/docs/` and serves Swagger UI and
the OpenAPI document there. Only published stable releases deploy, using images pinned by digest.

## Decisions

### 1. Docusaurus reads docs/ in place

A Docusaurus project in `website/`, with its own pinned dependencies, publishes `docs/` without
moving it. The files stay readable on GitHub and keep the same paths for links and editors.

`.md` files are parsed as CommonMark (`markdown.format: 'detect'`), so existing docs build unchanged
and contributors do not need to learn MDX. A page that needs components can be written as `.mdx`.

### 2. Links are rewritten at build time, not in the docs

A remark plugin in `website/` rewrites links that leave `docs/` to the file on GitHub, and links to
`api/openapi.json` to the site's API reference (decision 3). The docs keep their relative links, so they still
work on GitHub and `check_docs.py` still checks them. The site build fails on broken links and
anchors, and CI runs that build on every pull request.

### 3. The API reference is the repository's Swagger UI

The "API reference" page (`docs/api/reference.mdx`) shows Swagger UI inside the site, with the
site's header, search and docs sidebar. It loads the vendored, checksummed bundle and `openapi.json`
from `docs/api/`, which the site publishes under `/handbook/swagger/`. Its settings live in
`docs/api/swagger-config.js`, loaded by both this page and the API's own page at `/docs/`, so the
two cannot drift. It works in `make docs-serve` as well as in production, where a link to the API's
`/docs/` would not: Docusaurus prefixes its base path to same-host links, and the dev server does
not serve the API.

It is the one `.mdx` file in `docs/`, because only a doc page gets the docs sidebar. On GitHub it
shows as source rather than Swagger. Swagger keeps its own look inside the page, on a light panel in
both themes.

"Try it out" sends requests to the same origin, as the OpenAPI document's `servers` entry says. In
production that is the API behind the same Nginx; the local dev server has no API to answer.

Generating one page per endpoint with an OpenAPI plugin was left for later: it adds a dependency
and generated files to keep in step with the API.

### 4. Served from the production server under /handbook/

The site is a `docs` image, a static Nginx serving the built files, published by the release
workflow next to the backend, frontend and mobile images and pinned by digest in `images.env`. The
gateway forwards `/handbook/` to it. `/docs/` stays Swagger UI, so no existing URL changes.

Alternatives considered:

- **GitHub Pages.** Free and without a server, but the project chose to host on its own server.
- **Building the site in the gateway's Nginx image.** That image is built on the production server
  during each deploy, which would run `npm ci` and a full site build there, need npm registry
  access, slow deploys and leave the site unpinned.
- **Moving Swagger UI to make room at `/docs/`.** That would break a URL used across the README,
  the API docs, the backend routes and the web app's rewrites.
- **A subdomain.** That needs DNS and a TLS certificate.

The site's public address comes from the origin of `EXPO_PUBLIC_API_URL`, which the release
workflow already requires, because both are served by the same Nginx.

### 5. Updated with releases

The public site changes only when a stable release deploys, like the rest of production. Rolling
back a release rolls back its docs. Contributors preview changes with `make docs-serve`; development
Compose has no docs container.

### 6. Kept small

- Search is the local search plugin: no external account, and it works on any host.
- No versioned docs: the site shows the release it was built from, labelled in the navbar.
- Release notes stay as ordinary pages, not a blog.
- The sidebar is hand-written for top-level guides; `modules/`, `adr/` and `releases/` are listed
  from their folders, so new modules, ADRs and release notes appear without editing it.
- Pages link to GitHub upstream for editing.

## Consequences

- All of `docs/` is public, including the deployment runbook in `releases.md`, which names the
  GitHub secrets the deploy uses (not their values). Anything that must stay private cannot go in
  `docs/`.
- Doc changes merged between releases are not public until the next release.
- A new top-level guide must be added to `website/sidebars.ts`; otherwise it is published without a
  sidebar entry.
- Releases build and publish one more image, and production runs one more small container.
- User guides for non-developers, a link from the web app, a custom domain and generated API pages
  are left for later changes.
