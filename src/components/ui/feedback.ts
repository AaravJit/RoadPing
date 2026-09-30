/**
 * Haptic vocabulary. One place so the same moment always feels the same.
 * All calls are fire-and-forget; a device without a Taptic Engine is a no-op.
 */
import * as Haptics from 'expo-haptics';

const ignore = () => {};

export const haptic = {
  /** Selection changed (segmented control, picker row, toggle). */
  selection: () => void Haptics.selectionAsync().catch(ignore),
  /** Ordinary button tap. */
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(ignore),
  /** Transmission actually started — firm and intentional. */
  transmitStart: () =>
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(ignore),
  /** Went live. */
  success: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(ignore),
  /** Stopped / hidden — noticeable but calm. */
  stop: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(ignore),
  /** Something failed. */
  error: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(ignore),
};
