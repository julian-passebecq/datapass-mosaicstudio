/** Preserve approved build metadata; page navigation only prefixes its stable site title. */
export function updateSiteMetadata(doc: Document, manifest: {title: string; description: string}, pageTitle: string): void {
  const publishedTitle = doc.querySelector('title')?.getAttribute('data-studio-publication-title');
  doc.title = pageTitle + ' | ' + (publishedTitle || manifest.title);
  const meta = doc.querySelector('meta[name="description"]') || doc.head.appendChild(doc.createElement('meta'));
  meta.setAttribute('name', 'description');
  if (!meta.hasAttribute('data-studio-publication-description')) meta.setAttribute('content', manifest.description);
}
