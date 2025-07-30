import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-count",
  name: "Count Documents",
  description: "Count documents in a Payload CMS collection with optional filtering",
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
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.count({
      $,
      collection: this.collectionSlug,
      where: this.where,
    });

    $.export("$summary", `Found ${response.totalDocs} documents in ${this.collectionSlug}`);
    return response;
  },
};