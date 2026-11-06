import { readDocument, documents } from "@/lib/docs";
export function generateStaticParams() {
  return documents.map((document) => ({ slug: document.slug }));
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const document = readDocument(slug);
  if (!document) return new Response("Guide not found", { status: 404 });
  return new Response(document.content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.md"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
