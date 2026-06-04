/**
 * app/plus.tsx — RoadPing Plus paywall (Phase 16C).
 *
 * Foundation phase: products come from src/services/purchases.ts, which is not
 * wired to StoreKit yet, so the screen renders a graceful "not available yet"
 * state instead of buy buttons — it never fakes a purchase. Continue Free and
 * Restore Purchases always work and never crash.
 *
 * Uses Apple In-App Purchase (StoreKit) once wired up — no Stripe / web
 * checkout / external payment links.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { RoadPingLogo } from '@/components/RoadPingLogo';
import { useTheme } from '@/theme/ThemeProvider';
import { useEntitlement } from '@/hooks/useEntitlement';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight, TextStyles } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import {
  getAvailableProducts,
  purchasePlus,
  restorePurchases,
  type BillingPeriod,
  type ProductsResult,
  type PlusProductId,
} from '@/services/purchases';

const BENEFITS = [
  'Premium cockpit themes',
  'More saved vehicles',
  'More private rooms',
  'Larger room limits',
  'Expanded private zones',
  'Advanced customization',
] as const;

const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export default function PlusScreen() {
  const router = useRouter();
  const { accent } = useTheme();
  const { isPlus, refresh } = useEntitlement();

  const [products, setProducts] = useState<ProductsResult | null>(null);
  const [selected, setSelected] = useState<BillingPeriod>('yearly');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await getAvailableProducts();
      if (active) setProducts(result);
    })();
    return () => {
      active = false;
    };
  }, []);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function handleSubscribe(productId: PlusProductId) {
    setBusy(true);
    try {
      const result = await purchasePlus(productId);
      if (result.status === 'success') {
        await refresh();
        Alert.alert('Welcome to RoadPing Plus', 'Your plan is now active.');
        goBack();
      } else if (result.status === 'cancelled') {
        // No-op — user backed out.
      } else if (result.status === 'unavailable') {
        Alert.alert('Not available yet', result.reason);
      } else {
        Alert.alert('Purchase failed', result.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    try {
      const result = await restorePurchases();
      if (result.status === 'restored') {
        await refresh();
        Alert.alert('Purchases restored', 'RoadPing Plus is active.');
      } else if (result.status === 'nothing_to_restore') {
        Alert.alert(
          'Nothing to restore',
          'We couldn’t find a previous RoadPing Plus purchase on this Apple ID.',
        );
      } else if (result.status === 'unavailable') {
        Alert.alert('Not available yet', result.reason);
      } else {
        Alert.alert('Restore failed', result.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const productsAvailable = products?.available === true;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={[styles.close, { color: accent.accent }]}>‹ Back</Text>
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <RoadPingLogo size={72} />
          <Text style={styles.title}>RoadPing Plus</Text>
          <Text style={styles.subtitle}>More control for every drive.</Text>
          {isPlus && (
            <View style={[styles.activePill, { borderColor: accent.accent }]}>
              <Text style={[styles.activePillText, { color: accent.accent }]}>
                ✓ ACTIVE
              </Text>
            </View>
          )}
        </View>

        {/* Benefits */}
        <View style={styles.benefits}>
          {BENEFITS.map((benefit) => (
            <View key={benefit} style={styles.benefitRow}>
              <Text style={[styles.benefitCheck, { color: accent.accent }]}>✓</Text>
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        {/* Plans or unavailable notice */}
        {products === null ? (
          <Text style={styles.loadingText}>Loading plans…</Text>
        ) : productsAvailable ? (
          <View style={styles.plans}>
            {products.products.map((p) => {
              const isSel = p.period === selected;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setSelected(p.period)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSel }}
                  style={[
                    styles.planCard,
                    { borderColor: isSel ? accent.accent : Colors.border },
                    isSel && { backgroundColor: accent.accentMuted },
                  ]}
                >
                  <Text style={styles.planTitle}>{p.title}</Text>
                  <Text style={styles.planPrice}>{p.priceLabel ?? '—'}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{products.reason}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {productsAvailable && (
            <AppButton
              label="Subscribe"
              variant="primary"
              size="lg"
              fullWidth
              loading={busy}
              onPress={() => {
                const chosen = products.products.find((p) => p.period === selected);
                if (chosen) void handleSubscribe(chosen.id);
              }}
            />
          )}

          <AppButton
            label="Continue Free"
            variant={productsAvailable ? 'ghost' : 'primary'}
            size="lg"
            fullWidth
            disabled={busy}
            onPress={goBack}
          />

          <AppButton
            label="Restore Purchases"
            variant="ghost"
            size="md"
            fullWidth
            disabled={busy}
            onPress={() => {
              void handleRestore();
            }}
          />
        </View>

        {/* Legal */}
        <View style={styles.legalRow}>
          <Pressable onPress={() => void Linking.openURL(TERMS_URL)} hitSlop={8}>
            <Text style={styles.legalLink}>Terms</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => router.push('/privacy')} hitSlop={8}>
            <Text style={styles.legalLink}>Privacy</Text>
          </Pressable>
        </View>

        <Text style={styles.legalNote}>
          Subscriptions are billed through your Apple ID and renew automatically
          until cancelled in your Apple ID settings. Safety, privacy, blocking,
          reporting, and account controls are always free.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
  },
  close: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.medium,
    minWidth: 60,
  },
  headerSpacer: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
  },

  hero: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
  },
  title: {
    ...TextStyles.display,
    color: Colors.textPrimary,
    letterSpacing: -1,
    marginTop: Spacing.sm,
  },
  subtitle: {
    ...TextStyles.bodyLarge,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  activePill: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md12,
    paddingVertical: Spacing.xs,
  },
  activePillText: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },

  benefits: {
    gap: Spacing.md12,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md12,
  },
  benefitCheck: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.bold,
    width: 18,
    textAlign: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: FontSize.body,
    color: Colors.textPrimary,
  },

  loadingText: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  plans: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  planCard: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  planTitle: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  planPrice: {
    fontSize: FontSize.subheading,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  noticeCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  noticeText: {
    fontSize: FontSize.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.bodySmall * 1.5,
  },

  actions: {
    gap: Spacing.sm,
  },

  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  legalLink: {
    fontSize: FontSize.bodySmall,
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: Colors.textTertiary,
  },
  legalNote: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: FontSize.caption * 1.5,
  },
});
