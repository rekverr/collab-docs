type YjsModule = typeof import("yjs", { with: { "resolution-mode": "import" } });
type YjsDocument = import("yjs", { with: { "resolution-mode": "import" } }).Doc;

export interface VersionStateSource {
  snapshot: Uint8Array | null;
  updates: readonly Uint8Array[];
}

export interface RestoreStateResult {
  document: YjsDocument;
  update: Uint8Array;
}

export async function reconstructVersionState(source: VersionStateSource): Promise<YjsDocument> {
  const Y = await loadYjs();
  const document = new Y.Doc();
  if (source.snapshot !== null) Y.applyUpdate(document, source.snapshot);
  for (const update of source.updates) Y.applyUpdate(document, update);
  return document;
}

export async function createRestoreState(
  current: YjsDocument,
  versionState: Uint8Array,
): Promise<RestoreStateResult> {
  const Y = await loadYjs();
  const target = new Y.Doc();
  Y.applyUpdate(target, versionState);
  const before = Y.encodeStateVector(current);

  current.transact(() => {
    replaceXmlFragment(current, target, "prosemirror");
    replaceLegacyBlocks(Y, current, target);
    replaceLegacyText(current, target);
  }, "document-version-restore");

  const update = Y.encodeStateAsUpdate(current, before);
  target.destroy();
  return { document: current, update };
}

export async function encodeVersionState(document: YjsDocument): Promise<Uint8Array> {
  const Y = await loadYjs();
  return Y.encodeStateAsUpdate(document);
}

export async function isEmptyYjsUpdate(update: Uint8Array): Promise<boolean> {
  const Y = await loadYjs();
  const decoded = Y.decodeUpdate(update);
  return decoded.structs.length === 0 && decoded.ds.clients.size === 0;
}

function replaceXmlFragment(current: YjsDocument, target: YjsDocument, field: string): void {
  const currentFragment = current.getXmlFragment(field);
  const targetFragment = target.getXmlFragment(field);
  if (currentFragment.length > 0) currentFragment.delete(0, currentFragment.length);
  const children = targetFragment
    .toArray()
    .filter(
      (
        child,
      ): child is
        | import("yjs", { with: { "resolution-mode": "import" } }).XmlElement
        | import("yjs", { with: { "resolution-mode": "import" } }).XmlText =>
        "nodeName" in child || "insertEmbed" in child,
    )
    .map((child) => child.clone());
  if (children.length > 0) currentFragment.insert(0, children);
}

function replaceLegacyBlocks(Y: YjsModule, current: YjsDocument, target: YjsDocument): void {
  if (!current.share.has("blocks") && !target.share.has("blocks")) return;
  const currentBlocks = current.getArray<unknown>("blocks");
  const targetBlocks = target.getArray<unknown>("blocks");
  if (currentBlocks.length > 0) currentBlocks.delete(0, currentBlocks.length);
  const values = targetBlocks.toArray().map((value) => cloneSharedValue(Y, value));
  if (values.length > 0) currentBlocks.insert(0, values);
}

function replaceLegacyText(current: YjsDocument, target: YjsDocument): void {
  if (!current.share.has("content") && !target.share.has("content")) return;
  const currentText = current.getText("content");
  const targetText = target.getText("content").toString();
  if (currentText.length > 0) currentText.delete(0, currentText.length);
  if (targetText !== "") currentText.insert(0, targetText);
}

function cloneSharedValue(Y: YjsModule, value: unknown): unknown {
  return value instanceof Y.AbstractType ? value.clone() : structuredClone(value);
}

function loadYjs(): Promise<YjsModule> {
  return import("yjs");
}
