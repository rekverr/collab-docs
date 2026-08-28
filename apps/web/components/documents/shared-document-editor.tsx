"use client";

import { CollaborativeEditor } from "./collaborative-editor";

export function SharedDocumentEditor({
  documentId,
  shareToken,
}: Readonly<{ documentId: string; shareToken: string }>) {
  return (
    <CollaborativeEditor
      documentId={documentId}
      role="EDITOR"
      shareToken={shareToken}
      showDocumentTools={false}
    />
  );
}
