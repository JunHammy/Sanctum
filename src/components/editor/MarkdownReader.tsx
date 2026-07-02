// html comes from our own markdown-it pipeline (a note this user wrote), not
// arbitrary third-party content, so injecting it directly is fine here.
export function MarkdownReader({ html }: { html: string }) {
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
}
