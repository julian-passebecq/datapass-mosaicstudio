# Public-site metadata without a heavy application shell

Content clients can remain compact, without runs, knowledge, SQL or 3D. A selected build now emits title/description/social metadata before JavaScript runs. This is static metadata, not full server rendering or guaranteed search ranking.

The default is preview mode (`noindex,nofollow` plus a disallow robots file), so a synthetic acceptance build does not accidentally announce itself as a production website. Robots directives are NOT authentication or privacy: every published file remains publicly accessible.

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

Title and description default to the app manifest. Omit `image` when there is no approved image. A supplied image must exist inside that client's public directory, use a safe relative PNG/JPEG/WebP path and fit 1 MiB. Symbolic paths are refused. No asset is downloaded or generated automatically.

Public mode requires an explicit HTTPS canonical address without credentials, query or fragment. Relative social image URLs are resolved against it; use a trailing slash for a site hosted in a subdirectory. Review the address before publishing: validation does not prove domain ownership. The build performs no network verification or deployment.

`studio-publication.json` records metadata and its limits. The integrated workbench remains separate. Per-page dynamic SEO, prerendering, translated content, sitemap generation, a custom domain and authentication remain client/deployment responsibilities. Language metadata does not translate text.
