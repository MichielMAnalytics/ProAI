# Payload CMS Pipedream Integration

A comprehensive Pipedream integration for [Payload CMS](https://payloadcms.com/) that provides full access to the REST API including CRUD operations, authentication, globals, and preferences management.

## Overview

This integration allows you to interact with your Payload CMS instance through Pipedream workflows, enabling you to:

- Perform CRUD operations on any collection
- Manage user authentication and sessions
- Access and update global documents
- Handle user preferences
- Integrate Payload CMS with 2,000+ other apps through Pipedream

## Getting Started

### Prerequisites

1. A running Payload CMS instance with API access
2. API credentials (API key or username/password)
3. Pipedream account (Business plan for custom tools)

### Installation

1. Clone this repository or copy the components folder
2. Install the Pipedream CLI:
   ```bash
   npm install -g @pipedream/cli
   ```
3. Publish the app to your workspace:
   ```bash
   pd publish components/payload-cms/payload-cms.app.mjs --connect-environment production
   ```
4. Publish each action:
   ```bash
   # Example for find-by-id action
   pd publish components/payload-cms/actions/collections/find-by-id/find-by-id.mjs --connect-environment production
   ```

### Configuration

When connecting your Payload CMS account in Pipedream:

1. **API URL**: Your Payload CMS instance URL (e.g., `https://your-site.com`)
2. **Authentication**: Choose one of:
   - **API Key**: Bearer token for API authentication
   - **Basic Auth**: Email and password credentials

## Available Actions

### Collection Operations

#### Find Document by ID
Retrieve a single document from a collection by its ID.
- **Props**: Collection slug, Document ID, Depth (for populating relations)

#### Count Documents
Count documents in a collection with optional filtering.
- **Props**: Collection slug, Where query (MongoDB-style)

#### Create Document
Create a new document in a collection.
- **Props**: Collection slug, Document data

#### Update Documents
Update multiple documents based on a query.
- **Props**: Collection slug, Where query, Update data

#### Update Document by ID
Update a single document by its ID.
- **Props**: Collection slug, Document ID, Update data

#### Delete Documents
Delete multiple documents based on a query.
- **Props**: Collection slug, Where query

#### Delete Document by ID
Delete a single document by its ID.
- **Props**: Collection slug, Document ID

### Authentication Operations

#### User Login
Authenticate a user and receive a JWT token.
- **Props**: User collection slug, Email, Password
- **Returns**: User object and JWT token

#### User Logout
End the current user session.
- **Props**: User collection slug

#### Refresh Token
Refresh an authentication token.
- **Props**: User collection slug, Current token
- **Returns**: New JWT token

#### Get Current User
Retrieve information about the authenticated user.
- **Props**: User collection slug, Auth token
- **Returns**: User object

#### Forgot Password
Send a password reset email.
- **Props**: User collection slug, Email

#### Reset Password
Reset a user's password with a token.
- **Props**: User collection slug, Reset token, New password

#### Verify User
Verify a user's email address.
- **Props**: User collection slug, Verification token

#### Unlock User
Unlock a user account after failed login attempts.
- **Props**: User collection slug, Email

### Global Operations

#### Get Global
Retrieve a global document.
- **Props**: Global slug, Depth

#### Update Global
Update a global document.
- **Props**: Global slug, Update data

### Preference Operations

#### Get Preference
Retrieve a user preference by key.
- **Props**: Preference key

#### Create/Update Preference
Create or update a user preference.
- **Props**: Preference key, Value

#### Delete Preference
Delete a user preference.
- **Props**: Preference key

## Example Use Cases

### 1. User Registration Workflow
```javascript
// Step 1: Create user
const newUser = await $.actions.payloadCms.create({
  collectionSlug: "users",
  data: {
    email: "user@example.com",
    password: "securePassword123",
    firstName: "John",
    lastName: "Doe"
  }
});

// Step 2: Send welcome email (using another Pipedream action)
await $.actions.email.send({
  to: newUser.email,
  subject: "Welcome!",
  body: `Welcome ${newUser.firstName}!`
});
```

### 2. Content Synchronization
```javascript
// Sync blog posts from external source
const externalPosts = await $.actions.externalApi.getPosts();

for (const post of externalPosts) {
  await $.actions.payloadCms.create({
    collectionSlug: "posts",
    data: {
      title: post.title,
      content: post.content,
      author: post.authorId,
      publishedDate: post.date
    }
  });
}
```

### 3. Bulk Operations
```javascript
// Archive old posts
const cutoffDate = new Date();
cutoffDate.setMonth(cutoffDate.getMonth() - 6);

await $.actions.payloadCms.update({
  collectionSlug: "posts",
  where: {
    publishedDate: {
      less_than: cutoffDate.toISOString()
    }
  },
  data: {
    status: "archived"
  }
});
```

## Advanced Features

### Query Filtering
The integration supports MongoDB-style queries for filtering:

```javascript
// Complex query example
const where = {
  and: [
    { status: { equals: "published" } },
    { category: { in: ["news", "updates"] } },
    { createdAt: { greater_than: "2024-01-01" } }
  ]
};

const results = await $.actions.payloadCms.find({
  collectionSlug: "posts",
  where: where
});
```

### Pagination
Handle large datasets with pagination:

```javascript
const page = 1;
const limit = 20;

const results = await $.actions.payloadCms.find({
  collectionSlug: "posts",
  page: page,
  limit: limit,
  sort: "-createdAt" // Sort by creation date, descending
});
```

### Depth Control
Control how deeply related documents are populated:

```javascript
const post = await $.actions.payloadCms.findById({
  collectionSlug: "posts",
  documentId: "123",
  depth: 2 // Populate relationships up to 2 levels deep
});
```

## Error Handling

The integration includes comprehensive error handling:

- **401 Unauthorized**: Authentication failures
- **404 Not Found**: Invalid IDs or slugs
- **422 Validation Error**: Invalid data format
- **500 Server Error**: Payload CMS server issues

Example error handling in workflows:

```javascript
try {
  const result = await $.actions.payloadCms.create({
    collectionSlug: "posts",
    data: postData
  });
} catch (error) {
  if (error.message.includes("422")) {
    console.error("Validation error:", error.message);
    // Handle validation errors
  } else {
    throw error; // Re-throw other errors
  }
}
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify your API URL is correct (no trailing slash)
   - Check API key or credentials are valid
   - Ensure your user has appropriate permissions

2. **Collection Not Found**
   - Verify the collection slug matches exactly
   - Check if the collection is properly configured in Payload

3. **Rate Limiting**
   - Implement exponential backoff for bulk operations
   - Consider batching requests

### Debug Mode
Enable debug logging in your workflow:

```javascript
console.log("Request details:", {
  collection: collectionSlug,
  data: requestData
});
```

## Security Considerations

1. **API Keys**: Store securely using Pipedream's auth system
2. **JWT Tokens**: Tokens expire; implement refresh logic
3. **Permissions**: Ensure API user has minimum required permissions
4. **HTTPS**: Always use HTTPS for API connections

## Contributing

To contribute to this integration:

1. Follow Pipedream's component development guidelines
2. Test all changes thoroughly
3. Update documentation for new features
4. Submit pull requests with clear descriptions

## Support

- **Payload CMS Documentation**: https://payloadcms.com/docs
- **Pipedream Documentation**: https://pipedream.com/docs
- **Issues**: Report bugs in the GitHub repository

## License

This integration is provided as-is for use with Pipedream and Payload CMS.