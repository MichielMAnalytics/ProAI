import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-update-by-id",
  name: "Update Document by ID",
  description: "Update a single document by its ID in a Payload CMS collection",
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
    data: {
      type: "object",
      label: "Update Data",
      description: "The data to update in the document",
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.updateById({
      $,
      collection: this.collectionSlug,
      id: this.documentId,
      data: this.data,
    });

    $.export("$summary", `Successfully updated document with ID: ${this.documentId}`);
    return response;
  },
};