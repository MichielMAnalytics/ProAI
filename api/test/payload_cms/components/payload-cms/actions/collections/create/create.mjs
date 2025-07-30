import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-create",
  name: "Create Document",
  description: "Create a new document in a Payload CMS collection",
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
    data: {
      type: "object",
      label: "Document Data",
      description: "The data for the new document",
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.create({
      $,
      collection: this.collectionSlug,
      data: this.data,
    });

    $.export("$summary", `Successfully created document with ID: ${response.id}`);
    return response;
  },
};