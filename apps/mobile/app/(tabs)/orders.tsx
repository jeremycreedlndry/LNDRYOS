import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { trpc } from '@/lib/trpc'
import type { OrderStatus } from '@laundry/db'

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending:     '#f59e0b',
  in_progress: '#3b82f6',
  ready:       '#10b981',
  picked_up:   '#6b7280',
  delivered:   '#6b7280',
  cancelled:   '#ef4444',
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function OrdersScreen() {
  const { data: orders = [], isLoading, refetch } = trpc.orders.list.useQuery()
  const updateStatus = trpc.orders.updateStatus.useMutation({ onSuccess: () => refetch() })

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        onRefresh={refetch}
        refreshing={isLoading}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.orderNumber}>{item.order_number}</Text>
              <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status as OrderStatus] + '20' }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status as OrderStatus] }]}>
                  {item.status.replace('_', ' ')}
                </Text>
              </View>
            </View>

            <Text style={styles.customerName}>
              {(item.customer as { first_name?: string; last_name?: string } | null)
                ? `${(item.customer as { first_name: string }).first_name} ${(item.customer as { last_name: string }).last_name}`
                : item.customer_name ?? 'Walk-in'}
            </Text>

            <View style={styles.cardFooter}>
              <Text style={styles.amount}>{formatCents(item.total_amount)}</Text>

              {item.status === 'in_progress' && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                  onPress={() => updateStatus.mutate({ id: item.id, status: 'ready' })}
                >
                  <Text style={styles.actionBtnText}>Mark Ready</Text>
                </TouchableOpacity>
              )}
              {item.status === 'ready' && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#2563eb' }]}
                  onPress={() => updateStatus.mutate({ id: item.id, status: 'picked_up' })}
                >
                  <Text style={styles.actionBtnText}>Picked Up</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 16 },
  separator: { height: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  orderNumber: { fontFamily: 'monospace', fontSize: 14, fontWeight: '600', color: '#111827' },
  badge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  customerName: { fontSize: 14, color: '#374151', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 16, fontWeight: '700', color: '#111827' },
  actionBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
})
