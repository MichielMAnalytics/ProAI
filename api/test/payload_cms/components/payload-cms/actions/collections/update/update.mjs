import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-update",
  name: "Update Documents",
  description: "Update multiple documents in a Payload CMS collection based on a query",
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
    where: {
      propDefinition: [
        payloadCms,
        "where",
      ],
      description: "Query to filter which documents to update",
    },
    data: {
      type: "object",
      label: "Update Data",
      description: "The data to update in matching documents",
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.update({
      $,
      collection: this.collectionSlug,
      where: this.where,
      data: this.data,
    });

    $.export("$summary", `Successfully updated ${response.docs?.length || 0} documents`);
    return response;
  },
};