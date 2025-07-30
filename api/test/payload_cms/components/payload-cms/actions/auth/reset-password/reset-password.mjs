import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-reset-password",
  name: "Reset Password",
  description: "Reset a user's password using a reset token",
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
      label: "Reset Token",
      description: "The password reset token received via email",
    },
    password: {
      type: "string",
      label: "New Password",
      description: "The new password to set",
      secret: true,
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.resetPassword({
      $,
      collection: this.userCollectionSlug,
      token: this.token,
      password: this.password,
    });

    $.export("$summary", "Password successfully reset");
    return response;
  },
};