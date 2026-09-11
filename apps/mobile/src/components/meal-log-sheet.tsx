import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { CrispPress } from '@/components/crisp-press';
import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/app';
import { Fonts, Spacing } from '@/constants/theme';
import { lookupBarcode, scaleFood, defaultAmount, fetchOpenFoodFacts, parseSearchPayload, type OffFood, type ScaledFood } from '@/lib/barcode';
import { COFID_FOODS } from '@/lib/cofid-catalog';
import { COFID_CREDIT, searchFoods } from '@/lib/food-search';
import { MEAL_SLOTS, logDisplayName, type LogEntry, type MealSlot, type RecentMeal } from '@/lib/diary';
import type { LogInput } from '@/lib/db';

type Mode = 'scan' | 'search';

function defaultMealSlot(date = new Date()): MealSlot {
  const hour = date.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function asDockedFood(
  name: string,
  kcal: number,
  proteinG: number | null,
  carbsG: number | null,
  fatG: number | null,
  fiberG: number | null,
  sugarG: number | null,
  satFatG: number | null,
  sodiumMg: number | null,
  portionLabel: string,
): OffFood {
  return {
    barcode: '',
    name,
    kcal,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    sugarG,
    satFatG,
    sodiumMg,
    portionLabel,
    portion: 'serving',
    servingGrams: null,
    source: 'off',
  };
}

function specimenFromEdit(editing: LogEntry | null): OffFood | null {
  const name = editing?.name?.trim();
  if (!editing || !name) return null;
  return asDockedFood(
    name,
    editing.kcal,
    editing.proteinG,
    editing.carbsG,
    editing.fatG,
    editing.fiberG ?? null,
    editing.sugarG ?? null,
    editing.satFatG ?? null,
    editing.sodiumMg ?? null,
    'logged',
  );
}

export function MealLogSheet({
  visible,
  onClose,
  dayKey,
  dayLabel,
  recents,
  editing,
  isDark,
  accentText,
  hairline,
  textColor,
  mutedColor,
  cardBg,
  onSave,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  dayKey: string;
  dayLabel: string;
  recents: RecentMeal[];
  editing: LogEntry | null;
  isDark: boolean;
  accentText: string;
  accentSoft: string;
  hairline: string;
  textColor: string;
  mutedColor: string;
  cardBg: string;
  onSave: (input: LogInput) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const lock = useRef(false);

  const initialSpecimen = specimenFromEdit(editing);
  const [meal, setMeal] = useState<MealSlot>(editing?.meal ?? defaultMealSlot());
  const [mode, setMode] = useState<Mode>('search');
  const [specimen, setSpecimen] = useState<OffFood | null>(initialSpecimen);
  const [amount, setAmount] = useState(() => (initialSpecimen ? String(defaultAmount(initialSpecimen)) : '1'));
  const [looking, setLooking] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<OffFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function dockFood(food: OffFood) {
    setSpecimen(food);
    setAmount(String(defaultAmount(food)));
    setError(null);
    setSearchHits([]);
  }

  async function resolveCode(code: string) {
    if (lock.current) return;
    lock.current = true;
    setLooking(true);
    setError(null);
    try {
      const food = await lookupBarcode(code);
      if (!food) {
        setError('No energy data on that pack. Search for a similar food instead.');
        setMode('search');
        return;
      }
      dockFood(food);
      setMode('scan');
    } catch {
      setError('Could not reach the food database. Check the connection and try again.');
    } finally {
      setLooking(false);
      lock.current = false;
    }
  }

  function onBarcodeScanned(result: BarcodeScanningResult) {
    if (mode !== 'scan' || specimen || looking) return;
    void resolveCode(result.data);
  }

  function applyRecent(recent: RecentMeal) {
    dockFood(
      asDockedFood(
        recent.name,
        recent.kcal,
        recent.proteinG,
        recent.carbsG,
        recent.fatG,
        recent.fiberG,
        recent.sugarG,
        recent.satFatG,
        recent.sodiumMg,
        'recent',
      ),
    );
    setMode('scan');
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function runSearch() {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setError('Type at least two letters to search.');
      return;
    }
    setSearching(true);
    setError(null);
    setSpecimen(null);
    try {
      const { hits, packsFailed } = await searchFoods(query, {
        catalog: COFID_FOODS,
        lookup: fetchOpenFoodFacts,
        parseRemote: (payload) => parseSearchPayload(payload),
      });
      setSearchHits(hits);
      if (!hits.length && packsFailed) {
        setError('Could not reach the food database. Check the connection and try again.');
      } else if (!hits.length) {
        setError('Nothing matched. Try another name, or scan the pack.');
      } else if (packsFailed) {
        setError('Generic foods loaded. Packaged products didn’t load — check the connection and try again.');
      }
    } catch {
      setError('Could not reach the food database. Check the connection and try again.');
    } finally {
      setSearching(false);
    }
  }

  const amountValue = Number(amount.replace(',', '.'));
  const scaled = specimen ? scaleFood(specimen, amountValue) : null;

  async function handleSave() {
    if (!specimen || !scaled) {
      setError(specimen ? 'Set an amount greater than zero.' : 'Pick a food first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        dayKey,
        meal,
        name: specimen.name,
        kcal: scaled.kcal,
        proteinG: scaled.proteinG,
        carbsG: scaled.carbsG,
        fatG: scaled.fatG,
        fiberG: scaled.fiberG,
        sugarG: scaled.sugarG,
        satFatG: scaled.satFatG,
        sodiumMg: scaled.sodiumMg,
      });
      onClose();
    } catch {
      setError('Could not lock this reading. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(editing.id);
      onClose();
    } catch {
      setError('Could not remove this reading.');
    } finally {
      setSaving(false);
    }
  }

  const nativeScan = Platform.OS !== 'web';
  const canLock = scaled != null && scaled.kcal > 0;
  const showCamera = nativeScan && mode === 'scan' && !specimen && !looking && permission?.granted;
  const wellLabel = looking || searching ? 'READING' : specimen ? 'LOCKED READING' : mode === 'search' ? 'SEARCH' : 'VIEWFINDER';
  const inkOnAccent = isDark ? '#0A1019' : '#FFFFFF';
  const trackBg = isDark ? '#0B121C' : '#EEF0EC';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
          <View style={[styles.panel, { backgroundColor: cardBg, borderColor: isDark ? 'rgba(255,255,255,0.10)' : hairline }]}>
            <View style={styles.panelHead}>
              <View>
                <ThemedText type="smallBold" style={[styles.kicker, { color: mutedColor }]}>
                  {editing ? 'RECALIBRATE' : 'CAPTURE'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.dayStamp}>
                  {dayLabel}
                </ThemedText>
              </View>
              <CrispPress onPress={onClose} haptic="light" scaleTo={0.94} innerStyle={styles.dismissHit}>
                <Text style={[styles.dismissText, { color: mutedColor }]}>Close</Text>
              </CrispPress>
            </View>

            <SlidingBand
              values={MEAL_SLOTS.map((s) => ({ id: s.value, label: s.label }))}
              selected={meal}
              onChange={setMeal}
              trackBg={trackBg}
              hairline={hairline}
              pillColor={accentText}
              pillText={inkOnAccent}
              mutedColor={mutedColor}
            />

            <SlidingBand
              values={[
                { id: 'search', label: 'Search' },
                { id: 'scan', label: 'Scan pack' },
              ]}
              selected={mode}
              onChange={switchMode}
              trackBg={trackBg}
              hairline={hairline}
              pillColor={isDark ? 'rgba(183,233,60,0.16)' : 'rgba(14,107,56,0.12)'}
              pillText={accentText}
              mutedColor={mutedColor}
              compact
            />

            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollInner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.well, { borderColor: isDark ? 'rgba(183,233,60,0.22)' : 'rgba(14,107,56,0.18)' }]}>
              <View style={styles.wellHead}>
                <View style={styles.wellDot} />
                <Text style={styles.wellKicker}>{wellLabel}</Text>
                <View style={[styles.wellDot, { opacity: 0.35 }]} />
              </View>
              {showCamera ? (
                <View style={styles.finder}>
                  <CameraView
                    facing="back"
                    style={StyleSheet.absoluteFill}
                    barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
                    onBarcodeScanned={onBarcodeScanned}
                  />
                  <View style={styles.reticleWrap} pointerEvents="none">
                    <Reticle />
                  </View>
                </View>
              ) : specimen ? (
                <SpecimenDock
                  food={specimen}
                  scaled={scaled}
                  amount={amount}
                  onAmount={setAmount}
                  accentText={accentText}
                  mutedColor={mutedColor}
                  onClear={() => {
                    setSpecimen(null);
                    setSearchHits([]);
                  }}
                />
              ) : mode === 'search' ? (
                <View style={styles.searchWell}>
                  <Text style={styles.finderHint}>
                    {searching ? 'Searching the food database…' : 'Search by name when the camera can’t read a pack, or the barcode isn’t listed.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.finderEmpty}>
                  <View style={styles.reticleBox}>
                    <Reticle />
                  </View>
                  {nativeScan && !permission?.granted ? (
                    <CrispPress onPress={() => void requestPermission()} innerStyle={[styles.allowBtn, { backgroundColor: accentText }]}>
                      <Text style={[styles.allowText, { color: inkOnAccent }]}>Allow camera</Text>
                    </CrispPress>
                  ) : looking ? (
                    <Text style={styles.finderHint}>Looking up the pack…</Text>
                  ) : (
                    <Text style={styles.finderHint}>
                      {nativeScan
                        ? 'Settle the barcode in the reticle. The pack docks as a reading — no typing.'
                        : 'Key the barcode below. On a phone this well is the viewfinder.'}
                    </Text>
                  )}
                </View>
              )}
            </View>

            {(Platform.OS === 'web' || !permission?.granted) && mode === 'scan' && !specimen ? (
              <View style={styles.manualRow}>
                <TextInput
                  value={manualCode}
                  onChangeText={(text) => setManualCode(text.replace(/\D/g, ''))}
                  placeholder="Barcode digits"
                  placeholderTextColor={mutedColor}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={() => void resolveCode(manualCode)}
                  style={[styles.manualInput, { color: textColor, borderColor: hairline, backgroundColor: isDark ? '#0C1420' : '#F6F7F4' }]}
                />
                <CrispPress
                  onPress={() => void resolveCode(manualCode)}
                  disabled={manualCode.length < 8 || looking}
                  innerStyle={[styles.manualGo, { borderColor: accentText }]}
                >
                  <Text style={[styles.manualGoText, { color: accentText }]}>Read</Text>
                </CrispPress>
              </View>
            ) : null}

            {mode === 'search' && !specimen ? (
              <View style={styles.searchBlock}>
                <View style={styles.manualRow}>
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Food name"
                    placeholderTextColor={mutedColor}
                    returnKeyType="search"
                    autoCorrect
                    onSubmitEditing={() => void runSearch()}
                    style={[styles.manualInput, { color: textColor, borderColor: hairline, backgroundColor: isDark ? '#0C1420' : '#F6F7F4' }]}
                  />
                  <CrispPress
                    onPress={() => void runSearch()}
                    disabled={searchQuery.trim().length < 2 || searching}
                    innerStyle={[styles.manualGo, { borderColor: accentText }]}
                  >
                    <Text style={[styles.manualGoText, { color: accentText }]}>{searching ? '…' : 'Search'}</Text>
                  </CrispPress>
                </View>
                {searchHits.length > 0 ? (
                  <View style={[styles.hitList, { borderColor: hairline }]}>
                    {searchHits.map((hit, i) => (
                      <CrispPress
                        key={`${hit.barcode}-${hit.name}-${i}`}
                        haptic="select"
                        onPress={() => dockFood(hit)}
                        innerStyle={[styles.hitRow, i < searchHits.length - 1 ? { borderBottomColor: hairline, borderBottomWidth: StyleSheet.hairlineWidth } : null]}
                      >
                        <View style={styles.hitText}>
                          <Text style={[styles.hitName, { color: textColor }]} numberOfLines={2}>
                            {hit.name}
                          </Text>
                          <Text style={[styles.hitMeta, { color: mutedColor }]}>
                            {hit.source === 'cofid'
                              ? 'UK CoFID · per 100 g'
                              : hit.portion === 'serving'
                                ? `Open Food Facts · 1 serving (${hit.portionLabel})`
                                : 'Open Food Facts · per 100 g'}
                          </Text>
                        </View>
                        <Text style={[styles.hitKcal, { color: accentText }]}>{hit.kcal}</Text>
                      </CrispPress>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.credit}>{COFID_CREDIT}</Text>
              </View>
            ) : null}

            {!editing && recents.length > 0 ? (
              <View style={styles.recentsBlock}>
                <Text style={[styles.recentsLabel, { color: mutedColor }]}>RECENT PACKS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentsRow}>
                  {recents.map((recent) => (
                    <CrispPress
                      key={recent.name}
                      haptic="select"
                      onPress={() => applyRecent(recent)}
                      innerStyle={[styles.recentTick, { borderColor: hairline }]}
                    >
                      <Text style={[styles.recentName, { color: textColor }]} numberOfLines={1}>
                        {recent.name}
                      </Text>
                      <Text style={[styles.recentKcal, { color: accentText }]}>{recent.kcal}</Text>
                    </CrispPress>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={[styles.actions, { borderTopColor: hairline }]}>
              {editing && onDelete ? (
                <CrispPress onPress={() => void handleDelete()} disabled={saving} innerStyle={[styles.ghostBtn, { borderColor: 'rgba(214,69,69,0.35)' }]}>
                  <Text style={styles.deleteText}>Remove</Text>
                </CrispPress>
              ) : null}
              <CrispPress
                onPress={() => void handleSave()}
                disabled={saving || !canLock}
                scaleTo={0.98}
                style={styles.lockWrap}
                innerStyle={[styles.lockBtn, { backgroundColor: accentText }]}
              >
                <View style={styles.lockSheen} />
                <Text style={[styles.lockText, { color: inkOnAccent }]}>{saving ? 'Locking…' : 'Lock in'}</Text>
              </CrispPress>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function SlidingBand<T extends string>({
  values,
  selected,
  onChange,
  trackBg,
  hairline,
  pillColor,
  pillText,
  mutedColor,
  compact,
}: {
  values: { id: T; label: string }[];
  selected: T;
  onChange: (id: T) => void;
  trackBg: string;
  hairline: string;
  pillColor: string;
  pillText: string;
  mutedColor: string;
  compact?: boolean;
}) {
  const index = Math.max(0, values.findIndex((v) => v.id === selected));
  const [trackW, setTrackW] = useState(0);
  const slide = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    Animated.spring(slide, { toValue: index, useNativeDriver: true, friction: 8, tension: 170 }).start();
  }, [index, slide]);

  const pad = 4;
  const inner = Math.max(0, trackW - pad * 2);
  const cell = values.length ? inner / values.length : 0;

  return (
    <View
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      style={[styles.band, compact && styles.bandCompact, { backgroundColor: trackBg, borderColor: hairline }]}
    >
      {cell > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bandPill,
            compact && styles.bandPillCompact,
            {
              width: cell,
              backgroundColor: pillColor,
              transform: [{ translateX: Animated.multiply(slide, cell) }],
            },
          ]}
        />
      ) : null}
      {values.map((item) => {
        const on = item.id === selected;
        return (
          <CrispPress
            key={item.id}
            haptic="select"
            scaleTo={0.98}
            style={styles.bandCellWrap}
            innerStyle={[styles.bandCell, compact && styles.bandCellCompact]}
            onPress={() => onChange(item.id)}
          >
            <Text style={[styles.bandLabel, compact && styles.bandLabelCompact, { color: on ? pillText : mutedColor }]}>
              {item.label}
            </Text>
          </CrispPress>
        );
      })}
    </View>
  );
}

function Reticle() {
  const c = Brand.lime;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 200 200">
      <Rect x="16" y="16" width="34" height="2.5" fill={c} />
      <Rect x="16" y="16" width="2.5" height="34" fill={c} />
      <Rect x="150" y="16" width="34" height="2.5" fill={c} />
      <Rect x="181.5" y="16" width="2.5" height="34" fill={c} />
      <Rect x="16" y="181.5" width="34" height="2.5" fill={c} />
      <Rect x="16" y="150" width="2.5" height="34" fill={c} />
      <Rect x="150" y="181.5" width="34" height="2.5" fill={c} />
      <Rect x="181.5" y="150" width="2.5" height="34" fill={c} />
      <Circle cx="100" cy="100" r="20" stroke={c} strokeWidth="1.15" fill="none" opacity={0.5} />
      <Line x1="100" y1="72" x2="100" y2="88" stroke={c} strokeWidth="1.15" opacity={0.75} />
      <Line x1="100" y1="112" x2="100" y2="128" stroke={c} strokeWidth="1.15" opacity={0.75} />
      <Line x1="72" y1="100" x2="88" y2="100" stroke={c} strokeWidth="1.15" opacity={0.75} />
      <Line x1="112" y1="100" x2="128" y2="100" stroke={c} strokeWidth="1.15" opacity={0.75} />
    </Svg>
  );
}

function nudgeAmount(current: string, food: OffFood, dir: 1 | -1): string {
  const step = food.portion === 'serving' ? 0.5 : 10;
  const parsed = Number(current.replace(',', '.'));
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultAmount(food);
  const next = Math.round((base + dir * step) * 100) / 100;
  const min = food.portion === 'serving' ? 0.5 : 1;
  return String(Math.max(min, next));
}

function SpecimenDock({
  food,
  scaled,
  amount,
  onAmount,
  accentText,
  mutedColor,
  onClear,
}: {
  food: OffFood;
  scaled: ScaledFood | null;
  amount: string;
  onAmount: (value: string) => void;
  accentText: string;
  mutedColor: string;
  onClear: () => void;
}) {
  const macros = [
    { k: 'P', v: scaled?.proteinG },
    { k: 'C', v: scaled?.carbsG },
    { k: 'F', v: scaled?.fatG },
  ];
  // Recents / edit rows dock already-scaled totals as one serving — don't re-multiply.
  const amountLocked = food.portionLabel === 'logged' || food.portionLabel === 'recent';
  return (
    <View style={styles.dock}>
      <Text style={styles.dockPortion}>{scaled?.amountLabel ?? food.portionLabel}</Text>
      <Text style={styles.dockName} numberOfLines={2}>
        {food.name}
      </Text>
      <Text style={[styles.dockKcal, { color: accentText }]}>{scaled ? scaled.kcal.toLocaleString() : '—'}</Text>
      <Text style={styles.dockUnit}>kcal</Text>
      {amountLocked ? (
        <Text style={[styles.amountHint, { color: mutedColor }]}>Logged amount</Text>
      ) : (
        <>
          <View style={styles.amountRow}>
            <CrispPress haptic="select" onPress={() => onAmount(nudgeAmount(amount, food, -1))} innerStyle={styles.amountStep}>
              <Text style={[styles.amountStepText, { color: accentText }]}>−</Text>
            </CrispPress>
            <TextInput
              value={amount}
              onChangeText={(text) => onAmount(text.replace(/[^0-9.,]/g, ''))}
              keyboardType="decimal-pad"
              selectTextOnFocus
              style={[styles.amountInput, { color: '#EEF2F5', borderColor: 'rgba(255,255,255,0.14)' }]}
            />
            <CrispPress haptic="select" onPress={() => onAmount(nudgeAmount(amount, food, 1))} innerStyle={styles.amountStep}>
              <Text style={[styles.amountStepText, { color: accentText }]}>+</Text>
            </CrispPress>
          </View>
          <Text style={[styles.amountHint, { color: mutedColor }]}>{food.portion === 'serving' ? 'servings' : 'grams'}</Text>
        </>
      )}
      <View style={styles.dockMetrics}>
        {macros.map((m, i) => (
          <View key={m.k} style={[styles.dockMetric, i === macros.length - 1 && styles.dockMetricLast]}>
            <Text style={styles.dockMetricK}>{m.k}</Text>
            <Text style={styles.dockMetricV}>{m.v ?? '—'}</Text>
          </View>
        ))}
      </View>
      <CrispPress onPress={onClear} innerStyle={styles.rescan}>
        <Text style={styles.rescanText}>Change food</Text>
      </CrispPress>
    </View>
  );
}

export { logDisplayName };

const WELL = '#070B12';

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(2,8,16,0.84)', justifyContent: 'flex-end', paddingHorizontal: 14, paddingTop: Spacing.four },
  keyboard: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 14, paddingBottom: 18, gap: 12, maxHeight: '94%' },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetScrollInner: { gap: 12, paddingBottom: 4 },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  kicker: { fontSize: 11, letterSpacing: 1.6 },
  dayStamp: { marginTop: 2, fontSize: 12 },
  dismissHit: { paddingVertical: 8, paddingHorizontal: 4 },
  dismissText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  band: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 4, position: 'relative', overflow: 'hidden' },
  bandCompact: { borderRadius: 12, padding: 3 },
  bandPill: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: 11,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  bandPillCompact: { top: 3, left: 3, bottom: 3, borderRadius: 9, shadowOpacity: 0.08 },
  bandCellWrap: { flex: 1, zIndex: 1 },
  bandCell: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  bandCellCompact: { minHeight: 36 },
  bandLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.15 },
  bandLabelCompact: { fontSize: 12, fontWeight: '700', letterSpacing: 0.1 },
  well: { backgroundColor: WELL, borderRadius: 16, borderWidth: 1, overflow: 'hidden', paddingBottom: 10 },
  wellHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 10, paddingBottom: 6 },
  wellDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: Brand.lime, opacity: 0.85 },
  wellKicker: { color: 'rgba(183,233,60,0.78)', letterSpacing: 2, fontSize: 10, fontWeight: '800' },
  finder: { height: 196, marginHorizontal: 10, borderRadius: 10, overflow: 'hidden' },
  reticleWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  finderEmpty: { height: 196, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18 },
  reticleBox: { width: 148, height: 148 },
  finderHint: { textAlign: 'center', color: 'rgba(167,178,188,0.88)', fontSize: 13, lineHeight: 18 },
  searchWell: { minHeight: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 16 },
  allowBtn: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  allowText: { fontWeight: '800', fontSize: 14 },
  dock: { minHeight: 236, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 16, paddingBottom: 4 },
  dockPortion: { letterSpacing: 1.6, textTransform: 'uppercase', color: 'rgba(167,178,188,0.8)', fontSize: 10, fontWeight: '700' },
  dockName: { fontSize: 17, fontWeight: '800', textAlign: 'center', fontFamily: Fonts.rounded, color: '#EEF2F5', marginTop: 4 },
  dockKcal: { fontSize: 40, fontWeight: '800', letterSpacing: -1.2, fontFamily: Fonts.rounded, marginTop: 2 },
  dockUnit: { color: 'rgba(167,178,188,0.85)', fontSize: 11, letterSpacing: 1.2, fontWeight: '700', marginTop: -2 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  amountStep: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(183,233,60,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountStepText: { fontSize: 20, fontWeight: '800', lineHeight: 22 },
  amountInput: {
    minWidth: 72,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: Fonts.rounded,
    paddingHorizontal: 8,
  },
  amountHint: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 2 },
  dockMetrics: { flexDirection: 'row', marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden' },
  dockMetric: { width: 64, paddingVertical: 8, alignItems: 'center', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)' },
  dockMetricLast: { borderRightWidth: 0 },
  dockMetricK: { color: 'rgba(167,178,188,0.8)', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  dockMetricV: { color: '#EEF2F5', fontSize: 15, fontWeight: '800', fontFamily: Fonts.rounded, marginTop: 1 },
  rescan: { paddingVertical: 8, paddingHorizontal: 12, marginTop: 6 },
  rescanText: { color: Brand.lime, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  searchBlock: { gap: 8 },
  hitList: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  hitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12 },
  hitText: { flex: 1, gap: 2 },
  hitName: { fontSize: 14, fontWeight: '700' },
  hitMeta: { fontSize: 11, fontWeight: '600' },
  hitKcal: { fontSize: 15, fontWeight: '800', fontFamily: Fonts.rounded },
  manualRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  manualInput: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontWeight: '700', fontSize: 15 },
  manualGo: { minHeight: 46, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  manualGoText: { fontSize: 13, fontWeight: '800' },
  recentsBlock: { gap: 8 },
  recentsLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  recentsRow: { gap: 8, paddingRight: 8 },
  recentTick: { borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, maxWidth: 148, gap: 2 },
  recentName: { fontSize: 12, fontWeight: '700' },
  recentKcal: { fontSize: 13, fontWeight: '800', fontFamily: Fonts.rounded },
  error: { color: Brand.danger, fontSize: 13, fontWeight: '600' },
  credit: { color: 'rgba(120,132,144,0.95)', fontSize: 11, lineHeight: 15, fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  ghostBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  lockWrap: { flex: 1 },
  lockBtn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  lockSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  lockText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.4 },
  deleteText: { color: Brand.danger, fontSize: 13, fontWeight: '800' },
});
