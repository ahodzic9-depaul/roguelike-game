const W = 1280;
const H = 720;

const STATE = {
  CHAR_SELECT:   'char_select',
  POWER_SELECT:  'power_select',
  PLAYING:       'playing',
  UPGRADE:       'upgrade',
  STAT_BOOST:    'stat_boost',
  WIN:           'win',
  GAME_OVER:     'game_over',
};

const COLORS = {
  bg:     '#07071a',
  text:   '#e2e8f0',
  dim:    '#64748b',
  gold:   '#f59e0b',
  hpBar:  '#22c55e',
  dmgBar: '#ef4444',
  spdBar: '#38bdf8',

  kaido: { main: '#ef4444', dark: '#7f1d1d', mid: '#b91c1c', glow: 'rgba(239,68,68,' },
  dio:   { main: '#c084fc', dark: '#3b0764', mid: '#7c3aed', glow: 'rgba(192,132,252,' },
  levi:  { main: '#38bdf8', dark: '#0c4a6e', mid: '#0284c7', glow: 'rgba(56,189,248,'  },
};
