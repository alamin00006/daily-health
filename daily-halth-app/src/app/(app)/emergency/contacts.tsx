import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { SwitchRow } from '@/components/ui/switch-row';
import { localPhone } from '@/features/emergency/emergency-display';
import { useEmergencyActions, useEmergencyContacts } from '@/features/emergency/use-emergency';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { confirmAction, showToast } from '@/lib/user-feedback';
import { bangladeshPhoneSchema } from '@/shared-contracts/common-fields.contract';
import { EMERGENCY_CONTACTS_MAX, type EmergencyContactResponse } from '@/shared-contracts/emergency.contract';
import { colors } from '@/theme/design-tokens';

function ContactForm({
  profileId,
  contact,
  onDone,
}: {
  profileId: string;
  contact: EmergencyContactResponse | null;
  onDone: () => void;
}) {
  const actions = useEmergencyActions(profileId);
  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(contact ? localPhone(contact.phone) : '');
  const [relation, setRelation] = useState(contact?.relation ?? '');
  const [notifyOnSos, setNotifyOnSos] = useState(contact?.notifyOnSos ?? true);
  const [error, setError] = useState<string | null>(null);
  const busy = actions.addContact.isPending || actions.updateContact.isPending;

  const save = () => {
    if (name.trim().length < 2) return setError('নাম লিখুন।');
    const parsed = bangladeshPhoneSchema.safeParse(phone);
    if (!parsed.success) return setError('বাংলাদেশি মোবাইল নম্বর দিন, যেমন ০১৭১১-২৩৪৫৬৭।');
    setError(null);
    const body = { name: name.trim(), phone: parsed.data, relation: relation.trim() || null, notifyOnSos };
    const options = {
      onSuccess: () => {
        showToast('সেভ হয়েছে');
        onDone();
      },
      onError: (e: unknown) => setError(apiErrorMessage(e)),
    };
    if (contact) actions.updateContact.mutate({ contactId: contact.id, body }, options);
    else actions.addContact.mutate(body, options);
  };

  return (
    <SurfaceCard className="gap-4">
      <BanglaText variant="body-strong">{contact ? 'কন্টাক্ট বদলান' : 'নতুন জরুরি কন্টাক্ট'}</BanglaText>
      {error ? <InlineAlert tone="danger" message={error} /> : null}
      <LabeledTextInput label="নাম" placeholder="যেমন: জসিম উদ্দিন" value={name} onChangeText={setName} maxLength={80} />
      <LabeledTextInput
        label="মোবাইল নম্বর"
        placeholder="০১৭১১-২৩৪৫৬৭"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={20}
      />
      <LabeledTextInput
        label="সম্পর্ক (ইচ্ছা হলে)"
        placeholder="যেমন: প্রতিবেশী, ভাই"
        value={relation}
        onChangeText={setRelation}
        maxLength={40}
      />
      <SwitchRow
        title="জরুরি অবস্থায় SMS পাঠান"
        subtitle="সাহায্য চাইলে এই নম্বরে সাথে সাথে SMS যাবে"
        value={notifyOnSos}
        onChange={setNotifyOnSos}
      />
      <ActionButton label="সেভ করুন" loading={busy} onPress={save} />
      <ActionButton label="বাতিল" variant="ghost" onPress={onDone} />
    </SurfaceCard>
  );
}

/** Up to five people to call or SMS in an emergency. */
export default function EmergencyContactsScreen() {
  const { profile } = useActiveProfile();
  const contacts = useEmergencyContacts(profile?.id);
  const actions = useEmergencyActions(profile?.id ?? '');
  const [editing, setEditing] = useState<'new' | EmergencyContactResponse | null>(null);
  const editable = canEdit(profile);
  const list = contacts.data ?? [];

  const remove = async (c: EmergencyContactResponse) => {
    const ok = await confirmAction({
      title: `${c.name}-কে বাদ দেবেন?`,
      message: 'জরুরি অবস্থায় তাঁকে আর SMS পাঠানো হবে না।',
      confirmLabel: 'বাদ দিন',
      destructive: true,
    });
    if (!ok) return;
    actions.removeContact.mutate(c.id, {
      onSuccess: () => showToast('বাদ দেওয়া হয়েছে'),
      onError: (e) => showToast(apiErrorMessage(e)),
    });
  };

  return (
    <ScrollScreen
      header={
        <ScreenHeader
          title="জরুরি কন্টাক্ট"
          subtitle={profile?.fullName}
          fallbackHref="/emergency"
        />
      }
      onRefresh={() => contacts.refetch()}>
      {profile && editing ? (
        <ContactForm
          key={editing === 'new' ? 'new' : editing.id}
          profileId={profile.id}
          contact={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : editable && list.length < EMERGENCY_CONTACTS_MAX ? (
        <ActionButton label="কন্টাক্ট যোগ করুন" icon={Plus} variant="secondary" onPress={() => setEditing('new')} />
      ) : null}

      {contacts.isLoading ? (
        <LoadingList rows={3} rowClassName="h-16" />
      ) : contacts.isError ? (
        <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="কোনো জরুরি কন্টাক্ট নেই"
          message="বিপদে যাঁরা দ্রুত আসতে পারবেন, যেমন প্রতিবেশী বা কাছের আত্মীয়, তাঁদের নম্বর রাখুন।"
        />
      ) : (
        <SurfaceCard className="py-1">
          {list.map((c) => (
            <View key={c.id} className="flex-row items-center gap-2 border-b border-line/60 py-3">
              <View className="flex-1">
                <BanglaText variant="body-strong">{c.name}</BanglaText>
                <BanglaText variant="caption">
                  {c.relation ? `${c.relation} · ` : ''}
                  {toBanglaDigits(localPhone(c.phone))}
                  {c.notifyOnSos ? ' · SMS যাবে' : ''}
                </BanglaText>
              </View>
              {editable ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${c.name} বদলান`}
                    onPress={() => setEditing(c)}
                    className="h-11 w-11 items-center justify-center rounded-full active:bg-primary-50">
                    <Pencil size={18} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${c.name} বাদ দিন`}
                    onPress={() => void remove(c)}
                    className="h-11 w-11 items-center justify-center rounded-full active:bg-danger-soft">
                    <Trash2 size={18} color={colors.danger} />
                  </Pressable>
                </>
              ) : null}
            </View>
          ))}
        </SurfaceCard>
      )}
      <BanglaText variant="caption" className="px-1">
        সর্বোচ্চ {toBanglaDigits(EMERGENCY_CONTACTS_MAX)} জন। শুধু বাংলাদেশি মোবাইল নম্বর রাখা যায়।
      </BanglaText>
    </ScrollScreen>
  );
}
