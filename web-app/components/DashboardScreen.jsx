import { AutoAmount } from '../components/AutoAmount';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SourceBadge } from '../components/SourceBadge';
import { TransactionActionsMenu } from '../components/TransactionActionsMenu';
import { formatEuros } from '../lib/currency';
import { groupTransactionsByDayLabel } from '../lib/transactions';
import { colors, radius, shadow } from '../theme/tokens';
const weekdays = [
    'Dimanche',
    'Lundi',
    'Mardi',
    'Mercredi',
    'Jeudi',
    'Vendredi',
    'Samedi',
];
const months = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
];
function getInitials(name) {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
}
export function DashboardScreen({ userName, categories, totalBudget, totalSpent, remainingBudget, usedPct, transactions, savingsGoals, savingsBudget, onDeleteExpense, onOpenBudgetSettings, onOpenCategory, onOpenSavings, onOpenHistory, onOpenProfile, showQuickGuide, onOpenGuide, onDismissGuide, }) {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(daysInMonth - today.getDate(), 0);
    const totalBudgetExceeded = remainingBudget < 0;
    const formattedDate = `${weekdays[today.getDay()]} ${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`;
    const initials = getInitials(userName);
    const recentTransactionGroups = groupTransactionsByDayLabel(transactions.slice(0, 4));
    return (<ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Bonjour, {userName.split(' ')[0]} 👋</Text>
          <Text style={styles.date}>{formattedDate}</Text>
        </View>
        <Pressable style={({ pressed }) => [styles.avatar, pressed && styles.cardPressed]} onPress={onOpenProfile}>
          <Text style={styles.avatarLabel}>{initials}</Text>
        </Pressable>
      </View>

      <View style={styles.alertCard}>
        <View style={styles.alertDot}/>
        <View style={styles.alertBody}>
          <Text style={styles.alertTitle}>Rappel du soir</Text>
          <Text style={styles.alertText}>
            Pense à saisir tes dépenses en espèces ou hors prélèvements fixes.
          </Text>
        </View>
      </View>

      {showQuickGuide ? (<View style={styles.guideCard}>
          <View style={styles.guideHeader}>
            <View style={styles.guideTitleBlock}>
              <Text style={styles.guideEyebrow}>Nouveau sur Kloo ?</Text>
              <Text style={styles.guideTitle}>Commence comme ça</Text>
            </View>
            <Pressable onPress={onDismissGuide} style={({ pressed }) => [styles.guideDismiss, pressed && styles.guideDismissPressed]}>
              <Text style={styles.guideDismissLabel}>Masquer</Text>
            </Pressable>
          </View>

          <View style={styles.guideBubbles}>
            <View style={styles.guideBubble}>
              <Text style={styles.guideBubbleTitle}>1. Règle tes enveloppes</Text>
              <Text style={styles.guideBubbleText}>Loyer, courses, transport puis le reste.</Text>
            </View>
            <View style={styles.guideBubble}>
              <Text style={styles.guideBubbleTitle}>2. Ajoute tes dépenses</Text>
              <Text style={styles.guideBubbleText}>Le bouton + met à jour ton budget tout de suite.</Text>
            </View>
            <View style={styles.guideBubble}>
              <Text style={styles.guideBubbleTitle}>3. Suis ton mois</Text>
              <Text style={styles.guideBubbleText}>Les objectifs d’épargne restent séparés du budget courant.</Text>
            </View>
          </View>

          <Pressable onPress={onOpenGuide} style={({ pressed }) => [styles.guideButton, pressed && styles.guideButtonPressed]}>
            <Text style={styles.guideButtonLabel}>Voir l’aide complète</Text>
          </Pressable>
        </View>) : null}

      <Pressable style={({ pressed }) => [styles.budgetCard, pressed && styles.cardPressed]} onPress={onOpenBudgetSettings}>
        <View style={styles.budgetTop}>
          <View style={styles.budgetLeft}>
            <Text style={styles.smallLabel}>Budget restant</Text>
            <AutoAmount maxFontSize={40} minFontSize={12} style={[styles.bigValue, remainingBudget < 0 && styles.bigValueNegative]}>
              {formatEuros(remainingBudget)}
            </AutoAmount>
          </View>

          <View style={styles.budgetRight}>
            <View style={styles.tag}>
              <Text style={styles.tagLabel}>{daysRemaining} jours restants</Text>
            </View>
            <Text style={styles.budgetHint}>sur {formatEuros(totalBudget)} fixés</Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View style={[
            styles.progressFill,
            usedPct >= 100
                ? styles.progressOver
                : usedPct >= 80
                    ? styles.progressWarn
                    : styles.progressOk,
            { width: `${Math.min(usedPct, 100)}%` },
        ]}/>
        </View>

        <View style={styles.budgetBottom}>
          <Text style={styles.bottomText}>{formatEuros(totalSpent)} dépensés</Text>
          <Text style={styles.bottomText}>{usedPct}% utilisé</Text>
          <Text style={styles.bottomTextStrong}>Modifier</Text>
        </View>
      </Pressable>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Enveloppes</Text>
        <Pressable onPress={onOpenBudgetSettings}>
          <Text style={styles.sectionLink}>Modifier</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {categories.map((category) => {
            const pct = category.planned > 0 ? Math.round((category.spent / category.planned) * 100) : 0;
            const remaining = category.planned - category.spent;
            const isOver = remaining < 0;
            const isWarn = !isOver && pct >= 80;
            return (<Pressable key={category.id} style={({ pressed }) => [styles.categoryCard, pressed && styles.cardPressed]} onPress={() => onOpenCategory(category.id)}>
              {totalBudgetExceeded ? (<Pressable hitSlop={10} onPress={(event) => {
                        event.stopPropagation();
                        Alert.alert('Budget total dépassé', 'Attention, ton budget total a été dépassé. Pense à mettre à jour tes enveloppes.');
                    }} style={styles.globalWarningButton}>
                  <Text style={styles.globalWarningIcon}>!</Text>
                </Pressable>) : null}

              {isOver ? (<View style={[
                        styles.indicatorDot,
                        styles.dotOver,
                        totalBudgetExceeded && styles.indicatorDotShifted,
                    ]}/>) : null}
              {isWarn ? (<View style={[
                        styles.indicatorDot,
                        styles.dotWarn,
                        totalBudgetExceeded && styles.indicatorDotShifted,
                    ]}/>) : null}

              <View style={[styles.categoryIcon, { backgroundColor: category.softColor }]}>
                <Text style={styles.categoryEmoji}>{category.emoji}</Text>
              </View>

              <Text style={styles.categoryName}>{category.label}</Text>
              <AutoAmount maxFontSize={22} minFontSize={12} style={[styles.categoryValue, isOver && styles.overValue]}>
                {formatEuros(remaining)}
              </AutoAmount>
              <Text style={[styles.categorySub, isOver && styles.overSub]}>
                {isOver
                    ? `dépassé de ${formatEuros(Math.abs(remaining))}`
                    : `sur ${formatEuros(category.planned)} · ${pct}%`}
              </Text>

              <View style={styles.categoryBarTrack}>
                <View style={[
                    styles.categoryBarFill,
                    {
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: isOver ? colors.red : isWarn ? colors.amber : category.color,
                    },
                ]}/>
              </View>

              <Text style={styles.categorySpent}>{formatEuros(category.spent)} déjà dépensés</Text>
            </Pressable>);
        })}
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Épargne</Text>
        <Pressable onPress={onOpenSavings}>
          <Text style={styles.sectionLink}>Voir tout</Text>
        </Pressable>
      </View>

      <Pressable style={({ pressed }) => [styles.savingsCard, pressed && styles.cardPressed]} onPress={onOpenSavings}>
        <View style={styles.savingsTop}>
          <View style={styles.budgetLeft}>
            <Text style={styles.savingsLabel}>Mis de côté ce mois</Text>
            <AutoAmount maxFontSize={26} style={styles.savingsValue}>{formatEuros(savingsBudget)}</AutoAmount>
          </View>
          <View style={styles.savingsBadge}>
            <Text style={styles.savingsBadgeLabel}>{savingsGoals.length} objectifs</Text>
          </View>
        </View>

        {savingsGoals.slice(0, 2).map((goal) => {
            const goalPct = goal.targetAmount > 0
                ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
                : 0;
            return (<View key={goal.id} style={styles.goalRow}>
              <Text style={styles.goalEmoji}>{goal.emoji}</Text>
              <Text style={styles.goalName}>{goal.name}</Text>
              <View style={styles.goalMiniTrack}>
                <View style={[styles.goalMiniFill, { width: `${Math.min(goalPct, 100)}%` }]}/>
              </View>
              <View style={{ width: "44%", minWidth: 0 }}><AutoAmount maxFontSize={13} minFontSize={10} style={styles.goalMiniAmount}>{formatEuros(goal.currentAmount)}</AutoAmount><AutoAmount maxFontSize={11} minFontSize={9} style={styles.goalMiniAmount}>{`sur ${formatEuros(goal.targetAmount)}`}</AutoAmount></View>
            </View>);
        })}
      </Pressable>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Dépenses récentes</Text>
        <Pressable onPress={onOpenHistory}>
          <Text style={styles.sectionLink}>Tout voir</Text>
        </Pressable>
      </View>

      <View style={styles.transactionsList}>
        {recentTransactionGroups.map((group) => (<View key={group.label}>
            <Text style={styles.separator}>{group.label}</Text>

            {group.items.map((transaction) => {
                const category = categories.find((item) => item.id === transaction.categoryId);
                return (<View key={transaction.id} style={styles.transactionRow}>
                  <View style={[
                        styles.transactionIcon,
                        { backgroundColor: category?.softColor ?? colors.surface },
                    ]}>
                    <Text style={styles.transactionIconLabel}>{category?.emoji ?? '💸'}</Text>
                  </View>

                  <View style={styles.transactionText}>
                    <Text style={styles.transactionName}>{transaction.name}</Text>
                    <Text style={styles.transactionMeta}>{category?.label ?? transaction.categoryId}</Text>
                    <SourceBadge source={transaction.source}/>
                  </View>

                  <View style={styles.transactionRight}>
                    <AutoAmount maxFontSize={15} minFontSize={11} style={styles.transactionAmount}>-{formatEuros(transaction.amount)}</AutoAmount>
                    <TransactionActionsMenu expenseName={transaction.name} onDelete={() => onDeleteExpense(transaction.id)}/>
                  </View>
                </View>);
            })}
          </View>))}
      </View>
    </ScrollView>);
}
const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    content: {
        paddingTop: 58,
        paddingHorizontal: 16,
        paddingBottom: 132,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    hello: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.text,
    },
    date: {
        marginTop: 3,
        fontSize: 12,
        color: colors.textSoft,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#CCC8F8',
        backgroundColor: colors.accentSoft,
    },
    avatarLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#4A3DB0',
    },
    alertCard: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 14,
        padding: 12,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: '#CCC8F8',
        backgroundColor: colors.accentSoft,
    },
    alertDot: {
        width: 8,
        height: 8,
        marginTop: 5,
        borderRadius: 4,
        backgroundColor: colors.accent,
    },
    alertBody: {
        flex: 1,
    },
    alertTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#4A3DB0',
    },
    alertText: {
        marginTop: 2,
        fontSize: 13,
        lineHeight: 18,
        color: '#4A3DB0',
    },
    guideCard: {
        marginBottom: 16,
        padding: 16,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: '#E4D4A7',
        backgroundColor: '#FFF9ED',
        ...shadow,
    },
    guideHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
    },
    guideTitleBlock: {
        flex: 1,
    },
    guideEyebrow: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        color: '#9A5F08',
    },
    guideTitle: {
        marginTop: 4,
        fontSize: 20,
        fontWeight: '800',
        color: colors.text,
    },
    guideDismiss: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: colors.white,
    },
    guideDismissPressed: {
        opacity: 0.8,
    },
    guideDismissLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textMuted,
    },
    guideBubbles: {
        gap: 10,
        marginTop: 14,
    },
    guideBubble: {
        padding: 14,
        borderRadius: radius.md,
        backgroundColor: colors.white,
    },
    guideBubbleTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.text,
    },
    guideBubbleText: {
        marginTop: 4,
        fontSize: 13,
        lineHeight: 18,
        color: colors.textMuted,
    },
    guideButton: {
        alignItems: 'center',
        marginTop: 14,
        paddingVertical: 12,
        borderRadius: radius.sm,
        backgroundColor: colors.accent,
    },
    guideButtonPressed: {
        opacity: 0.86,
    },
    guideButtonLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.white,
    },
    budgetCard: {
        marginBottom: 16,
        padding: 22,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.white,
        ...shadow,
    },
    cardPressed: {
        opacity: 0.92,
        transform: [{ scale: 0.99 }],
    },
    budgetLeft: { flex: 1, minWidth: 0 },
    budgetTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 18,
        gap: 12,
    },
    smallLabel: {
        marginBottom: 4,
        fontSize: 11,
        fontWeight: '500',
        textTransform: 'uppercase',
        color: colors.textSoft,
    },
    bigValue: {
        fontSize: 40,
        fontWeight: '700',
        lineHeight: 42,
        color: colors.text,
    },
    bigValueNegative: {
        color: colors.red,
    },
    budgetRight: {
        maxWidth: '44%', minWidth: 0, flexShrink: 0,
        alignItems: 'flex-end',
    },
    tag: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: colors.greenSoft,
    },
    tagLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.green,
    },
    budgetHint: {
        marginTop: 4,
        fontSize: 12,
        color: colors.textSoft,
    },
    progressTrack: {
        height: 6,
        marginBottom: 10,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: colors.surface,
    },
    progressFill: {
        height: '100%',
        borderRadius: 999,
    },
    progressOk: {
        backgroundColor: colors.accent,
    },
    progressWarn: {
        backgroundColor: colors.amber,
    },
    progressOver: {
        backgroundColor: colors.red,
    },
    budgetBottom: {
        flexWrap: 'wrap', gap: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    bottomText: {
        fontSize: 12,
        color: colors.textSoft,
    },
    bottomTextStrong: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.text,
    },
    sectionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
    },
    sectionLink: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.accent,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 18,
    },
    categoryCard: {
        minWidth: 0,
        width: '47%',
        padding: 16,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.white,
        ...shadow,
    },
    indicatorDot: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    indicatorDotShifted: {
        right: 40,
    },
    dotWarn: {
        backgroundColor: colors.amber,
    },
    dotOver: {
        backgroundColor: colors.red,
    },
    globalWarningButton: {
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 2,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.amberSoft,
        borderWidth: 1,
        borderColor: '#F0D090',
    },
    globalWarningIcon: {
        fontSize: 13,
        fontWeight: '800',
        lineHeight: 14,
        color: colors.amber,
    },
    categoryIcon: {
        width: 34,
        height: 34,
        marginBottom: 10,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryEmoji: {
        fontSize: 17,
    },
    categoryName: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textMuted,
    },
    categoryValue: {
        marginTop: 2,
        fontSize: 22,
        fontWeight: '700',
        color: colors.text,
    },
    categorySub: {
        marginTop: 2,
        marginBottom: 8,
        fontSize: 11,
        color: colors.textSoft,
    },
    overValue: {
        color: colors.red,
    },
    overSub: {
        color: colors.red,
    },
    categoryBarTrack: {
        height: 4,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: colors.surface,
    },
    categoryBarFill: {
        height: '100%',
        borderRadius: 999,
    },
    categorySpent: {
        marginTop: 8,
        fontSize: 11,
        color: colors.textSoft,
    },
    savingsCard: {
        marginBottom: 18,
        padding: 18,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.white,
        ...shadow,
    },
    savingsTop: {
        gap: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    savingsLabel: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        color: colors.textSoft,
    },
    savingsValue: {
        marginTop: 4,
        fontSize: 26,
        fontWeight: '700',
        color: colors.amber,
    },
    savingsBadge: {
        flexShrink: 0,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: colors.amberSoft,
    },
    savingsBadgeLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.amber,
    },
    goalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 9,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    goalEmoji: {
        fontSize: 16,
    },
    goalName: {
        minWidth: 0,
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: colors.text,
    },
    goalMiniTrack: {
        width: 32,
        height: 4,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: colors.surface,
    },
    goalMiniFill: {
        height: '100%',
        borderRadius: 999,
        backgroundColor: colors.amber,
    },
    goalMiniAmount: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.amber,
    },
    transactionsList: {
        gap: 2,
    },
    separator: {
        marginBottom: 6,
        marginLeft: 10,
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        color: colors.textSoft,
    },
    transactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        paddingHorizontal: 10,
        borderRadius: radius.sm,
        backgroundColor: colors.bg,
    },
    transactionIcon: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    transactionIconLabel: {
        fontSize: 17,
    },
    transactionText: {
        minWidth: 0,
        flex: 1,
    },
    transactionName: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.text,
    },
    transactionMeta: {
        marginTop: 2,
        fontSize: 12,
        color: colors.textSoft,
    },
    transactionRight: {
        width: '43%', minWidth: 0,
        alignItems: 'flex-end',
        gap: 6,
    },
    transactionAmount: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.red,
    },
});
