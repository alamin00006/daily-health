import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { Home, MapPin, Phone, Trash2, User } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { ChipSelect } from '@/components/ui/chip-select';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { LoadingList } from '@/components/ui/state-views';
import { SwitchRow } from '@/components/ui/switch-row';
import { taka } from '@/features/doctors/doctor-display';
import { useAddressActions, useAddresses, useDeliveryZones } from '@/features/shop/use-shop';
import { confirmAction, showToast } from '@/lib/user-feedback';
import { bangladeshPhoneSchema } from '@/shared-contracts/common-fields.contract';
import type { DeliveryAddressResponse } from '@/shared-contracts/shop.contract';

const addressFormSchema = z.object({
  recipientName: z.string().trim().min(1, 'যিনি নেবেন তাঁর নাম লিখুন।').max(80, 'নাম খুব বড়।'),
  phone: z.string().transform((value, ctx) => {
    const parsed = bangladeshPhoneSchema.safeParse(value);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'সঠিক মোবাইল নম্বর লিখুন (যেমন ০১৭১১-২৩৪৫৬৭)।' });
      return z.NEVER;
    }
    return parsed.data;
  }),
  zoneId: z.string({ message: 'ডেলিভারি এলাকা বেছে নিন।' }).min(1, 'ডেলিভারি এলাকা বেছে নিন।'),
  area: z.string().trim().min(1, 'এলাকার নাম লিখুন (যেমন মিরপুর ১০)।').max(80),
  addressLine: z.string().trim().min(3, 'বাসা, রোড ইত্যাদি লিখুন।').max(300),
  label: z.string().trim().max(30),
  isDefault: z.boolean(),
});
type AddressInput = z.input<typeof addressFormSchema>;
type AddressValues = z.output<typeof addressFormSchema>;

function AddressForm({ address }: { address: DeliveryAddressResponse | null }) {
  const zones = useDeliveryZones();
  const actions = useAddressActions();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit } = useForm<AddressInput, unknown, AddressValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: {
      recipientName: address?.recipientName ?? '',
      phone: address?.phone.replace(/^\+88/, '') ?? '',
      zoneId: address?.zone.id ?? '',
      area: address?.area ?? '',
      addressLine: address?.addressLine ?? '',
      label: address?.label ?? '',
      isDefault: address?.isDefault ?? false,
    },
  });

  const save = handleSubmit((values) => {
    setError(null);
    const body = { ...values, label: values.label || null };
    const done = { onSuccess: () => (showToast('ঠিকানা সেভ হয়েছে'), router.back()), onError: (e: unknown) => setError(apiErrorMessage(e)) };
    if (address) actions.update.mutate({ id: address.id, body }, done);
    else actions.create.mutate(body, done);
  });

  const text = (
    name: 'recipientName' | 'phone' | 'area' | 'addressLine' | 'label',
    label: string,
    icon: typeof User,
    extra: Partial<React.ComponentProps<typeof LabeledTextInput>> = {}
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <LabeledTextInput
          label={label}
          icon={icon}
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          errorText={fieldState.error?.message}
          {...extra}
        />
      )}
    />
  );

  return (
    <ScrollScreen
      header={
        <ScreenHeader
          title={address ? 'ঠিকানা বদলান' : 'নতুন ঠিকানা'}
          fallbackHref="/shop/checkout"
        />
      }
      footer={
        <View className="gap-2">
          <ActionButton label="সেভ করুন" loading={actions.create.isPending || actions.update.isPending} onPress={() => void save()} />
          {address ? (
            <ActionButton
              label="ঠিকানাটি মুছুন"
              icon={Trash2}
              variant="danger"
              loading={actions.remove.isPending}
              onPress={async () => {
                const ok = await confirmAction({
                  title: 'ঠিকানা মুছবেন?',
                  message: 'আগের অর্ডারে এর কোনো প্রভাব পড়বে না।',
                  confirmLabel: 'মুছুন',
                  destructive: true,
                });
                if (ok) actions.remove.mutate(address.id, { onSuccess: () => router.back(), onError: (e) => setError(apiErrorMessage(e)) });
              }}
            />
          ) : null}
        </View>
      }>
      <FormErrorBanner message={error} />
      {text('recipientName', 'যিনি নেবেন', User, { autoComplete: 'name' })}
      {text('phone', 'মোবাইল নম্বর', Phone, { keyboardType: 'phone-pad', placeholder: '০১৭XXXXXXXX' })}
      <Controller
        control={control}
        name="zoneId"
        render={({ field, fieldState }) => (
          <ChipSelect
            label="ডেলিভারি এলাকা"
            value={field.value}
            onChange={field.onChange}
            errorText={fieldState.error?.message}
            options={(zones.data ?? []).map((z) => ({ value: z.id, label: `${z.name} (${taka(z.charge)})` }))}
          />
        )}
      />
      {text('area', 'এলাকা', MapPin, { placeholder: 'যেমন: মিরপুর ১০' })}
      {text('addressLine', 'বাসা, রোড, ফ্ল্যাট', Home, { multiline: true, placeholder: 'যেমন: বাসা ১২, রোড ৩, ৪র্থ তলা' })}
      {text('label', 'নাম দিন (ঐচ্ছিক)', MapPin, { placeholder: 'বাসা, অফিস…' })}
      <Controller
        control={control}
        name="isDefault"
        render={({ field }) => (
          <SwitchRow
            title="এটিই মূল ঠিকানা"
            subtitle="অর্ডারে আগে থেকে এটি বাছা থাকবে"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </ScrollScreen>
  );
}

/** Add or edit a delivery address (`?addressId=` to edit). */
export default function AddressFormScreen() {
  const { addressId } = useLocalSearchParams<{ addressId?: string }>();
  const addresses = useAddresses();
  if (addressId && addresses.isLoading) return <LoadingList rows={4} rowClassName="h-16" />;
  const address = addressId ? (addresses.data?.find((a) => a.id === addressId) ?? null) : null;
  return <AddressForm key={address?.id ?? 'new'} address={address} />;
}
