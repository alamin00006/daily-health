import { useState } from 'react';

import { apiErrorMessage } from '@/api/api-error-messages';
import { isApiError } from '@/api/api-error';
import { openLogin } from '@/features/auth/guest-access';
import { showToast } from '@/lib/user-feedback';
import { toBanglaDigits } from '@/lib/bangla-digits';

import { useCart, useIsRegistered, useSetCartItem } from './use-shop';

/**
 * Cart quantities for product cards, and setting them. Guests browse freely but
 * need an account to buy; above-stock answers show how many are left.
 */
export function useAddToCart() {
  const registered = useIsRegistered();
  const cart = useCart();
  const setItem = useSetCartItem();
  const [busyId, setBusyId] = useState<string | null>(null);

  const qtyOf = (productId: string) => cart.data?.items.find((i) => i.product.id === productId)?.qty ?? 0;

  const set = (productId: string, qty: number) => {
    if (!registered) {
      openLogin();
      return;
    }
    setBusyId(productId);
    setItem.mutate(
      { productId, qty },
      {
        onSuccess: () => {
          if (qty === 1 && qtyOf(productId) === 0) showToast('কার্টে যোগ হয়েছে');
        },
        onError: (error) => {
          const details = isApiError(error) ? (error.details as { maxQty?: number } | null) : null;
          if (details?.maxQty !== undefined) {
            showToast(details.maxQty > 0 ? `এখন সর্বোচ্চ ${toBanglaDigits(details.maxQty)}টি নেওয়া যাবে` : 'পণ্যটি এখন স্টকে নেই');
          } else {
            showToast(apiErrorMessage(error));
          }
        },
        onSettled: () => setBusyId(null),
      }
    );
  };

  return {
    qtyOf,
    set,
    busyId,
    itemCount: cart.data?.itemCount ?? 0,
  };
}
