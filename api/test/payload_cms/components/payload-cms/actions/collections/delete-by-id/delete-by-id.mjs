import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-delete-by-id",
  name: "Delete Document by ID",
  description: "Delete a single document by its ID from a Payload CMS collection",
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
  },
  async run({ $ }) {
    const response = await this.payloadCms.deleteById({
      $,
      collection: this.collectionSlug,
      id: this.documentId,
    });

    $.export("$summary", `Successfully deleted document with ID: ${this.documentId}`);
    return response;
  },
};