import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { trpc } from '@/lib/trpc'
import { formatDate } from '../../src/lib/utils'

export default function SettingsScreen() {
  const { data: tenant } = trpc.tenants.getCurrent.useQuery()
  const { data: subscription } = trpc.tenants.getSubscription.useQuery()

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Store</Text>
        <View style={styles.card}>
          <Row label="Name" value={tenant?.name ?? '—'} />
          <Row label="Plan" value={tenant?.plan ?? '—'} />
          <Row label="Status" value={tenant?.status ?? '—'} />
        </View>
      </View>

      {subscription && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.card}>
            <Row label="Status" value={subscription.status} />
            <Row label="Renews" value={formatDate(subscription.current_period_end)} />
            {subscription.cancel_at_period_end && (
              <Text style={styles.cancelNote}>Cancels at end of period</Text>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  label: { fontSize: 14, color: '#6b7280' },
  value: { fontSize: 14, fontWeight: '500', color: '#111827', textTransform: 'capitalize' },
  cancelNote: { padding: 14, fontSize: 13, color: '#ef4444' },
})
