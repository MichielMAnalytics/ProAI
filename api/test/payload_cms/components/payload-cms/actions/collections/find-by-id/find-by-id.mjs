import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-find-by-id",
  name: "Find Document by ID",
  description: "Find a single document by its ID from a Payload CMS collection",
  version: "0.0.1",
  type: "action",
  props: {
    payloadCms,
    collectionSlug: {
      propDefinition: [
        payloadCms,
        "collectionSlug",
      ],
    },
    documentId: {
      propDefinition: [
        payloadCms,
        "documentId",
      ],
    },
    depth: {
      propDefinition: [
        payloadCms,
        "depth",
      ],
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.findById({
      $,
      collection: this.collectionSlug,
      id: this.documentId,
      params: {
        depth: this.depth,
      },
    });

    $.export("$summary", `Successfully retrieved document with ID: ${this.documentId}`);
    return response;
  },
};