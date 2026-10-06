# Public-site metadata without a heavy application shell

Content clients can remain compact, without runs, knowledge, SQL or 3D. A selected build emits title/description/social metadata before JavaScript runs. This is static metadata, not full server rendering or guaranteed search ranking.

The default is preview mode (`noindex,nofollow` plus a disallow robots file), so a synthetic acceptance build does not announce itself as a production website. Robots directives are NOT authentication or privacy: every published file remains accessible.

Create an optional `clients/<id>/publication.json`:

```json
{
  "format": "datapass.publication",
  "version": 1,
  "visibility": "public",
  "language": "en",
  "canonicalUrl": "https://your-approved-domain.example/",
  "title": "Client-owned site title",
  "description": "A client-approved description.",
  "image": "social/preview.webp"
}
```

Title and description default to the app manifest. Omit the image when no asset has been approved. A supplied image must exist inside that client's public directory, use a safe relative PNG/JPEG/WebP path and fit 1 MiB. Symbolic paths are refused. No asset is downloaded or generated automatically.

Public mode requires an explicit HTTPS canonical address without credentials, query or fragment. Relative social image URLs resolve against it; use a trailing slash for a subdirectory site. Validation does not prove domain ownership. The build performs no network verification or deployment.

## Metadata ownership during hydration

The build marks the approved site title and description in the generated head. Runtime navigation prefixes the current page title to that stable approved site title. It does not replace the published description with a generic manifest description. In an integrated preview without a marked publication head, the active manifest remains the fallback. Text stays escaped at build time and is updated only through text/attribute APIs, not executable markup.

The controlled published-head browser fixtures exercise these rules against the actual production modules, including navigation and markup-like text. The isolated-build matrix still verifies real emitted metadata, preview/public defaults and canonical URLs. Per-page descriptions, prerendering and a complete page-specific SEO strategy remain client responsibilities.

## Delivery boundary

`studio-publication.json` records metadata and its limits. Language metadata does not translate interface text. Approved assets, translated content, a sitemap, custom domain, hosting/authentication and explicit deployment remain client/release work.

Use the selected-client build, verify keyboard and narrow-screen behavior, inspect requests and apply the emitted-JavaScript budgets in `docs/CLIENT_PERFORMANCE_GATES.md`. Passing those gates is not a complete accessibility or production-security certification.
