import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SessionGate, SessionProvider } from "../../../components/auth/session-provider";
import { SharedDocumentEditor } from "../../../components/documents/shared-document-editor";
import { accessCookieName, refreshCookieName } from "../../../lib/auth/session-cookies";
import { PublicDocumentBody } from "../../../lib/public-documents/public-document-renderer";
import { getSharedDocument } from "../../../lib/public-documents/shared-document-server";

interface SharedDocumentPageProps {
  params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: "Shared document · Collab Docs",
  robots: { index: false, follow: false },
};

export default async function SharedDocumentPage({ params }: SharedDocumentPageProps) {
  const { token } = await params;
  const document = await getSharedDocument(token);
  if (document === null) notFound();

  const cookieStore = await cookies();
  const hasSession = cookieStore.has(refreshCookieName) || cookieStore.has(accessCookieName);
  const attachmentBasePath = `/api/backend/shares/${encodeURIComponent(token)}/attachments`;

  if (document.accessMode === "EDIT" && hasSession) {
    return (
      <SessionProvider>
        <SessionGate>
          <main className="shared-document-page">
            <header className="shared-document-header">
              <Link className="brand" href="/app">
                Collab Docs
              </Link>
              <div>
                <p className="eyebrow">Editable shared document</p>
                <h1>{document.title}</h1>
              </div>
            </header>
            <SharedDocumentEditor documentId={document.documentId} shareToken={token} />
          </main>
        </SessionGate>
      </SessionProvider>
    );
  }

  return (
    <main className="public-document-page">
      <article className="public-document">
        <header>
          <Link className="brand" href="/">
            Collab Docs
          </Link>
          <p className="eyebrow">
            {document.accessMode === "EDIT" ? "Editable share link" : "Shared document"}
          </p>
          <h1>{document.title}</h1>
          {document.accessMode === "EDIT" && (
            <div className="share-sign-in-callout">
              <p>Sign in to edit this document with your identity and live presence.</p>
              <Link
                className="button"
                href={`/login?next=${encodeURIComponent(`/share/${token}`)}`}
              >
                Sign in to edit
              </Link>
            </div>
          )}
        </header>
        <PublicDocumentBody
          blocks={document.contentProjection.blocks}
          attachmentBasePath={attachmentBasePath}
        />
      </article>
    </main>
  );
}
