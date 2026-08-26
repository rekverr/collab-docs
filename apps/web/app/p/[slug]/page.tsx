import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicDocumentBody } from "../../../lib/public-documents/public-document-renderer";
import { getPublicDocument } from "../../../lib/public-documents/public-document-server";
import { publicDescription } from "../../../lib/public-documents/public-document";

export const revalidate = 300;

interface PublicDocumentPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PublicDocumentPageProps): Promise<Metadata> {
  const { slug } = await params;
  const document = await getPublicDocument(slug);
  if (document === null) notFound();
  return {
    title: `${document.title} · Collab Docs`,
    description: publicDescription(document),
    robots: { index: true, follow: true },
  };
}

export default async function PublicDocumentPage({ params }: PublicDocumentPageProps) {
  const { slug } = await params;
  const document = await getPublicDocument(slug);
  if (document === null) notFound();
  return (
    <main className="public-document-page">
      <article className="public-document">
        <header>
          <a className="brand" href="/">
            Collab Docs
          </a>
          <h1>{document.title}</h1>
        </header>
        <PublicDocumentBody
          blocks={document.contentProjection.blocks}
          publicSlug={document.publicSlug}
        />
      </article>
    </main>
  );
}
