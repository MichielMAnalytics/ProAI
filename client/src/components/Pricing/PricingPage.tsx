import React, { useState, useEffect } from 'react';
import { Check, ArrowRight, ChevronDown } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '~/hooks';
import { useGetUserBalance, useGetStartupConfig } from '~/data-provider';
import { getTierEmoji } from '~/utils/tierEmojis';
import { formatBalance } from '~/utils/formatBalance';

const PricingPage = () => {
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuthContext();
  const { data: startupConfig, isLoading: configLoading } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });
  const [searchParams] = useSearchParams();
  const [selectedTier, setSelectedTier] = useState('pro');
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

  const tierOptions = [
    { tier: 'pro', name: 'Eve Pro', price: 29 },
    { tier: 'max', name: 'Eve Max', price: 99 },
  ];

  // Function to get tier info from tier string
  const getTierInfo = (tier: string) => {
    const tierMap: { [key: string]: { tier: string; tierName: string; credits: string } } = {
      'pro': { tier: 'pro', tierName: 'Eve Pro', credits: startupConfig?.balance?.proTierTokens ? formatBalance(startupConfig.balance.proTierTokens) : '200K' },
      'max': { tier: 'max', tierName: 'Eve Max', credits: startupConfig?.balance?.maxTierTokens ? formatBalance(startupConfig.balance.maxTierTokens) : '900K' },
    };
    return tierMap[tier] || { tier: 'pro', tierName: 'Eve Pro', credits: '200K' };
  };

  const selectedOption = tierOptions.find(option => option.tier === selectedTier);

  // Helper function to determine user's current tier
  const getCurrentUserTier = () => {
    if (!balanceQuery.data?.tier) {
      return 'free';
    }
    return balanceQuery.data.tier;
  };

  // Helper function to check if a tier is the user's current plan
  const isCurrentPlan = (tierType: 'free' | 'pro' | 'max') => {
    const currentTier = getCurrentUserTier();
    
    if (tierType === 'free') {
      return currentTier === 'free';
    } else if (tierType === 'pro') {
      return currentTier === 'pro';
    } else if (tierType === 'max') {
      return currentTier === 'max';
    }
    return false;
  };

  // Helper function to check if the selected tier matches user's current plan
  const isCurrentSelectedPlan = (tier: string) => {
    const currentTier = getCurrentUserTier();
    return currentTier === tier;
  };

  // Helper function to check if selected tier represents a downgrade
  const isSelectedPlanDowngrade = (tier: string) => {
    const currentTier = getCurrentUserTier();
    if (currentTier === 'max' && tier === 'pro') {
      return true;
    }
    return false;
  };

  // Helper function to check if selected tier represents an upgrade
  const isSelectedPlanUpgrade = (tier: string) => {
    const currentTier = getCurrentUserTier();
    if (currentTier === 'free' && (tier === 'pro' || tier === 'max')) {
      return true;
    }
    if (currentTier === 'pro' && tier === 'max') {
      return true;
    }
    return false;
  };

  // Get user's current tier if they're on a pro plan
  const getCurrentTierInfo = () => {
    const currentTier = getCurrentUserTier();
    if (currentTier === 'pro' || currentTier === 'max') {
      return currentTier;
    }
    return null;
  };

  // Get the next tier up from user's current plan to encourage upgrades
  const getNextTier = () => {
    const currentTier = getCurrentUserTier();
    
    if (currentTier === 'free') {
      return 'pro'; // First pro tier
    }
    
    if (currentTier === 'pro') {
      return 'max'; // Upgrade to max
    }
    
    return 'pro'; // Default fallback
  };

  // Set selected tier to next tier above user's current plan by default
  useEffect(() => {
    if (balanceQuery.data) {
      const nextTier = getNextTier();
      setSelectedTier(nextTier);
    }
  }, [balanceQuery.data]);

  const faqItems = [
    {
      question: "What is EVE and how does it work?",
      answer: "EVE is an automation platform that provides extensive access to 2700+ apps and 10,000+ tools with no vendor lock-in. You can connect and automate workflows across different services while maintaining full control over your data and integrations."
    },
    {
      question: "What does the free plan include?",
      answer: "The free plan includes 10,000 credits per month, access to 2700+ apps and 10,000+ tools, access to all state of the art large language models, and unlimited tasks. It's designed to help you get started and explore Eve's capabilities."
    },
    {
      question: "How much does it cost to use?",
      answer: "Free users get 10,000 AI credits per month. Pro users get 200,000 credits per month for $29, and Max users get 900,000 credits per month for $99. You can start with our generous free tier and upgrade when you need additional credits and features like custom apps/tools and priority support."
    },
    {
      question: "What are credits?",
      answer: "Credits are units that measure your usage of the AI. Credit consumption varies based on the model used - more sophisticated models require more credits. Using tools and integrations also increases credit usage. A typical conversation uses 1000-2000 credits depending on length, complexity, model choice, and tool usage."
    },
    {
      question: "Can I change my Pro plan anytime?",
      answer: "Yes, you can upgrade from Pro to Max or downgrade at any time. Changes will be reflected in your next billing cycle, and you'll be charged the prorated amount."
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
      const isExistingProUser = currentTier === 'pro' || currentTier === 'max';
      
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
          credits: selectedTier,
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
    const freeCredits = startupConfig?.balance?.refillAmount ? formatBalance(startupConfig.balance.refillAmount) : '10K';
    const confirmed = window.confirm(
      'Are you sure you want to downgrade to the Free plan? This will:\n\n' +
      '• Cancel your current subscription\n' +
      `• Reduce your monthly credits to ${freeCredits}\n` +
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

  // Check if we're still loading critical data needed for proper badge display
  const isLoadingCriticalData = configLoading || 
    (isAuthenticated && startupConfig?.balance?.enabled && (balanceQuery.isLoading || balanceQuery.isFetching));

  // Don't render until we have all the data needed to display correctly
  if (isLoadingCriticalData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{
        background: 'var(--surface-primary)',
        minHeight: '100vh'
      }}>
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg" style={{ color: 'var(--text-secondary)' }}></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-6 px-4" style={{
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
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto mb-4">
            <img
              src="/assets/logo.svg"
              className="h-full w-full object-contain"
              alt="EVE Logo"
            />
          </div>
          <h1 className="text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
            Pricing
          </h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Start for free. Upgrade to get the capacity that exactly matches your team's needs.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid lg:grid-cols-3 gap-6 max-w-5xl mx-auto mb-8">
          {/* Free Tier */}
          <div 
            className="p-6 relative flex flex-col h-full rounded-2xl"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              border: '1px solid var(--border-light)'
            }}
          >
            {/* Header Section - Fixed Height */}
            <div className="h-14 mb-4">
              <h3 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Free
              </h3>
            </div>

            {/* Price Section - Fixed Height */}
            <div className="h-20 mb-4">
              <div className="text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                $0
                <span className="text-lg font-normal" style={{ color: 'var(--text-secondary)' }}>
                  /month
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Try Eve</p>
            </div>

            {/* Credits Section - Fixed Height */}
            <div className="h-8 mb-4">
              <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                🍼 {formatBalance(startupConfig?.balance?.refillAmount || 100000)} credits / month
              </div>
            </div>

            {/* Features Section - Flexible Height */}
            <div className="mb-4 flex-grow">
              <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                Get started with:
              </div>
              <ul className="space-y-2">
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Access to all preconfigured System Agents</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Access to 2700+ apps and 10,000+ tools</span>
                </li>
               
              </ul>
            </div>

            {/* Button Section - Fixed at Bottom */}
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
            className="p-6 relative flex flex-col h-full rounded-2xl"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              border: isCurrentPlan('pro') ? '2px solid var(--brand-blue)' : '2px solid var(--brand-blue)'
            }}
          >
            {/* Header Section - Fixed Height */}
            <div className="h-14 mb-4">
              <div className="flex items-center gap-2">
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
                ) : !isCurrentPlan('max') && (
                  <span 
                    className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ 
                      background: '#10b981',
                      color: 'white'
                    }}
                  >
                    POPULAR
                  </span>
                )}
              </div>
            </div>

            {/* Price Section - Fixed Height */}
            <div className="h-20 mb-4">
              <div className="text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                $29
                <span className="text-lg font-normal" style={{ color: 'var(--text-secondary)' }}>
                  /month
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>For more projects and usage</p>
            </div>

            {/* Credits Section - Fixed Height */}
            <div className="h-8 mb-4">
              <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                {getTierInfo('pro').credits} credits / month
              </div>
            </div>

            {/* Features Section - Flexible Height */}
            <div className="mb-4 flex-grow">
              <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                Everything in Free, plus:
              </div>
              <ul className="space-y-2">
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Access to all state of the art large language models</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Access to workflows</span>
                </li>
              
              </ul>
            </div>

            {/* Button Section - Fixed at Bottom */}
            <button
              onClick={() => {
                setSelectedTier('pro');
                if (isCurrentSelectedPlan('pro')) {
                  handleBackToChat();
                } else {
                  handleUpgradeToPro();
                }
              }}
              className={`w-full h-12 text-sm font-semibold mt-auto transition-colors ${
                isCurrentSelectedPlan('pro') 
                  ? 'btn btn-secondary'
                  : isSelectedPlanDowngrade('pro')
                    ? 'border border-red-500 text-red-500 hover:bg-red-50 hover:border-red-600 active:bg-red-100 active:border-red-700 rounded-lg'
                    : 'btn btn-primary'
              }`}
            >
              {isCurrentSelectedPlan('pro') 
                ? 'Current Plan' 
                : isSelectedPlanDowngrade('pro')
                  ? 'Downgrade'
                  : 'Upgrade to Pro'
              }
            </button>
          </div>

          {/* Max Tier */}
          <div 
            className="p-6 relative flex flex-col h-full rounded-2xl"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              border: isCurrentPlan('max') ? '2px solid var(--brand-blue)' : '1px solid var(--border-light)'
            }}
          >
            {/* Header Section - Fixed Height */}
            <div className="h-14 mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Max
                </h3>
                {isCurrentPlan('max') && (
                  <span 
                    className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ 
                      background: 'linear-gradient(135deg, var(--brand-blue) 0%, var(--brand-dark) 100%)'
                    }}
                  >
                    CURRENT
                  </span>
                )}
              </div>
            </div>

            {/* Price Section - Fixed Height */}
            <div className="h-20 mb-4">
              <div className="text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                $99
                <span className="text-lg font-normal" style={{ color: 'var(--text-secondary)' }}>
                  /month
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Get the most out of Eve</p>
            </div>

            {/* Credits Section - Fixed Height */}
            <div className="h-8 mb-4">
              <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                {getTierInfo('max').credits} credits / month
              </div>
            </div>

            {/* Features Section - Flexible Height */}
            <div className="mb-4 flex-grow">
              <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                Everything in Pro, plus:
              </div>
              <ul className="space-y-2">
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>5x more credits than Pro</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Access to global apps without credentials</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Priority support</span>
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 mr-3 flex-shrink-0" style={{ color: 'var(--brand-blue)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Request custom apps and tools</span>
                </li>
              </ul>
            </div>

            {/* Button Section - Fixed at Bottom */}
            <button
              onClick={() => {
                setSelectedTier('max');
                if (isCurrentSelectedPlan('max')) {
                  handleBackToChat();
                } else {
                  handleUpgradeToPro();
                }
              }}
              className={`w-full h-12 text-sm font-semibold mt-auto transition-colors ${
                isCurrentSelectedPlan('max') 
                  ? 'btn btn-secondary'
                  : isSelectedPlanDowngrade('max')
                    ? 'border border-red-500 text-red-500 hover:bg-red-50 hover:border-red-600 active:bg-red-100 active:border-red-700 rounded-lg'
                    : 'btn btn-primary'
              }`}
            >
              {isCurrentSelectedPlan('max') 
                ? 'Current Plan' 
                : isSelectedPlanDowngrade('max')
                  ? 'Downgrade'
                  : 'Upgrade to Max'
              }
            </button>
          </div>
        </div>

        {/* Enterprise Note */}
        <div className="text-center mb-6">
          <p className="text-lg mb-3" style={{ color: 'var(--text-secondary)' }}>
            Need unlimited credits and enterprise features?
          </p>
          <button 
            onClick={handleContactSales}
            className="btn btn-secondary"
          >
            Contact Sales
          </button>
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