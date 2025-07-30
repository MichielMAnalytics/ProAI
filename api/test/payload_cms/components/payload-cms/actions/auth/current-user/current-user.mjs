import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-current-user",
  name: "Get Current User",
  description: "Get information about the currently authenticated user",
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
      label: "Auth Token",
      description: "JWT token for authentication",
      secret: true,
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.me({
      $,
      collection: this.userCollectionSlug,
      token: this.token,
    });

    $.export("$summary", `Successfully retrieved current user: ${response.user?.email}`);
    return response;
  },
};