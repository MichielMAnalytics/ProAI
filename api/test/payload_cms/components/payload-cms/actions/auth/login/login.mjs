import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-login",
  name: "User Login",
  description: "Authenticate a user and receive a JWT token",
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
      description: "User's email address",
    },
    password: {
      type: "string",
      label: "Password",
      description: "User's password",
      secret: true,
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.login({
      $,
      collection: this.userCollectionSlug,
      email: this.email,
      password: this.password,
    });

    $.export("$summary", `Successfully logged in user: ${this.email}`);
    return response;
  },
};