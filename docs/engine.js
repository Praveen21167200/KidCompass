// Rule-based suggestion engine.
// Turns a child's recent reaction logs into explainable, actionable guidance.

// Reaction taxonomy -> valence. Positive = child does well, negative = distress.
export const REACTIONS = {
  happy: { label: 'Happy / joyful', valence: 2 },
  calm: { label: 'Calm / regulated', valence: 2 },
  engaged: { label: 'Engaged / focused', valence: 1 },
  neutral: { label: 'Neutral', valence: 0 },
  restless: { label: 'Restless / fidgety', valence: -1 },
  anxious: { label: 'Anxious / clingy', valence: -2 },
  overwhelmed: { label: 'Overwhelmed', valence: -3 },
  meltdown: { label: 'Meltdown', valence: -4 },
};

export const ENVIRONMENTS = ['theatre', 'playground', 'places', 'games', 'school', 'home', 'restaurant', 'travel'];

export const TRIGGERS = [
  'loud noise', 'crowds', 'bright lights', 'waiting', 'transitions',
  'new people', 'hunger', 'tiredness', 'smells', 'physical contact', 'screen time',
];

// Per-environment coping strategies for when a child struggles.
const COPING = {
  theatre: [
    'Choose sensory-friendly or matinee showings with lower volume.',
    'Bring noise-reducing headphones and a favourite comfort item.',
    'Sit near an aisle so you can take breaks easily.',
  ],
  playground: [
    'Visit during off-peak, quieter hours to reduce crowding.',
    'Preview the equipment and set clear expectations before arriving.',
    'Use a visual timer so transitions off the playground are predictable.',
  ],
  places: [
    'Prepare a visual schedule of where you are going and for how long.',
    'Keep outings short at first and build up duration gradually.',
    'Identify a quiet "reset" spot in advance for breaks.',
  ],
  games: [
    'Start with shorter, structured games with clear rules.',
    'Model turn-taking and offer wins early to build confidence.',
    'Watch for frustration cues and pause before it escalates.',
  ],
  school: [
    'Share a one-page profile of triggers/soothers with teachers.',
    'Build in movement or sensory breaks during the day.',
    'Use a home-school communication log to spot patterns.',
  ],
  home: [
    'Keep predictable routines and clear transition warnings.',
    'Create a calm-down corner with preferred sensory tools.',
  ],
  restaurant: [
    'Go at quieter times and pre-order or bring familiar food.',
    'Bring a quiet activity for waiting periods.',
    'Request a booth or corner table away from foot traffic.',
  ],
  travel: [
    'Prepare with social stories about the journey.',
    'Pack a sensory kit: headphones, snacks, fidget, comfort item.',
    'Plan regular breaks and keep to familiar routines where possible.',
  ],
};

const TRIGGER_TIPS = {
  'loud noise': 'Noise sensitivity is common — noise-cancelling headphones or earplugs help.',
  crowds: 'Crowds overwhelm — pick off-peak times and plan exit routes.',
  'bright lights': 'Bright/flashing light is a trigger — sunglasses or a cap can reduce input.',
  waiting: 'Waiting is hard — use visual timers and a waiting activity.',
  transitions: 'Transitions cause stress — give countdown warnings and use visual schedules.',
  'new people': 'New people feel threatening — allow warm-up time and no forced interaction.',
  hunger: 'Hunger amplifies dysregulation — keep snacks handy and log meal timing.',
  tiredness: 'Fatigue lowers tolerance — schedule demanding outings when well-rested.',
  smells: 'Strong smells overwhelm — avoid known sources; a familiar scent can ground them.',
  'physical contact': 'Touch sensitivity — prep others to ask before contact.',
  'screen time': 'Screens over-stimulate before events — build in a wind-down buffer.',
};

