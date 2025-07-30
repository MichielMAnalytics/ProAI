import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-delete",
  name: "Delete Documents",
  description: "Delete multiple documents from a Payload CMS collection based on a query",
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
      description: "Query to filter which documents to delete",
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.delete({
      $,
      collection: this.collectionSlug,
      where: this.where,
    });

    $.export("$summary", `Successfully deleted ${response.docs?.length || 0} documents`);
    return response;
  },
};