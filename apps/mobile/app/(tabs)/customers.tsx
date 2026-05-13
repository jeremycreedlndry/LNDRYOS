import { View, Text, FlatList, TextInput, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useDebounce } from '../../src/hooks/useDebounce'

export default function CustomersScreen() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)

  const { data: customers = [], isLoading } = trpc.customers.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 1 }
  )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search customers..."
          placeholderTextColor="#9ca3af"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {debouncedQuery.length < 1 ? 'Search by name or phone' : isLoading ? 'Searching...' : 'No customers found'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.first_name[0]}{item.last_name[0]}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
              <Text style={styles.contact}>{item.phone ?? item.email ?? 'No contact'}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  searchBar: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchInput: { backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#111827' },
  list: { padding: 16 },
  separator: { height: 8 },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, paddingVertical: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#111827' },
  contact: { fontSize: 13, color: '#6b7280', marginTop: 2 },
})
