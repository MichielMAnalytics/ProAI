import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-update-global",
  name: "Update Global",
  description: "Update a global document in Payload CMS",
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
    data: {
      type: "object",
      label: "Global Data",
      description: "The data to update in the global document",
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.updateGlobal({
      $,
      slug: this.globalSlug,
      data: this.data,
    });

    $.export("$summary", `Successfully updated global: ${this.globalSlug}`);
    return response;
  },
};