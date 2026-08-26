import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRestoreState, encodeVersionState, reconstructVersionState } from "./version-state";

describe("document version state", () => {
  it("reconstructs the durable current state from snapshot plus updates", async () => {
    const Y = await import("yjs");
    const source = new Y.Doc();
    source.getText("content").insert(0, "first");
    const snapshot = Y.encodeStateAsUpdate(source);
    const vector = Y.encodeStateVector(source);
    source.getText("content").insert(5, " second");
    const update = Y.encodeStateAsUpdate(source, vector);

    const reconstructed = await reconstructVersionState({ snapshot, updates: [update] });

    assert.equal(reconstructed.getText("content").toString(), "first second");
    source.destroy();
    reconstructed.destroy();
  });

  it("restores older ProseMirror content as a convergent new Yjs update", async () => {
    const Y = await import("yjs");
    const version = await prosemirrorDocument("Version content");
    const current = await prosemirrorDocument("Current content");
    const replica = new Y.Doc();
    Y.applyUpdate(replica, await encodeVersionState(current));

    const restored = await createRestoreState(current, await encodeVersionState(version));
    Y.applyUpdate(replica, restored.update);

    assert.equal(
      restored.document.getXmlFragment("prosemirror").toJSON(),
      "<paragraph>Version content</paragraph>",
    );
    assert.equal(
      replica.getXmlFragment("prosemirror").toJSON(),
      "<paragraph>Version content</paragraph>",
    );
    version.destroy();
    restored.document.destroy();
    replica.destroy();
  });
});

async function prosemirrorDocument(
  text: string,
): Promise<import("yjs", { with: { "resolution-mode": "import" } }).Doc> {
  const Y = await import("yjs");
  const document = new Y.Doc();
  const paragraph = new Y.XmlElement("paragraph");
  const content = new Y.XmlText();
  content.insert(0, text);
  paragraph.insert(0, [content]);
  document.getXmlFragment("prosemirror").insert(0, [paragraph]);
  return document;
}
