import { Link, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  formatCurrency,
  formatUnit,
  Publication,
  supabase,
  userErrorMessage,
} from '@/lib/supabase';

export default function MarketplaceScreen() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSessionEmail(data.session?.user.email ?? null);
  }, []);

  const loadPublications = useCallback(async () => {
    setError('');
    const { data, error: publicationsError } = await supabase
      .from('publicaciones')
      .select('*')
      .order('created_at', { ascending: false });

    if (publicationsError) {
      setError(userErrorMessage(publicationsError));
      setPublications([]);
      return;
    }

    setPublications((data || []) as Publication[]);
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadSession(), loadPublications()]);
      setLoading(false);
    };

    init();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user.email ?? null);
    });

    return () => data.subscription.unsubscribe();
  }, [loadPublications, loadSession]);

  const filteredPublications = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return publications;

    return publications.filter((item) =>
      [item.titulo, item.empresa, item.ubicacion, item.direccion_google]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [publications, search]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadSession(), loadPublications()]);
    setRefreshing(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSessionEmail(null);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#0f766e" size="large" />
        <Text style={styles.muted}>Cargando mercado RSU...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>San Luis Potosi</Text>
          <Text style={styles.title}>Marketplace RSU</Text>
        </View>
        {sessionEmail ? (
          <Pressable style={styles.secondaryButton} onPress={signOut}>
            <Text style={styles.secondaryButtonText}>Salir</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryButton} onPress={() => router.push('/login')}>
            <Text style={styles.primaryButtonText}>Entrar</Text>
          </Pressable>
        )}
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar material, empresa o ubicacion"
        placeholderTextColor="#64748b"
        style={styles.search}
      />

      <View style={styles.actionsRow}>
        <Link href="/registro" asChild>
          <Pressable style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Crear cuenta</Text>
          </Pressable>
        </Link>
        <Pressable style={styles.linkButton} onPress={refresh}>
          <Text style={styles.linkButtonText}>Actualizar</Text>
        </Pressable>
      </View>

      {sessionEmail ? <Text style={styles.session}>Sesion activa: {sessionEmail}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={filteredPublications}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Aun no hay publicaciones</Text>
            <Text style={styles.muted}>Cuando existan lotes publicados apareceran aqui.</Text>
          </View>
        }
        renderItem={({ item }) => <PublicationCard publication={item} />}
      />
    </SafeAreaView>
  );
}

function PublicationCard({ publication }: { publication: Publication }) {
  const image = publication.imagenes?.[0];
  const location = publication.direccion_google || publication.ubicacion || 'Ubicacion pendiente';
  const certified = publication.certificado ? 'Certificado' : 'Sin certificado';

  return (
    <View style={styles.card}>
      {image ? <Image source={{ uri: image }} style={styles.cardImage} /> : null}
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>{publication.estado || 'available'}</Text>
        <Text style={styles.softBadge}>{certified}</Text>
      </View>
      <Text style={styles.cardTitle}>{publication.titulo || 'Publicacion sin titulo'}</Text>
      <Text style={styles.company}>{publication.empresa || 'Usuario registrado'}</Text>
      <View style={styles.metrics}>
        <View>
          <Text style={styles.metricLabel}>Volumen</Text>
          <Text style={styles.metricValue}>
            {Number(publication.volumen_tons || 0)} {formatUnit(publication.unidad_medida)}
          </Text>
        </View>
        <View>
          <Text style={styles.metricLabel}>Precio</Text>
          <Text style={styles.price}>{formatCurrency(publication.precio)}</Text>
        </View>
      </View>
      <Text style={styles.location}>{location}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: '#eef8f6',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#eef8f6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '900',
  },
  primaryButton: {
    backgroundColor: '#0f766e',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  secondaryButton: {
    borderColor: '#0f766e',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#0f766e',
    fontWeight: '900',
  },
  search: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  linkButton: {
    backgroundColor: '#d9f3ee',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linkButtonText: {
    color: '#0f766e',
    fontWeight: '800',
  },
  session: {
    color: '#334155',
    fontSize: 12,
    marginBottom: 8,
  },
  error: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    color: '#991b1b',
    fontWeight: '700',
    marginBottom: 8,
    padding: 10,
  },
  listContent: {
    gap: 14,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#d9e7e4',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  cardImage: {
    borderRadius: 8,
    height: 170,
    marginBottom: 12,
    width: '100%',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    backgroundColor: '#0f766e',
    borderRadius: 999,
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  softBadge: {
    backgroundColor: '#ecfeff',
    borderRadius: 999,
    color: '#0369a1',
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 21,
    fontWeight: '900',
  },
  company: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  metrics: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    padding: 12,
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  price: {
    color: '#15803d',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'right',
  },
  location: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 24,
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  muted: {
    color: '#64748b',
    textAlign: 'center',
  },
});
