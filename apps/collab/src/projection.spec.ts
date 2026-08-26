import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Y from "yjs";
import { deriveDocumentProjection } from "./projection.js";

describe("TipTap Yjs projection", () => {
  it("derives only supported normalized blocks from the ProseMirror fragment", () => {
    const document = new Y.Doc();
    const fragment = document.getXmlFragment("prosemirror");
    const heading = element("heading", "Roadmap", { level: "2" });
    const paragraph = element("paragraph", "Shared notes");
    const bulletList = new Y.XmlElement("bulletList");
    bulletList.insert(0, [element("listItem", "First"), element("listItem", "Second")]);
    const taskList = new Y.XmlElement("taskList");
    taskList.insert(0, [element("taskItem", "Ship it", { checked: "true" })]);
    const code = element("codeBlock", "const safe = true;", { language: "typescript" });
    const image = new Y.XmlElement("image");
    image.setAttribute("src", "https://images.example.test/diagram.png");
    image.setAttribute("alt", "Architecture diagram");
    fragment.insert(0, [heading, paragraph, bulletList, taskList, code, image]);

    const projection = deriveDocumentProjection(document);

    assert.deepEqual(
      projection.blocks.map((block) => block.type),
      ["heading", "paragraph", "list", "task", "code", "image"],
    );
    assert.equal(projection.plainText.includes("Roadmap"), true);
    assert.equal(projection.plainText.includes("Ship it"), true);
  });

  it("rejects unsafe image sources instead of projecting client HTML", () => {
    const document = new Y.Doc();
    const image = new Y.XmlElement("image");
    image.setAttribute("src", "javascript:alert(1)");
    document.getXmlFragment("prosemirror").insert(0, [image]);

    assert.deepEqual(deriveDocumentProjection(document).blocks, []);
  });
});

function element(
  name: string,
  text: string,
  attributes: Readonly<Record<string, string>> = {},
): Y.XmlElement {
  const node = new Y.XmlElement(name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  const content = new Y.XmlText();
  content.insert(0, text);
  node.insert(0, [content]);
  return node;
}
