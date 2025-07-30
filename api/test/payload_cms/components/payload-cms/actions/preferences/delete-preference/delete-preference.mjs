import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-delete-preference",
  name: "Delete Preference",
  description: "Delete a user preference from Payload CMS",
  version: "0.0.1",
  type: "action",
  props: {
    payloadCms,
    key: {
      type: "string",
      label: "Preference Key",
      description: "The key of the preference to delete",
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.deletePreference({
      $,
      key: this.key,
    });

    $.export("$summary", `Successfully deleted preference: ${this.key}`);
    return response;
  },
};