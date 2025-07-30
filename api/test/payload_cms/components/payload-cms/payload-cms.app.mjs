import { axios } from "@pipedream/platform";

export default {
  type: "app",
  app: "payload-cms",
  propDefinitions: {
    collectionSlug: {
      type: "string",
      label: "Collection Slug",
      description: "The slug of the collection to interact with",
      async options() {
        try {
          const collections = await this.listCollections();
          return collections.map((collection) => ({
            label: collection.labels?.singular || collection.slug,
            value: collection.slug,
          }));
        } catch (error) {
          console.error("Error fetching collections:", error);
          return [];
        }
      },
    },
    userCollectionSlug: {
      type: "string",
      label: "User Collection Slug",
      description: "The slug of the auth-enabled user collection",
      default: "users",
      async options() {
        try {
          const collections = await this.listCollections();
          return collections
            .filter((collection) => collection.auth === true)
            .map((collection) => ({
              label: collection.labels?.singular || collection.slug,
              value: collection.slug,
            }));
        } catch (error) {
          console.error("Error fetching user collections:", error);
          return [{
            label: "Users",
            value: "users",
          }];
        }
      },
    },
    globalSlug: {
      type: "string",
      label: "Global Slug",
      description: "The slug of the global to interact with",
      async options() {
        try {
          const globals = await this.listGlobals();
          return globals.map((global) => ({
            label: global.label || global.slug,
            value: global.slug,
          }));
        } catch (error) {
          console.error("Error fetching globals:", error);
          return [];
        }
      },
    },
    documentId: {
      type: "string",
      label: "Document ID",
      description: "The ID of the document",
    },
    limit: {
      type: "integer",
      label: "Limit",
      description: "Maximum number of documents to return",
      default: 10,
      optional: true,
    },
    page: {
      type: "integer",
      label: "Page",
      description: "Page number for pagination",
      default: 1,
      optional: true,
    },
    sort: {
      type: "string",
      label: "Sort",
      description: "Field to sort by. Prefix with '-' for descending order",
      optional: true,
    },
    where: {
      type: "object",
      label: "Where Query",
      description: "MongoDB-style query for filtering results",
      optional: true,
    },
    depth: {
      type: "integer",
      label: "Depth",
      description: "Depth of related documents to populate",
      default: 0,
      optional: true,
    },
  },
  methods: {
    _baseUrl() {
      return `${this.$auth.api_url}/api`;
    },
    _headers(headers = {}) {
      const authHeaders = {};
      
      if (this.$auth.api_key) {
        authHeaders["Authorization"] = `Bearer ${this.$auth.api_key}`;
      } else if (this.$auth.email && this.$auth.password) {
        const credentials = Buffer.from(`${this.$auth.email}:${this.$auth.password}`).toString("base64");
        authHeaders["Authorization"] = `Basic ${credentials}`;
      }
      
      return {
        ...authHeaders,
        "Content-Type": "application/json",
        ...headers,
      };
    },
    async _makeRequest({
      $ = this,
      method = "GET",
      path,
      data,
      params,
      headers = {},
      ...opts
    }) {
      const config = {
        method,
        url: `${this._baseUrl()}${path}`,
        headers: this._headers(headers),
        data,
        params,
        ...opts,
      };

      try {
        return await axios($, config);
      } catch (error) {
        if (error.response) {
          throw new Error(`Payload CMS API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
      }
    },
    async listCollections(opts = {}) {
      const response = await this._makeRequest({
        path: "/collections",
        ...opts,
      });
      return response.collections || [];
    },
    async listGlobals(opts = {}) {
      const response = await this._makeRequest({
        path: "/globals",
        ...opts,
      });
      return response.globals || [];
    },
    async findById({
      collection,
      id,
      ...opts
    }) {
      return this._makeRequest({
        path: `/${collection}/${id}`,
        ...opts,
      });
    },
    async count({
      collection,
      where,
      ...opts
    }) {
      return this._makeRequest({
        path: `/${collection}/count`,
        params: {
          where: where ? JSON.stringify(where) : undefined,
        },
        ...opts,
      });
    },
    async create({
      collection,
      data,
      ...opts
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/${collection}`,
        data,
        ...opts,
      });
    },
    async update({
      collection,
      where,
      data,
      ...opts
    }) {
      return this._makeRequest({
        method: "PATCH",
        path: `/${collection}`,
        params: {
          where: where ? JSON.stringify(where) : undefined,
        },
        data,
        ...opts,
      });
    },
    async updateById({
      collection,
      id,
      data,
      ...opts
    }) {
      return this._makeRequest({
        method: "PATCH",
        path: `/${collection}/${id}`,
        data,
        ...opts,
      });
    },
    async delete({
      collection,
      where,
      ...opts
    }) {
      return this._makeRequest({
        method: "DELETE",
        path: `/${collection}`,
        params: {
          where: where ? JSON.stringify(where) : undefined,
        },
        ...opts,
      });
    },
    async deleteById({
      collection,
      id,
      ...opts
    }) {
      return this._makeRequest({
        method: "DELETE",
        path: `/${collection}/${id}`,
        ...opts,
      });
    },
    async login({
      collection = "users",
      email,
      password,
      ...opts
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/${collection}/login`,
        data: {
          email,
          password,
        },
        ...opts,
      });
    },
    async logout({
      collection = "users",
      ...opts
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/${collection}/logout`,
        ...opts,
      });
    },
    async refreshToken({
      collection = "users",
      token,
      ...opts
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/${collection}/refresh-token`,
        headers: {
          Authorization: `JWT ${token}`,
        },
        ...opts,
      });
    },
    async me({
      collection = "users",
      token,
      ...opts
    }) {
      return this._makeRequest({
        path: `/${collection}/me`,
        headers: {
          Authorization: `JWT ${token}`,
        },
        ...opts,
      });
    },
    async forgotPassword({
      collection = "users",
      email,
      ...opts
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/${collection}/forgot-password`,
        data: {
          email,
        },
        ...opts,
      });
    },
    async resetPassword({
      collection = "users",
      token,
      password,
      ...opts
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/${collection}/reset-password`,
        data: {
          token,
          password,
        },
        ...opts,
      });
    },
    async verifyUser({
      collection = "users",
      token,
      ...opts
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/${collection}/verify/${token}`,
        ...opts,
      });
    },
    async unlock({
      collection = "users",
      email,
      ...opts
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/${collection}/unlock`,
        data: {
          email,
        },
        ...opts,
      });
    },
    async getGlobal({
      slug,
      ...opts
    }) {
      return this._makeRequest({
        path: `/globals/${slug}`,
        ...opts,
      });
    },
    async updateGlobal({
      slug,
      data,
      ...opts
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/globals/${slug}`,
        data,
        ...opts,
      });
    },
    async getPreference({
      key,
      ...opts
    }) {
      return this._makeRequest({
        path: `/payload-preferences/${key}`,
        ...opts,
      });
    },
    async createPreference({
      key,
      value,
      ...opts
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/payload-preferences/${key}`,
        data: {
          value,
        },
        ...opts,
      });
    },
    async deletePreference({
      key,
      ...opts
    }) {
      return this._makeRequest({
        method: "DELETE",
        path: `/payload-preferences/${key}`,
        ...opts,
      });
    },
  },
};