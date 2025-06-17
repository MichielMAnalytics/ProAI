import React, { useState, useEffect } from 'react';
import { Check, ArrowRight, Crown, Zap, ChevronDown } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '~/hooks';
import { useGetUserBalance, useGetStartupConfig } from '~/data-provider';
import { getTierEmoji } from '~/utils/tierEmojis';

const PricingPage = () => {
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });
  const [searchParams] = useSearchParams();
  const [selectedProCredits, setSelectedProCredits] = useState(100000);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openFaqItems, setOpenFaqItems] = useState<Set<number>>(new Set());
  const [checkoutStatus, setCheckoutStatus] = useState<'success' | 'canceled' | null>(null);
  const [isDowngrading, setIsDowngrading] = useState(false);

  // Check for success/cancel parameters
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setCheckoutStatus('success');
    } else if (searchParams.get('canceled') === 'true') {
      setCheckoutStatus('canceled');
    }
  }, [searchParams]);

  // Check authentication status
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Clear status after showing it
  useEffect(() => {
    if (checkoutStatus) {
      const timer = setTimeout(() => {
        setCheckoutStatus(null);
        // Clean up URL parameters
        navigate('/pricing', { replace: true });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [checkoutStatus, navigate]);

  const creditOptions = [
    { credits: 100000, price: 20 },
    { credits: 200000, price: 35 },
    { credits: 400000, price: 60 },
    { credits: 800000, price: 100 },
    { credits: 1200000, price: 140 },
    { credits: 2000000, price: 200 },
    { credits: 3000000, price: 280 },
    { credits: 4000000, price: 350 },
  ];

  // Function to get tier name and emoji for credit amount
  const getTierInfoFromCredits = (credits: number) => {
    const creditToTierMap: { [key: number]: { tier: string; tierName: string } } = {
      100000: { tier: 'pro_1', tierName: 'Pro Tier 1' },
      200000: { tier: 'pro_2', tierName: 'Pro Tier 2' },
      400000: { tier: 'pro_3', tierName: 'Pro Tier 3' },
      800000: { tier: 'pro_4', tierName: 'Pro Tier 4' },
      1200000: { tier: 'pro_5', tierName: 'Pro Tier 5' },
      2000000: { tier: 'pro_6', tierName: 'Pro Tier 6' },
      3000000: { tier: 'pro_7', tierName: 'Pro Tier 7' },
      4000000: { tier: 'pro_8', tierName: 'Pro Tier 8' },
    };
    return creditToTierMap[credits] || { tier: 'pro_1', tierName: 'Pro Tier 1' };
  };

  const selectedOption = creditOptions.find(option => option.credits === selectedProCredits);

  // Helper function to determine user's current tier
  const getCurrentUserTier = () => {
    if (!balanceQuery.data?.tier) {
      return 'free';
    }
    return balanceQuery.data.tier;
  };

  // Helper function to check if a tier is the user's current plan
  const isCurrentPlan = (tierType: 'free' | 'pro' | 'enterprise') => {
    const currentTier = getCurrentUserTier();
    
    if (tierType === 'free') {
      return currentTier === 'free';
    } else if (tierType === 'pro') {
      return currentTier.startsWith('pro_');
    } else if (tierType === 'enterprise') {
      return currentTier === 'enterprise';
    }
    return false;
  };

  // Helper function to check if the selected credits match user's current plan
  const isCurrentSelectedPlan = () => {
    if (!isCurrentPlan('pro')) {
      return false;
    }
    const currentProCredits = getCurrentProCredits();
    return currentProCredits === selectedProCredits;
  };

  // Helper function to check if selected credits represent a downgrade
  const isSelectedPlanDowngrade = () => {
    if (!isCurrentPlan('pro')) {
      return false;
    }
    const currentProCredits = getCurrentProCredits();
    return currentProCredits && selectedProCredits < currentProCredits;
  };

  // Helper function to check if selected credits represent an upgrade
  const isSelectedPlanUpgrade = () => {
    if (!isCurrentPlan('pro')) {
      return true; // Free users upgrading to any pro tier
    }
    const currentProCredits = getCurrentProCredits();
    return currentProCredits && selectedProCredits > currentProCredits;
  };

  // Get user's current pro tier credits if they're on a pro plan
  const getCurrentProCredits = () => {
    const currentTier = getCurrentUserTier();
    if (!currentTier.startsWith('pro_')) {
      return null;
    }

    // Map tier to credits based on our tier system
    const tierToCredits = {
      'pro_1': 100000,
      'pro_2': 200000,
      'pro_3': 400000,
      'pro_4': 800000,
      'pro_5': 1200000,
      'pro_6': 2000000,
      'pro_7': 3000000,
      'pro_8': 4000000,
    };

    return tierToCredits[currentTier as keyof typeof tierToCredits] || null;
  };

  // Get the next tier up from user's current plan to encourage upgrades
  const getNextTierCredits = () => {
    const currentTier = getCurrentUserTier();
    
    if (currentTier === 'free') {
      return 100000; // First pro tier
    }
    
    if (currentTier.startsWith('pro_')) {
      const tierToCredits = {
        'pro_1': 200000,  // Next: pro_2
        'pro_2': 400000,  // Next: pro_3
        'pro_3': 800000,  // Next: pro_4
        'pro_4': 1200000, // Next: pro_5
        'pro_5': 2000000, // Next: pro_6
        'pro_6': 3000000, // Next: pro_7
        'pro_7': 4000000, // Next: pro_8
        'pro_8': 4000000, // Already max, stay at pro_8
      };
      
      return tierToCredits[currentTier as keyof typeof tierToCredits] || 100000;
    }
    
    return 100000; // Default fallback
  };

  // Set selected pro credits to next tier above user's current plan by default
  useEffect(() => {
    if (balanceQuery.data) {
      const nextTierCredits = getNextTierCredits();
      setSelectedProCredits(nextTierCredits);
    }
  }, [balanceQuery.data]);

  const faqItems = [
    {
      question: "What is EVE and how does it work?",
      answer: "EVE is an automation platform that provides extensive access to 2700+ apps and 10,000+ tools with no vendor lock-in. You can connect and automate workflows across different services while maintaining full control over your data and integrations."
    },
    {
      question: "What does the free plan include?",
      answer: "The free plan includes 5000 credits per month, access to 2700+ apps and 10,000+ tools, access to all state of the art large language models, and unlimited tasks. It's designed to help you get started and explore Eve's capabilities."
    },
    {
      question: "How much does it cost to use?",
      answer: "Free users have a limited number of AI credits. Paid users have more AI credits. You can start with our generous free tier and upgrade to Pro when you need additional credits and features like custom apps/tools and priority support."
    },
    {
      question: "What are credits?",
      answer: "Credits are units that measure your usage of the AI. Credit consumption varies based on the model used - more sophisticated models require more credits. Using tools and integrations also increases credit usage. A typical conversation uses 1000-2000 credits depending on length, complexity, model choice, and tool usage."
    },
    {
      question: "Can I change my Pro plan credits anytime?",
      answer: "Yes, you can upgrade or downgrade your Pro plan credits at any time. Changes will be reflected in your next billing cycle, and you'll be charged the prorated amount."
    },
    {
      question: "How does Enterprise pricing work?",
      answer: "Enterprise pricing is customized based on your organization's specific needs, team size, and usage requirements. Contact our sales team for a personalized quote and demo tailored to your requirements."
    }
  ];

  const toggleFaqItem = (index: number) => {
    const newOpenItems = new Set(openFaqItems);
    if (newOpenItems.has(index)) {
      newOpenItems.delete(index);
    } else {
      newOpenItems.add(index);
    }
    setOpenFaqItems(newOpenItems);
  };

  const handleUpgradeToPro = async () => {
    if (!isAuthenticated || !token) {
      // Redirect to login if not authenticated
      navigate('/login');
      return;
    }

    try {
      const currentTier = getCurrentUserTier();
      const isExistingProUser = currentTier.startsWith('pro_');
      
      // Use different endpoints based on whether user already has a subscription
      const endpoint = isExistingProUser 
        ? '/api/stripe/modify-subscription' 
        : '/api/stripe/create-checkout-session';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          credits: selectedProCredits,
        }),
      });

      if (!response.ok) {
        // Try to parse error response
        let errorMessage = isExistingProUser 
          ? 'Failed to modify subscription' 
          : 'Failed to create checkout session';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If response is not JSON, use status text or generic message
          if (response.status === 401) {
            errorMessage = 'You need to be logged in to upgrade';
            navigate('/login');
            return;
          } else if (response.status === 403) {
            errorMessage = 'You do not have permission to perform this action';
          } else if (response.status === 404 && isExistingProUser) {
            errorMessage = 'No active subscription found. Please contact support.';
          } else {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      if (isExistingProUser) {
        // For subscription modifications, show success message and refresh
        alert(`Successfully upgraded to ${result.tier?.name || 'new plan'}! Your subscription has been updated.`);
        window.location.reload();
      } else {
        // For new subscriptions, redirect to Stripe Checkout
        window.location.href = result.url;
      }
    } catch (error) {
      console.error('Error upgrading to Pro:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to upgrade: ${errorMessage}`);
    }
  };

  const handleContactSales = () => {
    navigate('/contact');
  };

  const handleDowngrade = async () => {
    if (!isAuthenticated || !token) {
      navigate('/login');
      return;
    }

    // Show confirmation dialog
    const confirmed = window.confirm(
      'Are you sure you want to downgrade to the Free plan? This will:\n\n' +
      '• Cancel your current subscription\n' +
      '• Reduce your monthly credits to 5,000\n' +
      '• Remove access to premium features\n\n' +
      'This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    setIsDowngrading(true);

    try {
      const response = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        let errorMessage = 'Failed to cancel subscription';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          if (response.status === 401) {
            errorMessage = 'You need to be logged in to cancel subscription';
            navigate('/login');
            return;
          } else if (response.status === 404) {
            errorMessage = 'No subscription found to cancel';
          } else {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      // Show success message
      alert(`Successfully downgraded to ${result.tierName}. Your subscription has been canceled.`);
      
      // Refresh the page to update the UI with new tier information
      window.location.reload();
      
    } catch (error) {
      console.error('Error downgrading subscription:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to downgrade: ${errorMessage}`);
    } finally {
      setIsDowngrading(false);
    }
  };

  const handleBackToChat = () => {
    navigate('/c/new');
  };

  const formatCredits = (credits: number) => {
    if (credits >= 1000000) {
      return `${credits / 1000000}M`;
    } else if (credits >= 1000) {
      return `${credits / 1000}K`;
    }
    return credits.toString();
  };

  return (
    <div className="min-h-screen py-12 px-4" style={{
      background: 'var(--surface-primary)',
      minHeight: '100vh'
    }}>
      <div className="max-w-6xl mx-auto">
        {/* Checkout Status Banner */}
        {checkoutStatus && (
          <div className={`mb-8 p-4 rounded-lg border ${
            checkoutStatus === 'success' 
              ? 'bg-blue-50 border-blue-200' 
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {checkoutStatus === 'success' ? (
                  <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--brand-blue)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-yellow-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                )}
                <div>
                  {checkoutStatus === 'success' ? (
                    <>
                      <p className="font-semibold" style={{ color: 'var(--brand-blue)' }}>Payment Successful!</p>
                      <p className="text-sm" style={{ color: 'var(--brand-blue)' }}>Welcome to Eve Pro! Your subscription is now active.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-yellow-800">Payment Canceled</p>
                      <p className="text-sm text-yellow-700">No worries! You can upgrade to Pro anytime.</p>
                    </>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setCheckoutStatus(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-16">
          <div className="w-12 h-12 mx-auto mb-6">
            <img
              src="/assets/logo.svg"
              className="h-full w-full object-contain"
              alt="EVE Logo"
            />
          </div>
          <h1 className="text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            Pricing
          </h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Start for free. Upgrade to get the capacity that exactly matches your team's needs.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid lg:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
          {/* Free Tier */}
          <div 
            className="p-8 relative flex flex-col h-full rounded-2xl"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              border: '1px solid var(--border-light)'
            }}
          >
            <div className="mb-8">
              <h3 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Free
              </h3>
              <div className="text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                $0
                <span className="text-lg font-normal" style={{ color: 'var(--text-secondary)' }}>
                  /month
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>For getting started</p>
            </div>

            <div className="mb-8">
              <div className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
                🍼 5000 credits / month
              </div>
            </div>

            <div className="mb-8 flex-grow">
              <div className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
                Get started with:
              </div>
              <ul className="space-y-3">
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Access 2700+ apps and 10,000+ tools</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Access to all state of the art large language models</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Unlimited tasks & workflows</span>
                </li>
              </ul>
            </div>

            <button
              onClick={isCurrentPlan('free') ? handleBackToChat : handleDowngrade}
              disabled={isDowngrading}
              className={`w-full h-12 text-sm font-medium mt-auto transition-colors ${
                isCurrentPlan('free') 
                  ? 'btn btn-secondary' 
                  : isDowngrading
                    ? 'border border-red-300 text-red-300 bg-gray-50 cursor-not-allowed rounded-lg'
                    : 'border border-red-500 text-red-500 hover:bg-red-50 hover:border-red-600 active:bg-red-100 active:border-red-700 rounded-lg'
              }`}
            >
              {isCurrentPlan('free') 
                ? 'Current Plan' 
                : isDowngrading 
                  ? 'Canceling...' 
                  : 'Downgrade'
              }
            </button>
          </div>

          {/* Pro Tier */}
          <div 
            className="p-8 relative flex flex-col h-full rounded-2xl"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              border: isCurrentPlan('pro') ? '2px solid var(--brand-blue)' : '2px solid var(--brand-blue)'
            }}
          >
            <div className="flex items-center gap-2 mb-8">
              <h3 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                Pro
              </h3>
              {isCurrentPlan('pro') ? (
                <span 
                  className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                  style={{ 
                    background: 'linear-gradient(135deg, var(--brand-blue) 0%, var(--brand-dark) 100%)'
                  }}
                >
                  CURRENT
                </span>
              ) : (
                <span 
                  className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                  style={{ 
                    background: 'linear-gradient(135deg, var(--brand-blue) 0%, var(--brand-dark) 100%)'
                  }}
                >
                  POPULAR
                </span>
              )}
            </div>

            <div className="mb-2">
              <div className="text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>
                ${selectedOption?.price}
                <span className="text-lg font-normal" style={{ color: 'var(--text-secondary)' }}>
                  /month
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>For more projects and usage</p>
            </div>

            <div className="mb-8 relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full h-12 px-4 text-left rounded-lg border flex items-center justify-between"
                style={{
                  borderColor: 'var(--border-medium)',
                  backgroundColor: 'var(--surface-primary)',
                  color: 'var(--text-primary)'
                }}
              >
                <span>
                  {(() => {
                    const tierInfo = getTierInfoFromCredits(selectedProCredits);
                    return `${getTierEmoji(tierInfo.tierName, tierInfo.tier)} ${formatCredits(selectedProCredits)} credits / month`;
                  })()}
                </span>
                <ChevronDown className="h-4 w-4" style={{ 
                  color: 'var(--text-secondary)',
                  transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s'
                }} />
              </button>

              {isDropdownOpen && (
                <div 
                  className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg z-10 max-h-64 overflow-y-auto"
                  style={{
                    backgroundColor: 'var(--surface-primary)',
                    borderColor: 'var(--border-medium)',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  {creditOptions.map((option) => {
                    const tierInfo = getTierInfoFromCredits(option.credits);
                    return (
                      <button
                        key={option.credits}
                        onClick={() => {
                          setSelectedProCredits(option.credits);
                          setIsDropdownOpen(false);
                        }}
                        className="w-full px-4 py-3 text-left transition-colors"
                        style={{
                          color: selectedProCredits === option.credits ? 'var(--brand-blue)' : 'var(--text-primary)',
                          backgroundColor: selectedProCredits === option.credits ? 'var(--surface-hover)' : 'transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (selectedProCredits !== option.credits) {
                            e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedProCredits !== option.credits) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <span>{getTierEmoji(tierInfo.tierName, tierInfo.tier)} {formatCredits(option.credits)} credits / month</span>
                          {selectedProCredits === option.credits && (
                            <Check className="h-4 w-4" style={{ color: 'var(--brand-blue)' }} />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mb-8 flex-grow">
              <div className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
                Everything in Free, plus:
              </div>
              <ul className="space-y-3">
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{formatCredits(selectedProCredits)} credits / month</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Request custom apps and tools</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Priority support</span>
                </li>
              </ul>
            </div>

            <button
              onClick={isCurrentSelectedPlan() ? handleBackToChat : handleUpgradeToPro}
              className={`w-full h-12 text-sm font-semibold mt-auto transition-colors ${
                isCurrentSelectedPlan() 
                  ? 'btn btn-secondary'
                  : isSelectedPlanDowngrade()
                    ? 'border border-red-500 text-red-500 hover:bg-red-50 hover:border-red-600 active:bg-red-100 active:border-red-700 rounded-lg'
                    : 'btn btn-primary'
              }`}
            >
              {isCurrentSelectedPlan() 
                ? 'Current Plan' 
                : isSelectedPlanDowngrade()
                  ? 'Downgrade'
                  : 'Upgrade'
              }
            </button>
          </div>

          {/* Enterprise Tier */}
          <div 
            className="p-8 relative flex flex-col h-full rounded-2xl"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              border: '1px solid var(--border-light)'
            }}
          >
            <div className="flex items-center gap-2 mb-8">
              <h3 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                Enterprise
              </h3>
            </div>

            <div className="mb-8">
              <div className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                Custom Pricing
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>For teams and organizations</p>
            </div>

            <div className="mb-8">
              <div className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
                Unlimited credits
              </div>
            </div>

            <div className="mb-8 flex-grow">
              <div className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
                Everything in Pro, plus:
              </div>
              <ul className="space-y-3">
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Unlimited credits</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Team collaboration tools</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Advanced analytics</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Dedicated support</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>SSO & advanced security</span>
                </li>
              </ul>
            </div>

            <button
              onClick={handleContactSales}
              className="btn btn-secondary w-full h-12 text-sm font-semibold mt-auto flex items-center justify-center gap-2"
            >
              Contact Us
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: 'var(--text-primary)' }}>
            Frequently Asked Questions
          </h2>
          
          <div className="space-y-4">
            {faqItems.map((item, index) => (
              <div 
                key={index}
                className="rounded-lg border"
                style={{
                  backgroundColor: 'var(--surface-secondary)',
                  borderColor: 'var(--border-light)'
                }}
              >
                <button
                  onClick={() => toggleFaqItem(index)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between transition-colors hover:bg-opacity-80"
                  style={{
                    color: 'var(--text-primary)',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <h3 className="text-lg font-semibold">{item.question}</h3>
                  <ChevronDown 
                    className="h-5 w-5 transition-transform duration-200 flex-shrink-0 ml-4"
                    style={{
                      color: 'var(--text-secondary)',
                      transform: openFaqItems.has(index) ? 'rotate(180deg)' : 'rotate(0deg)'
                    }}
                  />
                </button>
                
                <div 
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{
                    maxHeight: openFaqItems.has(index) ? '200px' : '0px',
                    opacity: openFaqItems.has(index) ? 1 : 0
                  }}
                >
                  <div className="px-6 pb-4">
                    <p style={{ color: 'var(--text-secondary)' }}>
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Back to Chat */}
        <div className="text-center mt-12">
          <button
            onClick={handleBackToChat}
            className="btn btn-neutral px-4 py-2 text-sm"
          >
            ← Back to Chat
          </button>
        </div>
      </div>
    </div>
  );
};

export default PricingPage; 