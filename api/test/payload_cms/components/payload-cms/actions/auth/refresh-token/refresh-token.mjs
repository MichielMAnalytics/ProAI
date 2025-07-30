import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-refresh-token",
  name: "Refresh Auth Token",
  description: "Refresh an authentication token for continued access",
  version: "0.0.1",
  type: "action",
  props: {
    payloadCms,
    userCollectionSlug: {
      propDefinition: [
        payloadCms,
        "userCollectionSlug",
      ],
    },
    token: {
      type: "string",
      label: "Current Token",
      description: "The current JWT token to refresh",
      secret: true,
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.refreshToken({
      $,
      collection: this.userCollectionSlug,
      token: this.token,
    });

    $.export("$summary", "Successfully refreshed authentication token");
    return response;
  },
};