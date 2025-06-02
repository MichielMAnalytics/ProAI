# Enterprise Contact System

This document describes the enterprise contact system implemented for Eve (LibreChat), which allows potential enterprise customers to submit contact forms through a multi-step process similar to Lovable's contact flow.

## Overview

The system consists of:
- **Frontend**: Multi-step contact form with modern UI
- **Backend**: RESTful API endpoints for contact management
- **Database**: MongoDB collection for storing contact submissions
- **Admin Interface**: API endpoints for managing contacts (admin-only)

## Architecture

### Database Schema
- **Collection**: `enterprisecontacts`
- **Schema**: `packages/data-schemas/src/schema/enterpriseContact.ts`
- **Model**: `api/models/EnterpriseContact.js`

### API Endpoints
- `POST /api/enterprise-contact` - Submit new contact (public)
- `GET /api/enterprise-contact` - List contacts (admin only)
- `GET /api/enterprise-contact/:contactId` - Get specific contact (admin only)
- `PUT /api/enterprise-contact/:contactId` - Update contact (admin only)
- `DELETE /api/enterprise-contact/:contactId` - Delete contact (admin only)

### Frontend Components
- **ContactPage**: `client/src/components/Contact/ContactPage.tsx`
- **Route**: `/contact`

## Contact Form Flow

### Step 1: Contact Details
- First name* (required)
- Last name* (required)
- Work email* (required)
- Phone number (optional)
- Company website* (required)

### Step 2: Additional Questions
- Problem to solve with Eve
- Expected number of end-users
- Current tools to replace
- Use cases (checkboxes):
  - Product Prototype Development
  - Internal Tool Building
  - Customer Portal Creation
  - MVP Development
  - UI/UX Prototyping
  - Custom Web Applications
  - SaaS Product Development
  - Other
- Compliance needs (checkboxes):
  - SOC 2
  - HIPAA
  - GDPR
  - On-prem hosting
  - None / Unsure

### Step 3: Additional Information
- Timeline dropdown:
  - Immediately
  - Within 1 month
  - Within 3 months
  - Within 6 months
  - More than 6 months
  - Just exploring
- Additional information (free text)

## Features

### Frontend Features
- **Multi-step form** with progress indicator
- **Form validation** with required field checking
- **Responsive design** matching Eve's design system
- **Success page** after submission
- **Loading states** during submission
- **Error handling** with user-friendly messages
- **Navigation integration** with pricing page

### Backend Features
- **Duplicate prevention** based on email address
- **Data validation** with Mongoose schema validation
- **Pagination** for admin contact listing
- **Search functionality** across name, email, and company
- **Status tracking** (new, contacted, qualified, closed)
- **Audit trail** with timestamps
- **UUID generation** for contact IDs

### Security Features
- **Admin-only endpoints** for contact management
- **JWT authentication** required for admin operations
- **Input sanitization** with express-mongo-sanitize
- **Email validation** with regex patterns
- **Rate limiting** (inherited from main app)

## Database Fields

### Contact Information
- `contactId`: Unique UUID identifier
- `firstName`: Contact's first name
- `lastName`: Contact's last name
- `workEmail`: Business email address
- `phoneNumber`: Phone number (optional)
- `companyWebsite`: Company website URL

### Business Information
- `problemToSolve`: Description of problem to solve
- `endUsersCount`: Expected number of users
- `currentTools`: Tools they want to replace
- `useCases`: Array of selected use cases
- `complianceNeeds`: Array of compliance requirements
- `timeline`: Implementation timeline
- `additionalInfo`: Additional notes

### System Fields
- `status`: Contact status (new, contacted, qualified, closed)
- `contactedAt`: Date when status changed to contacted
- `notes`: Internal notes (admin only)
- `createdAt`: Submission timestamp
- `updatedAt`: Last modification timestamp

## Integration Points

### Pricing Page Integration
- "Contact Sales" button in Enterprise tier navigates to `/contact`
- Seamless flow from pricing to contact form

### Error Handler Integration
- Token balance errors include upgrade prompts
- Links to pricing page for Pro upgrades

### Navigation
- Contact page accessible at `/contact`
- Back to chat functionality
- Standalone layout (no sidebar)

## Admin Usage

### Viewing Contacts
```bash
GET /api/enterprise-contact?page=1&limit=20&status=new&search=company
```

### Updating Contact Status
```bash
PUT /api/enterprise-contact/:contactId
{
  "status": "contacted",
  "notes": "Initial call scheduled for next week"
}
```

### Filtering and Search
- Filter by status: `?status=new`
- Search across fields: `?search=acme`
- Pagination: `?page=2&limit=10`
- Sorting: `?sortBy=createdAt&sortOrder=desc`

## Development Notes

### File Structure
```
packages/data-schemas/src/schema/enterpriseContact.ts  # Schema definition
api/models/EnterpriseContact.js                       # Model and methods
api/server/controllers/EnterpriseContactController.js # Request handlers
api/server/routes/enterpriseContact.js                # Route definitions
client/src/components/Contact/ContactPage.tsx         # Frontend component
```

### Environment Variables
No additional environment variables required. Uses existing MongoDB connection and JWT authentication.

### Dependencies
- Uses existing project dependencies
- No additional packages required
- Leverages LibreChat's design system and routing

## Future Enhancements

### Potential Improvements
1. **Email notifications** when new contacts are submitted
2. **CRM integration** (Salesforce, HubSpot, etc.)
3. **Lead scoring** based on company size and use cases
4. **Automated follow-up** email sequences
5. **Analytics dashboard** for contact metrics
6. **File upload** capability for RFPs or requirements
7. **Calendar integration** for scheduling demos
8. **Webhook support** for external integrations

### Admin Dashboard
Consider building a dedicated admin interface for:
- Contact management
- Lead qualification
- Follow-up tracking
- Reporting and analytics
- Bulk operations

## Testing

### Manual Testing
1. Navigate to `/contact`
2. Fill out the multi-step form
3. Submit and verify success page
4. Check database for new contact record
5. Test admin endpoints with proper authentication

### API Testing
```bash
# Submit new contact
curl -X POST http://localhost:3080/api/enterprise-contact \
  -H "Content-Type: application/json" \
  -d '{"firstName":"John","lastName":"Doe","workEmail":"john@example.com","companyWebsite":"example.com"}'

# List contacts (requires admin auth)
curl -X GET http://localhost:3080/api/enterprise-contact \
  -H "Authorization: Bearer <admin-jwt-token>"
```

## Monitoring

### Metrics to Track
- Contact submission rate
- Conversion from pricing page
- Response time to new contacts
- Contact status progression
- Popular use cases and compliance needs

### Logging
- All contact submissions are logged
- Admin operations are logged
- Error conditions are logged with context
- Duplicate submissions are logged for analysis 