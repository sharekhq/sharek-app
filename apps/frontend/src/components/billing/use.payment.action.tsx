import { useCallback } from 'react';
import { loadStripe, StripeElementLocale } from '@stripe/stripe-js';
import i18next from 'i18next';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const usePaymentAction = () => {
  const { stripeClient } = useVariables();
  const t = useT();

  return useCallback(
    // Consuming the PaymentIntent client_secret with the publishable key is
    // Stripe's intended flow: https://docs.stripe.com/api/payment_intents/object#payment_intent_object-client_secret
    async (clientSecret: string) => {
      // in the interface language, as the paywall's checkout loads it
      const stripe = await loadStripe(stripeClient, {
        locale: (i18next.resolvedLanguage as StripeElementLocale) || 'auto',
      }).catch(() => null);
      // Stripe.js's own messages for its failures are technical English, so
      // the reader gets a sentence in their language for each cause; the
      // caller only reads `error`
      if (!stripe) {
        // the paywall's sentence for the same failure
        return {
          error: t(
            'billing_stripe_load_failed',
            'The payment form could not be loaded. Please disable ad blockers or privacy extensions for this page and reload.'
          ),
        };
      }
      try {
        const { error } = await stripe.handleNextAction({ clientSecret });
        return { error: error?.message };
      } catch {
        // the intent is no longer in requires_action
        return { error: t('payment_failed', 'Payment failed') };
      }
    },
    [stripeClient, t]
  );
};
