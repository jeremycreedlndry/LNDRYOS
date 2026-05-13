import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import type { ServiceItem, ItemCategory } from '@laundry/db'

interface CartLine {
  service_item_id: string
  name: string
  category: ItemCategory
  quantity: number
  unit_price: number
  unit_label: string
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function POSScreen() {
  const [cart, setCart] = useState<CartLine[]>([])
  const { data: items = [] } = trpc.catalog.list.useQuery()

  const createOrder = trpc.orders.create.useMutation({
    onSuccess: (order) => {
      Alert.alert('Order Created', `Order ${order.order_number} created!\nTotal: ${formatCents(order.total_amount)}`, [
        { text: 'New Order', onPress: () => setCart([]) },
      ])
    },
    onError: (e) => Alert.alert('Error', e.message),
  })

  const addItem = (item: ServiceItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.service_item_id === item.id)
      if (existing) {
        return prev.map((l) => l.service_item_id === item.id ? { ...l, quantity: l.quantity + 1 } : l)
      }
      return [...prev, {
        service_item_id: item.id,
        name: item.name,
        category: item.category as ItemCategory,
        quantity: 1,
        unit_price: item.unit_price,
        unit_label: item.unit_label,
      }]
    })
  }

  const total = cart.reduce((s, l) => s + l.quantity * l.unit_price, 0)

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.grid} contentContainerStyle={styles.gridContent}>
        <Text style={styles.sectionLabel}>Services</Text>
        <View style={styles.itemGrid}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.itemCard}
              onPress={() => addItem(item as ServiceItem)}
              activeOpacity={0.7}
            >
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemPrice}>
                {formatCents(item.unit_price)}{item.unit_label !== 'item' ? `/${item.unit_label}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.cartPanel}>
        <Text style={styles.cartTitle}>Order ({cart.length} items)</Text>

        {cart.map((line) => (
          <View key={line.service_item_id} style={styles.cartRow}>
            <Text style={styles.cartItemName} numberOfLines={1}>{line.name}</Text>
            <Text style={styles.cartQty}>×{line.quantity}</Text>
            <Text style={styles.cartAmount}>{formatCents(line.quantity * line.unit_price)}</Text>
          </View>
        ))}

        {cart.length === 0 && (
          <Text style={styles.emptyCart}>Add items above</Text>
        )}

        <TouchableOpacity
          style={[styles.checkoutBtn, cart.length === 0 && styles.checkoutBtnDisabled]}
          disabled={cart.length === 0 || createOrder.isPending}
          onPress={() => {
            createOrder.mutate({
              lines: cart.map((l) => ({
                service_item_id: l.service_item_id,
                name: l.name,
                category: l.category,
                quantity: l.quantity,
                unit_price: l.unit_price,
              })),
              tax_rate: 0,
            })
          }}
        >
          <Text style={styles.checkoutBtnText}>
            {createOrder.isPending ? 'Processing...' : `Checkout · ${formatCents(total)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  grid: { flex: 1 },
  gridContent: { padding: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  itemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  itemCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  itemName: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 4 },
  itemPrice: { fontSize: 13, fontWeight: '700', color: '#2563eb' },
  cartPanel: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    padding: 16,
    paddingBottom: 8,
  },
  cartTitle: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  cartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cartItemName: { flex: 1, fontSize: 13, color: '#374151' },
  cartQty: { fontSize: 13, color: '#6b7280', marginHorizontal: 8 },
  cartAmount: { fontSize: 13, fontWeight: '600', color: '#111827', width: 60, textAlign: 'right' },
  emptyCart: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },
  checkoutBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  checkoutBtnDisabled: { backgroundColor: '#93c5fd' },
  checkoutBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
