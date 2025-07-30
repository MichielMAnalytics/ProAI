import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-logout",
  name: "User Logout",
  description: "Logout the current user session",
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
  },
  async run({ $ }) {
    const response = await this.payloadCms.logout({
      $,
      collection: this.userCollectionSlug,
    });

    $.export("$summary", "Successfully logged out user");
    return response;
  },
};