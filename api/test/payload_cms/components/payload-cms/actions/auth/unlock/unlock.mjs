import payloadCms from "../../../payload-cms.app.mjs";

export default {
  key: "payload-cms-unlock",
  name: "Unlock User",
  description: "Unlock a user account that has been locked due to failed login attempts",
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
      description: "Email address of the user to unlock",
    },
  },
  async run({ $ }) {
    const response = await this.payloadCms.unlock({
      $,
      collection: this.userCollectionSlug,
      email: this.email,
    });

    $.export("$summary", `Successfully unlocked user account: ${this.email}`);
    return response;
  },
};