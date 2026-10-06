import { StyleSheet } from 'react-native';
import { colors, radii, shadows, spacing, typography } from '../theme';

export const ui = StyleSheet.create({
  screenPad: { padding: spacing.lg, paddingBottom: spacing.xxl },

  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  cardMuted: {
    backgroundColor: '#ffffff',
    borderColor: '#64748b',
  },
  cardHighlight: {
    borderColor: colors.primaryMuted,
    backgroundColor: '#f0fdfa',
  },
  cardWarn: {
    borderColor: '#fcd34d',
    backgroundColor: colors.warningLight,
  },
  cardDanger: {
    borderColor: '#fca5a5',
    backgroundColor: colors.errorLight,
  },
  cardTotals: {
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primaryLight,
    marginBottom: 0,
  },

  cardTitle: { ...typography.section, color: colors.text },
  cardMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  muted: { ...typography.caption, color: colors.textSecondary },

  infoLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoLabel: { ...typography.body, fontWeight: '500', color: colors.textSecondary, flex: 1 },
  infoValue: { ...typography.body, fontWeight: '700', color: colors.text, textAlign: 'right', flex: 1 },

  banner: {
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  bannerInfo: { backgroundColor: colors.infoLight, borderColor: '#bae6fd' },
  bannerWarn: { backgroundColor: colors.warningLight, borderColor: '#fcd34d' },
  bannerSuccess: { backgroundColor: colors.successLight, borderColor: '#86efac' },
  bannerText: { ...typography.body, fontWeight: '500', color: colors.text, lineHeight: 22 },

  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  accountOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: '#f8fafc',
  },
  accountOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },

  modal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.soft,
  },
  modalTitle: { ...typography.section, flex: 1, paddingLeft: spacing.sm },
  modalBody: { padding: spacing.lg, paddingBottom: spacing.xxl },
  modalBg: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.xl },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadows.card,
  },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, gap: spacing.sm },

  sectionLabel: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  bulkBar: { marginBottom: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },

  chip: {
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  chipDisabled: { opacity: 0.55 },
  chipText: { ...typography.body, fontWeight: '700', color: colors.text },
  chipTextActive: { color: '#fff' },

  input: { marginBottom: spacing.sm },
  hint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 22 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
});
