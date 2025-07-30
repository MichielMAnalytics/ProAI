import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-verify-user",
  name: "Verify User",
  description: "Verify a user's email address using a verification token",
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
      label: "Verification Token",
      description: "The email verification token",
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.verifyUser({
      $,
      collection: this.userCollectionSlug,
      token: this.token,
    });

    $.export("$summary", "User email successfully verified");
    return response;
  },
};