import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-create-preference",
  name: "Create/Update Preference",
  description: "Create or update a user preference in Payload CMS",
  version: "0.0.1",
  type: "action",
  props: {
    payloadCms,
    key: {
      type: "string",
      label: "Preference Key",
      description: "The key for the preference",
    },
    value: {
      type: "object",
      label: "Preference Value",
      description: "The value to store for this preference",
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.createPreference({
      $,
      key: this.key,
      value: this.value,
    });

    $.export("$summary", `Successfully created/updated preference: ${this.key}`);
    return response;
  },
};