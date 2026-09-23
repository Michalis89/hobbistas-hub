import { normalizeFranchiseFamilyKey, normalizePlatformKey, toCanonicalGenres } from './games-normalizers';
import type { GameHistoryEntry, GamesTasteProfile, TasteComputation } from './games-types';

type GenreStat = {
  positiveWeight: number;
  negativeWeight: number;
  positiveCount: number;
  highSignalCount: number;
};

export function buildGamesTasteProfile(history: GameHistoryEntry[]): TasteComputation {
  const stats = new Map<string, GenreStat>();
  const themeWeights = new Map<string, number>();
  const droppedPatternWeights = new Map<string, number>();

  for (const entry of history) {
    const weight = tasteWeight(entry);
    const genres = toCanonicalGenres(entry.media.genres);

    for (const genre of genres) {
      const current = stats.get(genre) ?? {
        positiveWeight: 0,
        negativeWeight: 0,
        positiveCount: 0,
        highSignalCount: 0,
      };

      if (weight > 0) {
        current.positiveWeight += weight;
        current.positiveCount += 1;
        if (isHighSignal(entry)) {
          current.highSignalCount += 1;
        }
      } else if (weight < 0) {
        current.negativeWeight += Math.abs(weight);
      }

      stats.set(genre, current);
    }

    if (weight > 0 && (entry.status === 'completed' || entry.status === 'current')) {
      for (const theme of entry.media.themes) {
        const key = theme.trim().toLowerCase();
        if (!key) {
          continue;
        }
        themeWeights.set(key, (themeWeights.get(key) ?? 0) + weight);
      }
    }

    if (entry.status === 'dropped') {
      const lowered = genres.join(',');
      if (lowered.includes('moba') || lowered.includes('real-time-strategy-rts')) {
        droppedPatternWeights.set(
          'multiplayer live-service aversion',
          (droppedPatternWeights.get('multiplayer live-service aversion') ?? 0) + Math.abs(weight),
        );
      }
      if (lowered.includes('simulation') || lowered.includes('simulator')) {
        droppedPatternWeights.set(
          'cozy simulator aversion',
          (droppedPatternWeights.get('cozy simulator aversion') ?? 0) + Math.abs(weight),
        );
      }
      if (lowered.includes('indie') && lowered.includes('puzzle')) {
        droppedPatternWeights.set(
          'puzzle-first indie aversion',
          (droppedPatternWeights.get('puzzle-first indie aversion') ?? 0) + Math.abs(weight),
        );
      }
    }
  }

  const coreGenres: Array<{ name: string; weight: number }> = [];
  const secondaryGenres: Array<{ name: string; weight: number }> = [];
  const noiseSignals: Array<{ name: string; weight: number }> = [];
  const negativeSignals: Array<{ name: string; weight: number }> = [];

  for (const [genre, stat] of stats.entries()) {
    const net = stat.positiveWeight - stat.negativeWeight;
    if (stat.negativeWeight > stat.positiveWeight && stat.negativeWeight >= 2) {
      noiseSignals.push({ name: genre, weight: stat.negativeWeight - stat.positiveWeight });
      continue;
    }

    const core =
      (net >= 4 && stat.highSignalCount >= 2) ||
      (net >= 6 && stat.positiveCount >= 2);
    const secondary = net >= 2 && stat.positiveCount >= 2;

    if (core) {
      coreGenres.push({ name: genre, weight: net });
      continue;
    }

    if (secondary) {
      secondaryGenres.push({ name: genre, weight: net });
    }
  }

  coreGenres.sort((a, b) => b.weight - a.weight);
  secondaryGenres.sort((a, b) => b.weight - a.weight);

  const synthesizedThemeWeights = synthesizeThemes(stats);
  for (const [theme, weight] of synthesizedThemeWeights.entries()) {
    themeWeights.set(theme, (themeWeights.get(theme) ?? 0) + weight);
  }

  const themes = Array.from(themeWeights.entries())
    .filter(([theme, weight]) => weight > 0 && !theme.includes('psychological'))
    .sort((a, b) => b[1] - a[1])
    .map(([name, weight]) => ({ name, weight }));

  for (const [name, weight] of droppedPatternWeights.entries()) {
    negativeSignals.push({ name, weight });
  }

  for (const noise of noiseSignals) {
    if (
      noise.name === 'indie' ||
      noise.name === 'platform' ||
      noise.name === 'adventure' ||
      noise.name === 'role-playing-rpg'
    ) {
      continue;
    }
    if (noise.name.includes('puzzle')) {
      negativeSignals.push({ name: 'puzzle-first low-stakes aversion', weight: noise.weight });
    }
    if (noise.name.includes('simulator') || noise.name.includes('simulation')) {
      negativeSignals.push({ name: 'low-engagement simulator loop aversion', weight: noise.weight });
    }
  }

  negativeSignals.sort((a, b) => b.weight - a.weight);

  const playerStyles = buildPlayerStyles(stats, history);
  const summary = buildSummary(coreGenres, themes, playerStyles);

  const favoriteFranchiseKeys = new Set(
    history
      .filter(item => item.isFavorite || (item.status === 'completed' && (item.score ?? 0) >= 9))
      .map(item => normalizeFranchiseFamilyKey(item.media.title)),
  );

  const preferredPlatforms = buildPreferredPlatforms(history);

  const profile: GamesTasteProfile = {
    summary,
    coreGenres: coreGenres.slice(0, 3),
    secondaryGenres: secondaryGenres.slice(0, 3),
    themes: themes.slice(0, 3),
    playerStyles: playerStyles.slice(0, 2),
    negativeSignals: negativeSignals.slice(0, 4),
    signalTotals: {
      coreGenres: sumWeights(coreGenres),
      themes: sumWeights(themes),
      playerStyles: sumWeights(playerStyles),
      negativeSignals: sumWeights(negativeSignals),
    },
  };

  return {
    profile,
    signals: {
      coreGenreKeys: new Set(profile.coreGenres.map(item => item.name)),
      secondaryGenreKeys: new Set(profile.secondaryGenres.map(item => item.name)),
      negativeGenreKeys: new Set(
        profile.negativeSignals
          .map(item => item.name)
          .filter(name =>
            name.includes('puzzle') ||
            name.includes('simulator') ||
            name.includes('multiplayer') ||
            name.includes('live-service'),
          ),
      ),
      favoriteFranchiseKeys,
      topCompletedTitles: history
        .filter(item => item.status === 'completed')
        .sort((a, b) => ((b.score ?? 0) + (b.isFavorite ? 2 : 0)) - ((a.score ?? 0) + (a.isFavorite ? 2 : 0)))
        .slice(0, 4)
        .map(item => item.media.title),
      preferredPlatforms,
    },
  };
}

