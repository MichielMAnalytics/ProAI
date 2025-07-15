import { Schema, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IEnterpriseContact extends Document {
  contactId: string;
  // Contact type
  feedbackType: 'enterprise' | 'general';

  // Step 1: Contact details
  firstName?: string;
  lastName?: string;
  workEmail?: string;
  phoneNumber?: string;
  companyWebsite?: string;

  // Step 2: Additional questions
  problemToSolve?: string;
  endUsersCount?: string;
  currentTools?: string;
  useCases: string[];
  complianceNeeds: string[];

  // Step 3: Additional information
  timeline?: string;
  additionalInfo?: string;

  // General feedback fields
  userId?: string;
  conversationId?: string;

  // System fields
  status: 'new' | 'contacted' | 'qualified' | 'closed';
  contactedAt?: Date;
  notes?: string;
}

const enterpriseContactSchema = new Schema<IEnterpriseContact>(
  {
    contactId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    // Contact type
    feedbackType: {
      type: String,
      enum: ['enterprise', 'general'],
      default: 'enterprise',
    },
    // Step 1: Contact details
    firstName: {
      type: String,
      required: function (this: IEnterpriseContact) {
        return this.feedbackType === 'enterprise';
      },
      trim: true,
    },
    lastName: {
      type: String,
      required: function (this: IEnterpriseContact) {
        return this.feedbackType === 'enterprise';
      },
      trim: true,
    },
    workEmail: {
      type: String,
      required: function (this: IEnterpriseContact) {
        return this.feedbackType === 'enterprise';
      },
      trim: true,
      lowercase: true,
      validate: {
        validator: function (email: string) {
          return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        },
        message: 'Please enter a valid email address',
      },
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    companyWebsite: {
      type: String,
      trim: true,
    },

    // Step 2: Additional questions
    problemToSolve: {
      type: String,
      trim: true,
    },
    endUsersCount: {
      type: String,
      trim: true,
    },
    currentTools: {
      type: String,
      trim: true,
    },
    useCases: [
      {
        type: String,
        enum: [
          'Product Prototype Development',
          'Internal Tool Building',
          'Customer Portal Creation',
          'MVP Development',
          'UI/UX Prototyping',
          'Custom Web Applications',
          'SaaS Product Development',
          'Other',
        ],
      },
    ],
    complianceNeeds: [
      {
        type: String,
        enum: ['SOC 2', 'HIPAA', 'GDPR', 'On-prem hosting', 'None / Unsure'],
      },
    ],

    // Step 3: Additional information
    timeline: {
      type: String,
      enum: [
        'Immediately',
        'Within 1 month',
        'Within 3 months',
        'Within 6 months',
        'More than 6 months',
        'Just exploring',
      ],
    },
    additionalInfo: {
      type: String,
      trim: true,
    },

    // General feedback fields
    userId: {
      type: String,
      trim: true,
    },
    conversationId: {
      type: String,
      trim: true,
    },

    // System fields
    status: {
      type: String,
      enum: ['new', 'contacted', 'qualified', 'closed'],
      default: 'new',
    },
    contactedAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'enterprisecontacts',
  },
);

// Pre-save middleware to ensure contactId is generated
enterpriseContactSchema.pre('save', function (next) {
  if (!this.contactId) {
    this.contactId = uuidv4();
  }
  next();
});

// Create indexes for better query performance
enterpriseContactSchema.index({ workEmail: 1 });
enterpriseContactSchema.index({ status: 1 });
enterpriseContactSchema.index({ createdAt: -1 });
enterpriseContactSchema.index({ feedbackType: 1 });
enterpriseContactSchema.index({ userId: 1 });
enterpriseContactSchema.index({ conversationId: 1 });

export default enterpriseContactSchema;
