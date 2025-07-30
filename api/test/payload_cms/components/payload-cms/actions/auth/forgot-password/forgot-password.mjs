import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-forgot-password",
  name: "Forgot Password",
  description: "Send a password reset email to a user",
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
    email: {
      type: "string",
      label: "Email",
      description: "Email address to send the reset link to",
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.forgotPassword({
      $,
      collection: this.userCollectionSlug,
      email: this.email,
    });

    $.export("$summary", `Password reset email sent to: ${this.email}`);
    return response;
  },
};