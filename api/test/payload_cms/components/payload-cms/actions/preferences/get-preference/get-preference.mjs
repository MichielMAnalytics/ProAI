import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-get-preference",
  name: "Get Preference",
  description: "Retrieve a user preference by key from Payload CMS",
  version: "0.0.1",
  type: "action",
  props: {
    payloadCms,
    key: {
      type: "string",
      label: "Preference Key",
      description: "The key of the preference to retrieve",
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.getPreference({
      $,
      key: this.key,
    });

    $.export("$summary", `Successfully retrieved preference: ${this.key}`);
    return response;
  },
};