function avg(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

// A single log's comfort score: valence scaled by intensity (1-5, centred at 3).
function logScore(log) {
  const valence = REACTIONS[log.reaction]?.valence ?? 0;
  const intensity = Math.min(5, Math.max(1, Number(log.intensity) || 3));
  return valence * (intensity / 3);
}

function levelFor(score) {
  if (score >= 1) return 'thrives';
  if (score >= 0) return 'mixed';
  if (score >= -1.5) return 'struggles';
  return 'high-distress';
}

export function computeSuggestions(logs, { days = 30 } = {}) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const recent = logs.filter((l) => l.date >= cutoff);

  if (recent.length === 0) {
    return {
      window: days,
      totalLogs: 0,
      message: 'No logs in the selected window yet. Add daily observations to get suggestions.',
      environments: [],
      topTriggers: [],
      recommendations: [],
    };
  }

  // Aggregate per environment.
  const byEnv = {};
  for (const log of recent) {
    (byEnv[log.environment] ||= []).push(log);
  }

  const environments = Object.entries(byEnv).map(([env, envLogs]) => {
    const score = avg(envLogs.map(logScore));
    const level = levelFor(score);
    return {
      environment: env,
      count: envLogs.length,
      score: Number(score.toFixed(2)),
      level,
      strategies: level === 'thrives' || level === 'mixed' ? [] : (COPING[env] || COPING.places),
    };
  }).sort((a, b) => a.score - b.score); // worst first

  // Aggregate triggers.
  const triggerCounts = {};
  for (const log of recent) {
    for (const t of log.triggers || []) {
      triggerCounts[t] = (triggerCounts[t] || 0) + 1;
    }
  }
  const topTriggers = Object.entries(triggerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([trigger, count]) => ({ trigger, count, tip: TRIGGER_TIPS[trigger] || null }));

  // Build recommendations: one per environment the child has been logged in,
  // tailored to that environment's own comfort level (not just the top score).
  const recommendations = environments.map((env) => {
    const strategies = COPING[env.environment] || COPING.places;
    if (env.level === 'high-distress') {
      return {
        priority: 'high',
        environment: env.environment,
        level: env.level,
        title: `High distress in "${env.environment}"`,
        reason: `Very low comfort here (score ${env.score}) across ${env.count} log(s). This needs the most support.`,
        actions: strategies,
      };
    }
    if (env.level === 'struggles') {
      return {
        priority: 'high',
        environment: env.environment,
        level: env.level,
        title: `Support your child in "${env.environment}"`,
        reason: `Average comfort here is low (score ${env.score}) across ${env.count} log(s).`,
        actions: strategies,
      };
    }
    if (env.level === 'mixed') {
      return {
        priority: 'medium',
        environment: env.environment,
        level: env.level,
        title: `Keep an eye on "${env.environment}"`,
        reason: `Mixed results here (score ${env.score}) across ${env.count} log(s) — some good days, some hard ones.`,
        actions: [
          'Note what differs between the good and hard visits (time of day, crowd, hunger, tiredness).',
          ...strategies.slice(0, 2),
        ],
      };
    }
    // thrives
    return {
      priority: 'leverage',
      environment: env.environment,
      level: env.level,
      title: `Lean into "${env.environment}"`,
      reason: `Your child consistently does well here (score ${env.score}) across ${env.count} log(s). Use it to build confidence and as a regulating reward.`,
      actions: [
        `Schedule "${env.environment}" after harder activities to help recovery.`,
        'Note what specifically works here and transfer those elements to tougher environments.',
      ],
    };
  });

  if (topTriggers.length) {
    recommendations.push({
      priority: 'medium',
      title: 'Address recurring triggers',
      reason: `Most frequent triggers: ${topTriggers.map((t) => `${t.trigger} (${t.count})`).join(', ')}.`,
      actions: topTriggers.filter((t) => t.tip).map((t) => t.tip),
    });
  }

  // Trend: compare first vs second half of window.
  const sorted = [...recent].sort((a, b) => (a.date < b.date ? -1 : 1));
  const mid = Math.floor(sorted.length / 2);
  let trend = null;
  if (sorted.length >= 4) {
    const firstHalf = avg(sorted.slice(0, mid).map(logScore));
    const secondHalf = avg(sorted.slice(mid).map(logScore));
    const delta = secondHalf - firstHalf;
    trend = {
      direction: delta > 0.3 ? 'improving' : delta < -0.3 ? 'declining' : 'steady',
      delta: Number(delta.toFixed(2)),
    };
  }

  const overall = Number(avg(recent.map(logScore)).toFixed(2));

  return {
    window: days,
    totalLogs: recent.length,
    overallScore: overall,
    overallLevel: levelFor(overall),
    trend,
    environments,
    topTriggers,
    recommendations,
  };
}
