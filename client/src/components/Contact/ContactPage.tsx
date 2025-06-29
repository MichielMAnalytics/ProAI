import React, { useState } from 'react';
import { ChevronDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ContactFormData {
  // Step 1: Contact details
  firstName: string;
  lastName: string;
  workEmail: string;
  phoneNumber: string;
  companyWebsite: string;

  // Step 2: Additional questions
  problemToSolve: string;
  endUsersCount: string;
  currentTools: string;
  useCases: string[];
  complianceNeeds: string[];

  // Step 3: Additional information
  timeline: string;
  additionalInfo: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  workEmail?: string;
  companyWebsite?: string;
}

const ContactPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState<ContactFormData>({
    firstName: '',
    lastName: '',
    workEmail: '',
    phoneNumber: '',
    companyWebsite: '',
    problemToSolve: '',
    endUsersCount: '',
    currentTools: '',
    useCases: [],
    complianceNeeds: [],
    timeline: '',
    additionalInfo: '',
  });

  const useCaseOptions = [
    'Product Prototype Development',
    'Internal Tool Building',
    'Customer Portal Creation',
    'MVP Development',
    'UI/UX Prototyping',
    'Custom Web Applications',
    'SaaS Product Development',
    'Other',
  ];

  const complianceOptions = ['SOC 2', 'HIPAA', 'GDPR', 'On-prem hosting', 'None / Unsure'];

  const timelineOptions = [
    'Immediately',
    'Within 1 month',
    'Within 3 months',
    'Within 6 months',
    'More than 6 months',
    'Just exploring',
  ];

  // Email validation function
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // URL validation function
  const isValidUrl = (url: string): boolean => {
    if (!url) return true; // Optional field
    try {
      // Add protocol if missing
      const urlToTest = url.startsWith('http') ? url : `https://${url}`;
      new URL(urlToTest);
      return true;
    } catch {
      return false;
    }
  };

  // Validate step 1 fields
  const validateStep1 = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (!formData.workEmail.trim()) {
      newErrors.workEmail = 'Work email is required';
    } else if (!isValidEmail(formData.workEmail)) {
      newErrors.workEmail = 'Please enter a valid email address';
    }

    if (!formData.companyWebsite.trim()) {
      newErrors.companyWebsite = 'Company website is required';
    } else if (!isValidUrl(formData.companyWebsite)) {
      newErrors.companyWebsite = 'Please enter a valid website URL';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof ContactFormData, value: string | string[]) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear error for this field when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  const handleCheckboxChange = (field: 'useCases' | 'complianceNeeds', value: string) => {
    setFormData((prev) => {
      const currentArray = prev[field] as string[];
      const newArray = currentArray.includes(value)
        ? currentArray.filter((item) => item !== value)
        : [...currentArray, value];

      return {
        ...prev,
        [field]: newArray,
      };
    });
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return validateStep1();
      case 2:
        return true; // Step 2 is optional
      case 3:
        return true; // Step 3 is optional
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep) && currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep1()) {
      setCurrentStep(1); // Go back to step 1 if validation fails
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/enterprise-contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSubmitSuccess(true);
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to submit contact form'}`);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Failed to submit contact form. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToChat = () => {
    navigate('/c/new');
  };

  if (submitSuccess) {
    return (
      <div
        className="min-h-screen px-4 py-12"
        style={{
          background: 'var(--surface-primary)',
          minHeight: '100vh',
        }}
      >
        <div className="mx-auto max-w-2xl text-center">
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: 'linear-gradient(135deg, var(--brand-blue) 0%, var(--brand-dark) 100%)',
            }}
          >
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="mb-4 text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Thank you for your interest!
          </h1>
          <p className="mb-8 text-lg" style={{ color: 'var(--text-secondary)' }}>
            We've received your contact information and will get back to you within 24 hours to
            discuss how Eve can help accelerate your automation process.
          </p>
          <button onClick={handleBackToChat} className="btn btn-primary px-6 py-3">
            Back to Eve
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen px-4 py-12"
      style={{
        background: 'var(--surface-primary)',
        minHeight: '100vh',
      }}
    >
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <div
            className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-lg"
            style={{
              background: 'linear-gradient(135deg, var(--brand-blue) 0%, var(--brand-dark) 100%)',
            }}
          >
            <span className="text-lg font-bold text-white">E</span>
          </div>
          <h1 className="mb-4 text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Contact Eve
          </h1>
        </div>

        {/* Progress Steps */}
        <div className="mb-12 flex items-center justify-center">
          <div className="flex items-center space-x-8">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    step <= currentStep ? 'text-white' : 'text-gray-400'
                  }`}
                  style={{
                    backgroundColor:
                      step <= currentStep ? 'var(--brand-blue)' : 'var(--border-light)',
                  }}
                >
                  {step}
                </div>
                {step < 3 && (
                  <div
                    className="mx-4 h-0.5 w-16"
                    style={{
                      backgroundColor:
                        step < currentStep ? 'var(--brand-blue)' : 'var(--border-light)',
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-2">
          {/* Form Section */}
          <div>
            {currentStep === 1 && (
              <div>
                <h2 className="mb-2 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Contact details
                </h2>
                <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
                  Curious to discover how Eve can speed up development process? Meet with one of our
                  product experts to learn more.
                </p>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        className="mb-2 block text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        First name*
                      </label>
                      <input
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                        placeholder="Michael"
                        className={`w-full rounded-lg border px-4 py-3 ${errors.firstName ? 'border-red-500' : ''}`}
                        style={{
                          borderColor: errors.firstName ? '#ef4444' : 'var(--border-medium)',
                          backgroundColor: 'var(--surface-secondary)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      {errors.firstName && (
                        <p className="mt-1 text-sm text-red-500">{errors.firstName}</p>
                      )}
                    </div>
                    <div>
                      <label
                        className="mb-2 block text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Last name*
                      </label>
                      <input
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                        placeholder="Nightrider"
                        className={`w-full rounded-lg border px-4 py-3 ${errors.lastName ? 'border-red-500' : ''}`}
                        style={{
                          borderColor: errors.lastName ? '#ef4444' : 'var(--border-medium)',
                          backgroundColor: 'var(--surface-secondary)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      {errors.lastName && (
                        <p className="mt-1 text-sm text-red-500">{errors.lastName}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Work email*
                    </label>
                    <input
                      type="email"
                      value={formData.workEmail}
                      onChange={(e) => handleInputChange('workEmail', e.target.value)}
                      placeholder="e.g. michael@company.com"
                      className={`w-full rounded-lg border px-4 py-3 ${errors.workEmail ? 'border-red-500' : ''}`}
                      style={{
                        borderColor: errors.workEmail ? '#ef4444' : 'var(--border-medium)',
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    {errors.workEmail && (
                      <p className="mt-1 text-sm text-red-500">{errors.workEmail}</p>
                    )}
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Phone number
                    </label>
                    <input
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                      placeholder="e.g. 1234567890"
                      className="w-full rounded-lg border px-4 py-3"
                      style={{
                        borderColor: 'var(--border-medium)',
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Company's website*
                    </label>
                    <input
                      type="text"
                      value={formData.companyWebsite}
                      onChange={(e) => handleInputChange('companyWebsite', e.target.value)}
                      placeholder="e.g. company.com"
                      className={`w-full rounded-lg border px-4 py-3 ${errors.companyWebsite ? 'border-red-500' : ''}`}
                      style={{
                        borderColor: errors.companyWebsite ? '#ef4444' : 'var(--border-medium)',
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    {errors.companyWebsite && (
                      <p className="mt-1 text-sm text-red-500">{errors.companyWebsite}</p>
                    )}
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={handleNext}
                    className="btn btn-primary flex items-center gap-2 px-6 py-3"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div>
                <h2 className="mb-8 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Tell us more about your needs
                </h2>

                <div className="space-y-6">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      What problem are you trying to solve with Eve?
                    </label>
                    <textarea
                      value={formData.problemToSolve}
                      onChange={(e) => handleInputChange('problemToSolve', e.target.value)}
                      placeholder="We need to streamline our design approval process and reduce time to deployment..."
                      rows={4}
                      className="w-full resize-none rounded-lg border px-4 py-3"
                      style={{
                        borderColor: 'var(--border-medium)',
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      How many end-users will touch Eve in the first 6 months?
                    </label>
                    <input
                      type="text"
                      value={formData.endUsersCount}
                      onChange={(e) => handleInputChange('endUsersCount', e.target.value)}
                      className="w-full rounded-lg border px-4 py-3"
                      style={{
                        borderColor: 'var(--border-medium)',
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Current tools you'd like to replace Eve with?
                    </label>
                    <textarea
                      value={formData.currentTools}
                      onChange={(e) => handleInputChange('currentTools', e.target.value)}
                      placeholder="Figma, Retool, custom in-house tools"
                      rows={3}
                      className="w-full resize-none rounded-lg border px-4 py-3"
                      style={{
                        borderColor: 'var(--border-medium)',
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="mb-4 block text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Which of these use cases are you interested in?
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {useCaseOptions.map((option) => (
                        <label key={option} className="flex cursor-pointer items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={formData.useCases.includes(option)}
                            onChange={() => handleCheckboxChange('useCases', option)}
                            className="h-4 w-4 rounded border-2"
                            style={{ accentColor: 'var(--brand-blue)' }}
                          />
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {option}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label
                      className="mb-4 block text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Compliance needs:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {complianceOptions.map((option) => (
                        <label key={option} className="flex cursor-pointer items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={formData.complianceNeeds.includes(option)}
                            onChange={() => handleCheckboxChange('complianceNeeds', option)}
                            className="h-4 w-4 rounded border-2"
                            style={{ accentColor: 'var(--brand-blue)' }}
                          />
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {option}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex justify-between">
                  <button
                    onClick={handleBack}
                    className="btn btn-secondary flex items-center gap-2 px-6 py-3"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    onClick={handleNext}
                    className="btn btn-primary flex items-center gap-2 px-6 py-3"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div>
                <h2 className="mb-8 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Additional information
                </h2>

                <div className="space-y-6">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Do you have a timeline to getting started?
                    </label>
                    <div className="relative">
                      <select
                        value={formData.timeline}
                        onChange={(e) => handleInputChange('timeline', e.target.value)}
                        className="w-full cursor-pointer appearance-none rounded-lg border px-4 py-3"
                        style={{
                          borderColor: 'var(--border-medium)',
                          backgroundColor: 'var(--surface-secondary)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <option value="">Select your timeline</option>
                        {timelineOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 transform"
                        style={{ color: 'var(--text-secondary)' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Is there anything additional you would like to add?
                    </label>
                    <textarea
                      value={formData.additionalInfo}
                      onChange={(e) => handleInputChange('additionalInfo', e.target.value)}
                      placeholder="Our team has prior experience with React and we're looking for a solution that integrates with our existing authentication system..."
                      rows={5}
                      className="w-full resize-none rounded-lg border px-4 py-3"
                      style={{
                        borderColor: 'var(--border-medium)',
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>

                <div className="mt-8 flex justify-between">
                  <button
                    onClick={handleBack}
                    className="btn btn-secondary flex items-center gap-2 px-6 py-3"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="btn btn-primary px-6 py-3"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 text-center">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                * Required field
              </p>
            </div>
          </div>

          {/* Illustration Section */}
          <div className="flex items-center justify-center">
            <div
              className="flex h-96 w-full max-w-md items-center justify-center rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
              }}
            >
              <div
                className="w-full max-w-xs rounded-xl bg-white p-6 shadow-lg"
                style={{ backgroundColor: 'var(--surface-primary)' }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Invite
                  </span>
                  <button
                    className="rounded-md px-3 py-1 text-xs"
                    style={{
                      backgroundColor: 'var(--brand-blue)',
                      color: 'white',
                    }}
                  >
                    Invite
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-orange-400"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Peter (You)
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Owner
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-red-400"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        David
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Editor
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-blue-400"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Elon
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Editor
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Back to Chat */}
        <div className="mt-12 text-center">
          <button onClick={handleBackToChat} className="btn btn-neutral px-4 py-2 text-sm">
            ← Back to Chat
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