export function tasteWeight(entry: GameHistoryEntry): number {
  if (entry.status === 'planned') {
    return 0;
  }

  if (entry.status === 'current') {
    return 0.7;
  }

  if (entry.status === 'completed') {
    let weight = 1;
    const score = entry.score;
    if (score !== null && score >= 9) {
      weight += 2;
    } else if (score !== null && score >= 8) {
      weight += 1;
    }

    if (entry.isFavorite) {
      weight += 3;
    }

    return weight;
  }

  if (entry.status === 'dropped') {
    let droppedWeight = -1;
    if (entry.score !== null && entry.score <= 5) {
      droppedWeight -= 1;
    }

    return droppedWeight;
  }

  return 0;
}

function isHighSignal(entry: GameHistoryEntry): boolean {
  if (entry.status !== 'completed') {
    return false;
  }
  if (entry.isFavorite) {
    return true;
  }
  return (entry.score ?? 0) >= 9;
}

function synthesizeThemes(stats: Map<string, GenreStat>): Map<string, number> {
  const themeWeights = new Map<string, number>();

  const rpg = netGenre(stats, 'role-playing-rpg');
  const adventure = netGenre(stats, 'adventure');
  const hack = netGenre(stats, 'hack-and-slash');
  const shooter = netGenre(stats, 'shooter');
  const tactical = netGenre(stats, 'tactical') + netGenre(stats, 'strategy');

  if (rpg + adventure >= 5) {
    themeWeights.set('narrative-driven worlds', (rpg + adventure) * 0.7);
  }

  if (rpg + hack >= 5) {
    themeWeights.set('dark fantasy action', (rpg + hack) * 0.6);
  }

  if (adventure + shooter >= 4) {
    themeWeights.set('cinematic single-player campaigns', (adventure + shooter) * 0.6);
  }

  if (tactical >= 3) {
    themeWeights.set('choice-driven progression', tactical * 0.7);
  }

  return themeWeights;
}

function buildPlayerStyles(
  stats: Map<string, GenreStat>,
  history: GameHistoryEntry[],
): Array<{ name: string; weight: number }> {
  const narrative =
    netGenre(stats, 'adventure') +
    netGenre(stats, 'role-playing-rpg') +
    netGenre(stats, 'hack-and-slash');

  const continuation = history
    .filter(item => item.status === 'completed' || item.status === 'current')
    .reduce((acc, item) => acc + (item.isFavorite ? 1.5 : 0.8), 0);

  const challenge =
    netGenre(stats, 'role-playing-rpg') +
    netGenre(stats, 'hack-and-slash') +
    netGenre(stats, 'tactical');

  const cinematic = netGenre(stats, 'adventure') + netGenre(stats, 'shooter');

  const styles = [
    { name: 'single-player narrative immersion', weight: narrative },
    { name: 'franchise continuation focus', weight: continuation },
    { name: 'challenge-driven action RPG', weight: challenge * 0.8 },
    { name: 'cinematic campaign preference', weight: cinematic * 0.7 },
  ].filter(item => item.weight > 0.5);

  styles.sort((a, b) => b.weight - a.weight);
  return styles;
}

function sumWeights(signals: Array<{ weight: number }>): number {
  return signals.reduce((sum, item) => sum + item.weight, 0);
}

function netGenre(stats: Map<string, GenreStat>, key: string): number {
  const stat = stats.get(key);
  if (!stat) {
    return 0;
  }
  return stat.positiveWeight - stat.negativeWeight;
}

function buildSummary(
  coreGenres: Array<{ name: string; weight: number }>,
  themes: Array<{ name: string; weight: number }>,
  playerStyles: Array<{ name: string; weight: number }>,
): string {
  const genreText = coreGenres.slice(0, 2).map(item => item.name).join(' + ');
  const themeText = themes[0]?.name ?? 'narrative progression';
  const styleText = playerStyles[0]?.name ?? 'single-player focus';

  if (!genreText) {
    return 'Your games identity is still forming from recent completions and in-progress titles.';
  }

  return `Your taste centers around ${genreText}, with strong ${themeText} and ${styleText}.`;
}

function buildPreferredPlatforms(history: GameHistoryEntry[]): string[] {
  const weights = new Map<string, number>();

  for (const entry of history) {
    if (entry.status !== 'completed' && entry.status !== 'current') {
      continue;
    }

    const selected = entry.selectedPlatform ? [entry.selectedPlatform] : [];
    const candidates = [...selected, ...entry.media.platforms];

    for (const platform of candidates) {
      const key = normalizePlatformKey(platform);
      if (!key) {
        continue;
      }
      weights.set(key, (weights.get(key) ?? 0) + 1);
    }
  }

  return Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)
    .slice(0, 3);
}
