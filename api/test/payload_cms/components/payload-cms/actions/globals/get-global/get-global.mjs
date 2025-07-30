import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-get-global",
  name: "Get Global",
  description: "Retrieve a global document from Payload CMS",
  version: "0.0.1",
  type: "action",
  props: {
    payloadCms,
    globalSlug: {
      propDefinition: [
        payloadCms,
        "globalSlug",
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
    const response = await this.payloadCms.getGlobal({
      $,
      slug: this.globalSlug,
      params: {
        depth: this.depth,
      },
    });

    $.export("$summary", `Successfully retrieved global: ${this.globalSlug}`);
    return response;
  },
};